const SMHI_LATEST_RADAR =
  "https://opendata-download-radar.smhi.se/api/version/latest/area/sweden/product/comp/latest.png";

function formatLabelSv(date) {
  return new Intl.DateTimeFormat("sv-SE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Stockholm"
  })
    .format(date)
    .replace(".", "");
}

function arrayBufferToBase64(arrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }

  return btoa(binary);
}

async function fetchAsDataUrl(url) {
  const upstream = await fetch(url, {
    headers: {
      "User-Agent": "KustvaderRadar/1.0"
    }
  });

  if (!upstream.ok) {
    throw new Error(`SMHI radar returned ${upstream.status}`);
  }

  const contentType = upstream.headers.get("content-type") || "image/png";
  const arrayBuffer = await upstream.arrayBuffer();
  const base64 = arrayBufferToBase64(arrayBuffer);

  return `data:${contentType};base64,${base64}`;
}

export async function onRequestGet(context) {
  try {
    const now = new Date();
    const imageUrl = await fetchAsDataUrl(SMHI_LATEST_RADAR);

    return Response.json(
      {
        source: "SMHI",
        frames: [
          {
            kind: "radar",
            label: `Nu • ${formatLabelSv(now)}`,
            imageUrl,
            timestamp: now.toISOString()
          }
        ]
      },
      {
        headers: {
          "cache-control": "no-store"
        }
      }
    );
  } catch (error) {
    return Response.json(
      {
        message: "Det gick inte att hämta radarbild från SMHI",
        details: error?.message || "okänt fel"
      },
      { status: 500 }
    );
  }
}
