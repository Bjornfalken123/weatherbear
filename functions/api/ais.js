const AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream";

const DEFAULT_LISTEN_MS = 9000;
const MAX_LISTEN_MS = 10000;
const MAX_AGE_SECONDS = 60 * 60; // visa cacheade fartyg upp till 1 timme
const KV_KEY_PREFIX = "ais-region:";

const REGIONS = [
  {
    id: "oresund",
    name: "Öresund",
    bbox: [[55.25, 12.0], [56.25, 13.1]]
  },
  {
    id: "sweden-west",
    name: "Svenska västkusten",
    bbox: [[55.0, 10.0], [59.6, 13.3]]
  },
  {
    id: "sweden-east",
    name: "Svenska ostkusten",
    bbox: [[55.0, 13.0], [66.0, 25.0]]
  },
  {
    id: "malta",
    name: "Malta",
    bbox: [[35.5, 13.7], [36.3, 15.0]]
  }
];

function jsonResponse(payload, status = 200, cacheStatus = "BYPASS") {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-weatherbear-cache": cacheStatus,
      "content-type": "application/json; charset=utf-8"
    }
  });
}

function nowMs() {
  return Date.now();
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

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

function normalizeShipType(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : cleanString(value);
}

function normalizeIncomingData(data) {
  if (typeof data === "string") return Promise.resolve(data);

  if (data instanceof ArrayBuffer) {
    return Promise.resolve(new TextDecoder().decode(data));
  }

  if (data && typeof data.text === "function") {
    return data.text();
  }

  return Promise.resolve(String(data || ""));
}

function getMessagePayload(msg) {
  if (!msg) return null;
  if (msg.Message) return msg.Message;
  return msg;
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

  const latNum = Number(lat);
  const lonNum = Number(lon);

  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) return null;
  if (Math.abs(latNum) > 90 || Math.abs(lonNum) > 180) return null;

  const mmsi = firstDefined(
    getMmsi(report),
    metadata?.MMSI,
    metadata?.MMSI_String,
    metadata?.mmsi
  );

  return {
    mmsi: mmsi == null ? null : String(mmsi),
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

  if (!ship) return null;

  let source = ship;

  if (ship.ReportA || ship.ReportB) {
    source = {
      ...ship,
      ...(ship.ReportA || {}),
      ...(ship.ReportB || {})
    };
  }

  const mmsi = firstDefined(
    source && getMmsi(source),
    metadata?.MMSI,
    metadata?.MMSI_String,
    metadata?.mmsi
  );

  if (!mmsi) return null;

  return {
    mmsi: String(mmsi),
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

function vesselKey(vessel) {
  if (vessel?.mmsi != null && vessel.mmsi !== "") {
    return "mmsi:" + String(vessel.mmsi);
  }

  const lat = Number(vessel?.lat);
  const lon = Number(vessel?.lon);

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return "pos:" + lat.toFixed(5) + ":" + lon.toFixed(5);
  }

  return "";
}

function mergeVessel(existing, next) {
  const merged = {
    ...(existing || {}),
    ...(next || {})
  };

  merged.static = {
    ...((existing && existing.static) || {}),
    ...((next && next.static) || {})
  };

  merged.name =
    next?.name ||
    existing?.name ||
    merged.static?.name ||
    null;

  merged.callsign =
    next?.callsign ||
    existing?.callsign ||
    merged.static?.callsign ||
    null;

  merged.imo =
    next?.imo ||
    existing?.imo ||
    merged.static?.imo ||
    null;

  merged.shipType =
    next?.shipType ??
    existing?.shipType ??
    merged.static?.shipType ??
    null;

  merged.destination =
    next?.destination ||
    existing?.destination ||
    merged.static?.destination ||
    null;

  merged.eta =
    next?.eta ||
    existing?.eta ||
    merged.static?.eta ||
    null;

  return merged;
}

function parseBbox(value) {
  if (!value) return null;

  const parts = String(value).split(",").map(Number);

  if (parts.length !== 4 || parts.some((v) => !Number.isFinite(v))) {
    return null;
  }

  const [minLon, minLat, maxLon, maxLat] = parts;

  if (
    Math.abs(minLat) > 90 ||
    Math.abs(maxLat) > 90 ||
    Math.abs(minLon) > 180 ||
    Math.abs(maxLon) > 180
  ) {
    return null;
  }

  return {
    minLon: Math.min(minLon, maxLon),
    minLat: Math.min(minLat, maxLat),
    maxLon: Math.max(minLon, maxLon),
    maxLat: Math.max(minLat, maxLat),
    query: [
      Math.min(minLon, maxLon),
      Math.min(minLat, maxLat),
      Math.max(minLon, maxLon),
      Math.max(minLat, maxLat)
    ].join(",")
  };
}

function bboxIntersectsRegion(bbox, region) {
  const [[rMinLat, rMinLon], [rMaxLat, rMaxLon]] = region.bbox;

  return !(
    bbox.maxLon < rMinLon ||
    bbox.minLon > rMaxLon ||
    bbox.maxLat < rMinLat ||
    bbox.minLat > rMaxLat
  );
}

function vesselInsideBbox(vessel, bbox) {
  const lat = Number(vessel?.lat);
  const lon = Number(vessel?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;

  return (
    lat >= bbox.minLat &&
    lat <= bbox.maxLat &&
    lon >= bbox.minLon &&
    lon <= bbox.maxLon
  );
}

function vesselInsideRegion(vessel, region) {
  const lat = Number(vessel?.lat);
  const lon = Number(vessel?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;

  const [[minLat, minLon], [maxLat, maxLon]] = region.bbox;

  return (
    lat >= minLat &&
    lat <= maxLat &&
    lon >= minLon &&
    lon <= maxLon
  );
}

function pruneOld(vessels) {
  const cutoff = nowMs() - MAX_AGE_SECONDS * 1000;

  return vessels.filter((v) => {
    const t = Number(v.lastSeenAt || v.receivedAt || v.cachedAt || 0);
    return Number.isFinite(t) && t >= cutoff;
  });
}

function getKv(env) {
  return env.AIS_CACHE || null;
}

async function readRegionCache(env, regionId) {
  const kv = getKv(env);
  if (!kv) return null;

  const raw = await kv.get(KV_KEY_PREFIX + regionId, "json");

  if (!raw || !Array.isArray(raw.vessels)) {
    return {
      regionId,
      updatedAt: null,
      vessels: []
    };
  }

  return raw;
}

async function writeRegionCache(env, regionId, payload) {
  const kv = getKv(env);
  if (!kv) return;

  await kv.put(KV_KEY_PREFIX + regionId, JSON.stringify(payload));
}

async function getCachedVesselsForBbox(env, bbox) {
  const kv = getKv(env);
  if (!kv) return [];

  const vessels = [];

  for (const region of REGIONS) {
    if (!bboxIntersectsRegion(bbox, region)) continue;

    const cached = await readRegionCache(env, region.id);
    const cachedVessels = Array.isArray(cached?.vessels)
      ? cached.vessels
      : [];

    for (const vessel of cachedVessels) {
      if (!vesselInsideBbox(vessel, bbox)) continue;

      vessels.push({
        ...vessel,
        fromHostingCache: true,
        cacheRegion: vessel.cacheRegion || region.id
      });
    }
  }

  return pruneOld(vessels);
}

async function saveLiveVesselsToRegionCaches(env, liveVessels) {
  const kv = getKv(env);
  if (!kv) return;

  const byRegion = new Map();

  for (const region of REGIONS) {
    const matching = liveVessels.filter((v) => vesselInsideRegion(v, region));
    if (matching.length) {
      byRegion.set(region.id, { region, vessels: matching });
    }
  }

  for (const { region, vessels } of byRegion.values()) {
    const oldCache = await readRegionCache(env, region.id);
    const oldVessels = Array.isArray(oldCache?.vessels)
      ? oldCache.vessels
      : [];

    const merged = new Map();

    for (const oldVessel of oldVessels) {
      if (!vesselInsideRegion(oldVessel, region)) continue;

      const key = vesselKey(oldVessel);
      if (!key) continue;

      merged.set(key, {
        ...oldVessel,
        fromHostingCache: true,
        cacheRegion: oldVessel.cacheRegion || region.id
      });
    }

    for (const liveVessel of vessels) {
      const key = vesselKey(liveVessel);
      if (!key) continue;

      const existing = merged.get(key);

      merged.set(
        key,
        mergeVessel(existing, {
          ...liveVessel,
          cachedAt: nowMs(),
          cacheRegion: region.id,
          fromHostingCache: false
        })
      );
    }

    const mergedVessels = pruneOld(Array.from(merged.values()));

    await writeRegionCache(env, region.id, {
      regionId: region.id,
      regionName: region.name,
      updatedAt: new Date().toISOString(),
      vesselCount: mergedVessels.length,
      vessels: mergedVessels
    });
  }
}

async function fetchFreshAis({ apiKey, bbox, safeListenMs, debug }) {
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
    bbox: bbox.query,
    listenMs: safeListenMs
  };

  return new Promise((resolve) => {
    let finished = false;
    let ws = null;
    let timer = null;

    function finish() {
      if (finished) return;
      finished = true;

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      try {
        if (ws && ws.readyState === 1) {
          ws.close();
        }
      } catch (_) {}

      const payload = {
        vessels: Array.from(vessels.values())
      };

      if (debug) payload.debug = debugInfo;

      resolve(payload);
    }

    try {
      ws = new WebSocket(AISSTREAM_URL);

      ws.addEventListener("open", () => {
        debugInfo.connected = true;

        ws.send(
          JSON.stringify({
            APIKey: apiKey,
            BoundingBoxes: [
              [
                [bbox.minLat, bbox.minLon],
                [bbox.maxLat, bbox.maxLon]
              ]
            ],
            FilterMessageTypes: [
              "PositionReport",
              "StandardClassBPositionReport",
              "ExtendedClassBPositionReport",
              "LongRangeAisBroadcastMessage",
              "ShipStaticData",
              "StaticDataReport",
              "StaticVoyageData"
            ]
          })
        );

        timer = setTimeout(finish, safeListenMs);
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

            const key = vesselKey(position);
            if (!key) return;

            const existing = vessels.get(key);

            const merged = mergeVessel(existing, {
              ...position,
              receivedAt: nowMs(),
              lastSeenAt: nowMs(),
              fromHostingCache: false
            });

            vessels.set(key, merged);
          }

          const staticData = extractStaticData(payload, metadata);

          if (staticData) {
            debugInfo.staticMessages += 1;

            const key = "mmsi:" + String(staticData.mmsi);
            const existing = vessels.get(key);

            const merged = mergeVessel(existing, {
              mmsi: staticData.mmsi,
              name: staticData.name || existing?.name || null,
              callsign: staticData.callsign || existing?.callsign || null,
              imo: staticData.imo || existing?.imo || null,
              shipType: staticData.shipType ?? existing?.shipType ?? null,
              destination: staticData.destination || existing?.destination || null,
              eta: staticData.eta || existing?.eta || null,
              static: staticData,
              receivedAt: nowMs(),
              fromHostingCache: false
            });

            vessels.set(key, merged);
          }

          if (!position && !staticData) {
            debugInfo.ignoredMessages += 1;
          }
        } catch (error) {
          debugInfo.ignoredMessages += 1;
          debugInfo.lastError = error?.message || String(error);
        }
      });

      ws.addEventListener("error", () => {
        debugInfo.errored = true;
        finish();
      });

      ws.addEventListener("close", () => {
        debugInfo.closed = true;
        finish();
      });
    } catch (error) {
      debugInfo.errored = true;
      debugInfo.lastError = error?.message || String(error);
      finish();
    }
  });
}

function mergeLiveAndCached(liveVessels, cachedVessels) {
  const merged = new Map();

  for (const cached of cachedVessels) {
    const key = vesselKey(cached);
    if (!key) continue;

    merged.set(key, {
      ...cached,
      fromHostingCache: true
    });
  }

  for (const live of liveVessels) {
    const key = vesselKey(live);
    if (!key) continue;

    const existing = merged.get(key);

    merged.set(
      key,
      mergeVessel(existing, {
        ...live,
        fromHostingCache: false
      })
    );
  }

  return Array.from(merged.values()).filter((v) => {
    return Number.isFinite(Number(v.lat)) && Number.isFinite(Number(v.lon));
  });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);

  const bbox = parseBbox(url.searchParams.get("bbox"));
  const listenMs = url.searchParams.get("listenMs");
  const debug = url.searchParams.get("debug") === "1";

  if (!bbox) {
    return jsonResponse(
      {
        error: "bbox required",
        example: "/api/ais?bbox=10,55,13,59"
      },
      400
    );
  }

  const apiKey = context.env.AISSTREAM_API_KEY;

  if (!apiKey) {
    return jsonResponse(
      {
        error: "AISSTREAM_API_KEY missing",
        vessels: []
      },
      500
    );
  }

  const safeListenMs =
    clampNumber(listenMs, 1000, MAX_LISTEN_MS) || DEFAULT_LISTEN_MS;

  try {
    const cachedVessels = await getCachedVesselsForBbox(context.env, bbox);

    const freshPayload = await fetchFreshAis({
      apiKey,
      bbox,
      safeListenMs,
      debug
    });

    const liveVessels = Array.isArray(freshPayload.vessels)
      ? freshPayload.vessels.filter((v) => vesselInsideBbox(v, bbox))
      : [];

    const mergedVessels = mergeLiveAndCached(liveVessels, cachedVessels);

    if (liveVessels.length && context.waitUntil) {
      context.waitUntil(
        saveLiveVesselsToRegionCaches(context.env, liveVessels)
      );
    }

    const payload = {
      vessels: mergedVessels,
      cache: {
        mode: getKv(context.env) ? "KV_HOSTING_CACHE" : "NO_KV_BINDING",
        liveCount: liveVessels.length,
        cachedCount: cachedVessels.length,
        mergedCount: mergedVessels.length,
        savedCount: liveVessels.length
      }
    };

    if (debug) {
      payload.debug = freshPayload.debug;
    }

    return jsonResponse(payload, 200, cachedVessels.length ? "KV_MERGED" : "LIVE");
  } catch (error) {
    return jsonResponse(
      {
        error: true,
        message: error?.message || String(error),
        vessels: []
      },
      500
    );
  }
}
