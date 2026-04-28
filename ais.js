import WebSocket from "ws";

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

  // AIS ogiltiga koordinater brukar kunna hamna runt 91/181.
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

  // AIS type 24 kan vara uppdelad i ReportA / ReportB beroende på parser.
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
    imo:
      firstDefined(
        source.ImoNumber,
        source.IMO,
        source.Imo,
        source.imo
      ),
    shipType:
      normalizeShipType(
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
    eta:
      firstDefined(
        source.Eta,
        source.ETA,
        source.eta
      ),
    dimensionToBow: firstDefined(source.DimensionToBow, source.ToBow),
    dimensionToStern: firstDefined(source.DimensionToStern, source.ToStern),
    dimensionToPort: firstDefined(source.DimensionToPort, source.ToPort),
    dimensionToStarboard: firstDefined(source.DimensionToStarboard, source.ToStarboard)
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

export default async function handler(req, res) {
  const { bbox, listenMs } = req.query;

  if (!bbox) {
    return res.status(400).json({ error: "bbox required" });
  }

  const [minLon, minLat, maxLon, maxLat] = String(bbox)
    .split(",")
    .map(Number);

  if ([minLon, minLat, maxLon, maxLat].some((v) => Number.isNaN(v))) {
    return res.status(400).json({ error: "invalid bbox" });
  }

  const safeListenMs =
    clampNumber(listenMs, 1000, MAX_LISTEN_MS) || DEFAULT_LISTEN_MS;

  const API_KEY = process.env.AISSTREAM_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: "AISSTREAM_API_KEY missing" });
  }

  const vessels = new Map();
  let finished = false;
  let finishTimer = null;

  function done(status, payload, ws, resolve) {
    if (finished) return;
    finished = true;

    if (finishTimer) {
      clearTimeout(finishTimer);
      finishTimer = null;
    }

    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    } catch (e) {}

    return res.status(status).json(payload);
  }

  return new Promise((resolve) => {
    const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");

    ws.on("open", () => {
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
        done(200, { vessels: Array.from(vessels.values()) }, ws, resolve);
        resolve();
      }, safeListenMs);
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data);
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
        // Ignorera trasiga AIS-meddelanden så enstaka fel inte stoppar hela svaret.
      }
    });

    ws.on("error", () => {
      done(200, { vessels: Array.from(vessels.values()) }, ws, resolve);
      resolve();
    });

    ws.on("close", () => {
      done(200, { vessels: Array.from(vessels.values()) }, null, resolve);
      resolve();
    });
  });
}
