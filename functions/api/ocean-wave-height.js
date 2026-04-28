export async function onRequestGet(context) {
  const urlObj = new URL(context.request.url);

  const stationId = urlObj.searchParams.get("stationId");
  const period = urlObj.searchParams.get("period") || "latest-hour";

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
      `https://opendata-download-ocobs.smhi.se/api/version/latest/parameter/1` +
      `/station/${encodeURIComponent(stationId)}` +
      `/period/${encodeURIComponent(period)}` +
      `/data.json`;

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

    return Response.json(data, {
      headers: {
        "cache-control": "public, max-age=900, stale-while-revalidate=900"
      }
    });
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
