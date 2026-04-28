export async function onRequestGet(context) {
  try {
    const url =
      "https://opendata-download-ocobs.smhi.se/api/version/latest/parameter/1.json";

    const response = await fetch(url, {
      headers: {
        "User-Agent": "weather-dashboard/1.0 bjorn.falkenang@gmail.com"
      }
    });

    const text = await response.text();

    if (!response.ok) {
      return Response.json(
        {
          error: true,
          source: "SMHI",
          body: text
        },
        { status: response.status }
      );
    }

    const data = JSON.parse(text);

    const stations = Array.isArray(data?.station)
      ? data.station
      : Array.isArray(data?.stations)
      ? data.stations
      : Array.isArray(data?.resource)
      ? data.resource
      : [];

    const cleaned = stations
      .map((station) => {
        const id = String(
          station.id ?? station.key ?? station.stationId ?? station.station ?? ""
        ).trim();

        const latitude = Number(
          station.latitude ??
            station.lat ??
            station.position?.latitude ??
            station.position?.lat
        );

        const longitude = Number(
          station.longitude ??
            station.lon ??
            station.position?.longitude ??
            station.position?.lon
        );

        if (!id || Number.isNaN(latitude) || Number.isNaN(longitude)) {
          return null;
        }

        return {
          id,
          name: station.name || "Okänd station",
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
