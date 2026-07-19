const ERDDAP_GRID_URL = "https://erddap.emodnet.eu/erddap/griddap/bathymetry_dtm_2024.json";
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_MERCATOR = 20037508.342789244;
const TILE_SIZE = 256;
const NATIVE_STEP_DEGREES = 1 / 960; // 1/16 arc minute.
const MAX_AXIS_SAMPLES = 112;
const NO_DATA = 65535;

const SWEDEN_DEPTH_BOUNDS = {
  west: 8.0,
  south: 53.0,
  east: 27.0,
  north: 67.0
};

function numberParam(url, name) {
  const value = Number(url.searchParams.get(name));
  return Number.isFinite(value) ? value : null;
}

function parseMercatorBbox(value) {
  if (!value) return null;
  const parts = String(value).split(",").map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite)) return null;
  const [minX, minY, maxX, maxY] = parts;
  const limit = MAX_MERCATOR * 1.001;
  if (minX >= maxX || minY >= maxY) return null;
  if (parts.some((part) => Math.abs(part) > limit)) return null;
  return parts;
}

function mercatorXToLongitude(x) {
  return (x / MAX_MERCATOR) * 180;
}

function mercatorYToLatitude(y) {
  return (Math.atan(Math.sinh((y / MAX_MERCATOR) * Math.PI)) * 180) / Math.PI;
}

function expandMercatorBbox(bbox, pad) {
  const safePad = Math.max(0, Math.min(64, Math.round(Number(pad) || 0)));
  if (!safePad) return bbox.slice();
  const pixelWidth = (bbox[2] - bbox[0]) / TILE_SIZE;
  const pixelHeight = (bbox[3] - bbox[1]) / TILE_SIZE;
  return [
    bbox[0] - pixelWidth * safePad,
    bbox[1] - pixelHeight * safePad,
    bbox[2] + pixelWidth * safePad,
    bbox[3] + pixelHeight * safePad
  ];
}

function mercatorBoundsToLonLat(bbox) {
  return {
    west: mercatorXToLongitude(bbox[0]),
    south: mercatorYToLatitude(bbox[1]),
    east: mercatorXToLongitude(bbox[2]),
    north: mercatorYToLatitude(bbox[3])
  };
}

function overlaps(a, b) {
  return !(
    a.east < b.west ||
    a.west > b.east ||
    a.north < b.south ||
    a.south > b.north
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatCoordinate(value) {
  return Number(value).toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

function chooseStride(bounds) {
  const lonCells = Math.max(1, Math.ceil(Math.abs(bounds.east - bounds.west) / NATIVE_STEP_DEGREES));
  const latCells = Math.max(1, Math.ceil(Math.abs(bounds.north - bounds.south) / NATIVE_STEP_DEGREES));
  return Math.max(1, Math.ceil(Math.max(lonCells, latCells) / MAX_AXIS_SAMPLES));
}

function buildErddapUrl(bounds, stride) {
  const query = [
    "elevation",
    `[("${formatCoordinate(bounds.south)}"):${stride}:("${formatCoordinate(bounds.north)}")]`,
    `[("${formatCoordinate(bounds.west)}"):${stride}:("${formatCoordinate(bounds.east)}")]`
  ].join("").replace(/\"/g, "");
  return `${ERDDAP_GRID_URL}?${encodeURI(query)}`;
}

function normalizeErddapGrid(payload) {
  const table = payload && payload.table;
  const columns = table && Array.isArray(table.columnNames) ? table.columnNames : [];
  const rows = table && Array.isArray(table.rows) ? table.rows : [];
  const latIndex = columns.indexOf("latitude");
  const lonIndex = columns.indexOf("longitude");
  const elevationIndex = columns.indexOf("elevation");
  if (latIndex < 0 || lonIndex < 0 || elevationIndex < 0 || !rows.length) return null;

  const latValues = [];
  const lonValues = [];
  const latSeen = new Map();
  const lonSeen = new Map();

  for (const row of rows) {
    const lat = Number(row && row[latIndex]);
    const lon = Number(row && row[lonIndex]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const latKey = lat.toFixed(10);
    const lonKey = lon.toFixed(10);
    if (!latSeen.has(latKey)) {
      latSeen.set(latKey, lat);
      latValues.push(lat);
    }
    if (!lonSeen.has(lonKey)) {
      lonSeen.set(lonKey, lon);
      lonValues.push(lon);
    }
  }

  latValues.sort((a, b) => a - b);
  lonValues.sort((a, b) => a - b);
  if (!latValues.length || !lonValues.length) return null;

  const latLookup = new Map(latValues.map((value, index) => [value.toFixed(10), index]));
  const lonLookup = new Map(lonValues.map((value, index) => [value.toFixed(10), index]));
  const depthDm = new Array(latValues.length * lonValues.length).fill(NO_DATA);
  let validCount = 0;

  for (const row of rows) {
    const lat = Number(row && row[latIndex]);
    const lon = Number(row && row[lonIndex]);
    const elevation = Number(row && row[elevationIndex]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(elevation)) continue;
    const latPosition = latLookup.get(lat.toFixed(10));
    const lonPosition = lonLookup.get(lon.toFixed(10));
    if (latPosition == null || lonPosition == null) continue;

    // ERDDAP stores bathymetry as negative elevation. Positive values are land.
    if (elevation >= 0) continue;
    const depth = Math.max(0, -elevation);
    const encoded = Math.max(0, Math.min(NO_DATA - 1, Math.round(depth * 10)));
    depthDm[latPosition * lonValues.length + lonPosition] = encoded;
    validCount++;
  }

  if (!validCount) return null;
  return {
    latitudes: latValues,
    longitudes: lonValues,
    depthDm,
    validCount,
    noData: NO_DATA
  };
}

function emptyResponse(reason, maxAge = 300) {
  return new Response(null, {
    status: 204,
    headers: {
      "cache-control": `public, max-age=${maxAge}`,
      "x-weatherbear-depth": reason
    }
  });
}

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const bbox = parseMercatorBbox(requestUrl.searchParams.get("bbox"));
  const pad = numberParam(requestUrl, "pad") || 0;
  const scale = Math.max(1, Math.min(2, Math.round(numberParam(requestUrl, "scale") || 1)));
  if (!bbox) return emptyResponse("invalid-bbox", 60);

  const expandedBbox = expandMercatorBbox(bbox, pad);
  const lonLatBounds = mercatorBoundsToLonLat(expandedBbox);
  if (!overlaps(lonLatBounds, SWEDEN_DEPTH_BOUNDS)) return emptyResponse("outside-area");

  const queryBounds = {
    west: clamp(lonLatBounds.west, SWEDEN_DEPTH_BOUNDS.west, SWEDEN_DEPTH_BOUNDS.east),
    south: clamp(lonLatBounds.south, SWEDEN_DEPTH_BOUNDS.south, SWEDEN_DEPTH_BOUNDS.north),
    east: clamp(lonLatBounds.east, SWEDEN_DEPTH_BOUNDS.west, SWEDEN_DEPTH_BOUNDS.east),
    north: clamp(lonLatBounds.north, SWEDEN_DEPTH_BOUNDS.south, SWEDEN_DEPTH_BOUNDS.north)
  };
  if (queryBounds.west >= queryBounds.east || queryBounds.south >= queryBounds.north) {
    return emptyResponse("outside-area");
  }

  const stride = chooseStride(queryBounds);
  const cache = caches.default;
  const cacheUrl = new URL(context.request.url);
  cacheUrl.searchParams.set("v", "12");
  cacheUrl.searchParams.set("stride", String(stride));
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) {
    const response = new Response(cached.body, cached);
    response.headers.set("x-weatherbear-depth-cache", "HIT");
    return response;
  }

  const upstreamUrl = buildErddapUrl(queryBounds, stride);
  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Weatherbear raw depth grid/3.0"
      }
    });
    if (!upstream.ok) return emptyResponse(`erddap-${upstream.status}`, 120);

    const payload = await upstream.json();
    const grid = normalizeErddapGrid(payload);
    if (!grid) return emptyResponse("erddap-no-depth", 300);

    const body = JSON.stringify({
      version: 1,
      source: "EMODnet ERDDAP bathymetry_dtm_2024 elevation",
      bboxMercator: expandedBbox,
      requestedBounds: queryBounds,
      stride,
      renderScale: scale,
      nativeStepDegrees: NATIVE_STEP_DEGREES,
      latitudes: grid.latitudes,
      longitudes: grid.longitudes,
      depthDm: grid.depthDm,
      noData: grid.noData,
      validCount: grid.validCount
    });

    const response = new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}`,
        "x-weatherbear-depth-cache": "MISS",
        "x-weatherbear-depth-source": "erddap-raw-grid",
        "x-weatherbear-depth-stride": String(stride),
        "x-weatherbear-depth-valid": String(grid.validCount)
      }
    });
    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    return emptyResponse("erddap-fetch-error", 120);
  }
}
