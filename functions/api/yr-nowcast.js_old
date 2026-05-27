// /api/yr-nowcast.js

export default async function handler(req, res) {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: "lat/lon saknas" });
    }

    const url =
      "https://api.met.no/weatherapi/nowcast/2.0/complete" +
      "?lat=" + encodeURIComponent(lat.toFixed(4)) +
      "&lon=" + encodeURIComponent(lon.toFixed(4));

    const metRes = await fetch(url, {
      headers: {
        "User-Agent": "Weather Bear bjornfalkenang@gmail.com",
        "Accept": "application/json"
      }
    });

    const text = await metRes.text();

    if (!metRes.ok) {
      return res.status(metRes.status).json({
        error: "Nowcast kunde inte hämtas",
        status: metRes.status,
        details: text
      });
    }

    const data = JSON.parse(text);
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=240");
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({
      error: "Nowcast-fel",
      message: err.message
    });
  }
}
