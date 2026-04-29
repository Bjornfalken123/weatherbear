import {
  parseBbox,
  saveAisVesselsToCache,
  getCachedAisVesselsForBbox,
  mergeAisVessels
} from "../_ais-cache.js";
const DEFAULT_LISTEN_MS = 9000;
const MAX_LISTEN_MS = 10000;
const CACHE_TTL_SECONDS = 20; // 20 sekunder

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

function normalizeIncomingData(data) {
  if (typeof data === "string") return data;

  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }

  if (data && typeof data.text === "function") {
    return data.text();
  }

  return String(data || "");
}

function getMessagePayload(msg) {
  if (!msg) return null;
  if (msg.Message) return msg.Message;
  return msg;
}

function extractPosition(payload, metadata) {
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

  const mmsi = firstDefined(
    getMmsi(report),
    metadata?.MMSI,
    metadata?.mmsi
  );

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
    ),
    name:
      cleanString(metadata?.ShipName) ||
      cleanString(metadata?.shipName) ||
      null,
    callsign:
      cleanString(metadata?.CallSign) ||
      cleanString(metadata?.callsign) ||
      null
  };
}

function extractStaticData(payload, metadata) {
  const ship =
    payload?.ShipStaticData ||
    payload?.StaticDataReport ||
    payload?.StaticVoyageData ||
    null;

  let source = ship;

  if (ship && (ship.ReportA || ship.ReportB)) {
    source = {
      ...ship,
      ...(ship.ReportA || {}),
      ...(ship.ReportB || {})
    };
  }

  const mmsi = firstDefined(
    source && getMmsi(source),
    metadata?.MMSI,
    metadata?.mmsi
  );

  if (!mmsi) return null;

  return {
    mmsi,
    name:
      cleanString(source?.Name) ||
      cleanString(source?.ShipName) ||
      cleanString(source?.VesselName) ||
      cleanString(metadata?.ShipName) ||
      cleanString(metadata?.shipName),
    callsign:
      cleanString(source?.CallSign) ||
      cleanString(source?.Callsign) ||
      cleanString(source?.CallsSignName) ||
      cleanString(metadata?.CallSign) ||
      cleanString(metadata?.callsign),
    imo: firstDefined(
      source?.ImoNumber,
      source?.IMO,
      source?.Imo,
      source?.imo,
      metadata?.IMO,
      metadata?.imo
    ),
    shipType: normalizeShipType(
      firstDefined(
        source?.Type,
        source?.ShipType,
        source?.ShipAndCargoType,
        source?.shipType
      )
    ),
    destination:
      cleanString(source?.Destination) ||
      cleanString(source?.destination),
    eta: firstDefined(
      source?.Eta,
      source?.ETA,
      source?.eta
    ),
    dimensionToBow: firstDefined(source?.DimensionToBow, source?.ToBow),
    dimensionToStern: firstDefined(source?.DimensionToStern, source?.ToStern),
    dimensionToPort: firstDefined(source?.DimensionToPort, source?.ToPort),
    dimensionToStarboard: firstDefined(
      source?.DimensionToStarboard,
      source?.ToStarboard
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

function roundBboxCoord(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return 0;
  }

  return Math.round(n * 10) / 10;
}

function makeCacheKey(minLon, minLat, maxLon, maxLat) {
  return [
    "https://weatherbear-cache.local/api/ais",
    roundBboxCoord(minLon),
    roundBboxCoord(minLat),
    roundBboxCoord(maxLon),
    roundBboxCoord(maxLat)
  ].join("/");
}

function jsonResponse(payload, status = 200, cacheStatus = "BYPASS") {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": `public, max-age=${CACHE_TTL_SECONDS}`,
      "x-weatherbear-cache": cacheStatus
    }
  });
}

async function getCachedResponse(context, cacheKey, fetchFreshData) {
  const cache = caches.default;
  const cacheRequest = new Request(cacheKey, {
    method: "GET"
  });

  const cached = await cache.match(cacheRequest);

  if (cached) {
    const response = new Response(cached.body, cached);
    response.headers.set("x-weatherbear-cache", "HIT");
    return response;
  }

  const freshPayload = await fetchFreshData();

  const response = jsonResponse(freshPayload, 200, "MISS");

  context.waitUntil(cache.put(cacheRequest, response.clone()));

  return response;
}

async function fetchFreshAis({
  apiKey,
  minLon,
  minLat,
  maxLon,
  maxLat,
  safeListenMs,
  debug
}) {
  const vessels = new Map();

  const debugInfo = {
    connected: false,
    closed: false,
    errored: false,
    messages: 0,
    positionMessages: 0,
    staticMessages: 0,
    ignoredMessages: 0,
    messageTypes: {},
    lastError: null,
    bbox: {
      minLon,
      minLat,
      maxLon,
      maxLat
    },
    listenMs: safeListenMs
  };

  return new Promise((resolve) => {
    let finished = false;
    let finishTimer = null;
    let ws = null;

    function finish(payload = { vessels: [] }) {
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

      if (debug) {
        payload.debug = debugInfo;
      }

      resolve(payload);
    }

    try {
      ws = new WebSocket("wss://stream.aisstream.io/v0/stream");

      ws.addEventListener("open", () => {
        debugInfo.connected = true;

        ws.send(
          JSON.stringify({
            APIKey: apiKey,
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
          finish({
            vessels: Array.from(vessels.values())
          });
        }, safeListenMs);
      });

      ws.addEventListener("message", async (event) => {
        try {
          const rawText = await normalizeIncomingData(event.data);
          const msg = JSON.parse(rawText);

          debugInfo.messages += 1;

          const messageType =
            msg?.MessageType ||
            msg?.messageType ||
            "unknown";

          debugInfo.messageTypes[messageType] =
            (debugInfo.messageTypes[messageType] || 0) + 1;

          if (msg?.Error || msg?.error) {
            debugInfo.lastError = msg.Error || msg.error;
            return;
          }

          const payload = getMessagePayload(msg);
          const metadata = msg?.MetaData || msg?.metadata || null;

          if (!payload) {
            debugInfo.ignoredMessages += 1;
            return;
          }

          const position = extractPosition(payload, metadata);

          if (position) {
            debugInfo.positionMessages += 1;

            const key = vesselKeyFromPosition(position);
            const existing = vessels.get(key);

            const merged = mergeVessel(existing, {
              ...position,
              name:
                position.name ||
                existing?.name ||
                existing?.static?.name ||
                null,
              callsign:
                position.callsign ||
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

          const staticData = extractStaticData(payload, metadata);

          if (staticData) {
            debugInfo.staticMessages += 1;

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

          if (!position && !staticData) {
            debugInfo.ignoredMessages += 1;
          }
        } catch (e) {
          debugInfo.ignoredMessages += 1;
          debugInfo.lastError = e?.message || String(e);
        }
      });

      ws.addEventListener("error", () => {
        debugInfo.errored = true;

        finish({
          vessels: Array.from(vessels.values())
        });
      });

      ws.addEventListener("close", () => {
        debugInfo.closed = true;

        finish({
          vessels: Array.from(vessels.values())
        });
      });
    } catch (error) {
      debugInfo.errored = true;
      debugInfo.lastError = error?.message || String(error);

      finish({
        error: "AIS websocket failed",
        message: error.message,
        vessels: []
      });
    }
  });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);

  const bbox = url.searchParams.get("bbox");
  const listenMs = url.searchParams.get("listenMs");
  const debug = url.searchParams.get("debug") === "1";

  if (!bbox) {
    return jsonResponse({ error: "bbox required" }, 400, "BYPASS");
  }

  const [minLon, minLat, maxLon, maxLat] = String(bbox)
    .split(",")
    .map(Number);

  if ([minLon, minLat, maxLon, maxLat].some((v) => Number.isNaN(v))) {
    return jsonResponse({ error: "invalid bbox" }, 400, "BYPASS");
  }

  const safeListenMs =
    clampNumber(listenMs, 1000, MAX_LISTEN_MS) || DEFAULT_LISTEN_MS;

  const apiKey = context.env.AISSTREAM_API_KEY;

  if (!apiKey) {
    return jsonResponse({ error: "AISSTREAM_API_KEY missing" }, 500, "BYPASS");
  }

  const cacheKey = makeCacheKey(minLon, minLat, maxLon, maxLat);

  try {
    if (debug) {
      const freshPayload = await fetchFreshAis({
        apiKey,
        minLon,
        minLat,
        maxLon,
        maxLat,
        safeListenMs,
        debug
      });

      return jsonResponse(freshPayload, 200, "BYPASS");
    }

    return await getCachedResponse(context, cacheKey, () =>
      fetchFreshAis({
        apiKey,
        minLon,
        minLat,
        maxLon,
        maxLat,
        safeListenMs,
        debug: false
      })
    );
  } catch (error) {
    return jsonResponse(
      {
        error: true,
        message: error.message,
        vessels: []
      },
      500,
      "BYPASS"
    );
  }
}
