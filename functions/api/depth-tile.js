const EMODNET_WMS_URL = "https://ows.emodnet-bathymetry.eu/wms";
const TILE_SIZE = 256;
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_MERCATOR = 20037508.342789244;

// Weatherbears första produktionsområde: svenska hav och kustvatten med marginal.
const SWEDEN_DEPTH_BOUNDS = {
  west: 8.0,
  south: 53.0,
  east: 27.0,
  north: 67.0
};

const DEPTH_PALETTES = {
  day: [
    { quantity: -12000, color: "#ffffff", label: "djupare än 50 m" },
    { quantity: -50, color: "#fbfdff", label: "20–50 m" },
    { quantity: -20, color: "#f2f9ff", label: "10–20 m" },
    { quantity: -10, color: "#e2f2ff", label: "6–10 m" },
    { quantity: -6, color: "#cce9fb", label: "3–6 m" },
    { quantity: -3, color: "#a9d9f3", label: "2–3 m" },
    { quantity: -2, color: "#78c2e8", label: "0–2 m" },
    { quantity: 0, color: "#4ba9d8", label: "0 m" }
  ],
  night: [
    { quantity: -12000, color: "#0a1216", label: "djupare än 50 m" },
    { quantity: -50, color: "#0f1b1f", label: "20–50 m" },
    { quantity: -20, color: "#142227", label: "10–20 m" },
    { quantity: -10, color: "#192a2f", label: "6–10 m" },
    { quantity: -6, color: "#1e3136", label: "3–6 m" },
    { quantity: -3, color: "#24393e", label: "2–3 m" },
    { quantity: -2, color: "#2a4146", label: "0–2 m" },
    { quantity: 0, color: "#30494e", label: "0 m" }
  ]
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
  if (
    Math.abs(minX) > limit ||
    Math.abs(maxX) > limit ||
    Math.abs(minY) > limit ||
    Math.abs(maxY) > limit
  ) return null;
  return parts;
}

function mercatorYToLatitude(y) {
  return (Math.atan(Math.sinh((y / MAX_MERCATOR) * Math.PI)) * 180) / Math.PI;
}

function mercatorBoundsToLonLat(bbox) {
  const [minX, minY, maxX, maxY] = bbox;
  return {
    west: (minX / MAX_MERCATOR) * 180,
    south: mercatorYToLatitude(minY),
    east: (maxX / MAX_MERCATOR) * 180,
    north: mercatorYToLatitude(maxY)
  };
}

function tileLonLatBounds(z, x, y) {
  const n = 2 ** z;
  const west = (x / n) * 360 - 180;
  const east = ((x + 1) / n) * 360 - 180;
  const north = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  const south = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI;
  return { west, south, east, north };
}

function tileMercatorBounds(z, x, y) {
  const n = 2 ** z;
  const span = (2 * MAX_MERCATOR) / n;
  const minX = -MAX_MERCATOR + x * span;
  const maxX = minX + span;
  const maxY = MAX_MERCATOR - y * span;
  const minY = maxY - span;
  return [minX, minY, maxX, maxY];
}

function overlaps(a, b) {
  return !(
    a.east < b.west ||
    a.west > b.east ||
    a.north < b.south ||
    a.south > b.north
  );
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildWeatherbearDepthAnalysisSld() {
  // V9 kodar sjökortets djupzoner som exakta gråskaleklasser.
  // Klasserna följer samma nivåer som djupkurvorna: 2, 3, 6, 10, 20 och 50 m.
  // Klienten avkodar därefter klassen och applicerar dag-/nattpaletten lokalt.
  // Land och positiva höjder görs transparenta.
  return [
    '<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">',
    '<NamedLayer><Name>emodnet:mean</Name><UserStyle><Title>Weatherbear depth bands v9</Title><FeatureTypeStyle><Rule><RasterSymbolizer><Opacity>1</Opacity>',
    '<ColorMap type="intervals" extended="false">',
    '<ColorMapEntry color="#000000" quantity="-32768" opacity="0" label="no data"/>',
    '<ColorMapEntry color="#202020" quantity="-1000" opacity="1" label="djupare än 50 m"/>',
    '<ColorMapEntry color="#404040" quantity="-50" opacity="1" label="20–50 m"/>',
    '<ColorMapEntry color="#606060" quantity="-20" opacity="1" label="10–20 m"/>',
    '<ColorMapEntry color="#808080" quantity="-10" opacity="1" label="6–10 m"/>',
    '<ColorMapEntry color="#a0a0a0" quantity="-6" opacity="1" label="3–6 m"/>',
    '<ColorMapEntry color="#c0c0c0" quantity="-3" opacity="1" label="2–3 m"/>',
    '<ColorMapEntry color="#e0e0e0" quantity="-2" opacity="1" label="0–2 m"/>',
    '<ColorMapEntry color="#e0e0e0" quantity="0" opacity="1" label="0 m"/>',
    '<ColorMapEntry color="#ffffff" quantity="0.001" opacity="0" label="land"/>',
    '</ColorMap></RasterSymbolizer></Rule></FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>'
  ].join("");
}

function buildWeatherbearContourSld(theme = "day", scale = 1) {
  const isNight = theme === "night";
  const renderScale = Math.max(1, Math.min(2, Number(scale) || 1));
  const lineColor = isNight ? "#9b8058" : "#477f9f";
  const textColor = isNight ? "#bda06e" : "#315f79";
  const haloColor = isNight ? "#050505" : "#ffffff";
  const lineWidth = (0.85 * renderScale).toFixed(2);
  const fontSize = Math.round(9 * renderScale);
  const haloRadius = (1.5 * renderScale).toFixed(1);
  const repeat = Math.round(180 * renderScale);
  const displacement = Math.round(40 * renderScale);

  return [
    '<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">',
    '<NamedLayer><Name>emodnet:mean</Name><UserStyle><Title>Weatherbear depth contours</Title><FeatureTypeStyle>',
    '<Transformation><ogc:Function name="ras:Contour">',
    '<ogc:Function name="parameter"><ogc:Literal>data</ogc:Literal></ogc:Function>',
    '<ogc:Function name="parameter"><ogc:Literal>levels</ogc:Literal>',
    '<ogc:Literal>-50</ogc:Literal><ogc:Literal>-20</ogc:Literal><ogc:Literal>-10</ogc:Literal><ogc:Literal>-6</ogc:Literal><ogc:Literal>-3</ogc:Literal><ogc:Literal>-2</ogc:Literal>',
    '</ogc:Function></ogc:Function></Transformation>',
    `<Rule><LineSymbolizer><Stroke><CssParameter name="stroke">${lineColor}</CssParameter><CssParameter name="stroke-opacity">${isNight ? "0.30" : "0.22"}</CssParameter><CssParameter name="stroke-width">${lineWidth}</CssParameter></Stroke></LineSymbolizer>`,
    '<TextSymbolizer><Label><ogc:Function name="numberFormat"><ogc:Literal>0</ogc:Literal><ogc:Function name="abs"><ogc:PropertyName>value</ogc:PropertyName></ogc:Function></ogc:Function></Label>',
    `<Font><CssParameter name="font-family">Arial</CssParameter><CssParameter name="font-size">${fontSize}</CssParameter><CssParameter name="font-weight">bold</CssParameter></Font>`,
    `<LabelPlacement><LinePlacement/></LabelPlacement><Halo><Radius><ogc:Literal>${haloRadius}</ogc:Literal></Radius><Fill><CssParameter name="fill">${haloColor}</CssParameter><CssParameter name="fill-opacity">${isNight ? "0.9" : "0.82"}</CssParameter></Fill></Halo>`,
    `<Fill><CssParameter name="fill">${textColor}</CssParameter></Fill><Priority>2000</Priority>`,
    `<VendorOption name="followLine">true</VendorOption><VendorOption name="repeat">${repeat}</VendorOption><VendorOption name="maxDisplacement">${displacement}</VendorOption><VendorOption name="maxAngleDelta">30</VendorOption>`,
    '</TextSymbolizer></Rule></FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>'
  ].join("");
}

function makeUpstreamUrl(type, bbox, { pad = 0, scale = 1, theme = "day" } = {}) {
  const safePad = Math.max(0, Math.min(56, Math.round(Number(pad) || 0)));
  const renderScale = Math.max(1, Math.min(2, Math.round(Number(scale) || 1)));
  const pixelWidth = (bbox[2] - bbox[0]) / TILE_SIZE;
  const pixelHeight = (bbox[3] - bbox[1]) / TILE_SIZE;
  const requestBbox = safePad > 0
    ? [
        bbox[0] - pixelWidth * safePad,
        bbox[1] - pixelHeight * safePad,
        bbox[2] + pixelWidth * safePad,
        bbox[3] + pixelHeight * safePad
      ]
    : bbox;
  const logicalSize = TILE_SIZE + safePad * 2;
  const requestSize = logicalSize * renderScale;
  const renderTheme = theme === "night" ? "night" : "day";

  const params = new URLSearchParams({
    service: "WMS",
    request: "GetMap",
    version: "1.1.1",
    layers: "emodnet:mean",
    styles: "",
    format: type === "contours" ? "image/png" : "image/png8",
    transparent: "true",
    tiled: "false",
    width: String(requestSize),
    height: String(requestSize),
    srs: "EPSG:3857",
    bbox: requestBbox.join(","),
    interpolations: type === "contours" ? "bilinear" : "nearest"
  });

  if (type === "contours") {
    params.set("SLD_BODY", buildWeatherbearContourSld(renderTheme, renderScale));
    params.set("buffer", String(24 * renderScale));
  } else {
    params.set("SLD_BODY", buildWeatherbearDepthAnalysisSld());
    params.set("buffer", String(8 * renderScale));
  }

  return `${EMODNET_WMS_URL}?${params.toString()}`;
}

function emptyTileResponse(reason = "outside-area", maxAge = CACHE_TTL_SECONDS) {
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
  const z = numberParam(requestUrl, "z");
  const x = numberParam(requestUrl, "x");
  const y = numberParam(requestUrl, "y");
  const requestedBbox = parseMercatorBbox(requestUrl.searchParams.get("bbox"));
  const requestedType = requestUrl.searchParams.get("type");
  const requestedPad = Math.max(0, Math.min(56, Math.round(numberParam(requestUrl, "pad") || 0)));
  const requestedScale = Math.max(1, Math.min(2, Math.round(numberParam(requestUrl, "scale") || 1)));
  const theme = requestUrl.searchParams.get("theme") === "night" ? "night" : "day";
  const type = requestedType === "contours" ? "contours" : "fill";

  let bbox = requestedBbox;
  let lonLatBounds = null;

  if (bbox) {
    lonLatBounds = mercatorBoundsToLonLat(bbox);
  } else {
    if (![z, x, y].every(Number.isInteger) || z < 0 || z > 15) {
      return Response.json(
        { error: true, message: "Ogiltig bbox eller tile-koordinater" },
        { status: 400 }
      );
    }

    const n = 2 ** z;
    if (x < 0 || y < 0 || x >= n || y >= n) {
      return Response.json(
        { error: true, message: "Tile ligger utanför kartans rutnät" },
        { status: 400 }
      );
    }

    lonLatBounds = tileLonLatBounds(z, x, y);
    bbox = tileMercatorBounds(z, x, y);
  }

  if (!overlaps(lonLatBounds, SWEDEN_DEPTH_BOUNDS)) {
    return emptyTileResponse();
  }

  const cache = caches.default;
  const normalizedCacheUrl = new URL(context.request.url);
  // Fyllbilden är ett neutralt numeriskt analysraster; dag/natt färgsätts i klienten.
  // Dela därför samma råcache mellan temana. Konturer har däremot egen dag/nattstil.
  if (type === "fill") normalizedCacheUrl.searchParams.set("theme", "analysis");
  const cacheKey = new Request(normalizedCacheUrl.toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) {
    const response = new Response(cached.body, cached);
    response.headers.set("x-weatherbear-depth-cache", "HIT");
    return response;
  }

  const upstreamUrl = makeUpstreamUrl(type, bbox, {
    pad: requestedPad,
    scale: requestedScale,
    theme
  });

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        Accept: "image/png",
        "User-Agent": "Weatherbear depth layer/1.5"
      }
    });

    const contentType = upstream.headers.get("content-type") || "";
    const validImage = upstream.ok && contentType.toLowerCase().includes("image");

    // Ingen främmande reservkarta används. Ett felaktigt eller tomt kontursvar ska
    // hellre lämna en transparent tile än att en annan färgskala läcker igenom.
    if (!validImage) {
      return emptyTileResponse(`upstream-${upstream.status}`, 300);
    }

    const response = new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": contentType || "image/png",
        "cache-control": `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}`,
        "x-weatherbear-depth-cache": "MISS",
        "x-weatherbear-depth-source": type,
        "x-weatherbear-depth-grid": requestedBbox ? "maplibre-bbox" : "legacy-zxy",
        "x-weatherbear-depth-pad": String(requestedPad),
        "x-weatherbear-depth-scale": String(requestedScale),
        "x-weatherbear-depth-theme": theme,
        "x-weatherbear-depth-interpolation": type === "contours" ? "bilinear" : "nearest",
        "x-weatherbear-depth-encoding": type === "fill" ? "contour-bands-v9" : "contours"
      }
    });

    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    return emptyTileResponse("fetch-error", 120);
  }
}
