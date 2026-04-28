export async function onRequestGet(context) {
  const urlObj = new URL(context.request.url);

  const lat = Number(urlObj.searchParams.get("lat") || 59.3293).toFixed(4);
  const lon = Number(urlObj.searchParams.get("lon") || 18.0686).toFixed(4);

  const apiUrl =
    `https://api.met.no/weatherapi/locationforecast/2.0/compact` +
    `?lat=${encodeURIComponent(lat)}` +
    `&lon=${encodeURIComponent(lon)}`;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        "User-Agent": "weather-dashboard/1.0 bjorn.falkenang@gmail.com"
      }
    });

    const text = await response.text();

    if (!response.ok) {
      return Response.json(
        {
          error: true,
          body: text
        },
        { status: response.status }
      );
    }

    const data = JSON.parse(text);

    return Response.json(data, {
      headers: {
        "cache-control": "public, max-age=300"
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
