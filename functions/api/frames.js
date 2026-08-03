const CACHE_TTL_SECONDS = 2 * 60; // 2 minuter
const SMHI_BASE = "https://opendata-download-radar.smhi.se/api/version/latest/area/sweden/product/comp";
const SMHI_LATEST_RADAR = `${SMHI_BASE}/latest.png`;
const MAX_HISTORY_HOURS = 24;

function formatLabelSv(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return "";
  return date.toISOString();
}

function arrayBufferToBase64(arrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }

  return btoa(binary);
}

function roundToNearestFiveMinutes(date) {
  const ms = date.getTime();
  const step = 5 * 60 * 1000;
  return new Date(Math.round(ms / step) * step);
}

function roundToNearestHour(date) {
  const ms = date.getTime();
  const step = 60 * 60 * 1000;
  return new Date(Math.round(ms / step) * step);
}

function getEffectiveObservationTime(requested, now) {
  if (!requested) return now;

  // The frontend timeline rounds current time to the nearest full hour. If current
  // time is 10:50, the selected app time may be 11:00 even though SMHI radar
  // should still show the latest/nearest real observation, not a forecast warning.
  const roundedCurrentHour = roundToNearestHour(now);
  if (requested.getTime() > now.getTime() && requested.getTime() <= roundedCurrentHour.getTime()) {
    return now;
  }

  return requested;
}

function parseRequestedTime(request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("time") || url.searchParams.get("timestamp");
  if (!raw) return null;
  const numeric = Number(raw);
  const date = Number.isFinite(numeric) && raw.trim() !== "" ? new Date(numeric) : new Date(raw);
  if (!Number.isFinite(date.getTime())) return null;
  return date;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function smhiDayUrl(date) {
  return `${SMHI_BASE}/${date.getUTCFullYear()}/${pad2(date.getUTCMonth() + 1)}/${pad2(date.getUTCDate())}`;
}

function parseFrameTimeFromString(value) {
  if (!value || typeof value !== "string") return null;
  const iso = value.match(/(20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z?)/);
  if (iso) {
    const d = new Date(iso[1].endsWith("Z") ? iso[1] : `${iso[1]}Z`);
    if (Number.isFinite(d.getTime())) return d;
  }
  const compact = value.match(/(20\d{2})(\d{2})(\d{2})[T_\-]?(\d{2})(\d{2})/);
  if (compact) {
    const [, y, mo, da, h, mi] = compact;
    const d = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(da), Number(h), Number(mi), 0));
    if (Number.isFinite(d.getTime())) return d;
  }
  return null;
}

function extractFrameTime(node, pngLink) {
  const keys = ["valid", "validTime", "timestamp", "time", "date", "updated", "key", "name", "title"];
  for (const key of keys) {
    const d = parseFrameTimeFromString(node?.[key]);
    if (d) return d;
  }
  return parseFrameTimeFromString(pngLink);
}

function collectPngFrames(node, result = []) {
  if (!node || typeof node !== "object") return result;

  if (Array.isArray(node.formats)) {
    const png = node.formats.find((item) => {
      const key = String(item?.key || item?.type || "").toLowerCase();
      const link = String(item?.link || item?.href || "").toLowerCase();
      return key === "png" || link.endsWith(".png");
    });

    if (png?.link || png?.href) {
      const link = png.link || png.href;
      const time = extractFrameTime(node, link);
      if (time) result.push({ link, time });
    }
  }

  if (Array.isArray(node)) {
    node.forEach((item) => collectPngFrames(item, result));
  } else {
    Object.keys(node).forEach((key) => collectPngFrames(node[key], result));
  }

  return result;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "WeatherBearRadar/1.0", "Accept": "application/json" }
  });
  if (!response.ok) throw new Error(`SMHI radar index returned ${response.status}`);
  return response.json();
}

async function findNearestSmhiFrame(targetDate) {
  const target = roundToNearestFiveMinutes(targetDate);
  const dayUrls = [smhiDayUrl(target)];
  const startOfDay = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  if (Math.abs(target.getTime() - startOfDay) < 35 * 60 * 1000) {
    dayUrls.push(smhiDayUrl(new Date(startOfDay - 24 * 60 * 60 * 1000)));
  }

  const frames = [];
  for (const url of dayUrls) {
    try {
      const json = await fetchJson(url);
      collectPngFrames(json, frames);
    } catch (error) {
      // Try next candidate day. Some historic endpoints may not have data yet.
    }
  }

  if (!frames.length) return null;

  let best = null;
  let bestDelta = Infinity;
  for (const frame of frames) {
    const delta = Math.abs(frame.time.getTime() - target.getTime());
    if (delta < bestDelta) {
      best = frame;
      bestDelta = delta;
    }
  }

  // Avoid surprising matches far away from the selected hour.
  if (!best || bestDelta > 45 * 60 * 1000) return null;
  return best;
}

async function fetchRadarImageFrame(frame, fallbackDate) {
  const imageUrl = frame?.link || SMHI_LATEST_RADAR;
  const timestamp = frame?.time || fallbackDate || new Date();
  const upstream = await fetch(imageUrl, {
    headers: { "User-Agent": "WeatherBearRadar/1.0" }
  });

  if (!upstream.ok) {
    throw new Error(`SMHI radar returned ${upstream.status}`);
  }

  const contentType = upstream.headers.get("content-type") || "image/png";
  const arrayBuffer = await upstream.arrayBuffer();
  const base64 = arrayBufferToBase64(arrayBuffer);

  return {
    kind: "radar-observation",
    label: `Observation • ${formatLabelSv(timestamp)}`,
    imageUrl: `data:${contentType};base64,${base64}`,
    timestamp: timestamp.toISOString()
  };
}

async function fetchFreshFrames(request) {
  const now = new Date();
  const requested = parseRequestedTime(request);

  const effectiveRequested = getEffectiveObservationTime(requested, now);

  if (effectiveRequested && effectiveRequested.getTime() > now.getTime() + 2 * 60 * 1000) {
    return {
      source: "SMHI",
      available: false,
      message: "Radar observation saknar prognos",
      requestedTime: requested ? requested.toISOString() : null,
      effectiveTime: effectiveRequested.toISOString(),
      frames: []
    };
  }

  if (effectiveRequested && now.getTime() - effectiveRequested.getTime() > MAX_HISTORY_HOURS * 60 * 60 * 1000) {
    return {
      source: "SMHI",
      available: false,
      message: "Radar observation visas upp till 24 timmar bakåt",
      requestedTime: requested ? requested.toISOString() : null,
      effectiveTime: effectiveRequested.toISOString(),
      frames: []
    };
  }

  let frame = null;
  if (effectiveRequested) {
    frame = await findNearestSmhiFrame(effectiveRequested);
    if (!frame) {
      return {
        source: "SMHI",
        available: false,
        message: "Radar observation saknas för vald tid",
        requestedTime: requested ? requested.toISOString() : null,
        effectiveTime: effectiveRequested.toISOString(),
        frames: []
      };
    }
  }

  const imageFrame = await fetchRadarImageFrame(frame, effectiveRequested || now);

  return {
    source: "SMHI",
    available: true,
    requestedTime: requested ? requested.toISOString() : null,
    effectiveTime: effectiveRequested ? effectiveRequested.toISOString() : null,
    frames: [imageFrame]
  };
}

async function getCachedResponse(context) {
  const cache = caches.default;
  const requested = parseRequestedTime(context.request);
  const effectiveRequested = getEffectiveObservationTime(requested, new Date());
  const keyTime = effectiveRequested ? roundToNearestFiveMinutes(effectiveRequested).toISOString() : "latest";
  const cacheRequest = new Request(`https://weatherbear-cache.local/api/frames/${keyTime}`, { method: "GET" });
  const cached = await cache.match(cacheRequest);

  if (cached) {
    const response = new Response(cached.body, cached);
    response.headers.set("x-weatherbear-cache", "HIT");
    return response;
  }

  const freshData = await fetchFreshFrames(context.request);
  const response = Response.json(freshData, {
    headers: {
      "cache-control": `public, max-age=${CACHE_TTL_SECONDS}`,
      "x-weatherbear-cache": "MISS"
    }
  });

  context.waitUntil(cache.put(cacheRequest, response.clone()));
  return response;
}

export async function onRequestGet(context) {
  try {
    return await getCachedResponse(context);
  } catch (error) {
    return Response.json(
      {
        source: "SMHI",
        available: false,
        message: "Det gick inte att hämta radarbild från SMHI",
        details: error?.message || "okänt fel",
        frames: []
      },
      { status: 500 }
    );
  }
}
