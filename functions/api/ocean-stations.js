export async function onRequestGet(context) {
  try {
    const url =
      "https://opendata-download-ocobs.smhi.se/api/version/latest/parameter/6.json";

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
        "cache-control": "public, max-age=1800, stale-while-revalidate=1800"
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
