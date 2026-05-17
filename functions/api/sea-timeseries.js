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

   function parseTimeToTimestamp(value) {
  if (value == null || value === "") return null;

  if (typeof value === "number") {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  let text = String(value).trim();

  if (/^\d+$/.test(text)) {
    const numeric = Number(text);

    if (Number.isFinite(numeric)) {
      const timestamp = new Date(numeric).getTime();
      return Number.isFinite(timestamp) ? timestamp : null;
    }
  }

  /*
    Open-Meteo med timezone=GMT returnerar ofta tider utan Z,
    t.ex. 2026-05-13T12:00. Vi tolkar dem som UTC.
  */
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(text)) {
    text += "Z";
  }

  const timestamp = new Date(text).getTime();

  return Number.isFinite(timestamp) ? timestamp : null;
}
    function normalizeTime(value) {
      const timestamp = parseTimeToTimestamp(value);
      return timestamp == null ? null : new Date(timestamp).toISOString();
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

    async function safeExternalJson(externalUrl) {
      const response = await fetch(externalUrl);
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
            data?.reason ||
            data?.message ||
            text ||
            `Fel vid extern hämtning: ${externalUrl}`
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
      const raw = Array.isArray(data?.value)
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

          const normalizedTime = normalizeTime(time);
          if (!normalizedTime) return null;

          return {
            time: normalizedTime,
            value
          };
        })
        .filter(Boolean)
        .sort(
          (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
        );
    }

    function normalizeOpenMeteoHourly(data, variableName) {
      const times = Array.isArray(data?.hourly?.time)
        ? data.hourly.time
        : [];

      const values = Array.isArray(data?.hourly?.[variableName])
        ? data.hourly[variableName]
        : [];

      return times
        .map((time, index) => {
          const value = Number(values[index]);

          if (!time || !Number.isFinite(value)) return null;

          const normalizedTime = normalizeTime(time);
          if (!normalizedTime) return null;

          return {
            time: normalizedTime,
            value
          };
        })
        .filter(Boolean)
        .sort(
          (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
        );
    }

    function splitHistoryForecast(series) {
      const now = Date.now();

      const history = [];
      const forecast = [];

      for (const point of series || []) {
        const timestamp = new Date(point.time).getTime();

        if (!Number.isFinite(timestamp)) continue;

        if (timestamp <= now) {
          history.push(point);
        } else {
          forecast.push(point);
        }
      }

      return {
        history,
        forecast
      };
    }
    function dedupeAndSortSeries(series) {
  const map = new Map();

  for (const point of series || []) {
    if (!point || point.value == null || !point.time) continue;

    const timestamp = parseTimeToTimestamp(point.time);
    if (timestamp == null) continue;

    const hourTimestamp = Math.round(timestamp / (60 * 60 * 1000)) * 60 * 60 * 1000;

    map.set(hourTimestamp, {
      time: new Date(hourTimestamp).toISOString(),
      value: Number(point.value)
    });
  }

  return Array.from(map.values())
    .filter((point) => Number.isFinite(point.value))
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

function mergeHistoryPreferStation(stationHistory, modelHistory) {
  const station = dedupeAndSortSeries(stationHistory);
  const model = dedupeAndSortSeries(modelHistory);

  if (!station.length) return model;
  if (!model.length) return station;

  const stationTimes = new Set(
    station.map((point) => {
      const timestamp = parseTimeToTimestamp(point.time);
      return String(Math.round(timestamp / (60 * 60 * 1000)) * 60 * 60 * 1000);
    })
  );

  const merged = [];

  for (const point of model) {
    const timestamp = parseTimeToTimestamp(point.time);
    if (timestamp == null) continue;

    const key = String(Math.round(timestamp / (60 * 60 * 1000)) * 60 * 60 * 1000);

    if (!stationTimes.has(key)) {
      merged.push(point);
    }
  }

  merged.push(...station);

  return dedupeAndSortSeries(merged);
}

function getSeriesCoverageHours(series) {
  const sorted = dedupeAndSortSeries(series);

  if (sorted.length < 2) return 0;

  const first = parseTimeToTimestamp(sorted[0].time);
  const last = parseTimeToTimestamp(sorted[sorted.length - 1].time);

  if (first == null || last == null || last <= first) return 0;

  return Math.round((last - first) / (60 * 60 * 1000));
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

        const value = extractNumericValue(
          firstDefined(sample.Value, sample.value)
        );

        if (value == null) continue;

        const updated = firstDefined(
          sample.Updated,
          sample.updated,
          sample.Time,
          sample.time,
          stationData?.Updated,
          stationData?.updated
        );

        const normalizedTime = updated
          ? normalizeTime(updated)
          : new Date().toISOString();

        return {
          value,
          time: normalizedTime || new Date().toISOString()
        };
      }

      return null;
    }

    async function getNearestWaveStation() {
      const data = await safeJson("/api/ocean-wave-stations");
      const stations = Array.isArray(data?.stations) ? data.stations : [];

      return (
        stations
          .map(normalizeStation)
          .filter(Boolean)
          .filter((station) => station.distanceKm <= radiusKm)
          .sort((a, b) => a.distanceKm - b.distanceKm)[0] || null
      );
    }

    async function getNearestWaterLevelStation() {
      const data = await safeJson("/api/ocean-stations");

      const stations = Array.isArray(data?.station)
        ? data.station
        : Array.isArray(data?.stations)
          ? data.stations
          : Array.isArray(data?.resource)
            ? data.resource
            : [];

      return (
        stations
          .map(normalizeStation)
          .filter(Boolean)
          .filter((station) => station.distanceKm <= radiusKm)
          .sort((a, b) => a.distanceKm - b.distanceKm)[0] || null
      );
    }

    async function getNearestVivaStation() {
      const data = await safeJson("/api/viva-stations");

      const stations = Array.isArray(data?.stations)
        ? data.stations
        : Array.isArray(data)
          ? data
          : [];

      return (
        stations
          .map(normalizeStation)
          .filter(Boolean)
          .filter((station) => station.distanceKm <= radiusKm)
          .sort((a, b) => a.distanceKm - b.distanceKm)[0] || null
      );
    }

    async function getWaveHistory(station) {
      if (!station) return [];

      const periods = ["latest-months", "latest-day", "latest-hour"];

      for (const period of periods) {
        try {
          const data = await safeJson(
            `/api/ocean-wave-height?stationId=${encodeURIComponent(
              station.id
            )}&period=${encodeURIComponent(period)}`
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
            `/api/ocean-water-level?stationId=${encodeURIComponent(
              station.id
            )}&period=${encodeURIComponent(period)}`
          );

          const series = normalizeTimeseries(data);

          if (series.length) return series;
        } catch (error) {
          console.warn("water level history failed", period, error);
        }
      }

      return [];
    }

    async function getWaterTempObservation(station) {
      if (!station) return null;

      try {
        const data = await safeJson(
          `/api/viva-station?stationId=${encodeURIComponent(station.id)}`
        );

        const stationData = data?.station || data;

        return extractVivaSample(stationData, [
          "Ytvattentemperatur",
          "Vattentemperatur",
          "Vatten Temperatur",
          "Vattentemp",
          "Water temperature"
        ]);
      } catch (error) {
        console.warn("water temp observation failed", error);
        return null;
      }
    }

    async function getMarineSeries() {
      try {
        const marineUrl =
          "https://marine-api.open-meteo.com/v1/marine" +
          `?latitude=${encodeURIComponent(String(lat))}` +
          `&longitude=${encodeURIComponent(String(lon))}` +
          "&hourly=wave_height,sea_surface_temperature" +
          "&past_hours=72" +
          "&forecast_hours=168" +
          "&timezone=GMT" +
          "&cell_selection=sea";

        const data = await safeExternalJson(marineUrl);

        const waveHeightAll = normalizeOpenMeteoHourly(data, "wave_height");
        const waterTempAll = normalizeOpenMeteoHourly(
          data,
          "sea_surface_temperature"
        );

        return {
          waveHeight: splitHistoryForecast(waveHeightAll),
          waterTemp: splitHistoryForecast(waterTempAll),

          /*
            Medvetet tomt tills vi har en vattenståndsprognos
            med säker referensnivå.
          */
          waterLevel: {
            history: [],
            forecast: []
          }
        };
      } catch (error) {
        console.warn("marine series failed", error);

        return {
          waveHeight: {
            history: [],
            forecast: []
          },
          waterTemp: {
            history: [],
            forecast: []
          },
          waterLevel: {
            history: [],
            forecast: []
          }
        };
      }
    }

    const [waveStation, waterLevelStation, vivaStation] = await Promise.all([
      getNearestWaveStation(),
      getNearestWaterLevelStation(),
      getNearestVivaStation()
    ]);

    const [
      waveHistoryFromStation,
      waterLevelHistory,
      waterTempObservation,
      marineSeries
    ] = await Promise.all([
      getWaveHistory(waveStation),
      getWaterLevelHistory(waterLevelStation),
      getWaterTempObservation(vivaStation),
      getMarineSeries()
    ]);

    /*
      Vattentemperatur:
      - Historik/prognos kommer från Open-Meteo Marine, så grafen får en riktig tidsserie.
      - VIVA-observation sparas separat som aktuell observation, men används inte som fejkad historik.

      Våghöjd:
      - Om SMHI-stationshistorik finns används den för historik.
      - Prognos kommer från Open-Meteo Marine.
      - Om stationshistorik saknas används Open-Meteo-historik som fallback.

      Vattenstånd:
      - Historik kommer från SMHI-station.
      - Prognos lämnas tom tills referensnivå är säkert löst.
    */

    const waterTempHistory = marineSeries.waterTemp.history;
    const waterTempForecast = marineSeries.waterTemp.forecast;

   const waveHistory = mergeHistoryPreferStation(
  waveHistoryFromStation,
  marineSeries.waveHeight.history
);

    const waveForecast = marineSeries.waveHeight.forecast;

    const waterTempSource = {
      name: "Open-Meteo Marine",
      distanceKm: 0,
      note:
        "Historik och prognos är modellvärden för vald punkt. När VIVA-observation finns skickas den separat som aktuell observation."
    };

    return jsonResponse({
      lat,
      lon,
      radiusKm,
      updatedAt: new Date().toISOString(),

      sources: {
 waveHeight: waveHistoryFromStation.length
  ? {
      ...waveStation,
      note:
        "Stationshistorik används där den finns. Saknade äldre timmar fylls med Open-Meteo Marine."
    }
  : {
      name: "Open-Meteo Marine",
      distanceKm: 0,
      note:
        "Stationshistorik saknades inom valt område. Visar modellhistorik och prognos för vald punkt."
    },

        waterLevel: waterLevelStation,
        waterTemp: waterTempSource,

        observations: {
          waterTemp: vivaStation
            ? {
                ...vivaStation,
                note: "Närmaste VIVA-station för aktuell uppmätt vattentemperatur."
              }
            : null
        },

        forecast: {
          name: "Open-Meteo Marine",
          distanceKm: 0,
          note: "Prognos från modellpunkt för vald lat/lon."
        }
      },

      observations: {
        waterTemp: waterTempObservation
          ? {
              label: "Aktuell uppmätt vattentemperatur",
              unit: "°C",
              time: waterTempObservation.time,
              value: waterTempObservation.value,
              source: vivaStation
            }
          : null
      },

      series: {
        waterTemp: {
          label: "Vattentemperatur",
          unit: "°C",
          history: waterTempHistory,
          forecast: waterTempForecast,
          sourceType: "model",
          note:
            "Historik och prognos kommer från Open-Meteo Marine. Aktuell VIVA-observation skickas separat när den finns."
        },

        waveHeight: {
          label: "Våghöjd",
          unit: "m",
          history: waveHistory,
          forecast: waveForecast,
        sourceType: waveHistoryFromStation.length
  ? "station-and-model-history-model-forecast"
  : "model",
note: waveHistoryFromStation.length
  ? "Senaste historik kommer från närmaste station. Äldre saknade timmar fylls med Open-Meteo Marine. Prognos kommer från Open-Meteo Marine."
  : "Historik och prognos kommer från Open-Meteo Marine."
        },

        waterLevel: {
          label: "Vattenstånd",
          unit: "cm",
          history: waterLevelHistory,
          forecast: marineSeries.waterLevel.forecast,
          sourceType: "station-history",
          note:
            "Vattenståndsprognos är avvaktad tills en källa med säker referensnivå kopplas."
        }
      },

      forecastNote:
        "Våghöjd och vattentemperatur har prognos från Open-Meteo Marine. Vattentemperaturhistorik kommer också från Open-Meteo Marine. Vattenståndsprognos är avvaktad tills en källa med säker referensnivå kopplas."
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
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300"
    }
  });
}
