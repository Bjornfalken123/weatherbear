export async function onRequestGet(context) {
  try {
    const { request } = context;
    const url = new URL(request.url);

    const lat = Number(url.searchParams.get("lat"));
    const lon = Number(url.searchParams.get("lon"));
    const radiusKm = Number(url.searchParams.get("radiusKm") || 30);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return jsonResponse({ error: "lat och lon krävs" }, 400);
    }

    const baseUrl = url.origin;

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

      const match = String(value).replace(",", ".").match(/-?\d+(?:\.\d+)?/);
      if (!match) return null;

      const number = Number(match[0]);
      return Number.isFinite(number) ? number : null;
    }

    async function safeJson(path) {
      const response = await fetch(`${baseUrl}${path}`);
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
          `Fel vid hämtning: ${path}`
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
        longitude,
        distanceKm: distanceKm(lat, lon, latitude, longitude)
      };
    }

    function normalizeTimeseries(data) {
      const raw =
        Array.isArray(data?.value)
          ? data.value
          : Array.isArray(data?.values)
            ? data.values
            : Array.isArray(data?.data)
              ? data.data
              : [];

      return raw
        .map((item) => {
          const time = firstDefined(
            item.date,
            item.time,
            item.datetime,
            item.validTime,
            item.from
          );

          const value = extractNumericValue(
            firstDefined(item.value, item.Value, item.y)
          );

          if (!time || value == null) return null;

          const timestamp = new Date(time).getTime();

          if (!Number.isFinite(timestamp)) return null;

          return {
            time: new Date(timestamp).toISOString(),
            value
          };
        })
        .filter(Boolean)
        .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
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

        const value = extractNumericValue(firstDefined(sample.Value, sample.value));
        if (value == null) continue;

        const updated = firstDefined(
          sample.Updated,
          sample.updated,
          sample.Time,
          sample.time,
          stationData?.Updated,
          stationData?.updated
        );

        return {
          value,
          time: updated ? new Date(updated).toISOString() : new Date().toISOString()
        };
      }

      return null;
    }

    async function getNearestWaveStation() {
      const data = await safeJson("/api/ocean-wave-stations");
      const stations = Array.isArray(data?.stations) ? data.stations : [];

      return stations
        .map(normalizeStation)
        .filter(Boolean)
        .filter((station) => station.distanceKm <= radiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm)[0] || null;
    }

    async function getNearestWaterLevelStation() {
      const data = await safeJson("/api/ocean-stations");

      const stations =
        Array.isArray(data?.station)
          ? data.station
          : Array.isArray(data?.stations)
            ? data.stations
            : Array.isArray(data?.resource)
              ? data.resource
              : [];

      return stations
        .map(normalizeStation)
        .filter(Boolean)
        .filter((station) => station.distanceKm <= radiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm)[0] || null;
    }

    async function getNearestVivaStation() {
      const data = await safeJson("/api/viva-stations");
      const stations = Array.isArray(data?.stations)
        ? data.stations
        : Array.isArray(data)
          ? data
          : [];

      return stations
        .map(normalizeStation)
        .filter(Boolean)
        .filter((station) => station.distanceKm <= radiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm)[0] || null;
    }

    async function getWaveHistory(station) {
      if (!station) return [];

      const periods = ["latest-months", "latest-day", "latest-hour"];

      for (const period of periods) {
        try {
          const data = await safeJson(
            `/api/ocean-wave-height?stationId=${encodeURIComponent(station.id)}&period=${encodeURIComponent(period)}`
          );

          const series = normalizeTimeseries(data);

          if (series.length) return series;
        } catch (error) {
          console.warn("wave history failed", period, error);
        }
      }

      return [];
    }

    async function getWaterLevelHistory(station) {
      if (!station) return [];

      const periods = ["latest-months", "latest-day", "latest-hour"];

      for (const period of periods) {
        try {
          const data = await safeJson(
            `/api/ocean-water-level?stationId=${encodeURIComponent(station.id)}&period=${encodeURIComponent(period)}`
          );

          const series = normalizeTimeseries(data);

          if (series.length) return series;
        } catch (error) {
          console.warn("water level history failed", period, error);
        }
      }

      return [];
    }

    async function getWaterTempHistory(station) {
      if (!station) return [];

      try {
        const data = await safeJson(
          `/api/viva-station?stationId=${encodeURIComponent(station.id)}`
        );

        const stationData = data?.station || data;

        const sample = extractVivaSample(stationData, [
          "Ytvattentemperatur",
          "Vattentemperatur",
          "Vatten Temperatur",
          "Vattentemp",
          "Water temperature"
        ]);

        if (!sample) return [];

        return [
          {
            time: sample.time,
            value: sample.value
          }
        ];
      } catch (error) {
        console.warn("water temp history failed", error);
        return [];
      }
    }

    const [waveStation, waterLevelStation, vivaStation] = await Promise.all([
      getNearestWaveStation(),
      getNearestWaterLevelStation(),
      getNearestVivaStation()
    ]);

    const [waveHistory, waterLevelHistory, waterTempHistory] = await Promise.all([
      getWaveHistory(waveStation),
      getWaterLevelHistory(waterLevelStation),
      getWaterTempHistory(vivaStation)
    ]);

    return jsonResponse({
      lat,
      lon,
      radiusKm,
      updatedAt: new Date().toISOString(),
      sources: {
        waveHeight: waveStation,
        waterLevel: waterLevelStation,
        waterTemp: vivaStation
      },
      series: {
        waterTemp: {
          label: "Vattentemperatur",
          unit: "°C",
          history: waterTempHistory,
          forecast: []
        },
        waveHeight: {
          label: "Våghöjd",
          unit: "m",
          history: waveHistory,
          forecast: []
        },
        waterLevel: {
          label: "Vattenstånd",
          unit: "cm",
          history: waterLevelHistory,
          forecast: []
        }
      },
      forecastNote:
        "Prognosfältet är förberett. Nästa steg är att koppla NEMO-Nordic/Copernicus eller annan modellkälla."
    });
  } catch (error) {
    console.error("sea-timeseries error", error);

    return jsonResponse(
      {
        error: "Kunde inte hämta havsserier",
        message: error.message
      },
      500
    );
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}
