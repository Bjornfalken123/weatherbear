export async function onRequestGet(context) {
  const urlObj = new URL(context.request.url);
  const stationId = String(urlObj.searchParams.get("stationId") || "").trim();

  if (!stationId) {
    return Response.json(
      {
        error: true,
        message: "stationId saknas"
      },
      { status: 400 }
    );
  }

  try {
    const url =
      "https://services.viva.sjofartsverket.se:8080/output/vivaoutputservice.svc/vivastation/" +
      encodeURIComponent(stationId);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "weather-dashboard/1.0 viva-station"
      }
    });

    const text = await response.text();

    if (!response.ok) {
      return Response.json(
        {
          error: true,
          source: "VIVA",
          body: text
        },
        { status: response.status }
      );
    }

    const data = JSON.parse(text);
    const rawStation = data?.GetSingleStationResult || null;
    const samples = Array.isArray(rawStation?.Samples) ? rawStation.Samples : [];

    return Response.json(
      {
        station: {
          ID: rawStation?.ID ?? stationId,
          Name: rawStation?.Name || "Okänd station",
          Lat: Number(rawStation?.Lat),
          Lon: Number(rawStation?.Lon),
          Samples: samples
        }
      },
      {
        headers: {
          "cache-control": "public, max-age=120"
        }
      }
    );
  } catch (error) {
    return Response.json(
      {
        error: true,
        message: error.message
      },
      { status: 500 }
    );
  }
}
