const EMODNET_WMS_URL = "https://ows.emodnet-bathymetry.eu/wms";
const TILE_SIZE = 512;
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_MERCATOR = 20037508.342789244;

// Första Weatherbear-området: svenska hav och större kustvatten.
const SWEDEN_DEPTH_BOUNDS = {
  west: 9.4,
  south: 54.3,
  east: 25.8,
  north: 66.8
};

function numberParam(url, name) {
  const value = Number(url.searchParams.get(name));
  return Number.isFinite(value) ? value : null;
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

function buildWeatherbearDepthSld() {
  return [
    '<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">',
    '<NamedLayer><Name>emodnet:mean</Name><UserStyle><Title>Weatherbear depth zones</Title><FeatureTypeStyle><Rule><RasterSymbolizer><Opacity>1</Opacity>',
    '<ColorMap type="intervals" extended="false">',
    '<ColorMapEntry color="#ffffff" quantity="-12000" opacity="0.96" label="djupare än 50 m"/>',
    '<ColorMapEntry color="#fbfdff" quantity="-50" opacity="0.96" label="20–50 m"/>',
    '<ColorMapEntry color="#f2f9ff" quantity="-20" opacity="0.97" label="10–20 m"/>',
    '<ColorMapEntry color="#e2f2ff" quantity="-10" opacity="0.98" label="6–10 m"/>',
    '<ColorMapEntry color="#cce9fb" quantity="-6" opacity="0.99" label="3–6 m"/>',
    '<ColorMapEntry color="#a9d9f3" quantity="-3" opacity="1" label="2–3 m"/>',
    '<ColorMapEntry color="#78c2e8" quantity="-2" opacity="1" label="0–2 m"/>',
    '<ColorMapEntry color="#4ba9d8" quantity="0" opacity="1" label="0 m"/>',
    '<ColorMapEntry color="#ffffff" quantity="0.01" opacity="0" label="land"/>',
    '</ColorMap></RasterSymbolizer></Rule></FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>'
  ].join("");
}

function buildWeatherbearContourSld() {
  return [
    '<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">',
    '<NamedLayer><Name>emodnet:mean</Name><UserStyle><Title>Weatherbear shallow contours</Title><FeatureTypeStyle>',
    '<Transformation><ogc:Function name="ras:Contour">',
    '<ogc:Function name="parameter"><ogc:Literal>data</ogc:Literal></ogc:Function>',
    '<ogc:Function name="parameter"><ogc:Literal>levels</ogc:Literal>',
    '<ogc:Literal>-50</ogc:Literal><ogc:Literal>-20</ogc:Literal><ogc:Literal>-10</ogc:Literal><ogc:Literal>-6</ogc:Literal><ogc:Literal>-3</ogc:Literal><ogc:Literal>-2</ogc:Literal>',
    '</ogc:Function></ogc:Function></Transformation>',
    '<Rule><LineSymbolizer><Stroke><CssParameter name="stroke">#477f9f</CssParameter><CssParameter name="stroke-opacity">0.78</CssParameter><CssParameter name="stroke-width">0.85</CssParameter></Stroke></LineSymbolizer>',
    '<TextSymbolizer><Label><ogc:Function name="numberFormat"><ogc:Literal>0</ogc:Literal><ogc:Function name="abs"><ogc:PropertyName>value</ogc:PropertyName></ogc:Function></ogc:Function></Label>',
    '<Font><CssParameter name="font-family">Arial</CssParameter><CssParameter name="font-size">9</CssParameter><CssParameter name="font-weight">bold</CssParameter></Font>',
    '<LabelPlacement><LinePlacement/></LabelPlacement><Halo><Radius><ogc:Literal>1.5</ogc:Literal></Radius><Fill><CssParameter name="fill">#ffffff</CssParameter><CssParameter name="fill-opacity">0.82</CssParameter></Fill></Halo>',
    '<Fill><CssParameter name="fill">#315f79</CssParameter></Fill><Priority>2000</Priority>',
    '<VendorOption name="followLine">true</VendorOption><VendorOption name="repeat">180</VendorOption><VendorOption name="maxDisplacement">40</VendorOption><VendorOption name="maxAngleDelta">30</VendorOption>',
    '</TextSymbolizer></Rule></FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>'
  ].join("");
}

function makeUpstreamUrl(type, bbox, fallback = false) {
  const customContours = type === "contours" && !fallback;
  const params = new URLSearchParams({
    service: "WMS",
    request: "GetMap",
    version: "1.1.1",
    layers: type === "contours" && fallback ? "emodnet:contours" : "emodnet:mean",
    styles: "",
    format: "image/png",
    transparent: "true",
    tiled: customContours ? "false" : "true",
    width: String(TILE_SIZE),
    height: String(TILE_SIZE),
    srs: "EPSG:3857",
    bbox: bbox.join(","),
    interpolations: type === "fill" ? "bicubic" : "bilinear"
  });

  if (type === "fill") {
    params.set("SLD_BODY", buildWeatherbearDepthSld());
  } else if (customContours) {
    params.set("SLD_BODY", buildWeatherbearContourSld());
    params.set("buffer", "24");
  }

  return `${EMODNET_WMS_URL}?${params.toString()}`;
}

function emptyTileResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      "cache-control": `public, max-age=${CACHE_TTL_SECONDS}`,
      "x-weatherbear-depth": "outside-area"
    }
  });
}

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const z = numberParam(requestUrl, "z");
  const x = numberParam(requestUrl, "x");
  const y = numberParam(requestUrl, "y");
  const type = requestUrl.searchParams.get("type") === "contours" ? "contours" : "fill";

  if (![z, x, y].every(Number.isInteger) || z < 0 || z > 14) {
    return Response.json(
      { error: true, message: "Ogiltiga tile-koordinater" },
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

  const lonLatBounds = tileLonLatBounds(z, x, y);
  if (!overlaps(lonLatBounds, SWEDEN_DEPTH_BOUNDS)) {
    return emptyTileResponse();
  }

  const cache = caches.default;
  const cacheKey = new Request(context.request.url, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) {
    const response = new Response(cached.body, cached);
    response.headers.set("x-weatherbear-depth-cache", "HIT");
    return response;
  }

  const bbox = tileMercatorBounds(z, x, y);
  const upstreamUrl = makeUpstreamUrl(type, bbox);

  try {
    let upstream = await fetch(upstreamUrl, {
      headers: {
        Accept: "image/png",
        "User-Agent": "Weatherbear depth layer/1.0"
      }
    });

    let contentType = upstream.headers.get("content-type") || "";
    let validImage = upstream.ok && contentType.toLowerCase().includes("image");

    // Om servern saknar GeoServers contour-transformation används EMODnets
    // generaliserade konturlager som reserv i stället för att hela lagret försvinner.
    if (!validImage && type === "contours") {
      upstream = await fetch(makeUpstreamUrl(type, bbox, true), {
        headers: {
          Accept: "image/png",
          "User-Agent": "Weatherbear depth layer/1.0"
        }
      });
      contentType = upstream.headers.get("content-type") || "";
      validImage = upstream.ok && contentType.toLowerCase().includes("image");
    }

    if (!validImage) {
      return new Response(null, {
        status: 204,
        headers: {
          "cache-control": "public, max-age=300",
          "x-weatherbear-depth": `upstream-${upstream.status}`
        }
      });
    }

    const response = new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": upstream.headers.get("content-type") || "image/png",
        "cache-control": `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}`,
        "x-weatherbear-depth-cache": "MISS",
        "x-weatherbear-depth-source": type
      }
    });

    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    return new Response(null, {
      status: 204,
      headers: {
        "cache-control": "public, max-age=120",
        "x-weatherbear-depth": "fetch-error"
      }
    });
  }
}
