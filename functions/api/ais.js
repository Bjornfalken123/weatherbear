const DEFAULT_LISTEN_MS = 9000;
const MAX_LISTEN_MS = 10000;

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

function cleanString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return null;
}

function normalizeShipType(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : cleanString(value);
}

function getMmsi(report) {
  return firstDefined(
    report?.UserID,
    report?.UserId,
    report?.userId,
    report?.MMSI,
    report?.Mmsi,
    report?.mmsi,
    report?.MmsiNumber,
    report?.mmsiNumber
  );
}

function extractPosition(payload) {
  const report =
    payload?.PositionReport ||
    payload?.StandardClassBPositionReport ||
    payload?.ExtendedClassBPositionReport ||
    payload?.LongRangeAisBroadcastMessage ||
    payload?.BaseStationReport ||
    payload?.AidsToNavigationReport ||
    payload?.SearchAndRescueAircraftPositionReport ||
    null;

  if (!report) return null;

  const lat = firstDefined(
    report.Latitude,
    report.latitude,
    report.Lat,
    report.lat
  );

  const lon = firstDefined(
    report.Longitude,
    report.longitude,
    report.Lon,
    report.lon,
    report.Lng,
    report.lng
  );

  if (lat == null || lon == null) return null;

  const latNum = Number(lat);
  const lonNum = Number(lon);

  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) return null;
  if (Math.abs(latNum) > 90 || Math.abs(lonNum) > 180) return null;

  const mmsi = getMmsi(report);

  return {
    mmsi: mmsi || null,
    lat: latNum,
    lon: lonNum,
    cog: firstDefined(
      report.Cog,
      report.COG,
      report.CourseOverGround,
      report.courseOverGround,
      report.Course,
      report.course,
      0
    ),
    sog: firstDefined(
      report.Sog,
      report.SOG,
      report.SpeedOverGround,
      report.speedOverGround,
      report.Speed,
      report.speed
    ),
    heading: firstDefined(
      report.TrueHeading,
      report.Heading,
      report.heading
    ),
    navStatus: firstDefined(
      report.NavigationalStatus,
      report.NavigationStatus,
      report.navStatus
    )
  };
}

function extractStaticData(payload) {
  const ship =
    payload?.ShipStaticData ||
    payload?.StaticDataReport ||
    payload?.StaticVoyageData ||
    null;

  if (!ship) return null;

  let source = ship;

  if (ship.ReportA || ship.ReportB) {
    source = {
      ...ship,
      ...(ship.ReportA || {}),
      ...(ship.ReportB || {})
    };
  }

  const mmsi = getMmsi(source);
  if (!mmsi) return null;

  return {
    mmsi,
    name:
      cleanString(source.Name) ||
      cleanString(source.ShipName) ||
      cleanString(source.VesselName),
    callsign:
      cleanString(source.CallSign) ||
      cleanString(source.Callsign) ||
      cleanString(source.CallsignName),
    imo: firstDefined(
      source.ImoNumber,
      source.IMO,
      source.Imo,
      source.imo
    ),
    shipType: normalizeShipType(
      firstDefined(
        source.Type,
        source.ShipType,
        source.ShipAndCargoType,
        source.shipType
      )
    ),
    destination:
      cleanString(source.Destination) ||
      cleanString(source.destination),
    eta: firstDefined(
      source.Eta,
      source.ETA,
      source.eta
    ),
    dimensionToBow: firstDefined(source.DimensionToBow, source.ToBow),
    dimensionToStern: firstDefined(source.DimensionToStern, source.ToStern),
    dimensionToPort: firstDefined(source.DimensionToPort, source.ToPort),
    dimensionToStarboard: firstDefined(
      source.DimensionToStarboard,
      source.ToStarboard
    )
  };
}

function mergeVessel(existing, next) {
  return {
    ...(existing || {}),
    ...next,
    static: {
      ...((existing && existing.static) || {}),
      ...((next && next.static) || {})
    }
  };
}

function vesselKeyFromPosition(position) {
  if (position?.mmsi) return String(position.mmsi);
  return `${Number(position.lat).toFixed(5)}:${Number(position.lon).toFixed(5)}`;
}

function jsonResponse(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store"
    }
  });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);

  const bbox = url.searchParams.get("bbox");
  const listenMs = url.searchParams.get("listenMs");

  if (!bbox) {
    return jsonResponse({ error: "bbox required" }, 400);
  }

  const [minLon, minLat, maxLon, maxLat] = String(bbox)
    .split(",")
    .map(Number);

  if ([minLon, minLat, maxLon, maxLat].some((v) => Number.isNaN(v))) {
    return jsonResponse({ error: "invalid bbox" }, 400);
  }

  const safeListenMs =
    clampNumber(listenMs, 1000, MAX_LISTEN_MS) || DEFAULT_LISTEN_MS;

  const API_KEY = context.env.AISSTREAM_API_KEY;

  if (!API_KEY) {
    return jsonResponse({ error: "AISSTREAM_API_KEY missing" }, 500);
  }

  const vessels = new Map();

  return new Promise((resolve) => {
    let finished = false;
    let finishTimer = null;
    let ws = null;

    function finish(status = 200, payload = { vessels: [] }) {
      if (finished) return;
      finished = true;

      if (finishTimer) {
        clearTimeout(finishTimer);
        finishTimer = null;
      }

      try {
        if (ws && ws.readyState === 1) {
          ws.close();
        }
      } catch (e) {}

      resolve(jsonResponse(payload, status));
    }

    try {
      ws = new WebSocket("wss://stream.aisstream.io/v0/stream");

      ws.addEventListener("open", () => {
        ws.send(
          JSON.stringify({
            APIKey: API_KEY,
            BoundingBoxes: [[[minLat, minLon], [maxLat, maxLon]]],
            FilterMessageTypes: [
              "PositionReport",
              "StandardClassBPositionReport",
              "ExtendedClassBPositionReport",
              "LongRangeAisBroadcastMessage",
              "ShipStaticData",
              "StaticDataReport"
            ]
          })
        );

        finishTimer = setTimeout(() => {
          finish(200, {
            vessels: Array.from(vessels.values())
          });
        }, safeListenMs);
      });

      ws.addEventListener("message", (event) => {
        try {
          const msg = JSON.parse(event.data);
          const payload = msg && msg.Message ? msg.Message : null;
          if (!payload) return;

          const position = extractPosition(payload);

          if (position) {
            const key = vesselKeyFromPosition(position);
            const existing = vessels.get(key);

            const merged = mergeVessel(existing, {
              ...position,
              name:
                existing?.name ||
                existing?.static?.name ||
                null,
              callsign:
                existing?.callsign ||
                existing?.static?.callsign ||
                null,
              imo:
                existing?.imo ||
                existing?.static?.imo ||
                null,
              shipType:
                existing?.shipType ||
                existing?.static?.shipType ||
                null,
              destination:
                existing?.destination ||
                existing?.static?.destination ||
                null,
              receivedAt: Date.now()
            });

            vessels.set(key, merged);
          }

          const staticData = extractStaticData(payload);

          if (staticData) {
            const key = String(staticData.mmsi);
            const existing = vessels.get(key);

            const merged = mergeVessel(existing, {
              mmsi: staticData.mmsi,
              name: staticData.name || existing?.name || null,
              callsign: staticData.callsign || existing?.callsign || null,
              imo: staticData.imo || existing?.imo || null,
              shipType: staticData.shipType || existing?.shipType || null,
              destination: staticData.destination || existing?.destination || null,
              eta: staticData.eta || existing?.eta || null,
              static: staticData,
              receivedAt: Date.now()
            });

            vessels.set(key, merged);
          }
        } catch (e) {
          // Ignorera trasiga AIS-meddelanden.
        }
      });

      ws.addEventListener("error", () => {
        finish(200, {
          vessels: Array.from(vessels.values())
        });
      });

      ws.addEventListener("close", () => {
        finish(200, {
          vessels: Array.from(vessels.values())
        });
      });
    } catch (error) {
      finish(500, {
        error: "AIS websocket failed",
        message: error.message
      });
    }
  });
}
