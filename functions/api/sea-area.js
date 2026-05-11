export default async function handler(req, res) {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const radiusKm = Number(req.query.radiusKm || 30);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({
        error: "lat och lon krävs"
      });
    }

    function toRad(value) {
      return value * Math.PI / 180;
    }

    function distanceKm(lat1, lon1, lat2, lon2) {
      const R = 6371;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);

      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) *
          Math.cos(toRad(lat2)) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);

      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function formatTemp(value) {
      return value == null ? "--" : `${Number(value).toFixed(1)} °C`;
    }

    function formatWave(value) {
      return value == null ? "--" : `${Number(value).toFixed(1)} m`;
    }

    function formatWaterLevel(value) {
      return value == null ? "--" : `${Number(value).toFixed(1)} cm`;
    }

    function formatWind(value) {
      return value == null ? "--" : `${Number(value).toFixed(1)} m/s`;
    }

    function extractNumericValue(value) {
      if (value == null) return null;

      if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
      }

      const match = String(value)
        .replace(",", ".")
        .match(/-?\d+(?:\.\d+)?/);

      if (!match) return null;

      const number = Number(match[0]);
      return Number.isFinite(number) ? number : null;
    }

    async function safeJson(url) {
      const response = await fetch(url);
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error ||
          data?.message ||
          `Fel vid hämtning: ${url}`
        );
      }

      return data;
    }

    async function getVivaStations() {
      const data = await safeJson(`${getBaseUrl(req)}/api/viva-stations`);
      return Array.isArray(data?.stations) ? data.stations : [];
    }

    async function getVivaStationData(stationId) {
      const data = await safeJson(
        `${getBaseUrl(req)}/api/viva-station?stationId=${encodeURIComponent(
          stationId
        )}`
      );

      return data?.station || null;
    }

    function extractVivaSample(stationData, names) {
      const samples = Array.isArray(stationData?.Samples)
        ? stationData.Samples
        : [];

      for (const name of names) {
        const sample = samples.find((item) => item?.Name === name);
        if (!sample) continue;

        const numericValue = extractNumericValue(sample.Value);
        if (numericValue == null) continue;

        return {
          name: sample.Name,
          value: numericValue,
          updated: sample.Updated || null
        };
      }

      return null;
    }

    function getBaseUrl(req) {
      const proto =
        req.headers["x-forwarded-proto"] ||
        (req.socket?.encrypted ? "https" : "http");

      const host = req.headers["x-forwarded-host"] || req.headers.host;

      return `${proto}://${host}`;
    }

    const vivaStations = await getVivaStations();

    const nearbyStations = vivaStations
      .map((station) => {
        const stationLat = Number(station.latitude);
        const stationLon = Number(station.longitude);

        if (!Number.isFinite(stationLat) || !Number.isFinite(stationLon)) {
          return null;
        }

        return {
          ...station,
          distanceKm: distanceKm(lat, lon, stationLat, stationLon)
        };
      })
      .filter(Boolean)
      .filter((station) => station.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    let waterTemp = null;
    let waveHeight = null;
    let waterLevel = null;
    let wind = null;
    let gust = null;

    const stationResults = [];

    for (const station of nearbyStations.slice(0, 8)) {
      try {
        const stationData = await getVivaStationData(station.id);

        const waterTempSample = extractVivaSample(stationData, [
          "Vattentemperatur",
          "Vatten Temperatur",
          "Ytvattentemperatur"
        ]);

        const waveSample = extractVivaSample(stationData, [
          "Våghöjd"
        ]);

        const waterLevelSample = extractVivaSample(stationData, [
          "Vattenstånd"
        ]);

        const windSample = extractVivaSample(stationData, [
          "Vindhastighet",
          "Medelvind"
        ]);

        const gustSample = extractVivaSample(stationData, [
          "Byvind",
          "Vindby"
        ]);

        if (waterTemp == null && waterTempSample) {
          waterTemp = waterTempSample.value;
        }

        if (waveHeight == null && waveSample) {
          waveHeight = waveSample.value;
        }

        if (waterLevel == null && waterLevelSample) {
          waterLevel = waterLevelSample.value;
        }

        if (wind == null && windSample) {
          wind = windSample.value;
        }

        if (gust == null && gustSample) {
          gust = gustSample.value;
        }

        stationResults.push({
          id: station.id,
          name: station.name || "Okänd station",
          type: "VIVA",
          source: "VIVA",
          latitude: station.latitude,
          longitude: station.longitude,
          distanceKm: station.distanceKm,
          hasWaterTemp: Boolean(waterTempSample),
          hasWaveHeight: Boolean(waveSample),
          hasWaterLevel: Boolean(waterLevelSample),
          hasWind: Boolean(windSample),
          hasGust: Boolean(gustSample)
        });
      } catch (error) {
        stationResults.push({
          id: station.id,
          name: station.name || "Okänd station",
          type: "VIVA",
          source: "VIVA",
          latitude: station.latitude,
          longitude: station.longitude,
          distanceKm: station.distanceKm,
          error: true
        });
      }
    }

    return res.status(200).json({
      lat,
      lon,
      radiusKm,
      waterTemp,
      waveHeight,
      waterLevel,
      wind,
      gust,
      waterTempText: formatTemp(waterTemp),
      waveHeightText: formatWave(waveHeight),
      waterLevelText: formatWaterLevel(waterLevel),
      windText: formatWind(wind),
      gustText: formatWind(gust),
      stations: stationResults
    });
  } catch (error) {
    console.error("sea-area error", error);

    return res.status(500).json({
      error: "Kunde inte hämta havsområde",
      message: error.message
    });
  }
}
