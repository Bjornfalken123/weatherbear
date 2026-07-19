const WFS_URL = "https://ows.emodnet-bathymetry.eu/wfs";
const CACHE_TTL_SECONDS = 24 * 60 * 60;
const MAX_MERCATOR = 20037508.342789244;
const MAX_FEATURES = 8000;

function parseBbox(value) {
  const parts = String(value || "").split(",").map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite)) return null;
  const [minX, minY, maxX, maxY] = parts;
  if (minX >= maxX || minY >= maxY) return null;
  if (parts.some((value) => Math.abs(value) > MAX_MERCATOR * 1.01)) return null;
  return parts;
}

function mercatorToLonLat(coordinate) {
  const x = Number(coordinate && coordinate[0]);
  const y = Number(coordinate && coordinate[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const lon = (x / MAX_MERCATOR) * 180;
  const lat = (Math.atan(Math.sinh((y / MAX_MERCATOR) * Math.PI)) * 180) / Math.PI;
  return [lon, lat];
}

function mapCoordinates(coordinates, transform) {
  if (!Array.isArray(coordinates)) return coordinates;
  if (coordinates.length >= 2 && Number.isFinite(Number(coordinates[0])) && Number.isFinite(Number(coordinates[1]))) {
    return transform(coordinates);
  }
  return coordinates.map((item) => mapCoordinates(item, transform));
}

function extractDepth(properties) {
  const props = properties && typeof properties === "object" ? properties : {};
  const preferred = ["elevation1", "elevation", "depth", "contour", "value", "z"];
  const entries = Object.entries(props);
  for (const name of preferred) {
    const entry = entries.find(([key]) => String(key).toLowerCase() === name);
    if (!entry) continue;
    const match = String(entry[1] == null ? "" : entry[1]).replace(",", ".").match(/-?\d+(?:\.\d+)?/);
    if (!match) continue;
    const value = Math.abs(Number(match[0]));
    if (Number.isFinite(value) && value >= 0 && value <= 12000) return value;
  }
  return null;
}

function normalizeFeatureCollection(payload, target4326) {
  const features = Array.isArray(payload && payload.features) ? payload.features : [];
  const normalized = [];
  for (const feature of features) {
    const geometry = feature && feature.geometry;
    if (!geometry || (geometry.type !== "LineString" && geometry.type !== "MultiLineString")) continue;
    const depth = extractDepth(feature.properties);
    if (!Number.isFinite(depth)) continue;
    const coordinates = target4326
      ? mapCoordinates(geometry.coordinates, mercatorToLonLat)
      : geometry.coordinates;
    if (!coordinates) continue;
    normalized.push({
      type: "Feature",
      id: feature.id,
      properties: {
        depth,
        label: Number.isInteger(depth) ? String(depth) : String(Math.round(depth * 10) / 10)
      },
      geometry: { type: geometry.type, coordinates }
    });
  }
  return { type: "FeatureCollection", features: normalized };
}

function empty(reason, maxAge = 180) {
  return new Response(JSON.stringify({ type: "FeatureCollection", features: [], reason }), {
    status: 200,
    headers: {
      "content-type": "application/geo+json; charset=utf-8",
      "cache-control": `public, max-age=${maxAge}`,
      "x-weatherbear-contours": reason
    }
  });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const bbox = parseBbox(url.searchParams.get("bbox"));
  const target4326 = url.searchParams.get("target") === "4326";
  if (!bbox) return empty("invalid-bbox", 60);

  const width = bbox[2] - bbox[0];
  const height = bbox[3] - bbox[1];
  if (width > 2500000 || height > 2500000) return empty("bbox-too-large", 60);

  const cacheUrl = new URL(context.request.url);
  cacheUrl.searchParams.set("v", "15");
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    const response = new Response(cached.body, cached);
    response.headers.set("x-weatherbear-contours-cache", "HIT");
    return response;
  }

  const upstreamUrl = new URL(WFS_URL);
  upstreamUrl.searchParams.set("service", "WFS");
  upstreamUrl.searchParams.set("version", "1.1.0");
  upstreamUrl.searchParams.set("request", "GetFeature");
  upstreamUrl.searchParams.set("typeName", "emodnet:contours");
  upstreamUrl.searchParams.set("outputFormat", "application/json");
  upstreamUrl.searchParams.set("srsName", "EPSG:3857");
  upstreamUrl.searchParams.set("bbox", `${bbox.join(",")},EPSG:3857`);
  upstreamUrl.searchParams.set("maxFeatures", String(MAX_FEATURES));

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      headers: {
        Accept: "application/json, application/geo+json",
        "User-Agent": "Weatherbear external bathymetric contours/1.0"
      }
    });
    if (!upstream.ok) return empty(`wfs-${upstream.status}`, 120);
    const payload = await upstream.json();
    const normalized = normalizeFeatureCollection(payload, target4326);
    const body = JSON.stringify(normalized);
    const response = new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/geo+json; charset=utf-8",
        "cache-control": `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}`,
        "x-weatherbear-contours-cache": "MISS",
        "x-weatherbear-contours-count": String(normalized.features.length),
        "x-weatherbear-contours-source": "emodnet-wfs-contours"
      }
    });
    context.waitUntil(caches.default.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    return empty("wfs-fetch-error", 120);
  }
}
