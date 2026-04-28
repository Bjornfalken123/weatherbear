export async function onRequestGet(context) {
  const urlObj = new URL(context.request.url);

  const lat = Number(urlObj.searchParams.get("lat"));
  const lon = Number(urlObj.searchParams.get("lon"));

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return Response.json(
      {
        error: true,
        message: "lat och lon krävs"
      },
      { status: 400 }
    );
  }

  try {
    const url =
      "https://api.open-meteo.com/v1/forecast" +
      `?latitude=${encodeURIComponent(lat)}` +
      `&longitude=${encodeURIComponent(lon)}` +
      "&current=wind_gusts_10m" +
      "&hourly=wind_gusts_10m" +
      "&wind_speed_unit=ms" +
      "&timezone=auto" +
      "&forecast_days=7";

    const response = await fetch(url);
    const text = await response.text();

    if (!response.ok) {
      return Response.json(
        {
          error: true,
          source: "Open-Meteo",
          body: text
        },
        { status: response.status }
      );
    }

    const data = JSON.parse(text);

    const currentValue = data?.current?.wind_gusts_10m ?? null;
    const currentTime = data?.current?.time ?? null;

    const times = data?.hourly?.time ?? [];
    const gusts = data?.hourly?.wind_gusts_10m ?? [];

    const timeseries = times.map((time, index) => ({
      time,
      value: gusts[index] ?? null
    }));

    return Response.json(
      {
        value: currentValue,
        time: currentTime,
        timeseries,
        source: "Open-Meteo",
        unit: "m/s"
      },
      {
        headers: {
          "cache-control": "public, max-age=300"
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
