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

    /*
      Vi testar inte hur många stationer som helst, för då kan API:t bli långsamt.
      Topp 10 närmaste inom radien räcker oftast bra.
    */
    const MAX_CANDIDATE_STATIONS = 10;
    const SMHI_SEALEVEL_OBS_FORECAST_INDEX_URL =
      "https://data-download.smhi.se/data/oceanography/observation-forecast/";

    /*
      Om två stationer är nästan lika färska väljer vi den närmaste.
      Det gör att appen inte hoppar till en mycket längre bort station bara
      för att den är några minuter färskare.
    */
    const FRESHNESS_TIE_MS = 90 * 60 * 1000;

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

      // SMHI:s CSV-filer kan använda kompakt eller mellanslagsseparerad UTC-tid.
      const compactDateTime = text.match(/^(\d{4})(\d{2})(\d{2})[ T]?(\d{2})(\d{2})(?:(\d{2}))?$/);
      if (compactDateTime) {
        const [, year, month, day, hour, minute, second = "00"] = compactDateTime;
        const timestamp = Date.UTC(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour),
          Number(minute),
          Number(second)
        );
        return Number.isFinite(timestamp) ? timestamp : null;
      }

      const spacedDateTime = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/);
      if (spacedDateTime) {
        text = `${spacedDateTime[1]}T${spacedDateTime[2]}Z`;
      }

      /*
        Open-Meteo med timezone=GMT och flera SMHI-filer returnerar ofta
        tider utan Z, t.ex. 2026-05-13T12:00. Vi tolkar dem som UTC.
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

    function getCandidateStations(stations) {
      return stations
        .map(normalizeStation)
        .filter(Boolean)
        .filter((station) => station.distanceKm <= radiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, MAX_CANDIDATE_STATIONS);
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

    function normalizeHeaderName(value) {
      return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/^\uFEFF/, "")
        .replace(/[åä]/g, "a")
        .replace(/ö/g, "o")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    }

    function normalizeForecastKey(value) {
      return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/^\uFEFF/, "")
        .replace(/[åä]/g, "a")
        .replace(/ö/g, "o")
        .replace(/[^a-z0-9]+/g, "");
    }

    function splitDelimitedLine(line, delimiter) {
      const result = [];
      let current = "";
      let inQuotes = false;

      for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        const next = line[index + 1];

        if (char === '"') {
          if (inQuotes && next === '"') {
            current += '"';
            index += 1;
          } else {
            inQuotes = !inQuotes;
          }
          continue;
        }

        if (char === delimiter && !inQuotes) {
          result.push(current.trim());
          current = "";
          continue;
        }

        current += char;
      }

      result.push(current.trim());
      return result;
    }

    function guessDelimiter(lines) {
      const candidates = [";", ",", "\t"];
      let best = ";";
      let bestScore = -1;

      for (const delimiter of candidates) {
        const score = lines
          .slice(0, 10)
          .reduce((sum, line) => sum + Math.max(0, splitDelimitedLine(line, delimiter).length - 1), 0);

        if (score > bestScore) {
          best = delimiter;
          bestScore = score;
        }
      }

      return best;
    }

    function looksLikeForecastHeader(cells) {
      const normalized = cells.map(normalizeHeaderName).filter(Boolean);
      if (!normalized.length) return false;

      const joined = normalized.join("_");
      const hasTime = normalized.some((header) =>
        [
          "time", "date", "date_time", "datetime", "datum", "tid",
          "forecast_time", "fcst_time", "valid_time", "validtime",
          "valid_datetime", "valid_date", "time_utc", "utc", "datum_tid"
        ].includes(header) || header.includes("tid") || header.includes("time") || header.includes("datum")
      );
      const hasStationOrValue = normalized.some((header) =>
        header.includes("station") ||
        header.includes("plats") ||
        header.includes("location") ||
        header.includes("prognos") ||
        header.includes("forecast") ||
        header.includes("fcst") ||
        header.includes("sealevel") ||
        header.includes("sea_level") ||
        header.includes("waterlevel") ||
        header.includes("water_level") ||
        header.includes("havsvattenstand") ||
        header.includes("vattenstand") ||
        header.includes("rh2000") ||
        header.includes("nemo")
      );

      return hasTime || hasStationOrValue || joined.includes("valid") || joined.includes("forecast");
    }

    function parseDelimitedTableDetailed(text) {
      const rawLines = String(text || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"));

      if (rawLines.length < 2) {
        return {
          delimiter: ";",
          originalHeaders: [],
          headers: [],
          rows: [],
          rawRows: []
        };
      }

      const delimiter = guessDelimiter(rawLines);
      let headerIndex = 0;
      let bestScore = -1;

      rawLines.slice(0, 40).forEach((line, index) => {
        const cells = splitDelimitedLine(line, delimiter);
        if (cells.length < 2) return;

        const normalized = cells.map(normalizeHeaderName);
        let score = cells.length;
        if (looksLikeForecastHeader(cells)) score += 20;
        if (normalized.some((header) => header.includes("station") || header.includes("plats") || header.includes("location"))) score += 6;
        if (normalized.some((header) => header.includes("forecast") || header.includes("prognos") || header.includes("fcst"))) score += 6;
        if (normalized.some((header) => header.includes("time") || header.includes("tid") || header.includes("datum") || header.includes("valid"))) score += 6;

        const next = rawLines[index + 1] ? splitDelimitedLine(rawLines[index + 1], delimiter) : [];
        if (next.length >= Math.max(2, Math.floor(cells.length * 0.6))) score += 2;

        if (score > bestScore) {
          bestScore = score;
          headerIndex = index;
        }
      });

      const lines = rawLines.slice(headerIndex);
      const originalHeaders = splitDelimitedLine(lines[0], delimiter);
      const headers = originalHeaders.map(normalizeHeaderName);
      const rawRows = lines
        .slice(1)
        .map((line) => splitDelimitedLine(line, delimiter))
        .filter((cells) => cells.length >= 2);

      const rows = rawRows.map((cells) => {
        const row = {};

        headers.forEach((header, index) => {
          if (header) row[header] = cells[index] ?? "";
        });

        return row;
      });

      return {
        delimiter,
        originalHeaders,
        headers,
        rows,
        rawRows
      };
    }

    function parseDelimitedTable(text) {
      return parseDelimitedTableDetailed(text).rows;
    }

    function firstColumn(row, names) {
      for (const name of names) {
        const normalized = normalizeHeaderName(name);
        if (row[normalized] !== undefined && row[normalized] !== null && row[normalized] !== "") {
          return row[normalized];
        }
      }

      return null;
    }

    function getRowTime(row) {
      return firstColumn(row, [
        "time",
        "date_time",
        "datetime",
        "valid_time",
        "validtime",
        "valid",
        "date",
        "datum",
        "tid",
        "datum_tid",
        "date_time_utc",
        "datetime_utc",
        "forecast_time",
        "forecast_time_utc",
        "fcst_time",
        "fcst_time_utc",
        "valid_datetime",
        "valid_datetime_utc",
        "valid_date",
        "validtid",
        "valid_tid",
        "valid_time_utc",
        "tidpunkt",
        "tidpunkt_utc",
        "time_utc",
        "utc"
      ]);
    }

    function getRowValue(row) {
      return extractNumericValue(firstColumn(row, [
        "value",
        "varde",
        "sea_level",
        "sealevel",
        "sea_level_height",
        "water_level",
        "waterlevel",
        "water_level_cm",
        "sealevel_cm",
        "ssh",
        "zeta",
        "forecast",
        "forecast_cm",
        "forecast_value",
        "forecast_value_cm",
        "prognos",
        "prognos_cm",
        "prognos_varde",
        "kort_prognos",
        "kort_prognos_cm",
        "short_forecast",
        "short_forecast_cm",
        "fcst",
        "fcst_cm",
        "fcst_value",
        "sealevel_rh2000",
        "water_level_rh2000",
        "sea_level_rh2000",
        "waterlevel_rh2000",
        "havsvattenstand",
        "havsvattenstand_cm",
        "vattenstand",
        "vattenstand_cm",
        "vattenstand_rh2000",
        "vattenstand_rh_2000",
        "rh2000",
        "zeta",
        "sossheig",
        "sea_surface_height",
        "sea_surface_height_above_geoid",
        "model_value",
        "model_value_cm",
        "nemo"
      ]));
    }

    function getRowLatLon(row) {
      const rowLat = extractNumericValue(firstColumn(row, [
        "lat",
        "latitude",
        "y",
        "station_latitude"
      ]));
      const rowLon = extractNumericValue(firstColumn(row, [
        "lon",
        "lng",
        "longitude",
        "x",
        "station_longitude"
      ]));

      if (rowLat == null || rowLon == null) return null;
      if (!Number.isFinite(rowLat) || !Number.isFinite(rowLon)) return null;

      return {
        lat: rowLat,
        lon: rowLon
      };
    }

    function getRowStationId(row) {
      const value = firstColumn(row, [
        "station",
        "station_id",
        "stationid",
        "station_code",
        "id",
        "name",
        "namn",
        "station_name",
        "stationnamn",
        "station_namn",
        "plats",
        "platsnamn",
        "matstation",
        "mätstation",
        "location",
        "location_name"
      ]);

      return value == null ? null : String(value).trim().toLowerCase();
    }

    function getRowDatePart(row) {
      return firstColumn(row, ["date", "datum", "valid_date", "forecast_date", "fcst_date"]);
    }

    function getRowTimePart(row) {
      return firstColumn(row, ["time", "tid", "valid_time", "validtid", "valid_tid", "forecast_time", "fcst_time", "utc"]);
    }

    function getForecastRowNormalizedTime(row) {
      const direct = normalizeTime(getRowTime(row));
      if (direct) return direct;

      const datePart = getRowDatePart(row);
      const timePart = getRowTimePart(row);
      if (datePart && timePart) {
        return normalizeTime(`${datePart}T${timePart}`.replace(/TT/g, "T").replace(/\s+/g, ""));
      }

      return null;
    }

    function seriesFromForecastRows(rows) {
      return rows
        .map((row) => {
          const time = getForecastRowNormalizedTime(row);
          const value = getRowValue(row);

          if (!time || value == null || !Number.isFinite(value)) return null;

          return {
            time,
            value
          };
        })
        .filter(Boolean)
        .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    }

    function getForecastStationKeys(station) {
      const keys = [
        station && station.id,
        station && station.name,
        station && station.stationId,
        station && station.key
      ]
        .map(normalizeForecastKey)
        .filter(Boolean);

      return keys.filter((value, index, array) => array.indexOf(value) === index);
    }

    function headerMatchesStation(header, stationKeys) {
      const normalized = normalizeForecastKey(header);
      if (!normalized) return false;

      return stationKeys.some((key) => {
        if (!key) return false;
        if (normalized === key) return true;
        if (normalized.includes(key) && key.length >= 4) return true;
        if (key.includes(normalized) && normalized.length >= 4) return true;
        return false;
      });
    }

    function parseWideForecastTimestamp(cells, headers) {
      const timeNames = new Set([
        "time",
        "date_time",
        "datetime",
        "valid_time",
        "validtime",
        "valid",
        "date",
        "datum",
        "tid",
        "forecast_time",
        "fcst_time",
        "valid_datetime",
        "valid_date",
        "validtid",
        "tidpunkt",
        "time_utc",
        "utc"
      ]);

      let dateIndex = -1;
      let timeIndex = -1;

      for (let index = 0; index < headers.length; index += 1) {
        const header = headers[index];
        if (timeNames.has(header)) {
          const normalized = normalizeTime(cells[index]);
          if (normalized) return normalized;
        }

        if (["date", "datum", "valid_date"].includes(header)) dateIndex = index;
        if (["time", "tid", "valid_time", "validtime", "valid_tid", "validtid", "forecast_time", "fcst_time", "utc"].includes(header)) timeIndex = index;
      }

      if (dateIndex >= 0 && timeIndex >= 0) {
        const combined = `${cells[dateIndex] || ""}T${cells[timeIndex] || ""}`
          .replace(/TT/g, "T")
          .replace(/\s+/g, "");
        const normalized = normalizeTime(combined);
        if (normalized) return normalized;
      }

      for (const cell of cells) {
        const normalized = normalizeTime(cell);
        if (normalized) return normalized;
      }

      return null;
    }

    function parseSmhiRunTimestampFromFileName(fileName) {
      const match = String(fileName || "").match(/_(\d{12})(?:\.csv)?$/);
      if (!match) return null;
      return parseTimeToTimestamp(match[1]);
    }

    function parseForecastTimeFromHeader(header, runTimestamp) {
      const raw = String(header || "").trim();
      if (!raw) return null;

      const direct = normalizeTime(raw);
      if (direct) return direct;

      const compactInside = raw.match(/(\d{12}|\d{10})/);
      if (compactInside) {
        const fromCompact = normalizeTime(compactInside[1].length === 10 ? `${compactInside[1]}00` : compactInside[1]);
        if (fromCompact) return fromCompact;
      }

      if (runTimestamp != null) {
        const lead = raw.match(/(?:^|[^0-9])(?:t\s*[+]?|\+\s*)?(\d{1,3})\s*(?:h|hr|hrs|hour|hours|tim|timmar)(?:[^a-zåäö]|$)/i);
        if (lead) {
          const hours = Number(lead[1]);
          if (Number.isFinite(hours)) {
            return new Date(runTimestamp + hours * 60 * 60 * 1000).toISOString();
          }
        }
      }

      return null;
    }

    function rowMatchesForecastStation(row, station, stationKeys) {
      const rowStationId = getRowStationId(row);
      if (!rowStationId) return false;

      const normalizedRowStation = normalizeForecastKey(rowStationId);
      if (!normalizedRowStation) return false;

      return stationKeys.some((key) => {
        if (!key) return false;
        return normalizedRowStation === key ||
          (normalizedRowStation.includes(key) && key.length >= 4) ||
          (key.includes(normalizedRowStation) && normalizedRowStation.length >= 4);
      });
    }

    function getBestForecastRowsForStation(table, station) {
      const stationKeys = getForecastStationKeys(station);
      const namedRows = [];
      const positionedRows = [];

      for (let index = 0; index < table.rows.length; index += 1) {
        const row = table.rows[index];
        const cells = table.rawRows[index] || [];

        if (stationKeys.length && rowMatchesForecastStation(row, station, stationKeys)) {
          namedRows.push({ row, cells, distanceKm: 0 });
          continue;
        }

        const position = getRowLatLon(row);
        if (position && station && Number.isFinite(station.latitude) && Number.isFinite(station.longitude)) {
          positionedRows.push({
            row,
            cells,
            distanceKm: distanceKm(station.latitude, station.longitude, position.lat, position.lon)
          });
        }
      }

      if (namedRows.length) return namedRows;
      if (!positionedRows.length) return [];

      positionedRows.sort((a, b) => a.distanceKm - b.distanceKm);
      const nearest = positionedRows[0];

      // Prognosfilen är stationsbaserad. Vid positionfallback väljer vi bara en rad
      // om den faktiskt ligger nära den station som observationerna valde.
      if (!nearest || nearest.distanceKm > 25) return [];

      return positionedRows.filter((item) => item.distanceKm <= nearest.distanceKm + 0.01);
    }

    function seriesFromStationRowForecastTable(table, station, runTimestamp) {
      if (!table || !table.headers || !table.rawRows || !station) return [];

      const timeColumns = [];
      table.originalHeaders.forEach((header, index) => {
        const normalizedHeader = table.headers[index];
        const isMetaColumn = [
          "station", "station_id", "stationid", "station_code", "id",
          "name", "namn", "station_name", "stationnamn", "station_namn",
          "plats", "platsnamn", "matstation", "location", "location_name",
          "lat", "latitude", "station_latitude", "lon", "lng", "longitude", "station_longitude", "x", "y"
        ].includes(normalizedHeader);

        if (isMetaColumn) return;

        const time = parseForecastTimeFromHeader(header, runTimestamp) ||
          parseForecastTimeFromHeader(normalizedHeader, runTimestamp);

        if (time) {
          timeColumns.push({ index, time });
        }
      });

      if (!timeColumns.length) return [];

      const bestRows = getBestForecastRowsForStation(table, station);
      if (!bestRows.length) return [];

      const points = [];
      for (const item of bestRows) {
        for (const column of timeColumns) {
          const value = extractNumericValue(item.cells[column.index]);
          if (value == null || !Number.isFinite(value)) continue;

          points.push({
            time: column.time,
            value
          });
        }
      }

      return dedupeAndSortSeries(points);
    }

    function seriesFromWideForecastTable(table, station) {
      const stationKeys = getForecastStationKeys(station);
      if (!stationKeys.length || !table || !table.headers || !table.rawRows) return [];

      const stationColumnIndexes = [];

      table.originalHeaders.forEach((header, index) => {
        const normalizedHeader = table.headers[index];
        if (!normalizedHeader) return;

        const isLikelyTimeColumn = [
          "time", "date_time", "datetime", "valid_time", "validtime", "valid",
          "date", "datum", "tid", "forecast_time", "fcst_time", "valid_datetime",
          "valid_date", "validtid", "tidpunkt", "time_utc", "utc"
        ].includes(normalizedHeader);

        if (isLikelyTimeColumn) return;

        if (headerMatchesStation(header, stationKeys) || headerMatchesStation(normalizedHeader, stationKeys)) {
          stationColumnIndexes.push(index);
        }
      });

      if (!stationColumnIndexes.length) return [];

      const points = [];

      for (const cells of table.rawRows) {
        const time = parseWideForecastTimestamp(cells, table.headers);
        if (!time) continue;

        for (const columnIndex of stationColumnIndexes) {
          const value = extractNumericValue(cells[columnIndex]);
          if (value == null || !Number.isFinite(value)) continue;

          points.push({
            time,
            value
          });
        }
      }

      return dedupeAndSortSeries(points);
    }

    async function getWaterLevelForecast(station) {
      if (!station) return [];

      try {
        const indexResponse = await fetch(SMHI_SEALEVEL_OBS_FORECAST_INDEX_URL, {
          headers: {
            "User-Agent": "weatherbear/1.0 bjornfalkenang@gmail.com"
          }
        });

        const indexText = await indexResponse.text();

        if (!indexResponse.ok) {
          throw new Error(`SMHI sea level index ${indexResponse.status}: ${indexText.slice(0, 200)}`);
        }

        const forecastFiles = Array.from(
          indexText.matchAll(/SEALEVEL_NEMO_FCST_48H_\d+\.csv/g)
        )
          .map((match) => match[0])
          .filter((value, index, array) => array.indexOf(value) === index)
          .sort();

        const latestForecastFile = forecastFiles[forecastFiles.length - 1] || null;
        if (!latestForecastFile) return [];

        const forecastResponse = await fetch(
          SMHI_SEALEVEL_OBS_FORECAST_INDEX_URL + latestForecastFile,
          {
            headers: {
              "User-Agent": "weatherbear/1.0 bjornfalkenang@gmail.com"
            }
          }
        );

        const forecastText = await forecastResponse.text();

        if (!forecastResponse.ok) {
          throw new Error(`SMHI sea level forecast ${forecastResponse.status}: ${forecastText.slice(0, 200)}`);
        }

        const table = parseDelimitedTableDetailed(forecastText);
        const rows = table.rows;
        if (!rows.length) return [];

        const runTimestamp = parseSmhiRunTimestampFromFileName(latestForecastFile);

        // SMHI:s stationfiler kan komma i minst tre praktiska former:
        // 1) tid per rad + stationkolumn,
        // 2) tid per rad + stationer som kolumner,
        // 3) station per rad + prognostider som kolumner.
        // Tidigare versioner missade form 3, vilket gav tom prognos trots korrekt fil.
        const stationRowSeries = seriesFromStationRowForecastTable(table, station, runTimestamp);
        if (stationRowSeries.length) {
          return stationRowSeries;
        }

        const wideSeries = seriesFromWideForecastTable(table, station);
        if (wideSeries.length) {
          return wideSeries;
        }

        const stationKeys = getForecastStationKeys(station);

        const stationRows = rows.filter((row) => {
          const rowStationId = getRowStationId(row);
          if (!rowStationId) return false;
          return stationKeys.some((key) => {
            const normalizedRowStation = normalizeForecastKey(rowStationId);
            return normalizedRowStation === key || normalizedRowStation.includes(key) || key.includes(normalizedRowStation);
          });
        });

        if (stationRows.length) {
          return dedupeAndSortSeries(seriesFromForecastRows(stationRows));
        }

        const rowsWithPosition = rows
          .map((row) => {
            const position = getRowLatLon(row);
            if (!position) return null;

            return {
              row,
              position,
              distanceKm: distanceKm(station.latitude, station.longitude, position.lat, position.lon)
            };
          })
          .filter(Boolean);

        if (!rowsWithPosition.length) return [];

        rowsWithPosition.sort((a, b) => a.distanceKm - b.distanceKm);
        const nearest = rowsWithPosition[0];

        if (!nearest || nearest.distanceKm > 50) {
          return [];
        }

        const nearestRows = rowsWithPosition
          .filter((item) => item.distanceKm <= nearest.distanceKm + 0.01)
          .map((item) => item.row);

        return dedupeAndSortSeries(seriesFromForecastRows(nearestRows));
      } catch (error) {
        console.warn("water level forecast failed", station.id, error);
        return [];
      }
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

        const hourTimestamp =
          Math.round(timestamp / (60 * 60 * 1000)) * 60 * 60 * 1000;

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
          return String(
            Math.round(timestamp / (60 * 60 * 1000)) * 60 * 60 * 1000
          );
        })
      );

      const merged = [];

      for (const point of model) {
        const timestamp = parseTimeToTimestamp(point.time);
        if (timestamp == null) continue;

        const key = String(
          Math.round(timestamp / (60 * 60 * 1000)) * 60 * 60 * 1000
        );

        if (!stationTimes.has(key)) {
          merged.push(point);
        }
      }

      merged.push(...station);

      return dedupeAndSortSeries(merged);
    }

    function getLatestTimestamp(series) {
      let latest = null;

      for (const point of series || []) {
        const timestamp = parseTimeToTimestamp(point.time);

        if (timestamp == null) continue;

        if (latest == null || timestamp > latest) {
          latest = timestamp;
        }
      }

      return latest;
    }

    function chooseFreshestSeriesResult(results) {
      const valid = results
        .filter((item) => item && item.station && Array.isArray(item.history))
        .filter((item) => item.history.length)
        .map((item) => ({
          ...item,
          latestTimestamp: getLatestTimestamp(item.history)
        }))
        .filter((item) => item.latestTimestamp != null);

      if (!valid.length) {
        return {
          station: null,
          history: [],
          latestTimestamp: null
        };
      }

      valid.sort((a, b) => {
        const freshnessDiff = b.latestTimestamp - a.latestTimestamp;

        if (Math.abs(freshnessDiff) > FRESHNESS_TIE_MS) {
          return freshnessDiff;
        }

        return a.station.distanceKm - b.station.distanceKm;
      });

      return {
        station: valid[0].station,
        history: valid[0].history,
        latestTimestamp: valid[0].latestTimestamp
      };
    }

    function chooseFreshestObservationResult(results) {
      const valid = results
        .filter((item) => item && item.station && item.observation)
        .map((item) => ({
          ...item,
          latestTimestamp: parseTimeToTimestamp(item.observation.time)
        }))
        .filter((item) => item.latestTimestamp != null);

      if (!valid.length) {
        return {
          station: null,
          observation: null,
          latestTimestamp: null
        };
      }

      valid.sort((a, b) => {
        const freshnessDiff = b.latestTimestamp - a.latestTimestamp;

        if (Math.abs(freshnessDiff) > FRESHNESS_TIE_MS) {
          return freshnessDiff;
        }

        return a.station.distanceKm - b.station.distanceKm;
      });

      return {
        station: valid[0].station,
        observation: valid[0].observation,
        latestTimestamp: valid[0].latestTimestamp
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

    async function getWaveStationCandidates() {
      const data = await safeJson("/api/ocean-wave-stations");
      const stations = Array.isArray(data?.stations) ? data.stations : [];

      return getCandidateStations(stations);
    }

    async function getWaterLevelStationCandidates() {
      const data = await safeJson("/api/ocean-stations");

      const stations = Array.isArray(data?.station)
        ? data.station
        : Array.isArray(data?.stations)
          ? data.stations
          : Array.isArray(data?.resource)
            ? data.resource
            : [];

      return getCandidateStations(stations);
    }

    async function getVivaStationCandidates() {
      const data = await safeJson("/api/viva-stations");

      const stations = Array.isArray(data?.stations)
        ? data.stations
        : Array.isArray(data)
          ? data
          : [];

      return getCandidateStations(stations);
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
          console.warn("wave history failed", station.id, period, error);
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
          console.warn("water level history failed", station.id, period, error);
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
        console.warn("water temp observation failed", station.id, error);
        return null;
      }
    }

    async function getFreshestWaveHistory() {
      const candidates = await getWaveStationCandidates();

      const results = await Promise.all(
        candidates.map(async (station) => {
          const history = await getWaveHistory(station);

          return {
            station,
            history
          };
        })
      );

      return chooseFreshestSeriesResult(results);
    }

    async function getFreshestWaterLevelHistory() {
      const candidates = await getWaterLevelStationCandidates();

      const results = await Promise.all(
        candidates.map(async (station) => {
          const history = await getWaterLevelHistory(station);

          return {
            station,
            history
          };
        })
      );

      return chooseFreshestSeriesResult(results);
    }

    async function getFreshestWaterTempObservation() {
      const candidates = await getVivaStationCandidates();

      const results = await Promise.all(
        candidates.map(async (station) => {
          const observation = await getWaterTempObservation(station);

          return {
            station,
            observation
          };
        })
      );

      return chooseFreshestObservationResult(results);
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

    const [
      waveResult,
      waterLevelResult,
      waterTempObservationResult,
      marineSeries
    ] = await Promise.all([
      getFreshestWaveHistory(),
      getFreshestWaterLevelHistory(),
      getFreshestWaterTempObservation(),
      getMarineSeries()
    ]);

    /*
      Vattentemperatur:
      - Historik/prognos kommer från Open-Meteo Marine, så grafen får en riktig tidsserie.
      - Färskaste VIVA-observation inom valt område skickas separat som aktuell uppmätt vattentemperatur.

      Våghöjd:
      - Färskaste användbara SMHI-stationshistorik inom valt område används där den finns.
      - Saknade äldre historiktimmar fylls med Open-Meteo Marine.
      - Prognos kommer från Open-Meteo Marine.

      Vattenstånd:
      - Färskaste användbara SMHI-stationshistorik inom valt område används.
      - Prognos hämtas från SMHI:s NEMO-vattenståndsprognos när station/prognospunkt kan matchas.
    */

    const waveStation = waveResult.station;
    const waterLevelStation = waterLevelResult.station;
    const vivaStation = waterTempObservationResult.station;

    const waveHistoryFromStation = waveResult.history || [];
    const waterLevelHistory = waterLevelResult.history || [];
    const waterLevelForecast = await getWaterLevelForecast(waterLevelStation);
    const waterTempObservation = waterTempObservationResult.observation;

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

      stationSelection: {
        strategy:
          "Färskaste användbara station inom valt område prioriteras. Om flera stationer är ungefär lika färska väljs den närmaste.",
        freshnessTieMinutes: Math.round(FRESHNESS_TIE_MS / (60 * 1000)),
        maxCandidateStations: MAX_CANDIDATE_STATIONS
      },

      sources: {
        waveHeight: waveHistoryFromStation.length && waveStation
          ? {
              ...waveStation,
              note:
                "Färskaste användbara stationshistorik inom valt område används där den finns. Saknade äldre timmar fylls med Open-Meteo Marine."
            }
          : {
              name: "Open-Meteo Marine",
              distanceKm: 0,
              note:
                "Användbar stationshistorik saknades inom valt område. Visar modellhistorik och prognos för vald punkt."
            },

        waterLevel: waterLevelStation
          ? {
              ...waterLevelStation,
              note:
                "Färskaste användbara vattenståndsstation inom valt område."
            }
          : null,

        waterTemp: waterTempSource,

        observations: {
          waterTemp: vivaStation
            ? {
                ...vivaStation,
                note:
                  "Färskaste VIVA-station inom valt område för aktuell uppmätt vattentemperatur."
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
            "Historik och prognos kommer från Open-Meteo Marine. Färskaste VIVA-observation inom valt område skickas separat när den finns."
        },

        waveHeight: {
          label: "Våghöjd",
          unit: "m",
          history: waveHistory,
          forecast: waveForecast,
          sourceType: waveHistoryFromStation.length
            ? "fresh-station-and-model-history-model-forecast"
            : "model",
          note: waveHistoryFromStation.length
            ? "Färskaste stationshistorik inom valt område används där den finns. Äldre saknade timmar fylls med Open-Meteo Marine. Prognos kommer från Open-Meteo Marine."
            : "Historik och prognos kommer från Open-Meteo Marine."
        },

        waterLevel: {
          label: "Vattenstånd",
          unit: "cm",
          history: waterLevelHistory,
          forecast: waterLevelForecast,
          sourceType: waterLevelHistory.length || waterLevelForecast.length
            ? "fresh-station-history-smhi-forecast"
            : "none",
          note: waterLevelHistory.length || waterLevelForecast.length
            ? "Färskaste användbara vattenståndsstation inom valt område används. Prognos hämtas från SMHI när matchning finns."
            : "Ingen användbar vattenståndsdata hittades inom valt område."
        }
      },

      forecastNote:
        "Våghöjd och vattentemperatur har prognos från Open-Meteo Marine. Vattenstånd har SMHI-prognos när station/prognospunkt kan matchas."
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
