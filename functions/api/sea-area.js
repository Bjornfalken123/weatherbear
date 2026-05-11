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

    function getBaseUrl(req) {
      const proto =
        req.headers["x-forwarded-proto"] ||
        (req.socket?.encrypted ? "https" : "http");

      const host = req.headers["x-forwarded-host"] || req.headers.host;

      return `${proto}://${host}`;
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

    function firstDefined(...values) {
      for (const value of values) {
        if (value !== undefined && value !== null && value !== "") {
          return value;
        }
      }

      return null;
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
      const text = await response.text();

      let data = null;

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!response.ok) {
        throw new Error(
          data?.error ||
          data?.message ||
          text ||
          `Fel vid hämtning: ${url}`
        );
      }

      return data;
    }

    function normalizeStation(station) {
      const id = firstDefined(
        station.id,
        station.Id,
        station.ID,
        station.stationId,
        station.StationId,
        station.key
      );

      const name = firstDefined(
        station.name,
        station.Name,
        station.stationName,
        station.StationName
      );

      const latitude = Number(
        firstDefined(
          station.latitude,
          station.Latitude,
          station.lat,
          station.Lat
        )
      );

      const longitude = Number(
        firstDefined(
          station.longitude,
          station.Longitude,
          station.lon,
          station.lng,
          station.Lon,
          station.Lng
        )
      );

      if (!id || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }

      return {
        id: String(id),
        name: name || "Okänd station",
        latitude,
        longitude
      };
    }

    function extractVivaSample(stationData, names) {
      const samples = Array.isArray(stationData?.Samples)
        ? stationData.Samples
        : Array.isArray(stationData?.samples)
          ? stationData.samples
          : [];

      for (const wantedName of names) {
        const sample = samples.find((item) => {
          const sampleName = firstDefined(item?.Name, item?.name);
          return sampleName === wantedName;
        });

        if (!sample) continue;

        const value = firstDefined(sample.Value, sample.value);
        const numericValue = extractNumericValue(value);

        if (numericValue == null) continue;

        return {
          name: firstDefined(sample.Name, sample.name),
          value: numericValue,
          updated: firstDefined(sample.Updated, sample.updated, sample.Time, sample.time)
        };
      }

      return null;
    }

    const baseUrl = getBaseUrl(req);

    const vivaStationsData = await safeJson(`${baseUrl}/api/viva-stations`);

    const rawStations = Array.isArray(vivaStationsData?.stations)
      ? vivaStationsData.stations
      : Array.isArray(vivaStationsData)
        ? vivaStationsData
        : [];

    const vivaStations = rawStations
      .map(normalizeStation)
      .filter(Boolean);

    const nearbyStations = vivaStations
      .map((station) => ({
        ...station,
        distanceKm: distanceKm(lat, lon, station.latitude, station.longitude)
      }))
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
        const stationData = await safeJson(
          `${baseUrl}/api/viva-station?stationId=${encodeURIComponent(station.id)}`
        );

        const actualStationData = stationData?.station || stationData;

        const waterTempSample = extractVivaSample(actualStationData, [
          "Vattentemperatur",
          "Vatten Temperatur",
          "Ytvattentemperatur"
        ]);

        const waveSample = extractVivaSample(actualStationData, [
          "Våghöjd"
        ]);

        const waterLevelSample = extractVivaSample(actualStationData, [
          "Vattenstånd"
        ]);

        const windSample = extractVivaSample(actualStationData, [
          "Vindhastighet",
          "Medelvind"
        ]);

        const gustSample = extractVivaSample(actualStationData, [
          "Byvind",
          "Vindby"
        ]);

        if (waterTemp == null && waterTempSample) waterTemp = waterTempSample.value;
        if (waveHeight == null && waveSample) waveHeight = waveSample.value;
        if (waterLevel == null && waterLevelSample) waterLevel = waterLevelSample.value;
        if (wind == null && windSample) wind = windSample.value;
        if (gust == null && gustSample) gust = gustSample.value;

        stationResults.push({
          id: station.id,
          name: station.name,
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
          name: station.name,
          type: "VIVA",
          source: "VIVA",
          latitude: station.latitude,
          longitude: station.longitude,
          distanceKm: station.distanceKm,
          error: true,
          message: error.message
        });
      }
    }

    return res.status(200).json({
      lat,
      lon,
      radiusKm,
      stationCountTotal: vivaStations.length,
      stationCountNearby: nearbyStations.length,
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
