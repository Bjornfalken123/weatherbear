export async function onRequestGet(context) {
  try {
    const url =
      "https://services.viva.sjofartsverket.se:8080/output/vivaoutputservice.svc/vivastation";

    const response = await fetch(url, {
      headers: {
        "User-Agent": "weather-dashboard/1.0 viva-stations"
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

    const stations = Array.isArray(data?.GetStationsResult?.Stations)
      ? data.GetStationsResult.Stations
      : [];

    const cleaned = stations
      .map((station) => {
        const id = String(station?.ID ?? "").trim();
        const latitude = Number(station?.Lat);
        const longitude = Number(station?.Lon);

        if (!id || Number.isNaN(latitude) || Number.isNaN(longitude)) {
          return null;
        }

        return {
          id,
          name: station?.Name || "Okänd station",
          latitude,
          longitude
        };
      })
      .filter(Boolean);

    return Response.json(
      { stations: cleaned },
      {
        headers: {
          "cache-control": "public, max-age=1800, stale-while-revalidate=1800"
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
