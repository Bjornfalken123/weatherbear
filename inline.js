
      var activeMode="weather", activeBottomTab="weather", seaSelectionActive=false, seaMode="area", selectedSeaArea=null,
        seaAreaRadiusKm=50, seaAreaSourceId="sea-area-source", seaAreaFillLayerId="sea-area-fill-layer", seaAreaLineLayerId="sea-area-line-layer",
        showWaveObjects=false, showLighthouseObjects=false, showAisObjects=false, lastObjectInteractionAt=0, forecastExpanded=false,
        currentForecastDays=[], weatherTimeseries=[], weatherGustTimeseries=[], weatherHistoryTimeseries=[], weatherAnalysisHistoryLoading=false, latestWeatherAnalysisHistoryRequestId=0, selectedForecastTime=null, timePlaybackTimer=null, weatherDetailsExpanded=false,
        timelineApplyTimer=null, pendingForecastTime=null;

      var selectedSeaAreaData = null;
      var latestSeaAreaRequestId = 0;
      var selectedSeaTimeseriesData = null;
      var latestSeaTimeseriesRequestId = 0;
      var seaHistoryHours = 24;
      var seaForecastHours = 72;
      var savedSelections={weather:null,wave:null,lighthouse:null};
      var activeAdvancedCard="wind";
      var activeAdvancedMetric="wind";
      var advancedChartRegistry = {};
      var advancedChartSeq = 0;

      var maptilerMap=null, maptilerWeatherMarker=null, maptilerWindLayer=null, maptilerPrecipitationLayer=null, maptilerRadarLayer=null,
        maptilerTemperatureLayer=null, maptilerTimelineLayer=null, smhiRadarObservationVisible=false, smhiRadarObservationRequestId=0, smhiRadarObservationActiveKey=null,
        smhiRadarObservationSourceId="smhi-radar-observation-source", smhiRadarObservationLayerId="smhi-radar-observation-layer", smhiRadarObservationTileIds=[], smhiRadarObservationSourceIds=[], openMeteoProtocolRegistered=false, openMeteoCloudMetadataPromise=null,
        openMeteoCloudValidTimes=[], openMeteoCloudSourceActiveKey=null, openMeteoCloudRequestId=0, openMeteoCloudLastError=null,
        openMeteoCloudApplyTimer=null, openMeteoCloudPendingTime=null, openMeteoCloudLastAppliedAt=0, openMeteoCloudSourceCache=new Map();

      var baseMapMode = "standard";
      var nauticalBaseSourceId = "nautical-light-base-source";
      var nauticalBaseLayerId = "nautical-light-base-layer";
      var nauticalSeamarkSourceId = "nautical-seamark-source";
      var nauticalSeamarkLayerId = "nautical-seamark-layer";
      var nauticalDepthSourceId = "nautical-emodnet-depth-source";
      var nauticalDepthLayerId = "nautical-emodnet-depth-layer";
      var nauticalDepthTestEnabled = true;
      var nauticalLayerOrderTimer = null;
      var nauticalCompassMode = "north";
var nauticalTheme = localStorage.getItem("weatherbear:nauticalTheme") || "day";
var mapCameraProgrammaticUntil = 0;
var nauticalFollowInitialized = false;
try{document.body.setAttribute("data-nautical-theme", nauticalTheme === "evening" ? "evening" : "day");}catch(e){}
var nauticalGeoWatchId = null;
var nauticalDeviceHeading = null;
var nauticalGpsHeading = null;
var nauticalLastSpeed = null;
var nauticalOrientationStarted = false;
var customUserLocationMarker = null;
var customUserLocationEl = null;
var customUserLocationArrowEl = null;

var customUserAccuracySourceId = "custom-user-accuracy-source";
var customUserAccuracyLayerId = "custom-user-accuracy-layer";
var customUserCourseSourceId = "custom-user-course-source";
var customUserCourseLayerId = "custom-user-course-layer";

var userTrackingMode = "off";
// "off" = fri karta: GPS syns, kartan följer inte
// "follow" = följ position, nord upp
// "follow-course" = följ position och rotera efter GPS-kurs

var userPositionState = {
  lat: null,
  lon: null,
  accuracy: null,
  speed: null,
  rawHeading: null,
  updatedAt: 0,
  previous: null
};

var navigationCourse = {
  heading: null,
  source: null,
  updatedAt: 0,
  confidence: 0
};
var APP_DISPLAY_TIMEZONE = (Intl.DateTimeFormat().resolvedOptions().timeZone || "local");
var TIME_STEP_HOUR_MS = 60 * 60 * 1000;
var TIME_STEP_SMHI_RADAR_MS = 5 * 60 * 1000;
var forecastStartTime = null;
var forecastEndTime = null;
var appTimeState = {
  selectedMs: null,
  timelineStartMs: null,
  timelineEndMs: null,
  updatedAtMs: Date.now()
};

function normalizeTimeMs(value){
  if(value == null || value === "") return null;
  if(value instanceof Date){
    var dateMs = value.getTime();
    return isFinite(dateMs) ? dateMs : null;
  }
  var numeric = Number(value);
  if(isFinite(numeric) && String(value).trim() !== "") return numeric;
  var parsed = new Date(value).getTime();
  return isFinite(parsed) ? parsed : null;
}

function roundTimeToStep(timeValue, stepMs){
  var t = normalizeTimeMs(timeValue);
  if(!isFinite(t)) t = Date.now();
  var step = Number(stepMs) || TIME_STEP_HOUR_MS;
  return Math.round(t / step) * step;
}

function floorTimeToStep(timeValue, stepMs){
  var t = normalizeTimeMs(timeValue);
  if(!isFinite(t)) t = Date.now();
  var step = Number(stepMs) || TIME_STEP_HOUR_MS;
  return Math.floor(t / step) * step;
}

function roundToForecastHour(timeValue){
  return roundTimeToStep(timeValue, TIME_STEP_HOUR_MS);
}

function roundToSmhiRadarObservationTime(timeValue){
  return roundTimeToStep(timeValue, TIME_STEP_SMHI_RADAR_MS);
}

function getCurrentRoundedForecastHour(){
  return roundToForecastHour(Date.now());
}

function getSmhiRadarObservationRequestTime(timeValue){
  var selected = normalizeTimeMs(timeValue);
  if(!isFinite(selected)) selected = getSelectedAppTime();
  var now = Date.now();

  // If the app's main timeline rounds "now" to the nearest full hour ahead
  // (for example 10:50 -> 11:00), SMHI observation should still use the
  // nearest real observation around the actual current time, not treat 11:00
  // as a missing forecast. Future hours beyond the current rounded hour remain unsupported.
  if(isFinite(selected) && selected > now && selected <= getCurrentRoundedForecastHour()){
    return { requestMs: roundToSmhiRadarObservationTime(now), isForecast: false, adjustedFromRoundedNow: true };
  }

  var requestMs = roundToSmhiRadarObservationTime(selected);
  return { requestMs: requestMs, isForecast: isFutureAppTime(requestMs), adjustedFromRoundedNow: false };
}

function setForecastTimeBounds(startValue, endValue){
  forecastStartTime = roundToForecastHour(startValue);
  forecastEndTime = roundToForecastHour(endValue);
  appTimeState.timelineStartMs = forecastStartTime;
  appTimeState.timelineEndMs = forecastEndTime;
}

function clampForecastTime(timeValue){
  var t = roundToForecastHour(timeValue);

  if(forecastStartTime) t = Math.max(forecastStartTime, t);
  if(forecastEndTime) t = Math.min(forecastEndTime, t);

  return roundToForecastHour(t);
}

function getSelectedAppTime(){
  return selectedForecastTime || appTimeState.selectedMs || roundToForecastHour(Date.now());
}

function isSelectedTimeRoundedCurrentHour(){
  var selected = normalizeTimeMs(getSelectedAppTime());
  if(!isFinite(selected)) return false;
  return Math.abs(selected - getCurrentRoundedForecastHour()) <= 60 * 1000;
}

function getAnalysisFocusTime(){
  // Kartlager och huvudreglage jobbar i hela timmar, men analysens öppningsvärde
  // ska kännas som "nu". Om reglaget står på aktuell avrundad timme
  // använder grafens markör faktisk aktuell tid. Om användaren själv har
  // stegat bakåt/framåt används vald timme.
  if(isSelectedTimeRoundedCurrentHour()) return Date.now();
  return getSelectedAppTime();
}

function setSelectedAppTime(timeValue, options){
  options = options || {};
  var normalized = options.noClamp ? roundToForecastHour(timeValue) : clampForecastTime(timeValue);
  selectedForecastTime = normalized;
  appTimeState.selectedMs = normalized;
  appTimeState.updatedAtMs = Date.now();
  return normalized;
}

function isFutureAppTime(timeValue, toleranceMs){
  var t = normalizeTimeMs(timeValue);
  if(!isFinite(t)) return false;
  return t > Date.now() + (toleranceMs == null ? 2 * 60 * 1000 : toleranceMs);
}

function findNearestWeatherTimeseriesItem(timeValue){
  if(!Array.isArray(weatherTimeseries) || !weatherTimeseries.length) return null;

  var targetTime = roundToForecastHour(timeValue);
  var best = weatherTimeseries[0];
  var bestDiff = Math.abs(new Date(best.time).getTime() - targetTime);

  for(var i = 1; i < weatherTimeseries.length; i++){
    var itemTime = new Date(weatherTimeseries[i].time).getTime();
    var diff = Math.abs(itemTime - targetTime);

    if(diff < bestDiff){
      best = weatherTimeseries[i];
      bestDiff = diff;
    }
  }

  return best;
}

function getForecastPrecipitation(item){
  if(!item || !item.data) return {amount:null, hours:1};

  if(
    item.data.next_1_hours &&
    item.data.next_1_hours.details &&
    item.data.next_1_hours.details.precipitation_amount != null
  ){
    return {
      amount: item.data.next_1_hours.details.precipitation_amount,
      hours: 1
    };
  }

  if(
    item.data.next_6_hours &&
    item.data.next_6_hours.details &&
    item.data.next_6_hours.details.precipitation_amount != null
  ){
    return {
      amount: item.data.next_6_hours.details.precipitation_amount,
      hours: 6
    };
  }

  if(
    item.data.next_12_hours &&
    item.data.next_12_hours.details &&
    item.data.next_12_hours.details.precipitation_amount != null
  ){
    return {
      amount: item.data.next_12_hours.details.precipitation_amount,
      hours: 12
    };
  }

  return {amount:null, hours:1};
}

function formatForecastPeriodRange(timeValue, hours){
  var start = Number(timeValue);
  var h = Number(hours || 1);

  if(!isFinite(start)) return "";

  var end = start + h * 60 * 60 * 1000;

  return formatClockDotGlobal(start) + "–" + formatClockDotGlobal(end);
}
      async function loadSeaAreaData(lat, lon, radiusKm){
        var requestId = ++latestSeaAreaRequestId;
        selectedSeaAreaData = null;
        renderSeaAreaPanel();
        try{
          var url = "/api/sea-area?lat=" + encodeURIComponent(String(lat)) + "&lon=" + encodeURIComponent(String(lon)) + "&radiusKm=" + encodeURIComponent(String(radiusKm));
          var res = await fetch(url);
          var data = await res.json();
          if(requestId !== latestSeaAreaRequestId) return;
          if(!res.ok) throw new Error((data && data.error) || "Havsdata kunde inte hämtas");
          selectedSeaAreaData = data;
          renderSeaAreaPanel();
        }catch(e){
          if(requestId !== latestSeaAreaRequestId) return;
          console.warn("Havsområdesdata kunde inte hämtas", e);
          selectedSeaAreaData = {error:true,message:"Det gick inte att hämta havsdata för området."};
          renderSeaAreaPanel();
        }
      }

      async function loadSeaTimeseriesData(lat, lon, radiusKm){
        var requestId = ++latestSeaTimeseriesRequestId;
        selectedSeaTimeseriesData = null;
        renderSeaTimeseriesPanel();
        try{
          var url = "/api/sea-timeseries?lat=" + encodeURIComponent(String(lat)) + "&lon=" + encodeURIComponent(String(lon)) + "&radiusKm=" + encodeURIComponent(String(radiusKm));
          var res = await fetch(url);
          var data = await res.json();
          if(requestId !== latestSeaTimeseriesRequestId) return;
          if(!res.ok) throw new Error((data && data.error) || "Havsserier kunde inte hämtas");
          selectedSeaTimeseriesData = data;
    renderSeaAreaPanel();
        }catch(e){
          if(requestId !== latestSeaTimeseriesRequestId) return;
          console.warn("Havsserier kunde inte hämtas", e);
          selectedSeaTimeseriesData = {error:true,message:"Det gick inte att hämta historik eller prognos just nu."};
          renderSeaAreaPanel();
        }
      }

      function escapeHtml(value){return String(value == null ? "" : value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");}
      function formatCoord(v){ return Number(v).toFixed(4); }
      function formatTemp(v){ return v==null ? "--" : Number(v).toFixed(1)+" °C"; }
      function formatHumidity(v){ return v==null ? "--" : Math.round(Number(v))+" %"; }
      function formatRain(v){ return v==null ? "--" : Number(v).toFixed(1)+" mm"; }
function formatWind(v){
  return v==null ? "--" : Number(v).toFixed(1)+" m/s";
}

function formatPressure(v){
  return v==null ? "--" : Number(v).toFixed(1)+" hPa";
}
   function formatFeelsLike(v){
  return v == null || !isFinite(Number(v))
    ? "--"
    : Number(v).toFixed(1).replace(".", ",") + " °C";
}

function calculateFeelsLikeTemperature(temp, windSpeed, humidity){
  if(temp == null || !isFinite(Number(temp))) return null;

  var t = Number(temp);
  var windMs = windSpeed == null || !isFinite(Number(windSpeed))
    ? 0
    : Math.max(0, Number(windSpeed));

  var rh = humidity == null || !isFinite(Number(humidity))
    ? 50
    : Math.max(0, Math.min(100, Number(humidity)));

  // 1) Kallt väder: wind chill.
  // Gäller bäst när temperaturen är låg och vinden är märkbar.
  if(t <= 10 && windMs > 1.33){
    var windKmh = windMs * 3.6;

    var windChill =
      13.12 +
      0.6215 * t -
      11.37 * Math.pow(windKmh, 0.16) +
      0.3965 * t * Math.pow(windKmh, 0.16);

    if(isFinite(windChill)){
      return windChill;
    }
  }

  // 2) Varmt och fuktigt väder: heat index.
  // Används bara där heat index faktiskt är relevant.
  if(t >= 26 && rh >= 40){
    var tf = (t * 9 / 5) + 32;

    var hiF =
      -42.379 +
      2.04901523 * tf +
      10.14333127 * rh -
      0.22475541 * tf * rh -
      0.00683783 * tf * tf -
      0.05481717 * rh * rh +
      0.00122874 * tf * tf * rh +
      0.00085282 * tf * rh * rh -
      0.00000199 * tf * tf * rh * rh;

    var hiC = (hiF - 32) * 5 / 9;

    if(isFinite(hiC)){
      return hiC;
    }
  }

  // 3) Mellanläge: mjuk apparent temperature.
  // Steadman tar hänsyn till vind och fukt, men viktas mot faktisk temperatur
  // så att appen inte visar onödigt extrema "känns som"-värden i normalt väder.
  var vaporPressure = (rh / 100) * 6.105 * Math.exp((17.27 * t) / (237.7 + t));
  var steadman = t + (0.33 * vaporPressure) - (0.70 * windMs) - 4.00;

  if(!isFinite(steadman)) return t;

  var diff = steadman - t;

  // Begränsa mellanlägets påverkan så värdet känns trovärdigt i vardagsväder.
  var maxDrop = 4;
  var maxRise = 3;

  if(diff < -maxDrop) diff = -maxDrop;
  if(diff > maxRise) diff = maxRise;

  return t + diff;
}

function formatUvIndex(value){
  if(value == null || !isFinite(Number(value))) return "--";

  var n = Math.max(0, Number(value));

  if(n < 0.5) return "0";

  return n.toFixed(1).replace(".", ",");
}

function getUvLevel(value){
  if(value == null || !isFinite(Number(value))) return "";

  var n = Math.max(0, Number(value));

  if(n < 3) return "lågt";
  if(n < 6) return "måttligt";
  if(n < 8) return "högt";
  if(n < 11) return "mycket högt";

  return "extremt";
}

function formatUvMetric(value){
  if(value == null || !isFinite(Number(value))) return "--";

  var level = getUvLevel(value);

  return formatUvIndex(value) + (level ? " · " + level : "");
}

function findNearestHourlyValue(rows, timeValue, valueKeys){
  if(!Array.isArray(rows) || !rows.length) return null;

  var target = roundToForecastHour(timeValue);
  var best = null;
  var bestDiff = Infinity;

  for(var i = 0; i < rows.length; i++){
    var row = rows[i];
    var rowTime = new Date(row.time).getTime();

    if(!isFinite(rowTime)) continue;

    var value = null;

    for(var k = 0; k < valueKeys.length; k++){
      var key = valueKeys[k];

      if(row[key] != null && isFinite(Number(row[key]))){
        value = Number(row[key]);
        break;
      }
    }

    if(value == null) continue;

    var diff = Math.abs(rowTime - target);

    if(diff < bestDiff){
      bestDiff = diff;
      best = value;
    }
  }

  return best;
}

async function fetchOpenMeteoUvTimeseries(lat, lon){
  try{
    var url =
      "/api/openmeteo-uv?lat=" +
      encodeURIComponent(String(lat)) +
      "&lon=" +
      encodeURIComponent(String(lon));

    var res = await fetch(url);
    var data = await res.json();

    if(!res.ok) throw new Error((data && data.error) || "UV-index kunde inte hämtas");

    return Array.isArray(data.timeseries) ? data.timeseries : [];
  }catch(e){
    console.warn("UV-index kunde inte hämtas", e);
    return [];
  }
}   

function formatWave(v){
  return v==null ? "--" : Number(v).toFixed(1)+" m";
}

function formatWaterLevel(v){
  return v==null ? "--" : Number(v).toFixed(1)+" cm";
}

function toRad(value){
  return value * Math.PI / 180;
}
      function isNearNow(timeValue){
  var t = Number(timeValue);
  if(!isFinite(t)) return false;
  return Math.abs(Date.now() - t) <= 75 * 60 * 1000;
}

function formatForecastHourRange(timeValue){
  var start = Number(timeValue);
  if(!isFinite(start)) return "";
  var end = start + 60 * 60 * 1000;
  return formatClockDotGlobal(start) + "–" + formatClockDotGlobal(end);
}

function formatPrecipAmount(value){
  if(value == null || !isFinite(Number(value))) return "0 mm";

  var n = Math.max(0, Number(value));

  if(n < 0.05) return "0 mm";
  if(n < 0.1) return "<0,1 mm";

  return n.toFixed(1).replace(".", ",") + " mm";
}

function getPrecipLevel(amount){
  var n = Math.max(0, Number(amount || 0));

  if(n < 0.05){
    return {
      label: "Uppehåll",
      tone: "dry",
      active: false
    };
  }

  if(n < 0.5){
    return {
      label: "Lätt",
      tone: "light",
      active: true
    };
  }

  if(n < 2.0){
    return {
      label: "Måttlig",
      tone: "moderate",
      active: true
    };
  }

  return {
    label: "Kraftig",
    tone: "heavy",
    active: true
  };
}
function getPrecipAmountFromPeriod(item){
  if(!item || !item.data) return null;

  var candidates = [
    item.data.next_1_hours,
    item.data.next_30_minutes,
    item.data.next_15_minutes,
    item.data.next_6_hours,
    item.data.next_12_hours
  ];

  for(var i = 0; i < candidates.length; i++){
    var details = candidates[i] && candidates[i].details;

    if(details && details.precipitation_amount != null){
      var value = Number(details.precipitation_amount);
      return isFinite(value) ? Math.max(0, value) : null;
    }
  }

  return null;
}

function getPrecipRateNow(item){
  var details = item && item.data && item.data.instant && item.data.instant.details;

  if(!details || details.precipitation_rate == null) return null;

  var value = Number(details.precipitation_rate);

  return isFinite(value) ? Math.max(0, value) : null;
}

function isWetPrecipPoint(point){
  if(!point) return false;

  return (
    (point.rate != null && point.rate >= 0.05) ||
    (point.amount != null && point.amount >= 0.05)
  );
}

function getNowcastPointAmount(point, fallback){
  if(!point) return fallback;

  if(point.amount != null && isFinite(Number(point.amount))){
    return Math.max(0, Number(point.amount));
  }

  if(point.rate != null && isFinite(Number(point.rate))){
    return Math.max(0, Number(point.rate));
  }

  return fallback;
}

function hasUsableNowcastCoverage(meta){
  var coverage = meta && meta.radar_coverage;

  if(!coverage) return true;

  coverage = String(coverage).toLowerCase();

  return coverage === "ok" || coverage === "good" || coverage === "high";
}

function summarizeNowcastPrecipitation(nowcastData, fallbackAmount){
  var fallback =
    fallbackAmount == null || !isFinite(Number(fallbackAmount))
      ? 0
      : Math.max(0, Number(fallbackAmount));

  if(
    !nowcastData ||
    !nowcastData.properties ||
    !Array.isArray(nowcastData.properties.timeseries)
  ){
    return summarizePrecipitationForCard(Date.now(), fallback, null);
  }

  var props = nowcastData.properties;

  if(!hasUsableNowcastCoverage(props.meta)){
    return summarizePrecipitationForCard(Date.now(), fallback, null);
  }

  var now = Date.now();
  var oneHourFromNow = now + 60 * 60 * 1000;

  var timeseries = props.timeseries
    .map(function(item){
      return {
        raw: item,
        time: new Date(item.time).getTime(),
        amount: getPrecipAmountFromPeriod(item),
        rate: getPrecipRateNow(item)
      };
    })
    .filter(function(item){
      return isFinite(item.time);
    })
    .sort(function(a, b){
      return a.time - b.time;
    });

  if(!timeseries.length){
    return summarizePrecipitationForCard(Date.now(), fallback, null);
  }

  var current = timeseries[0];
  var currentDiff = Math.abs(current.time - now);

  for(var i = 1; i < timeseries.length; i++){
    var diff = Math.abs(timeseries[i].time - now);

    if(diff < currentDiff){
      current = timeseries[i];
      currentDiff = diff;
    }
  }

  var nextHourAmount = getNowcastPointAmount(current, fallback);
  var firstWet = null;

  for(var j = 0; j < timeseries.length; j++){
    var point = timeseries[j];

    if(point.time < now - 5 * 60 * 1000) continue;
    if(point.time > oneHourFromNow) break;

    if(isWetPrecipPoint(point)){
      firstWet = point;
      break;
    }
  }

  var level = getPrecipLevel(nextHourAmount);

  var isRainingNow =
    isWetPrecipPoint(current) &&
    currentDiff <= 20 * 60 * 1000;

  if(isRainingNow){
    return {
      label: level.tone === "heavy" ? "Kraftig nederbörd nu" : "Nederbörd nu",
      amount: nextHourAmount,
      detail: formatPrecipAmount(nextHourAmount) + " · närmaste timmen",
      active: true,
      tone: level.tone === "dry" ? "light" : level.tone
    };
  }

  if(firstWet){
    var minutes = Math.max(1, Math.round((firstWet.time - now) / (60 * 1000)));
    var comingAmount = getNowcastPointAmount(firstWet, nextHourAmount);
    var comingLevel = getPrecipLevel(comingAmount);

    return {
      label: "Nederbörd om ca " + minutes + " min",
      amount: comingAmount,
      detail: formatPrecipAmount(Math.max(nextHourAmount, comingAmount)) + " · närmaste timmen",
      active: true,
      tone: comingLevel.tone === "dry" ? "light" : comingLevel.tone
    };
  }

  return {
    label: "Uppehåll",
    amount: nextHourAmount,
    detail: "0 mm · närmaste timmen",
    active: false,
    tone: "dry"
  };
}

function summarizePrecipitationForCard(timeValue, yrAmount, nowcastData, periodHours){
  var roundedTime = roundToForecastHour(timeValue);

  if(isNearNow(roundedTime) && nowcastData){
    return summarizeNowcastPrecipitation(nowcastData, yrAmount);
  }

  var amount =
    yrAmount == null || !isFinite(Number(yrAmount))
      ? 0
      : Math.max(0, Number(yrAmount));

  var level = getPrecipLevel(amount);
  var hours = Number(periodHours || 1);

  var periodText = isNearNow(roundedTime)
    ? "närmaste timmen"
    : formatForecastPeriodRange(roundedTime, hours);

  return {
    label: level.label,
    amount: amount,
    detail: formatPrecipAmount(amount) + " · " + periodText,
    active: level.active,
    tone: level.tone,
    periodHours: hours
  };
}
function buildPrecipitationMetric(summary){
  if(!summary) return "";

  var label = escapeHtml(summary.label || "Uppehåll");
  var detail = summary.detail
    ? ' <span class="weather-metric-muted">· ' + escapeHtml(summary.detail) + '</span>'
    : "";

  return (
    '<div class="weather-metric-line">' +
    '<strong>Nederbörd</strong> ' +
    '<span>' + label + '</span>' +
    detail +
    '</div>'
  );
}
      function distanceKmBetween(lat1, lon1, lat2, lon2){
        var R=6371, dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
        var a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)*Math.sin(dLon/2);
        return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
      }
      function distanceKm(a,b,c,d){ return distanceKmBetween(a,b,c,d); }

      function setText(id,v){ var el=document.getElementById(id); if(el) el.textContent=v; }
      function isMobileView(){ return window.matchMedia("(max-width:700px)").matches; }
      function isSeaActive(){ return seaSelectionActive === true; }
      function markObjectInteraction(){ lastObjectInteractionAt=Date.now(); }
      function setOverlayHeaderDot(state){ var dot=document.getElementById("overlayHeaderDot"); if(dot) dot.classList.toggle("loading",state==="loading"); }

      function isStandaloneWebApp(){ return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
      function applyStandaloneInsetsFix(){
        var standalone = isStandaloneWebApp();
        document.documentElement.classList.toggle('standalone-webapp', standalone);
        if(standalone) document.documentElement.style.setProperty('--safe-top','0px');
        else document.documentElement.style.removeProperty('--safe-top');
      }
      applyStandaloneInsetsFix();
      window.addEventListener('pageshow', applyStandaloneInsetsFix);
      window.addEventListener('resize', applyStandaloneInsetsFix);
      window.addEventListener('orientationchange', function(){setTimeout(applyStandaloneInsetsFix,250);setTimeout(applyStandaloneInsetsFix,600);});

      function weatherLabelFromSymbol(sc){
        if(!sc) return "--";
        var k=sc.replace(/_(day|night|polartwilight)$/,'');
        var L={clearsky:'Klart',fair:'Mestadels klart',partlycloudy:'Delvis molnigt',cloudy:'Molnigt',lightrainshowers:'Lätta regnskurar',rainshowers:'Regnskurar',heavyrainshowers:'Kraftiga regnskurar',lightrain:'Lätt regn',rain:'Regn',heavyrain:'Kraftigt regn',lightsleet:'Lätt snöblandat regn',sleet:'Snöblandat regn',heavysleet:'Kraftigt snöblandat regn',lightsnow:'Lätt snöfall',snow:'Snöfall',heavysnow:'Kraftigt snöfall',fog:'Dimma'};
        return L[k] || k;
      }
      function weatherIconFromSymbol(sc){
        if(!sc) return '•';
        var k=sc.replace(/_(day|night|polartwilight)$/,'');
        var icons={clearsky:'☀️',fair:'🌤️',partlycloudy:'⛅',cloudy:'☁️',lightrainshowers:'🌦️',rainshowers:'🌦️',heavyrainshowers:'⛈️',lightrain:'🌦️',rain:'🌧️',heavyrain:'🌧️',lightsleet:'🌨️',sleet:'🌨️',heavysleet:'🌨️',lightsnow:'🌨️',snow:'❄️',heavysnow:'❄️',fog:'🌫️'};
        return icons[k] || '•';
      }
      function degreesToCompass(deg){ if(deg==null || isNaN(Number(deg))) return '--'; return ['N','NO','O','SO','S','SV','V','NV'][Math.round(((Number(deg)%360)+360)%360/45)%8]; }
      function formatWindDirection(deg){ if(deg==null || isNaN(Number(deg))) return '--'; return Math.round(Number(deg))+'° '+degreesToCompass(Number(deg)); }
      function formatWindWithDirection(speed,deg){ var wind=formatWind(speed), dir=formatWindDirection(deg); if(wind==='--' && dir==='--') return '--'; if(wind==='--') return dir; if(dir==='--') return wind; return wind+' • '+dir; }
      function formatObsTime(v){ if(!v) return "--"; var n=Number(v); var d=(!isNaN(n) && String(v).length>=10) ? new Date(n) : new Date(v); if(isNaN(d.getTime())) return String(v); return d.toLocaleString("sv-SE",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}); }
      function formatObservedValue(fv,obs){ if(!fv || fv==="--") return "--"; var rt=obs && (obs.date || obs.time) || null; var tt=formatObsTime(rt); if(!rt || tt==="--") return fv; return fv+" • "+tt; }

      function isSameDateGlobal(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}
      function formatClockDotGlobal(v){ if(!v) return '--.--'; var d=new Date(v); if(isNaN(d.getTime())) return '--.--'; return d.toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'}).replace(':','.'); }
      function formatDateKeyGlobal(v){ var d=new Date(v); if(isNaN(d.getTime())) return ''; return new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit'}).format(d); }
      function formatForecastLabelGlobal(v){
        if(!v) return '--';
        var d=new Date(v); if(isNaN(d.getTime())) return '--';
        var now=new Date(), tomorrow=new Date(now); tomorrow.setDate(now.getDate()+1);
        var time=formatClockDotGlobal(d);
        var dateKey=formatDateKeyGlobal(d), nowKey=formatDateKeyGlobal(now), tomorrowKey=formatDateKeyGlobal(tomorrow);
        if(dateKey === nowKey) return 'Idag '+time;
        if(dateKey === tomorrowKey) return 'Imorgon '+time;
        var weekday=d.toLocaleDateString('sv-SE',{weekday:'short'});
        weekday=weekday.charAt(0).toUpperCase()+weekday.slice(1);
        return weekday+' '+time;
      }

      function buildOverlayDataGrid(rows){
        return '<div class="overlay-data-grid">'+ rows.filter(function(r){ return r.value && r.value!=="--"; }).map(function(r){ return '<div class="overlay-data-cell"><div class="overlay-data-label">'+r.label+'</div><div class="overlay-data-value'+(r.highlight?' highlight':'')+'">'+r.value+'</div></div>'; }).join("") + '</div>';
      }

      function syncOverlayTitle(){
        var titleEl=document.getElementById("overlayTitle"), panel=document.getElementById("mapOverlayPanel");
        if(!titleEl) return;
        var collapsed = panel && panel.classList.contains("is-collapsed");
        if(titleEl.dataset.collapsedTitle || titleEl.dataset.expandedTitle){
          titleEl.textContent = collapsed ? (titleEl.dataset.collapsedTitle || titleEl.dataset.baseTitle || "Välj plats") : (titleEl.dataset.expandedTitle || titleEl.dataset.baseTitle || "Välj plats");
          return;
        }
        titleEl.textContent = titleEl.dataset.baseTitle || "Välj plats";
      }
      function renderCombinedMapOverlay(){
        var titleEl=document.getElementById("overlayTitle"), contentEl=document.getElementById("overlayContent");
        if(!titleEl || !contentEl) return;
        syncOverlayTitle();
        var base=contentEl.dataset.baseContent || "Tryck på kartan för att visa väderdata.";
        var waveTitle=contentEl.dataset.waveTitle || "";
        var waveContent=contentEl.dataset.waveContent || "";
        var lighthouseTitle=contentEl.dataset.lighthouseTitle || "";
        var lighthouseContent=contentEl.dataset.lighthouseContent || "";
        var html='<div>'+base+'</div>';
        if(waveTitle && waveContent) html += '<div class="overlay-object-section"><div class="overlay-object-title">'+waveTitle+'</div><div>'+waveContent+'</div></div>';
        if(lighthouseTitle && lighthouseContent) html += '<div class="overlay-object-section"><div class="overlay-object-title">'+lighthouseTitle+'</div><div>'+lighthouseContent+'</div></div>';
        contentEl.innerHTML=html;
      }
      function updateMapOverlay(title,content,meta){
        var t=document.getElementById("overlayTitle"), c=document.getElementById("overlayContent");
        if(!t || !c) return;
        t.dataset.baseTitle=title;
        if(meta && (meta.expandedTitle || meta.collapsedTitle)){
          t.dataset.expandedTitle = meta.expandedTitle || title;
          t.dataset.collapsedTitle = meta.collapsedTitle || title;
        }else{
          delete t.dataset.expandedTitle; delete t.dataset.collapsedTitle;
        }
        c.dataset.baseContent=content;
        renderCombinedMapOverlay();
      }
      function updateWaveOverlay(title,content){ var c=document.getElementById("overlayContent"); if(!c) return; c.dataset.waveTitle=title; c.dataset.waveContent=content; renderCombinedMapOverlay(); }
      function updateLighthouseOverlay(title,content){ var c=document.getElementById("overlayContent"); if(!c) return; c.dataset.lighthouseTitle=title; c.dataset.lighthouseContent=content; renderCombinedMapOverlay(); }
      function hideWaveOverlay(){ var c=document.getElementById("overlayContent"); if(!c) return; c.dataset.waveTitle=""; c.dataset.waveContent=""; renderCombinedMapOverlay(); }
      function hideLighthouseOverlay(){ var c=document.getElementById("overlayContent"); if(!c) return; c.dataset.lighthouseTitle=""; c.dataset.lighthouseContent=""; renderCombinedMapOverlay(); }

      function buildFavoriteId(lat, lon){return Number(lat).toFixed(4)+":"+Number(lon).toFixed(4);}
      var favoritesStorageKey="weatherFavorites", seaAreasStorageKey="seaAreaFavorites";
      function getStoredFavorites(){try{var raw=localStorage.getItem(favoritesStorageKey);var parsed=raw?JSON.parse(raw):[];return Array.isArray(parsed)?parsed:[];}catch(e){return [];}}
      function saveStoredFavorites(items){localStorage.setItem(favoritesStorageKey, JSON.stringify(items));}
      function isFavorite(lat, lon){var id=buildFavoriteId(lat, lon);return getStoredFavorites().some(function(item){return item.id===id;});}
      function addFavorite(place){var items=getStoredFavorites();if(items.some(function(item){return item.id===place.id;})) return;items.unshift(place);saveStoredFavorites(items.slice(0,20));renderFavoritesList();}
      function removeFavorite(id){saveStoredFavorites(getStoredFavorites().filter(function(item){return item.id!==id;}));renderFavoritesList();}
      function renameFavorite(id){var items=getStoredFavorites();var item=items.find(function(entry){return entry.id===id;});if(!item) return;var nextName=window.prompt("Nytt namn på platsen:", item.name || "");if(nextName===null) return;nextName=String(nextName).trim();if(!nextName) return;item.name=nextName;saveStoredFavorites(items);renderFavoritesList();}

      function buildSeaAreaFavoriteId(lat, lon, radiusKm){return Number(lat).toFixed(4)+":"+Number(lon).toFixed(4)+":"+Number(radiusKm || seaAreaRadiusKm);}
      function getStoredSeaAreas(){try{var raw=localStorage.getItem(seaAreasStorageKey);var parsed=raw?JSON.parse(raw):[];return Array.isArray(parsed)?parsed:[];}catch(e){return [];}}
      function saveStoredSeaAreas(items){localStorage.setItem(seaAreasStorageKey, JSON.stringify(items));}
      function isSeaAreaFavorite(lat, lon, radiusKm){var id=buildSeaAreaFavoriteId(lat, lon, radiusKm);return getStoredSeaAreas().some(function(item){return item.id===id;});}
      function addSeaAreaFavorite(area){var items=getStoredSeaAreas();if(items.some(function(item){return item.id===area.id;})) return;items.unshift(area);saveStoredSeaAreas(items.slice(0,20));renderFavoritesList();}
      function removeSeaAreaFavorite(id){saveStoredSeaAreas(getStoredSeaAreas().filter(function(item){return item.id!==id;}));renderFavoritesList();}
      function renameSeaAreaFavorite(id){var items=getStoredSeaAreas();var item=items.find(function(entry){return entry.id===id;});if(!item) return;var nextName=window.prompt("Nytt namn på havsområdet:", item.name || "");if(nextName===null) return;nextName=String(nextName).trim();if(!nextName) return;item.name=nextName;saveStoredSeaAreas(items);renderFavoritesList();}

      function formatSeaChartTime(value){var d=new Date(value);if(isNaN(d.getTime())) return "";return d.toLocaleDateString("sv-SE",{day:"2-digit",month:"2-digit"})+" "+d.toLocaleTimeString("sv-SE",{hour:"2-digit",minute:"2-digit"});}
      function formatSeaRelativeHourLabel(timestamp, now){var diffHours=Math.round((timestamp-now)/(60*60*1000));if(diffHours===0) return "Nu";return diffHours>0?"+"+diffHours+"h":diffHours+"h";}
      function formatSeaAxisClock(timestamp){var d=new Date(timestamp);if(isNaN(d.getTime())) return "";return d.toLocaleTimeString("sv-SE",{hour:"2-digit",minute:"2-digit"});}
      function formatSeaChartValue(value, unit){if(value == null || isNaN(Number(value))) return "--";return Number(value).toFixed(1)+" "+unit;}
      function getSeaMetricConfig(metric){
        if(metric==="waterTemp") return {key:"waterTemp",label:"Vattentemperatur",shortLabel:"Temp",unit:"°C",emptyText:"Ingen vattentemperatur hittades för detta område."};
        if(metric==="waveHeight") return {key:"waveHeight",label:"Våghöjd",shortLabel:"Våg",unit:"m",emptyText:"Ingen vågdata hittades för detta område."};
        if(metric==="waterLevel") return {key:"waterLevel",label:"Vattenstånd",shortLabel:"Vatten",unit:"cm",emptyText:"Ingen vattenståndsdata hittades för detta område."};
        return {key:metric,label:"Data",shortLabel:"Data",unit:"",emptyText:"Ingen data hittades."};
      }
      function normalizeSeaPoint(point,type){if(!point) return null;var time=point.time||point.date||point.datetime||point.validTime;var value=Number(point.value);if(!time || !isFinite(value)) return null;var timestamp=new Date(time).getTime();if(!isFinite(timestamp)) return null;return {time:new Date(timestamp).toISOString(),timestamp:timestamp,value:value,type:type};}
      function getVisibleSeaSeries(metricData){
        metricData=metricData||{};var now=getAnalysisFocusTime ? getAnalysisFocusTime() : (getSelectedAppTime ? getSelectedAppTime() : Date.now());
        var history=Array.isArray(metricData.history)?metricData.history.map(function(point){return normalizeSeaPoint(point,"history");}).filter(Boolean):[];
        var forecast=Array.isArray(metricData.forecast)?metricData.forecast.map(function(point){return normalizeSeaPoint(point,"forecast");}).filter(Boolean):[];
        var historyStart=now-seaHistoryHours*60*60*1000, forecastEnd=now+seaForecastHours*60*60*1000;
        history=history.filter(function(point){return point.timestamp>=historyStart && point.timestamp<=now+15*60*1000;}).sort(function(a,b){return a.timestamp-b.timestamp;});
        forecast=forecast.filter(function(point){return point.timestamp>=now-15*60*1000 && point.timestamp<=forecastEnd;}).sort(function(a,b){return a.timestamp-b.timestamp;});
        return {now:now,history:history,forecast:forecast,all:history.concat(forecast).sort(function(a,b){return a.timestamp-b.timestamp;})};
      }
      function findClosestSeaPoint(points,targetTime){if(!Array.isArray(points)||!points.length) return null;var closest=points[0], closestDiff=Math.abs(points[0].timestamp-targetTime);for(var i=1;i<points.length;i++){var diff=Math.abs(points[i].timestamp-targetTime);if(diff<closestDiff){closest=points[i];closestDiff=diff;}}return closest;}
      function buildSeaPath(points,xForTime,yForValue){if(!Array.isArray(points)||!points.length) return "";return points.map(function(point,index){var x=xForTime(point.timestamp), y=yForValue(point.value);return (index===0?"M":"L")+x.toFixed(1)+" "+y.toFixed(1);}).join(" ");}
   function buildSeaCombinedSvgChart(metricData, config){
  var series = getVisibleSeaSeries(metricData);
  var points = series.all;

  if(!points.length){
    return '<div class="sea-chart-empty">' + escapeHtml(config.emptyText) + '</div>';
  }

  if(points.length === 1){
    return (
      '<div class="sea-chart-empty">' +
      'Endast ett värde finns i valt intervall: <strong>' +
      escapeHtml(formatSeaChartValue(points[0].value, config.unit)) +
      '</strong><br><span>' +
      escapeHtml(formatSeaChartTime(points[0].time)) +
      '</span></div>'
    );
  }

  var width = 340;
  var height = 188;
  var padLeft = 32;
  var padRight = 16;
  var padTop = 18;
  var padBottom = 38;

  var values = points.map(function(point){
    return point.value;
  });

  var minValue = Math.min.apply(null, values);
  var maxValue = Math.max.apply(null, values);

  if(minValue === maxValue){
    minValue = minValue - 1;
    maxValue = maxValue + 1;
  }

  var valuePadding = (maxValue - minValue) * 0.12;
  minValue -= valuePadding;
  maxValue += valuePadding;

  var minTime = points[0].timestamp;
  var maxTime = points[points.length - 1].timestamp;

  if(maxTime <= minTime){
    maxTime = minTime + 60 * 60 * 1000;
  }

  var usableW = width - padLeft - padRight;
  var usableH = height - padTop - padBottom;

  function xForTime(timestamp){
    return padLeft + ((timestamp - minTime) / (maxTime - minTime)) * usableW;
  }

  function yForValue(value){
    return padTop + (1 - ((value - minValue) / (maxValue - minValue))) * usableH;
  }

  function formatSeaAxisDay(timestamp){
    var d = new Date(timestamp);
    var today = new Date();
    var todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    var dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    var diffDays = Math.round((dayStart - todayStart) / (24 * 60 * 60 * 1000));

    if(Math.abs(timestamp - series.now) <= 30 * 60 * 1000) return "Nu";
    if(diffDays === -1) return "Igår";
    if(diffDays === 0) return "Idag";
    if(diffDays === 1) return "Imorgon";

    return String(d.getDate()) + "/" + String(d.getMonth() + 1);
  }

  function formatSeaAxisClock(timestamp){
    return formatClockDotGlobal(timestamp);
  }

  var historyPath = buildSeaPath(series.history, xForTime, yForValue);
  var forecastPath = buildSeaPath(series.forecast, xForTime, yForValue);

  var nowX = Math.max(padLeft, Math.min(width - padRight, xForTime(series.now)));
  var nowPoint = findClosestSeaPoint(points, series.now) || points[0];

  var selectedPoint = nowPoint;
  var selectedX = xForTime(selectedPoint.timestamp);
  var selectedY = yForValue(selectedPoint.value);

  var axisCandidates = [
    minTime,
    minTime + (series.now - minTime) / 2,
    series.now,
    series.now + (maxTime - series.now) / 2,
    maxTime
  ];

  var axisTicks = [];
  var seenTicks = {};

  for(var i = 0; i < axisCandidates.length; i++){
    var t = axisCandidates[i];

    if(!isFinite(t)) continue;
    if(t < minTime - 1 || t > maxTime + 1) continue;

    var rounded = Math.round(t / (60 * 60 * 1000)) * 60 * 60 * 1000;
    var key = String(rounded);

    if(seenTicks[key]) continue;

    seenTicks[key] = true;
    axisTicks.push({timestamp:rounded});
  }

  axisTicks.sort(function(a, b){
    return a.timestamp - b.timestamp;
  });

  var pointPayload = points.map(function(point){
    return {
      timestamp:point.timestamp,
      value:point.value,
      time:point.time,
      type:point.type
    };
  });

  var encodedPoints = encodeURIComponent(JSON.stringify(pointPayload));

  var svg =
    '<div class="sea-chart-interactive" ' +
      'data-sea-points="' + encodedPoints + '" ' +
      'data-sea-unit="' + escapeHtml(config.unit || "") + '" ' +
      'data-sea-min-time="' + escapeHtml(String(minTime)) + '" ' +
      'data-sea-max-time="' + escapeHtml(String(maxTime)) + '" ' +
      'data-sea-min-value="' + escapeHtml(String(minValue)) + '" ' +
      'data-sea-max-value="' + escapeHtml(String(maxValue)) + '" ' +
      'data-sea-width="' + width + '" ' +
      'data-sea-height="' + height + '" ' +
      'data-sea-pad-left="' + padLeft + '" ' +
      'data-sea-pad-right="' + padRight + '" ' +
      'data-sea-pad-top="' + padTop + '" ' +
      'data-sea-pad-bottom="' + padBottom + '"' +
    '>' +
    '<svg class="sea-combined-chart" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none">' +

      '<line x1="' + padLeft + '" y1="' + (height - padBottom) + '" x2="' + (width - padRight) + '" y2="' + (height - padBottom) + '" stroke="rgba(255,255,255,0.18)" stroke-width="1"></line>' +

      '<line x1="' + padLeft + '" y1="' + padTop + '" x2="' + padLeft + '" y2="' + (height - padBottom) + '" stroke="rgba(255,255,255,0.12)" stroke-width="1"></line>' +

      '<line x1="' + nowX.toFixed(1) + '" y1="' + padTop + '" x2="' + nowX.toFixed(1) + '" y2="' + (height - padBottom) + '" stroke="rgba(232,215,168,0.7)" stroke-width="1.3" stroke-dasharray="4 4"></line>' +

      (historyPath
        ? '<path d="' + historyPath + '" fill="none" stroke="rgba(123,199,255,0.95)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path>'
        : ''
      ) +

      (forecastPath
        ? '<path d="' + forecastPath + '" fill="none" stroke="rgba(152,240,219,0.82)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="5 5"></path>'
        : ''
      ) +

      '<line class="sea-selected-line" x1="' + selectedX.toFixed(1) + '" y1="' + padTop + '" x2="' + selectedX.toFixed(1) + '" y2="' + (height - padBottom) + '" stroke="rgba(255,255,255,0.72)" stroke-width="1.2"></line>' +

      '<circle class="sea-selected-dot" cx="' + selectedX.toFixed(1) + '" cy="' + selectedY.toFixed(1) + '" r="4.5" fill="rgba(255,255,255,0.96)" stroke="rgba(5,11,22,0.9)" stroke-width="2"></circle>' +

      '<circle cx="' + xForTime(nowPoint.timestamp).toFixed(1) + '" cy="' + yForValue(nowPoint.value).toFixed(1) + '" r="3.5" fill="rgba(232,215,168,0.96)"></circle>' +

      axisTicks.map(function(tick, index){
        var x = Math.max(padLeft, Math.min(width - padRight, xForTime(tick.timestamp)));
        var label = formatSeaAxisDay(tick.timestamp);
        var clock = formatSeaAxisClock(tick.timestamp);
        var anchor = "middle";

        if(index === 0) anchor = "start";
        if(index === axisTicks.length - 1) anchor = "end";

        var isNow = label === "Nu";

        return (
          '<line x1="' + x.toFixed(1) + '" y1="' + (height - padBottom) + '" x2="' + x.toFixed(1) + '" y2="' + (height - padBottom + 5) + '" stroke="rgba(255,255,255,0.18)" stroke-width="1"></line>' +
          '<text x="' + x.toFixed(1) + '" y="' + (height - 22) + '" text-anchor="' + anchor + '" fill="' + (isNow ? "rgba(232,215,168,0.98)" : "rgba(255,255,255,0.62)") + '" font-size="8" font-weight="' + (isNow ? "900" : "750") + '">' + escapeHtml(label) + '</text>' +
          '<text x="' + x.toFixed(1) + '" y="' + (height - 8) + '" text-anchor="' + anchor + '" fill="rgba(255,255,255,0.42)" font-size="8">' + escapeHtml(clock) + '</text>'
        );
      }).join("") +

    '</svg>' +

    '<div class="sea-chart-readout">' +
      '<div class="sea-chart-readout-time">' + escapeHtml(formatSeaSelectedTime(selectedPoint.timestamp)) + '</div>' +
      '<div class="sea-chart-readout-value">' + escapeHtml(formatSeaChartValue(selectedPoint.value, config.unit)) + '</div>' +
    '</div>' +

    '<div class="sea-chart-help">Tryck eller dra i diagrammet för exakt timvärde.</div>' +
    '</div>';

  return svg;
}
      function buildSeaRangeControls(){
        return '<div class="sea-range-panel"><div class="sea-range-row"><div class="sea-range-label">Historik</div><div class="sea-range-buttons">'+[12,24,72].map(function(hours){return '<button type="button" class="sea-range-btn '+(seaHistoryHours===hours?'is-active':'')+'" data-sea-history-hours="'+hours+'">'+hours+'h</button>';}).join("")+'</div></div><div class="sea-range-row"><div class="sea-range-label">Prognos</div><div class="sea-range-buttons">'+[12,24,72].map(function(hours){return '<button type="button" class="sea-range-btn '+(seaForecastHours===hours?'is-active':'')+'" data-sea-forecast-hours="'+hours+'">'+hours+'h</button>';}).join("")+'</div></div></div>';
      }
      function buildSeaMetricCard(metricKey, metricData, source){
        var config=getSeaMetricConfig(metricKey); metricData=metricData||{}; if(metricData.label) config.label=metricData.label; if(metricData.unit) config.unit=metricData.unit;
        var series=getVisibleSeaSeries(metricData), nowPoint=findClosestSeaPoint(series.all, getAnalysisFocusTime ? getAnalysisFocusTime() : Date.now());
        var sourceText=source&&source.name?source.name+" · "+Number(source.distanceKm||0).toFixed(1)+" km":"Ingen station vald";
        var note="";
        if(!series.history.length || !series.forecast.length){
          note='<div class="sea-chart-note">'+escapeHtml(config.label)+': '+escapeHtml((series.history.length?'historik':'ingen historik')+' · '+(series.forecast.length?'prognos':'ingen prognos'))+'</div>';
        }
        return '<div class="sea-metric-card"><div class="sea-metric-card-header"><div><div class="sea-metric-card-title">'+escapeHtml(config.label)+'</div><div class="sea-metric-card-subtitle">'+escapeHtml(sourceText)+'</div></div><div class="sea-metric-now"><div class="sea-metric-now-label">Vald tid</div><div class="sea-metric-now-value">'+escapeHtml(nowPoint?formatSeaChartValue(nowPoint.value,config.unit):"--")+'</div></div></div>'+buildSeaCombinedSvgChart(metricData,config)+'<div class="sea-chart-footer"><span><strong>Heldragen</strong> historik</span><span><strong>Streckad</strong> prognos</span></div>'+note+'</div>';
      }
      function formatSeaSelectedTime(timestamp){
  var t = Number(timestamp);

  if(!isFinite(t)) return "";

  var d = new Date(t);
  var today = new Date();

  var todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  var dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  var diffDays = Math.round((dayStart - todayStart) / (24 * 60 * 60 * 1000));

  var dayText = "";

  if(diffDays === -1){
    dayText = "Igår";
  }else if(diffDays === 0){
    dayText = "Idag";
  }else if(diffDays === 1){
    dayText = "Imorgon";
  }else{
    dayText = String(d.getDate()) + "/" + String(d.getMonth() + 1);
  }

  return dayText + " " + formatClockDotGlobal(t);
}

function setupSeaChartInteractions(){
  if(window.__seaChartInteractionsReady) return;

  window.__seaChartInteractionsReady = true;

  var activeChart = null;

  function parseSeaChartPoints(chart){
    try{
      return JSON.parse(decodeURIComponent(chart.getAttribute("data-sea-points") || "[]"));
    }catch(e){
      return [];
    }
  }

  function findNearestPointByX(chart, clientX){
    var points = parseSeaChartPoints(chart);

    if(!points.length) return null;

    var rect = chart.getBoundingClientRect();
    var chartWidth = Number(chart.getAttribute("data-sea-width") || 340);
    var padLeft = Number(chart.getAttribute("data-sea-pad-left") || 32);
    var padRight = Number(chart.getAttribute("data-sea-pad-right") || 16);
    var minTime = Number(chart.getAttribute("data-sea-min-time"));
    var maxTime = Number(chart.getAttribute("data-sea-max-time"));

    if(!isFinite(minTime) || !isFinite(maxTime) || maxTime <= minTime) return points[0];

    var localX = ((clientX - rect.left) / Math.max(1, rect.width)) * chartWidth;

    localX = Math.max(padLeft, Math.min(chartWidth - padRight, localX));

    var progress = (localX - padLeft) / Math.max(1, chartWidth - padLeft - padRight);
    var targetTime = minTime + progress * (maxTime - minTime);

    var closest = points[0];
    var closestDiff = Math.abs(points[0].timestamp - targetTime);

    for(var i = 1; i < points.length; i++){
      var diff = Math.abs(points[i].timestamp - targetTime);

      if(diff < closestDiff){
        closest = points[i];
        closestDiff = diff;
      }
    }

    return closest;
  }

  function updateSeaChartSelection(chart, point){
    if(!chart || !point) return;

    var chartWidth = Number(chart.getAttribute("data-sea-width") || 340);
    var chartHeight = Number(chart.getAttribute("data-sea-height") || 188);
    var padLeft = Number(chart.getAttribute("data-sea-pad-left") || 32);
    var padRight = Number(chart.getAttribute("data-sea-pad-right") || 16);
    var padTop = Number(chart.getAttribute("data-sea-pad-top") || 18);
    var padBottom = Number(chart.getAttribute("data-sea-pad-bottom") || 38);
    var minTime = Number(chart.getAttribute("data-sea-min-time"));
    var maxTime = Number(chart.getAttribute("data-sea-max-time"));
    var minValue = Number(chart.getAttribute("data-sea-min-value"));
    var maxValue = Number(chart.getAttribute("data-sea-max-value"));
    var unit = chart.getAttribute("data-sea-unit") || "";

    if(!isFinite(minTime) || !isFinite(maxTime) || maxTime <= minTime) return;
    if(!isFinite(minValue) || !isFinite(maxValue) || maxValue <= minValue) return;

    var usableW = chartWidth - padLeft - padRight;
    var usableH = chartHeight - padTop - padBottom;

    var x = padLeft + ((point.timestamp - minTime) / (maxTime - minTime)) * usableW;
    var y = padTop + (1 - ((point.value - minValue) / (maxValue - minValue))) * usableH;

    x = Math.max(padLeft, Math.min(chartWidth - padRight, x));
    y = Math.max(padTop, Math.min(chartHeight - padBottom, y));

    var line = chart.querySelector(".sea-selected-line");
    var dot = chart.querySelector(".sea-selected-dot");
    var timeEl = chart.querySelector(".sea-chart-readout-time");
    var valueEl = chart.querySelector(".sea-chart-readout-value");

    if(line){
      line.setAttribute("x1", x.toFixed(1));
      line.setAttribute("x2", x.toFixed(1));
    }

    if(dot){
      dot.setAttribute("cx", x.toFixed(1));
      dot.setAttribute("cy", y.toFixed(1));
    }

    if(timeEl){
      timeEl.textContent = formatSeaSelectedTime(point.timestamp);
    }

    if(valueEl){
      valueEl.textContent = formatSeaChartValue(point.value, unit);
    }
  }

  function updateFromEvent(e){
    if(!activeChart) return;

    var point = findNearestPointByX(activeChart, e.clientX);

    updateSeaChartSelection(activeChart, point);
  }

  document.addEventListener("pointerdown", function(e){
    var chart = e.target && e.target.closest ? e.target.closest(".sea-chart-interactive") : null;

    if(!chart) return;

    activeChart = chart;

    e.preventDefault();
    e.stopPropagation();

    updateFromEvent(e);
  });

  document.addEventListener("pointermove", function(e){
    if(!activeChart) return;

    e.preventDefault();
    updateFromEvent(e);
  });

  document.addEventListener("pointerup", function(){
    activeChart = null;
  });

  document.addEventListener("pointercancel", function(){
    activeChart = null;
  });
}

setupSeaChartInteractions();
      function getSeaOverviewValueFromTimeseries(metricKey, fallbackValue){
        if(!selectedSeaTimeseriesData || selectedSeaTimeseriesData.error) return fallbackValue || "--";

        var seriesRoot = selectedSeaTimeseriesData.series || {};
        var metricData = seriesRoot[metricKey];
        if(!metricData) return fallbackValue || "--";

        var config = getSeaMetricConfig(metricKey);
        if(metricData.unit) config.unit = metricData.unit;

        var series = getVisibleSeaSeries(metricData);
        var nowPoint = findClosestSeaPoint(series.all, getAnalysisFocusTime ? getAnalysisFocusTime() : Date.now());

        if(!nowPoint) return fallbackValue || "--";
        return formatSeaChartValue(nowPoint.value, config.unit);
      }


      function buildRecentAnalysisHistoryDates(daysBack){
        var dates=[];
        var seen=new Set();
        var now=new Date();
        for(var offset=Number(daysBack)||3; offset>=0; offset--){
          var d=new Date(now.getFullYear(), now.getMonth(), now.getDate()-offset);
          var key=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
          if(!seen.has(key)){seen.add(key);dates.push(key);}
        }
        return dates;
      }

      function loadWeatherAnalysisHistory(lat, lon){
        var requestId=++latestWeatherAnalysisHistoryRequestId;
        weatherAnalysisHistoryLoading=true;
        weatherHistoryTimeseries=[];
        var dates=buildRecentAnalysisHistoryDates(3);
        Promise.all(dates.map(function(dateKey){
          return fetch('/api/openmeteo-history?lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lon)+'&date='+encodeURIComponent(dateKey))
            .then(function(res){return res.text().then(function(text){
              if(!res.ok) throw new Error(text || 'Historik kunde inte hämtas.');
              try{return JSON.parse(text);}catch(e){return null;}
            });})
            .then(function(data){return (data && data.properties && Array.isArray(data.properties.timeseries)) ? data.properties.timeseries : [];})
            .catch(function(err){console.warn('Analys-historik kunde inte hämtas', dateKey, err);return [];});
        })).then(function(results){
          if(requestId!==latestWeatherAnalysisHistoryRequestId) return;
          var cutoff=Date.now()+30*60*1000;
          var byHour=new Map();
          results.forEach(function(list){
            (list||[]).forEach(function(item){
              var t=new Date(item && item.time).getTime();
              if(!isFinite(t) || t>cutoff) return;
              var key=String(roundToForecastHour(t));
              byHour.set(key,item);
            });
          });
          weatherHistoryTimeseries=Array.from(byHour.values()).sort(function(a,b){return new Date(a.time).getTime()-new Date(b.time).getTime();});
          weatherAnalysisHistoryLoading=false;
          if(activeMode==='advanced' && typeof renderAdvancedAccordion==='function') renderAdvancedAccordion();
        }).catch(function(err){
          if(requestId!==latestWeatherAnalysisHistoryRequestId) return;
          weatherAnalysisHistoryLoading=false;
          weatherHistoryTimeseries=[];
          console.warn('Analys-historik misslyckades', err);
          if(activeMode==='advanced' && typeof renderAdvancedAccordion==='function') renderAdvancedAccordion();
        });
      }

      function pushWeatherAnalysisPoint(target, item, key, sourcePriority){
        var t=new Date(item && item.time).getTime();
        if(!isFinite(t)) return;
        var value=getWeatherSeriesPointValue(item,key);
        if(value==null || !isFinite(Number(value))) return;
        var hour=roundToForecastHour(t);
        var mapKey=String(hour);
        var existing=target.get(mapKey);
        if(!existing || Number(sourcePriority||0) >= existing.priority){
          target.set(mapKey,{timestamp:hour,value:Number(value),priority:Number(sourcePriority||0)});
        }
      }

      function getWeatherAnalysisWindow(){
        var focus=getAnalysisFocusTime ? getAnalysisFocusTime() : (getSelectedAppTime ? getSelectedAppTime() : Date.now());
        return {
          focus:focus,
          start:focus - 24*60*60*1000,
          end:focus + 72*60*60*1000
        };
      }

      function getWeatherSeriesPointValue(item, key){
        var data = item && item.data || {};
        var instant = data.instant && data.instant.details || {};
        if(key === "temperature") return instant.air_temperature;
        if(key === "wind") return instant.wind_speed;
        if(key === "gust") return instant.wind_speed_of_gust;
        if(key === "pressure") return instant.air_pressure_at_sea_level;
        if(key === "humidity") return instant.relative_humidity;
        if(key === "precipitation") return getForecastPrecipitation(item).amount;
        return null;
      }

      function getVisibleWeatherPoints(key, maxPoints){
        var windowRange=getWeatherAnalysisWindow();
        var pointMap=new Map();
        var historyList=Array.isArray(weatherHistoryTimeseries) ? weatherHistoryTimeseries : [];
        var forecastList=Array.isArray(weatherTimeseries) ? weatherTimeseries : [];

        if(key === "gust"){
          historyList.forEach(function(item){pushWeatherAnalysisPoint(pointMap,item,"gust",1);});
          var gustList = Array.isArray(weatherGustTimeseries) ? weatherGustTimeseries : [];
          gustList.forEach(function(item){
            var t=new Date(item && item.time).getTime();
            var v=item && item.value;
            if(!isFinite(t) || v==null || !isFinite(Number(v))) return;
            var hour=roundToForecastHour(t);
            var mapKey=String(hour);
            var existing=pointMap.get(mapKey);
            if(!existing || 2 >= existing.priority){
              pointMap.set(mapKey,{timestamp:hour,value:Number(v),priority:2});
            }
          });
        }else{
          historyList.forEach(function(item){pushWeatherAnalysisPoint(pointMap,item,key,1);});
          forecastList.forEach(function(item){pushWeatherAnalysisPoint(pointMap,item,key,2);});
        }

        var points=Array.from(pointMap.values())
          .filter(function(p){return p && isFinite(p.timestamp) && isFinite(p.value) && p.timestamp>=windowRange.start && p.timestamp<=windowRange.end;})
          .sort(function(a,b){return a.timestamp-b.timestamp;})
          .map(function(p){return {timestamp:p.timestamp,value:p.value};});

        if(points.length < 2){
          points=Array.from(pointMap.values())
            .filter(function(p){return p && isFinite(p.timestamp) && isFinite(p.value) && p.timestamp>=windowRange.focus-60*60*1000;})
            .sort(function(a,b){return a.timestamp-b.timestamp;})
            .map(function(p){return {timestamp:p.timestamp,value:p.value};});
        }

        return points.slice(0, maxPoints || 54);
      }

      function getAdvancedSeaPoints(metricKey){
        if(!selectedSeaTimeseriesData || selectedSeaTimeseriesData.error) return [];
        var metricData = (selectedSeaTimeseriesData.series || {})[metricKey];
        if(!metricData) return [];
        var series = getVisibleSeaSeries(metricData);
        return (series.all || []).map(function(p){return {timestamp:p.timestamp,value:Number(p.value)};}).filter(function(p){return isFinite(p.timestamp) && isFinite(p.value);});
      }

      function formatAdvancedChartTimeLabel(timestamp){
        var d=new Date(timestamp);
        if(isNaN(d.getTime())) return "--";
        var now=new Date();
        var time=d.toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'});
        if(formatDateKeyGlobal(d) === formatDateKeyGlobal(now)) return time;
        return d.toLocaleDateString('sv-SE',{day:'2-digit',month:'2-digit'}) + ' ' + time;
      }

      function formatAdvancedRelativeTime(timestamp){
        var t=Number(timestamp), now=(getAnalysisFocusTime ? getAnalysisFocusTime() : Date.now());
        if(!isFinite(t)) return "";
        var diffMin=Math.round((t-now)/60000);
        if(Math.abs(diffMin) <= 30) return "Nu";
        var diffH=Math.round(diffMin/60);
        if(diffH === 0) return diffMin > 0 ? "+"+diffMin+" min" : diffMin+" min";
        return diffH > 0 ? "+"+diffH+" h" : diffH+" h";
      }

      function findAdvancedNowIndex(points){
        if(!Array.isArray(points) || !points.length) return 0;
        var now=getAnalysisFocusTime ? getAnalysisFocusTime() : (getSelectedAppTime ? getSelectedAppTime() : Date.now()), bestIndex=0, bestDiff=Infinity;
        points.forEach(function(p,idx){
          var diff=Math.abs(Number(p.timestamp)-now);
          if(diff<bestDiff){bestDiff=diff;bestIndex=idx;}
        });
        return bestIndex;
      }

      function buildAdvancedMiniChart(points, unit){
        if(!Array.isArray(points) || points.length < 2) return '<div class="sea-chart-empty">Ingen tidsserie att visa ännu.</div>';
        points=points.filter(function(p){return p && isFinite(p.timestamp) && isFinite(p.value);}).slice(0,98);
        if(points.length < 2) return '<div class="sea-chart-empty">Ingen tidsserie att visa ännu.</div>';
        var width=320, height=138, padL=12, padR=12, padT=16, padB=26;
        var minT=Math.min.apply(null,points.map(function(p){return p.timestamp;}));
        var maxT=Math.max.apply(null,points.map(function(p){return p.timestamp;}));
        var minV=Math.min.apply(null,points.map(function(p){return p.value;}));
        var maxV=Math.max.apply(null,points.map(function(p){return p.value;}));
        if(maxV===minV){maxV+=1;minV-=1;}
        var usableW=width-padL-padR, usableH=height-padT-padB;
        function xForTime(ts){return padL + ((ts-minT)/Math.max(1,maxT-minT))*usableW;}
        function x(p){return xForTime(p.timestamp);}
        function y(p){return padT + (1-((p.value-minV)/Math.max(0.0001,maxV-minV)))*usableH;}
        var chartId='advChart'+(++advancedChartSeq);
        var coords=points.map(function(p){return {x:x(p),y:y(p),time:p.timestamp,value:p.value};});
        advancedChartRegistry[chartId]={points:coords,unit:unit||""};
        var d=points.map(function(p,i){return (i?'L':'M')+x(p).toFixed(1)+' '+y(p).toFixed(1);}).join(' ');
        var initialIndex=findAdvancedNowIndex(points);
        var initial=coords[initialIndex];
        var now=getAnalysisFocusTime ? getAnalysisFocusTime() : (getSelectedAppTime ? getSelectedAppTime() : Date.now());
        var nowLine='';
        if(now >= minT && now <= maxT){
          var nowX=xForTime(now);
          nowLine='<line x1="'+nowX.toFixed(1)+'" y1="'+padT+'" x2="'+nowX.toFixed(1)+'" y2="'+(height-padB)+'" stroke="rgba(232,215,168,0.58)" stroke-width="1.1" stroke-dasharray="3 4" vector-effect="non-scaling-stroke" />'+
            '<text x="'+Math.min(width-padR-18, Math.max(padL+18, nowX)).toFixed(1)+'" y="'+(height-8)+'" text-anchor="middle" fill="rgba(232,215,168,0.95)" font-size="9" font-weight="900">Nu</text>';
        }
        return '<div class="advanced-chart-wrap" data-advanced-chart="'+chartId+'">'+
          '<svg class="advanced-chart" data-advanced-chart-surface="'+chartId+'" viewBox="0 0 '+width+' '+height+'" preserveAspectRatio="none">'+
            '<line x1="'+padL+'" y1="'+(height-padB)+'" x2="'+(width-padR)+'" y2="'+(height-padB)+'" stroke="rgba(255,255,255,0.16)" stroke-width="1" />'+nowLine+
            '<path d="'+d+'" fill="none" stroke="rgba(123,199,255,0.96)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />'+
            '<line id="'+chartId+'Line" x1="'+initial.x.toFixed(1)+'" y1="'+padT+'" x2="'+initial.x.toFixed(1)+'" y2="'+(height-padB)+'" stroke="rgba(255,255,255,0.82)" stroke-width="1.4" vector-effect="non-scaling-stroke" />'+
            '<circle id="'+chartId+'Dot" cx="'+initial.x.toFixed(1)+'" cy="'+initial.y.toFixed(1)+'" r="3.8" fill="rgba(232,215,168,1)" />'+
          '</svg>'+
          '<div class="advanced-chart-axis"><span>'+escapeHtml(formatAdvancedChartTimeLabel(minT))+'</span><span class="advanced-chart-now-pill">Nu</span><span>'+escapeHtml(formatAdvancedChartTimeLabel(maxT))+'</span></div>'+ 
          '<div class="advanced-chart-control">'+
            '<div class="advanced-chart-readout"><span>Tidpunkt</span><strong id="'+chartId+'Readout">'+escapeHtml(formatAdvancedChartReadout(initial.time, initial.value, unit))+'</strong></div><div class="advanced-chart-hint">Dra direkt i grafen</div>'+
            '<input class="advanced-chart-slider" type="range" min="0" max="'+(points.length-1)+'" value="'+initialIndex+'" step="1" data-advanced-chart-slider="'+chartId+'" aria-label="Dra för att läsa av grafen" />'+
          '</div>'+
        '</div>';
      }


      function buildAdvancedWindChart(windPoints, gustPoints){
        windPoints=(windPoints||[]).filter(function(p){return p && isFinite(p.timestamp) && isFinite(p.value);}).slice(0,98);
        gustPoints=(gustPoints||[]).filter(function(p){return p && isFinite(p.timestamp) && isFinite(p.value);}).slice(0,98);
        if(windPoints.length < 2) return '<div class="sea-chart-empty">Ingen vindserie att visa ännu.</div>';
        function nearestValue(points, ts){
          if(!points || !points.length) return null;
          var best=points[0], bestDiff=Math.abs(points[0].timestamp-ts);
          for(var i=1;i<points.length;i++){
            var diff=Math.abs(points[i].timestamp-ts);
            if(diff<bestDiff){best=points[i];bestDiff=diff;}
          }
          return best && isFinite(best.value) ? best.value : null;
        }
        var combined=windPoints.map(function(p){return {timestamp:p.timestamp, wind:p.value, gust:nearestValue(gustPoints,p.timestamp)};});
        var allVals=[];
        combined.forEach(function(p){if(isFinite(p.wind)) allVals.push(p.wind); if(isFinite(p.gust)) allVals.push(p.gust);});
        if(allVals.length < 2) return buildAdvancedMiniChart(windPoints,"m/s");
        var width=320, height=148, padL=12, padR=12, padT=18, padB=28;
        var minT=Math.min.apply(null,combined.map(function(p){return p.timestamp;}));
        var maxT=Math.max.apply(null,combined.map(function(p){return p.timestamp;}));
        var minV=Math.min.apply(null,allVals), maxV=Math.max.apply(null,allVals);
        minV=Math.max(0,minV-1);
        if(maxV===minV){maxV+=1;minV=Math.max(0,minV-1);}
        var usableW=width-padL-padR, usableH=height-padT-padB;
        function xForTime(ts){return padL + ((ts-minT)/Math.max(1,maxT-minT))*usableW;}
        function yForValue(value){return padT + (1-((value-minV)/Math.max(0.0001,maxV-minV)))*usableH;}
        var chartId='advChart'+(++advancedChartSeq);
        var coords=combined.map(function(p){return {x:xForTime(p.timestamp),y:yForValue(p.wind),y2:isFinite(p.gust)?yForValue(p.gust):null,time:p.timestamp,value:p.wind,gust:p.gust};});
        advancedChartRegistry[chartId]={windPair:true,points:coords,unit:"m/s"};
        var windPath=coords.map(function(p,i){return (i?'L':'M')+p.x.toFixed(1)+' '+p.y.toFixed(1);}).join(' ');
        var gustCoords=coords.filter(function(p){return isFinite(p.y2);});
        var gustPath=gustCoords.map(function(p,i){return (i?'L':'M')+p.x.toFixed(1)+' '+p.y2.toFixed(1);}).join(' ');
        var initialIndex=findAdvancedNowIndex(windPoints), initial=coords[initialIndex] || coords[0];
        var now=getAnalysisFocusTime ? getAnalysisFocusTime() : (getSelectedAppTime ? getSelectedAppTime() : Date.now()), nowLine='';
        if(now >= minT && now <= maxT){
          var nowX=xForTime(now);
          nowLine='<line x1="'+nowX.toFixed(1)+'" y1="'+padT+'" x2="'+nowX.toFixed(1)+'" y2="'+(height-padB)+'" stroke="rgba(232,215,168,0.58)" stroke-width="1.1" stroke-dasharray="3 4" vector-effect="non-scaling-stroke" />'+
            '<text x="'+Math.min(width-padR-18, Math.max(padL+18, nowX)).toFixed(1)+'" y="'+(height-8)+'" text-anchor="middle" fill="rgba(232,215,168,0.95)" font-size="9" font-weight="900">Nu</text>';
        }
        function windReadout(p){
          var rel=formatAdvancedRelativeTime(p.time);
          var time=formatAdvancedChartTimeLabel(p.time);
          var w=isFinite(p.value)?(Math.round(p.value*10)/10):'--';
          var g=isFinite(p.gust)?(Math.round(p.gust*10)/10):'--';
          return (rel ? rel+' · ' : '') + time+' · Vind '+w+' m/s · Byar '+g+' m/s';
        }
        return '<div class="advanced-chart-wrap" data-advanced-chart="'+chartId+'">'+
          '<svg class="advanced-chart" data-advanced-chart-surface="'+chartId+'" viewBox="0 0 '+width+' '+height+'" preserveAspectRatio="none">'+
            '<line x1="'+padL+'" y1="'+(height-padB)+'" x2="'+(width-padR)+'" y2="'+(height-padB)+'" stroke="rgba(255,255,255,0.16)" stroke-width="1" />'+nowLine+
            '<path d="'+windPath+'" fill="none" stroke="rgba(123,199,255,0.96)" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />'+
            (gustPath?'<path d="'+gustPath+'" fill="none" stroke="rgba(232,215,168,0.94)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />':'')+
            '<line id="'+chartId+'Line" x1="'+initial.x.toFixed(1)+'" y1="'+padT+'" x2="'+initial.x.toFixed(1)+'" y2="'+(height-padB)+'" stroke="rgba(255,255,255,0.82)" stroke-width="1.4" vector-effect="non-scaling-stroke" />'+
            '<circle id="'+chartId+'Dot" cx="'+initial.x.toFixed(1)+'" cy="'+initial.y.toFixed(1)+'" r="3.8" fill="rgba(123,199,255,1)" />'+
            (isFinite(initial.y2)?'<circle id="'+chartId+'Dot2" cx="'+initial.x.toFixed(1)+'" cy="'+initial.y2.toFixed(1)+'" r="3.8" fill="rgba(232,215,168,1)" />':'')+
          '</svg>'+ 
          '<div class="advanced-chart-axis"><span>'+escapeHtml(formatAdvancedChartTimeLabel(minT))+'</span><span class="advanced-chart-now-pill">Nu</span><span>'+escapeHtml(formatAdvancedChartTimeLabel(maxT))+'</span></div>'+ 
          '<div class="advanced-chart-legend"><span><i class="wind-base"></i>Grundvind</span><span><i class="wind-gust"></i>Byar</span></div>'+ 
          '<div class="advanced-chart-control"><div class="advanced-chart-readout"><span>Tidpunkt</span><strong id="'+chartId+'Readout">'+escapeHtml(windReadout(initial))+'</strong></div><div class="advanced-chart-hint">Dra direkt i grafen</div><input class="advanced-chart-slider" type="range" min="0" max="'+(coords.length-1)+'" value="'+initialIndex+'" step="1" data-advanced-chart-slider="'+chartId+'" aria-label="Dra för att läsa av vindgrafen" /></div></div>';
      }

      function formatAdvancedChartReadout(timestamp, value, unit){
        var rel=formatAdvancedRelativeTime(timestamp);
        var time=formatAdvancedChartTimeLabel(timestamp);
        var val=isFinite(value)?(Math.round(value*10)/10):'--';
        return (rel ? rel+' · ' : '') + time+' · '+val+(unit?' '+unit:'');
      }

      function updateAdvancedChartCursor(chartId, index){
        var entry=advancedChartRegistry[chartId];
        var points=Array.isArray(entry)?entry:(entry&&entry.points);
        var unit=(entry&&entry.unit)||"";
        if(!points || !points.length) return;
        var i=Math.max(0,Math.min(points.length-1,Number(index)||0));
        var p=points[i];
        var line=document.getElementById(chartId+'Line'), dot=document.getElementById(chartId+'Dot'), dot2=document.getElementById(chartId+'Dot2'), readout=document.getElementById(chartId+'Readout');
        if(line){line.setAttribute('x1',p.x.toFixed(1));line.setAttribute('x2',p.x.toFixed(1));}
        if(dot){dot.setAttribute('cx',p.x.toFixed(1));dot.setAttribute('cy',p.y.toFixed(1));}
        if(dot2){
          if(isFinite(p.y2)){dot2.setAttribute('cx',p.x.toFixed(1));dot2.setAttribute('cy',p.y2.toFixed(1));dot2.style.display='';}
          else{dot2.style.display='none';}
        }
        if(readout){
          if(entry && entry.windPair){
            var rel=formatAdvancedRelativeTime(p.time), time=formatAdvancedChartTimeLabel(p.time);
            var w=isFinite(p.value)?(Math.round(p.value*10)/10):'--';
            var g=isFinite(p.gust)?(Math.round(p.gust*10)/10):'--';
            readout.textContent=(rel ? rel+' · ' : '') + time+' · Vind '+w+' m/s · Byar '+g+' m/s';
          }else{
            readout.textContent=formatAdvancedChartReadout(p.time,p.value,unit);
          }
        }
      }

      function updateAdvancedChartCursorFromClientX(chartId, clientX){
        var entry=advancedChartRegistry[chartId];
        var points=Array.isArray(entry)?entry:(entry&&entry.points);
        if(!points || !points.length || !isFinite(clientX)) return;
        var surface=document.querySelector('[data-advanced-chart-surface="'+chartId+'"]');
        if(!surface) return;
        var rect=surface.getBoundingClientRect();
        if(!rect.width) return;
        var viewBox=surface.viewBox && surface.viewBox.baseVal;
        var svgW=viewBox && viewBox.width ? viewBox.width : 320;
        var x=((clientX-rect.left)/rect.width)*svgW;
        var bestIndex=0,bestDiff=Infinity;
        points.forEach(function(p,idx){
          var diff=Math.abs(Number(p.x)-x);
          if(diff<bestDiff){bestDiff=diff;bestIndex=idx;}
        });
        updateAdvancedChartCursor(chartId,bestIndex);
      }

      function bindAdvancedChartDrag(container){
        if(!container) return;
        container.querySelectorAll('[data-advanced-chart-surface]').forEach(function(surface){
          var chartId=surface.getAttribute('data-advanced-chart-surface');
          if(!chartId) return;
          var dragging=false;
          function move(evt){updateAdvancedChartCursorFromClientX(chartId, evt.clientX);}
          surface.addEventListener('pointerdown',function(evt){dragging=true;try{surface.setPointerCapture(evt.pointerId);}catch(e){} move(evt);});
          surface.addEventListener('pointermove',function(evt){if(dragging) move(evt);});
          surface.addEventListener('pointerup',function(evt){dragging=false;try{surface.releasePointerCapture(evt.pointerId);}catch(e){}});
          surface.addEventListener('pointercancel',function(){dragging=false;});
        });
      }

      function buildAdvancedCompareChart(seriesList){
        seriesList=(seriesList||[]).filter(function(s){return s && s.points && s.points.length>1;});
        if(seriesList.length < 2) return '<div class="sea-chart-empty">Jämförelse visas när minst två serier finns.</div>';
        var width=320, height=154, padL=14, padR=14, padT=16, padB=24;
        var all=[]; seriesList.forEach(function(s){s.points=s.points.filter(function(p){return p&&isFinite(p.timestamp)&&isFinite(p.value);}).slice(0,98); all=all.concat(s.points);});
        if(all.length < 2) return '<div class="sea-chart-empty">Ingen jämförbar tidsserie att visa ännu.</div>';
        var minT=Math.min.apply(null,all.map(function(p){return p.timestamp;}));
        var maxT=Math.max.apply(null,all.map(function(p){return p.timestamp;}));
        var usableW=width-padL-padR, usableH=height-padT-padB;
        function x(ts){return padL + ((ts-minT)/Math.max(1,maxT-minT))*usableW;}
        var chartId='advChart'+(++advancedChartSeq);
        var colors=['rgba(123,199,255,0.96)','rgba(152,240,219,0.92)','rgba(232,215,168,0.90)'];
        var paths=[];
        seriesList.forEach(function(s,idx){
          var vals=s.points.map(function(p){return p.value;});
          var minV=Math.min.apply(null,vals), maxV=Math.max.apply(null,vals);
          if(maxV===minV){maxV+=1;minV-=1;}
          function y(v){return padT + (1-((v-minV)/Math.max(0.0001,maxV-minV)))*usableH;}
          var d=s.points.map(function(p,i){return (i?'L':'M')+x(p.timestamp).toFixed(1)+' '+y(p.value).toFixed(1);}).join(' ');
          paths.push('<path d="'+d+'" fill="none" stroke="'+colors[idx%colors.length]+'" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />');
        });
        var initialTime=Math.max(minT,Math.min(maxT,getSelectedAppTime ? getSelectedAppTime() : Date.now()));
        var initialPct=(initialTime-minT)/Math.max(1,maxT-minT);
        var cursorX=x(initialTime);
        advancedChartRegistry[chartId]={compare:true,series:seriesList,minT:minT,maxT:maxT,width:width,padL:padL,padR:padR};
        function readoutAt(ts){
          var time=(formatAdvancedRelativeTime(ts)?formatAdvancedRelativeTime(ts)+' · ':'')+formatAdvancedChartTimeLabel(ts);
          var chunks=seriesList.map(function(s){
            var nearest=s.points.reduce(function(best,p){return !best||Math.abs(p.timestamp-ts)<Math.abs(best.timestamp-ts)?p:best;},null);
            var val=nearest&&isFinite(nearest.value)?Math.round(nearest.value*10)/10:'--';
            return s.label+' '+val+(s.unit?' '+s.unit:'');
          });
          return time+' · '+chunks.join(' · ');
        }
        return '<div class="advanced-chart-wrap" data-advanced-chart="'+chartId+'">'+
          '<svg class="advanced-chart" data-advanced-chart-surface="'+chartId+'" viewBox="0 0 '+width+' '+height+'" preserveAspectRatio="none">'+
            '<line x1="'+padL+'" y1="'+(height-padB)+'" x2="'+(width-padR)+'" y2="'+(height-padB)+'" stroke="rgba(255,255,255,0.16)" stroke-width="1" />'+paths.join('')+
            '<line id="'+chartId+'Line" x1="'+cursorX.toFixed(1)+'" y1="'+padT+'" x2="'+cursorX.toFixed(1)+'" y2="'+(height-padB)+'" stroke="rgba(255,255,255,0.82)" stroke-width="1.4" vector-effect="non-scaling-stroke" />'+
          '</svg>'+ 
          '<div class="advanced-chart-control"><div class="advanced-chart-readout"><span>Tidpunkt</span><strong id="'+chartId+'Readout">'+escapeHtml(readoutAt(initialTime))+'</strong></div>'+ 
          '<input class="advanced-chart-slider" type="range" min="0" max="100" value="'+Math.round(initialPct*100)+'" step="1" data-advanced-compare-slider="'+chartId+'" aria-label="Dra för att läsa av jämförelsen" /></div></div>';
      }

      function updateAdvancedCompareCursor(chartId, value){
        var entry=advancedChartRegistry[chartId]; if(!entry||!entry.compare) return;
        var pct=Math.max(0,Math.min(100,Number(value)||0))/100;
        var ts=entry.minT + (entry.maxT-entry.minT)*pct;
        var x=entry.padL + pct*(entry.width-entry.padL-entry.padR);
        var line=document.getElementById(chartId+'Line'), readout=document.getElementById(chartId+'Readout');
        if(line){line.setAttribute('x1',x.toFixed(1));line.setAttribute('x2',x.toFixed(1));}
        if(readout){
          var time=(formatAdvancedRelativeTime(ts)?formatAdvancedRelativeTime(ts)+' · ':'')+formatAdvancedChartTimeLabel(ts);
          var chunks=entry.series.map(function(s){
            var nearest=s.points.reduce(function(best,p){return !best||Math.abs(p.timestamp-ts)<Math.abs(best.timestamp-ts)?p:best;},null);
            var val=nearest&&isFinite(nearest.value)?Math.round(nearest.value*10)/10:'--';
            return s.label+' '+val+(s.unit?' '+s.unit:'');
          });
          readout.textContent=time+' · '+chunks.join(' · ');
        }
      }


      function summarizePoints(points, formatter){
        if(!Array.isArray(points) || !points.length) return {now:"--",min:"--",max:"--"};
        var vals=points.map(function(p){return p.value;}).filter(function(v){return isFinite(v);});
        if(!vals.length) return {now:"--",min:"--",max:"--"};
        var min=Math.min.apply(null,vals), max=Math.max.apply(null,vals);
        var nowIndex=findAdvancedNowIndex(points);
        var now=points[nowIndex] ? points[nowIndex].value : points[0].value;
        var f=formatter || function(v){return String(v);};
        return {now:f(now),min:f(min),max:f(max)};
      }

      function buildAdvancedCard(key, title, subtitle, value, chartHtml, kpis){
        var open = activeAdvancedCard === key;
        var body = chartHtml || '<div class="sea-chart-empty">Välj en punkt på kartan för att visa graf.</div>';
        if(Array.isArray(kpis) && kpis.length){
          body += '<div class="advanced-kpis">'+kpis.map(function(k){return '<div class="advanced-kpi"><div class="advanced-kpi-label">'+escapeHtml(k.label)+'</div><div class="advanced-kpi-value">'+escapeHtml(k.value)+'</div></div>';}).join('')+'</div>';
        }
        return '<div class="advanced-card '+(open?'is-open':'')+'" data-advanced-card="'+escapeHtml(key)+'">'+
          '<button class="advanced-card-toggle" type="button" data-advanced-toggle="'+escapeHtml(key)+'"><span class="advanced-card-main"><span class="advanced-card-title">'+escapeHtml(title)+'</span><span class="advanced-card-subtitle">'+escapeHtml(subtitle || '')+'</span></span><span class="advanced-card-value">'+escapeHtml(value || '--')+'</span></button>'+
          '<div class="advanced-card-body">'+body+'</div>'+
        '</div>';
      }

      function buildAdvancedBarChart(points, unit){
        if(!Array.isArray(points) || points.length < 2) return '<div class="sea-chart-empty">Ingen tidsserie att visa ännu.</div>';
        points=points.filter(function(p){return p && isFinite(p.timestamp) && isFinite(p.value);}).slice(0,98);
        if(points.length < 2) return '<div class="sea-chart-empty">Ingen tidsserie att visa ännu.</div>';
        var width=320, height=138, padL=12, padR=12, padT=16, padB=26;
        var minT=Math.min.apply(null,points.map(function(p){return p.timestamp;}));
        var maxT=Math.max.apply(null,points.map(function(p){return p.timestamp;}));
        var maxV=Math.max.apply(null,points.map(function(p){return Math.max(0,p.value);}));
        if(maxV<=0) maxV=1;
        var usableW=width-padL-padR, usableH=height-padT-padB;
        function xForTime(ts){return padL + ((ts-minT)/Math.max(1,maxT-minT))*usableW;}
        var chartId='advChart'+(++advancedChartSeq);
        var barW=Math.max(3, Math.min(12, usableW/Math.max(1,points.length)-2));
        var coords=points.map(function(p){var x=xForTime(p.timestamp), h=(Math.max(0,p.value)/maxV)*usableH, y=height-padB-h;return {x:x,y:y,time:p.timestamp,value:p.value};});
        advancedChartRegistry[chartId]={points:coords,unit:unit||""};
        var initialIndex=findAdvancedNowIndex(points), initial=coords[initialIndex], now=getSelectedAppTime ? getSelectedAppTime() : Date.now(), nowLine='';
        if(now >= minT && now <= maxT){var nowX=xForTime(now);nowLine='<line x1="'+nowX.toFixed(1)+'" y1="'+padT+'" x2="'+nowX.toFixed(1)+'" y2="'+(height-padB)+'" stroke="rgba(232,215,168,0.58)" stroke-width="1.1" stroke-dasharray="3 4" vector-effect="non-scaling-stroke" /><text x="'+Math.min(width-padR-18, Math.max(padL+18, nowX)).toFixed(1)+'" y="'+(height-8)+'" text-anchor="middle" fill="rgba(232,215,168,0.95)" font-size="9" font-weight="900">Nu</text>';}
        var bars=coords.map(function(p){var h=(height-padB)-p.y;return '<rect x="'+(p.x-barW/2).toFixed(1)+'" y="'+p.y.toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+Math.max(1,h).toFixed(1)+'" rx="2" fill="rgba(123,199,255,0.88)" />';}).join('');
        return '<div class="advanced-chart-wrap" data-advanced-chart="'+chartId+'"><svg class="advanced-chart" data-advanced-chart-surface="'+chartId+'" viewBox="0 0 '+width+' '+height+'" preserveAspectRatio="none"><line x1="'+padL+'" y1="'+(height-padB)+'" x2="'+(width-padR)+'" y2="'+(height-padB)+'" stroke="rgba(255,255,255,0.16)" stroke-width="1" />'+nowLine+bars+'<line id="'+chartId+'Line" x1="'+initial.x.toFixed(1)+'" y1="'+padT+'" x2="'+initial.x.toFixed(1)+'" y2="'+(height-padB)+'" stroke="rgba(255,255,255,0.82)" stroke-width="1.4" vector-effect="non-scaling-stroke" /><circle id="'+chartId+'Dot" cx="'+initial.x.toFixed(1)+'" cy="'+initial.y.toFixed(1)+'" r="3.8" fill="rgba(232,215,168,1)" /></svg><div class="advanced-chart-axis"><span>'+escapeHtml(formatAdvancedChartTimeLabel(minT))+'</span><span class="advanced-chart-now-pill">Nu</span><span>'+escapeHtml(formatAdvancedChartTimeLabel(maxT))+'</span></div><div class="advanced-chart-control"><div class="advanced-chart-readout"><span>Tidpunkt</span><strong id="'+chartId+'Readout">'+escapeHtml(formatAdvancedChartReadout(initial.time, initial.value, unit))+'</strong></div><div class="advanced-chart-hint">Dra direkt i grafen</div><input class="advanced-chart-slider" type="range" min="0" max="'+(points.length-1)+'" value="'+initialIndex+'" step="1" data-advanced-chart-slider="'+chartId+'" aria-label="Dra för att läsa av grafen" /></div></div>';
      }

      function getAdvancedMetricDefinitions(){
        var tempPts=getVisibleWeatherPoints("temperature",98), windPts=getVisibleWeatherPoints("wind",98), gustPts=getVisibleWeatherPoints("gust",98), rainPts=getVisibleWeatherPoints("precipitation",98);
        var waterTempPts=getAdvancedSeaPoints("waterTemp"), wavePts=getAdvancedSeaPoints("waveHeight"), levelPts=getAdvancedSeaPoints("waterLevel");
        var waterLevelSeries=(selectedSeaTimeseriesData && selectedSeaTimeseriesData.series && selectedSeaTimeseriesData.series.waterLevel) || null;
        var waterLevelHasForecast=!!(waterLevelSeries && Array.isArray(waterLevelSeries.forecast) && waterLevelSeries.forecast.length);
        var levelUnit=((selectedSeaTimeseriesData && selectedSeaTimeseriesData.series && selectedSeaTimeseriesData.series.waterLevel && selectedSeaTimeseriesData.series.waterLevel.unit) || "cm");
        var waterTempUnit=((selectedSeaTimeseriesData && selectedSeaTimeseriesData.series && selectedSeaTimeseriesData.series.waterTemp && selectedSeaTimeseriesData.series.waterTemp.unit) || "°C");
        var tempSum=summarizePoints(tempPts,formatTemp), windSum=summarizePoints(windPts,formatWind), rainSum=summarizePoints(rainPts,formatRain);
        var waterTempSum=summarizePoints(waterTempPts,function(v){return formatSeaChartValue(v,waterTempUnit);});
        var waveSum=summarizePoints(wavePts,function(v){return formatSeaChartValue(v,"m");}), levelSum=summarizePoints(levelPts,function(v){return formatSeaChartValue(v,levelUnit);});
        var gustText=gustPts.length ? formatWind(Math.max.apply(null,gustPts.map(function(p){return p.value;}))) : "--";
        var seaLoading=!!(selectedSeaArea && selectedSeaTimeseriesData == null);
        var seaMissingText=seaLoading ? "Hämtar havsdata..." : "Hämtas när havsdata finns";
        var compareSeries=[
          {label:"Temperatur",unit:"°C",points:tempPts},
          {label:"Vind",unit:"m/s",points:windPts},
          {label:"Regn",unit:"mm",points:rainPts},
          {label:"Havstemp",unit:waterTempUnit,points:waterTempPts},
          {label:"Vågor",unit:"m",points:wavePts}
        ].filter(function(s){return s.points && s.points.length>1;});
        return {
          temperature:{label:"Temperatur",hint:"Linje · historik/prognos",value:tempSum.now,subtitle:"Lufttemperatur, historik och prognos där det finns",chart:buildAdvancedMiniChart(tempPts,"°C"),kpis:[{label:"Lägst",value:tempSum.min},{label:"Högst",value:tempSum.max}]},
          wind:{label:"Vind",hint:"2 linjer · byar",value:windSum.now,subtitle:"Grundvind och byvind, historik och prognos där det finns",chart:buildAdvancedWindChart(windPts,gustPts),kpis:[{label:"Max grundvind",value:windSum.max},{label:"Max byvind",value:gustText}]},
          precipitation:{label:"Nederbörd",hint:"Staplar · timme",value:rainSum.now,subtitle:"Nederbörd per timme, historik och prognos där det finns",chart:buildAdvancedBarChart(rainPts,"mm"),kpis:[{label:"Lägst",value:rainSum.min},{label:"Högst",value:rainSum.max}]},
          watertemp:{label:"Havstemp",hint:"Linje · hav",value:waterTempSum.now,subtitle:selectedSeaTimeseriesData?"Vattentemperatur, historik och prognos":seaMissingText,chart:buildAdvancedMiniChart(waterTempPts,waterTempUnit),kpis:[{label:"Lägst",value:waterTempSum.min},{label:"Högst",value:waterTempSum.max}]},
          waves:{label:"Vågor",hint:"Linje · hav",value:waveSum.now,subtitle:selectedSeaTimeseriesData?"Våghöjd, historik och prognos":seaMissingText,chart:buildAdvancedMiniChart(wavePts,"m"),kpis:[{label:"Lägst",value:waveSum.min},{label:"Högst",value:waveSum.max}]},
          waterlevel:{label:"Vattenstånd",hint:"Linje · hav",value:levelSum.now,subtitle:selectedSeaTimeseriesData?(waterLevelHasForecast?"Vattenstånd, historik och prognos":"Vattenstånd, observationer") : seaMissingText,chart:buildAdvancedMiniChart(levelPts,levelUnit),kpis:[{label:"Lägst",value:levelSum.min},{label:"Högst",value:levelSum.max}]},
        };
      }

      function renderAdvancedWorkspace(){
        advancedChartRegistry = {}; advancedChartSeq = 0;
        var container=document.getElementById("seaAreaContent"); if(!container) return;
        if(!selectedSeaArea && !weatherTimeseries.length){container.className="advanced-empty-hint";container.innerHTML="Välj en plats på kartan eller använd Min plats. Då fylls analysen automatiskt.";return;}
        var defs=getAdvancedMetricDefinitions(); if(!defs[activeAdvancedMetric]) activeAdvancedMetric="wind"; var active=defs[activeAdvancedMetric] || defs.wind;
        container.className="advanced-workspace";
        var stationCount=selectedSeaAreaData && Array.isArray(selectedSeaAreaData.stations) ? selectedSeaAreaData.stations.length : 0;
        var metricKeys=["temperature","wind","precipitation","watertemp","waves","waterlevel"]; if(metricKeys.indexOf(activeAdvancedMetric)===-1) activeAdvancedMetric="wind"; var chips=metricKeys.map(function(key){var d=defs[key];return '<button type="button" class="advanced-metric-chip '+(key===activeAdvancedMetric?'is-active':'')+'" data-advanced-metric="'+escapeHtml(key)+'"><strong>'+escapeHtml(d.label)+'</strong><span>'+escapeHtml(d.hint)+'</span></button>';}).join('');
        var kpis=Array.isArray(active.kpis)&&active.kpis.length?'<div class="advanced-kpis">'+active.kpis.map(function(k){return '<div class="advanced-kpi"><div class="advanced-kpi-label">'+escapeHtml(k.label)+'</div><div class="advanced-kpi-value">'+escapeHtml(k.value)+'</div></div>';}).join('')+'</div>':'';
        var stationList='';
        if(selectedSeaAreaData&&Array.isArray(selectedSeaAreaData.stations)&&selectedSeaAreaData.stations.length){stationList='<div class="advanced-station-strip-list">'+selectedSeaAreaData.stations.slice(0,3).map(function(station){var name=station.name||"Okänd station", type=station.type||station.source||"Station", distance=station.distanceKm!=null?Number(station.distanceKm).toFixed(1)+" km":"";return '<div class="advanced-station-mini"><span>'+escapeHtml(name)+'</span><strong>'+escapeHtml(type+(distance?' · '+distance:''))+'</strong></div>';}).join('')+'</div>';}
        var stationHtml='<div class="advanced-station-strip"><div class="advanced-station-strip-title"><span>Stationer nära området</span><span>'+escapeHtml(stationCount?String(stationCount):"--")+'</span></div>'+ (stationList || '<div class="advanced-empty-hint" style="margin-top:9px;padding:11px;">Stationer visas när havsdata finns för vald plats.</div>') +'</div>';
        container.innerHTML='<div class="advanced-workspace-head"><div><div class="advanced-workspace-title">Analys</div><div class="advanced-workspace-subtitle">Välj en datatyp. Dra i grafen för exakt tidpunkt.</div></div><div class="advanced-status-pill">'+escapeHtml(selectedSeaArea?'Plats vald':'Väderdata')+'</div></div><div class="advanced-metric-picker">'+chips+'</div><div class="advanced-graph-card"><div class="advanced-graph-header"><div><div class="advanced-graph-title">'+escapeHtml(active.label)+'</div><div class="advanced-graph-subtitle">'+escapeHtml(active.subtitle || '')+'</div></div><div class="advanced-graph-value">'+escapeHtml(active.value || '--')+'</div></div>'+ (active.chart || '<div class="sea-chart-empty">Ingen graf att visa ännu.</div>') + kpis + '</div>'+stationHtml;
        container.querySelectorAll('[data-advanced-metric]').forEach(function(btn){btn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();activeAdvancedMetric=btn.getAttribute('data-advanced-metric') || 'wind';renderAdvancedWorkspace();});});
        container.querySelectorAll('[data-advanced-chart-slider]').forEach(function(slider){slider.addEventListener('input',function(){updateAdvancedChartCursor(slider.getAttribute('data-advanced-chart-slider'), slider.value);});});
        bindAdvancedChartDrag(container);
      }

      function renderAdvancedAccordion(){renderAdvancedWorkspace();}

      function renderSeaTimeseriesPanel(){
        var container=document.getElementById("seaTimeseriesContent");
        if(!container) return;
        if(!selectedSeaArea){container.innerHTML="";return;}
        if(!selectedSeaTimeseriesData){
          container.innerHTML='<div class="sea-timeseries-card"><div class="sea-chart-empty">Hämtar historik och prognos...</div></div>';
          return;
        }
        if(selectedSeaTimeseriesData.error){
          container.innerHTML='<div class="sea-timeseries-card"><div class="sea-chart-empty">'+escapeHtml(selectedSeaTimeseriesData.message || "Kunde inte hämta havsserier.")+'</div></div>';
          return;
        }
        var seriesRoot=selectedSeaTimeseriesData.series || {}, sources=selectedSeaTimeseriesData.sources || {};
        container.innerHTML='<div class="sea-timeseries-card"><div class="sea-chart-header"><div><div class="sea-chart-title">Havsdata över tid</div><div class="sea-chart-legend">X-axeln visar tid relativt nu. Heldragen linje är historik, streckad linje är prognos.</div></div></div>'+buildSeaRangeControls()+'<div class="sea-metric-stack">'+buildSeaMetricCard("waterTemp",seriesRoot.waterTemp,sources.waterTemp)+buildSeaMetricCard("waveHeight",seriesRoot.waveHeight,sources.waveHeight)+buildSeaMetricCard("waterLevel",seriesRoot.waterLevel,sources.waterLevel)+'</div></div>';
        container.querySelectorAll("[data-sea-history-hours]").forEach(function(btn){btn.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();seaHistoryHours=Number(btn.getAttribute("data-sea-history-hours"))||24;renderSeaTimeseriesPanel();});});
        container.querySelectorAll("[data-sea-forecast-hours]").forEach(function(btn){btn.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();seaForecastHours=Number(btn.getAttribute("data-sea-forecast-hours"))||24;renderSeaTimeseriesPanel();});});
      }

      function renderSeaAreaPanel(){
        if(activeMode === "advanced"){
          renderAdvancedAccordion();
          return;
        }

        var areaContent=document.getElementById("seaAreaContent"), stationsContent=document.getElementById("seaStationsContent");
        if(!areaContent) return;
        if(!selectedSeaArea){
          areaContent.className="sea-empty-state";
          areaContent.innerHTML="Tryck på kartan för att visa analys här.";
          if(stationsContent) stationsContent.innerHTML="Välj ett havsområde för att se närliggande stationer.";
          return;
        }
        if(!selectedSeaAreaData){
          areaContent.className="sea-area-card";
          areaContent.innerHTML='<div class="sea-area-title">Hämtar havsdata...</div><div class="sea-area-meta">Centrum: '+formatCoord(selectedSeaArea.lat)+', '+formatCoord(selectedSeaArea.lon)+'<br>Radie: '+selectedSeaArea.radiusKm+' km<br>Söker efter stationer och observationer.</div><div class="weather-point-actions"><button type="button" class="weather-favorite-btn" id="saveSeaAreaBtn">'+(isFavorite(selectedSeaArea.lat,selectedSeaArea.lon)?'Sparad plats':'Spara plats')+'</button></div><div class="sea-data-placeholder"><div class="sea-data-row"><span>Vattentemp</span><strong>Hämtar...</strong></div><div class="sea-data-row"><span>Våghöjd</span><strong>Hämtar...</strong></div><div class="sea-data-row"><span>Vattenstånd</span><strong>Hämtar...</strong></div></div><div id="seaTimeseriesContent"></div>';
          renderSeaTimeseriesPanel();
          if(stationsContent) stationsContent.innerHTML="Stationer inom "+selectedSeaArea.radiusKm+" km hämtas...";
          return;
        }
        if(selectedSeaAreaData.error){
          areaContent.className="sea-empty-state";
          areaContent.innerHTML='<div>'+(selectedSeaAreaData.message || "Det gick inte att hämta havsdata för området.")+'</div><div id="seaTimeseriesContent"></div>';
          renderSeaTimeseriesPanel();
          if(stationsContent) stationsContent.innerHTML="Stationer kunde inte hämtas just nu.";
          return;
        }
        var waterTemp=selectedSeaAreaData.waterTempText || selectedSeaAreaData.waterTemperatureText || selectedSeaAreaData.waterTemperature || "--";
        var waveHeight=selectedSeaAreaData.waveHeightText || selectedSeaAreaData.waveHeight || "--";
        var waterLevel=selectedSeaAreaData.waterLevelText || selectedSeaAreaData.waterLevel || "--";

        waterTemp=getSeaOverviewValueFromTimeseries("waterTemp", waterTemp);
        waveHeight=getSeaOverviewValueFromTimeseries("waveHeight", waveHeight);
        waterLevel=getSeaOverviewValueFromTimeseries("waterLevel", waterLevel);
        var stationCount=Array.isArray(selectedSeaAreaData.stations)?selectedSeaAreaData.stations.length:0;
        areaContent.className="sea-area-card";
        areaContent.innerHTML='<div class="sea-area-title">Havsområde</div><div class="sea-area-meta">Centrum: '+formatCoord(selectedSeaArea.lat)+', '+formatCoord(selectedSeaArea.lon)+'<br>Radie: '+selectedSeaArea.radiusKm+' km<br>Stationer hittade: '+stationCount+'</div><div class="weather-point-actions"><button type="button" class="weather-favorite-btn" id="saveSeaAreaBtn">'+(isFavorite(selectedSeaArea.lat,selectedSeaArea.lon)?'Sparad plats':'Spara plats')+'</button></div><div class="sea-data-placeholder"><div class="sea-data-row"><span>Vattentemp</span><strong>'+waterTemp+'</strong></div><div class="sea-data-row"><span>Våghöjd</span><strong>'+waveHeight+'</strong></div><div class="sea-data-row"><span>Vattenstånd</span><strong>'+waterLevel+'</strong></div></div><div id="seaTimeseriesContent"></div>';
        renderSeaTimeseriesPanel();
        if(stationsContent){
          if(!stationCount) stationsContent.innerHTML="Inga stationer hittades inom "+selectedSeaArea.radiusKm+" km.";
          else stationsContent.innerHTML=selectedSeaAreaData.stations.map(function(station){var name=station.name || "Okänd station";var type=station.type || station.source || "Station";var distance=station.distanceKm != null ? Number(station.distanceKm).toFixed(1)+" km" : "";return '<div class="sea-data-row"><span>'+escapeHtml(name)+'</span><strong>'+escapeHtml(type+(distance?' · '+distance:''))+'</strong></div>';}).join("");
        }
      }

      function makeSeaCircleGeoJson(lat, lon, radiusKm, points){
        points=points || 96; var coords=[], earthRadiusKm=6371, latRad=lat*Math.PI/180, lonRad=lon*Math.PI/180, distance=radiusKm/earthRadiusKm;
        for(var i=0;i<=points;i++){var bearing=(i/points)*2*Math.PI;var pointLat=Math.asin(Math.sin(latRad)*Math.cos(distance)+Math.cos(latRad)*Math.sin(distance)*Math.cos(bearing));var pointLon=lonRad+Math.atan2(Math.sin(bearing)*Math.sin(distance)*Math.cos(latRad),Math.cos(distance)-Math.sin(latRad)*Math.sin(pointLat));coords.push([pointLon*180/Math.PI,pointLat*180/Math.PI]);}
        return {type:"FeatureCollection",features:[{type:"Feature",properties:{radiusKm:radiusKm},geometry:{type:"Polygon",coordinates:[coords]}}]};
      }
      function ensureSeaAreaLayers(){
        if(!maptilerMap) return false;
        try{
          if(!(maptilerMap.getSource && maptilerMap.getSource(seaAreaSourceId))) maptilerMap.addSource(seaAreaSourceId,{type:"geojson",data:{type:"FeatureCollection",features:[]}});
          if(!(maptilerMap.getLayer && maptilerMap.getLayer(seaAreaFillLayerId))) maptilerMap.addLayer({id:seaAreaFillLayerId,type:"fill",source:seaAreaSourceId,paint:{"fill-color":"#7bc7ff","fill-opacity":0.08}});
          if(!(maptilerMap.getLayer && maptilerMap.getLayer(seaAreaLineLayerId))) maptilerMap.addLayer({id:seaAreaLineLayerId,type:"line",source:seaAreaSourceId,paint:{"line-color":"#7bc7ff","line-opacity":0.42,"line-width":1.5}});
          try{
            if(maptilerMap.getLayer && maptilerMap.getLayer(seaAreaFillLayerId) && maptilerMap.setPaintProperty) maptilerMap.setPaintProperty(seaAreaFillLayerId,"fill-opacity",0.08);
            if(maptilerMap.getLayer && maptilerMap.getLayer(seaAreaLineLayerId) && maptilerMap.setPaintProperty){
              maptilerMap.setPaintProperty(seaAreaLineLayerId,"line-opacity",0.42);
              maptilerMap.setPaintProperty(seaAreaLineLayerId,"line-width",1.5);
            }
          }catch(styleErr){}
          return true;
        }catch(e){console.warn("Kunde inte skapa havsområdeslager", e);return false;}
      }
      function bringSeaAreaLayersToFront(){if(!maptilerMap) return;try{if(maptilerMap.getLayer && maptilerMap.getLayer(seaAreaFillLayerId)) maptilerMap.moveLayer(seaAreaFillLayerId);if(maptilerMap.getLayer && maptilerMap.getLayer(seaAreaLineLayerId)) maptilerMap.moveLayer(seaAreaLineLayerId);}catch(e){console.warn("Kunde inte flytta havsområdet överst", e);}}
      function setSeaAreaVisible(visible){if(!maptilerMap) return;try{if(maptilerMap.getLayer && maptilerMap.getLayer(seaAreaFillLayerId)) maptilerMap.setLayoutProperty(seaAreaFillLayerId,"visibility",visible?"visible":"none");if(maptilerMap.getLayer && maptilerMap.getLayer(seaAreaLineLayerId)) maptilerMap.setLayoutProperty(seaAreaLineLayerId,"visibility",visible?"visible":"none");}catch(e){console.warn("Kunde inte ändra synlighet för havsområde", e);}}
      function updateSeaAreaLayer(){
        if(!maptilerMap || !selectedSeaArea) return; if(!ensureSeaAreaLayers()) return;
        try{var source=maptilerMap.getSource(seaAreaSourceId); if(source && source.setData) source.setData(makeSeaCircleGeoJson(selectedSeaArea.lat,selectedSeaArea.lon,selectedSeaArea.radiusKm)); setSeaAreaVisible(isSeaActive()); bringSeaAreaLayersToFront(); updateSeaBadge();}catch(e){console.warn("Kunde inte uppdatera havsområde", e);}
      }
      function updateSeaBadge(){var seaBadge=document.getElementById("seaBadge"); if(!seaBadge) return; seaBadge.classList.toggle("visible", !!(seaSelectionActive && selectedSeaArea));}
      function selectSeaArea(lat, lon){
        seaSelectionActive=true; activeBottomTab="advanced"; setActiveTab("tabAdvanced"); setSeaAreaVisible(true);
        selectedSeaArea={lat:lat,lon:lon,radiusKm:seaAreaRadiusKm,selectedAt:Date.now()}; selectedSeaAreaData=null; selectedSeaTimeseriesData=null;
        updateSeaAreaLayer(); updateSeaBadge(); renderSeaAreaPanel(); loadSeaAreaData(lat,lon,seaAreaRadiusKm); loadSeaTimeseriesData(lat,lon,seaAreaRadiusKm);
        try{if(maptilerMap) maptilerMap.easeTo({center:[lon,lat],zoom:Math.max(maptilerMap.getZoom?maptilerMap.getZoom():8,8),duration:350});}catch(e){}
        enterSeaMode(false);
      }
      function setSeaMode(mode){
        seaMode=mode==="stations"?"stations":"area";
        var areaBtn=document.getElementById("seaAreaTabBtn"), stationsBtn=document.getElementById("seaStationsTabBtn"), areaView=document.getElementById("seaAreaView"), stationsView=document.getElementById("seaStationsView");
        if(areaBtn) areaBtn.classList.toggle("is-active", seaMode==="area"); if(stationsBtn) stationsBtn.classList.toggle("is-active", seaMode==="stations");
        if(areaView) areaView.style.display=seaMode==="area"?"block":"none"; if(stationsView) stationsView.style.display=seaMode==="stations"?"block":"none";
      }

      var mobileSeaSheet=document.getElementById('mobileSeaSheet'), mobileFilterSheet=document.getElementById('mobileFilterSheet'), mobileSearchSheet=document.getElementById('mobileSearchSheet');
      var mobileSearchInput=document.getElementById('mobileSearchInput'), mobileSearchResults=document.getElementById('mobileSearchResults');
      var mobileSearchCloseBtn=document.getElementById('mobileSearchCloseBtn'), mobileFilterCloseBtn=document.getElementById('mobileFilterCloseBtn'), mobileSeaCloseBtn=document.getElementById('mobileSeaCloseBtn');
      var mobileSearchTimer=null, mobileSearchRequestId=0, selectedPlaceName="";

      function getModeLabel(mode){return mode === "advanced" ? "Avancerat" : (mode === "nautical" ? "Sjökort" : "Väder");}
      function isLayerAllowedInMode(layerKey){
        var allowed={
          weather:{wind:1,precip:1,satellite:1},
          advanced:{base:1,wind:1,precip:1,radar:1,radarObservation:1,satellite:1,temperature:1,wave:1,lighthouse:1,ais:1},
          nautical:{wind:1,radar:1,radarObservation:1,ais:1}
        };
        return !!((allowed[activeMode]||allowed.weather)[layerKey]);
      }
      function setModeSwitcherState(){
        var label=document.getElementById('modeSwitcherLabel'); if(label) label.textContent=getModeLabel(activeMode);
        document.querySelectorAll('[data-mode-option]').forEach(function(btn){btn.classList.toggle('is-active',btn.getAttribute('data-mode-option')===activeMode);});
      }
      function removeWeatherLayerIfVisible(layerId){try{if(typeof safeRemoveWeatherLayer==='function') safeRemoveWeatherLayer(layerId); else if(maptilerMap&&maptilerMap.getLayer&&maptilerMap.getLayer(layerId)) maptilerMap.removeLayer(layerId);}catch(e){}}
      function enforceModeLayers(){
        if(activeMode === 'weather' && baseMapMode !== 'standard' && typeof setBaseMapMode === 'function') setBaseMapMode('standard');
        if(activeMode === 'nautical' && typeof setBaseMapMode === 'function') setBaseMapMode('nautical');
        if(!isLayerAllowedInMode('wind') && windLayerVisible){removeWeatherLayerIfVisible('main-wind-layer');windLayerVisible=false;}
        if(!isLayerAllowedInMode('precip') && precipitationLayerVisible){removeWeatherLayerIfVisible('main-precipitation-layer');precipitationLayerVisible=false;}
        if(!isLayerAllowedInMode('radar') && radarLayerVisible){removeWeatherLayerIfVisible('main-radar-layer');radarLayerVisible=false;}
        if(!isLayerAllowedInMode('radarObservation') && smhiRadarObservationVisible){smhiRadarObservationVisible=false;removeSmhiRadarObservationLayer();}
        if(!isLayerAllowedInMode('temperature') && temperatureLayerVisible){removeWeatherLayerIfVisible('main-temperature-layer');temperatureLayerVisible=false;}
        if(!isLayerAllowedInMode('satellite') && satelliteLayerVisible){satelliteLayerVisible=false;try{cancelOpenMeteoCloudWarmup();removeOpenMeteoCloudLayer();}catch(e){}}
        if(!isLayerAllowedInMode('wave')) showWaveObjects=false;
        if(!isLayerAllowedInMode('lighthouse')) showLighthouseObjects=false;
        if(!isLayerAllowedInMode('ais')){showAisObjects=false;if(typeof clearAisMarkers==='function') clearAisMarkers();}
        if(!isLayerAllowedInMode('satellite') && satelliteLayerVisible){
          satelliteLayerVisible=false;
          try{cancelOpenMeteoCloudWarmup();removeOpenMeteoCloudLayer();}catch(e){}
        }
        if(typeof updateModeUI === 'function') updateModeUI();
        if(typeof updateAdvancedTrayButton === 'function') updateAdvancedTrayButton();
        if(typeof syncAllLayerButtons === 'function') syncAllLayerButtons();
      }
      function hideLaunchScreen(){var el=document.getElementById("launchScreen");if(el) el.classList.add("is-hidden");}
      function updateAdvancedTrayButton(){
        var btn=document.getElementById('advancedTrayBtn'), hint=document.getElementById('advancedTrayHint'), title=document.getElementById('advancedTrayTitle'), icon=document.getElementById('advancedTrayIcon');
        if(!btn) return;
        var isOpen=!!(mobileSeaSheet && mobileSeaSheet.classList.contains('is-open'));
        btn.classList.toggle('is-open', isOpen);
        btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        if(title) title.textContent = 'Analys';
        if(icon) icon.textContent = isOpen ? '⌄' : '⌃';
        if(hint){
          hint.textContent = '';
        }
      }
      function openAdvancedSheet(openSheet){
        activeBottomTab="advanced";
        seaSelectionActive=true;
        if(mobileFilterSheet) mobileFilterSheet.classList.remove("is-open");
        if(mobileSearchSheet){mobileSearchSheet.classList.remove("is-open");mobileSearchSheet.classList.remove("places-mode");}
        if(openSheet!==false && mobileSeaSheet) mobileSeaSheet.classList.add("is-open");
        setSeaAreaVisible(!!selectedSeaArea);
        bringSeaAreaLayersToFront();
        renderSeaAreaPanel();
        updateAdvancedTrayButton();
        enforceModeLayers();
        if((activeMode==="advanced" || activeMode==="nautical") && satelliteLayerVisible && typeof syncOpenMeteoCloudLayerForSelectedTime==="function"){
          syncOpenMeteoCloudLayerForSelectedTime(getSelectedAppTime(),{immediate:true,preload:true});
          startOpenMeteoCloudStartupWarmup(getSelectedAppTime());
        }else if(activeMode==="weather" && typeof removeOpenMeteoCloudLayer==="function"){
          removeOpenMeteoCloudLayer();
        }
        setModeSwitcherState();
        updateSeaBadge();
        refreshMobileNavState();
        refreshMapSizeSoon();
      }
      function closeAdvancedSheet(){
        if(mobileSeaSheet) mobileSeaSheet.classList.remove("is-open");
        updateAdvancedTrayButton();
        refreshMobileNavState();
        refreshMapSizeSoon();
      }
      function setAppMode(mode, options){
        options = options || {};
        activeMode = mode === "nautical" ? "nautical" : (mode === "advanced" ? "advanced" : "weather");
        hideLaunchScreen();
        closeMobileFilterSheet();
        closeSearch();
        document.body.setAttribute("data-app-mode", activeMode);

        if(activeMode === "weather"){
          activeBottomTab="weather";
          seaSelectionActive=false;
          setSeaAreaVisible(false);
          if(typeof setBaseMapMode === "function") setBaseMapMode("standard");
          closeAdvancedSheet();
          showWaveObjects=false;
          showLighthouseObjects=false;
          showAisObjects=false;
          if(typeof clearAisMarkers === "function") clearAisMarkers();
          if(typeof updateModeUI === "function") updateModeUI();
          if(typeof renderWeatherHome === "function") renderWeatherHome();
          if(typeof requestWeatherHomeLocation === "function") requestWeatherHomeLocation({onlyIfNoSelection:true});
        }else if(activeMode === "advanced"){
          activeBottomTab="advanced";
          seaSelectionActive=true;
          showAisObjects=false;
          if(typeof clearAisMarkers === "function") clearAisMarkers();
          if(typeof setBaseMapMode === "function") setBaseMapMode("standard");
          closeAdvancedSheet();
          var prepared = prepareAdvancedFromExistingSelection(options.openSheet === true);
          setSeaAreaVisible(!!selectedSeaArea);
          if(!prepared && !weatherTimeseries.length){
            updateMapOverlay("Avancerat", "Tryck på kartan eller använd Min plats för att välja analysplats.");
          }else if(window.updateWeatherForSelectedTime && weatherTimeseries.length){
            window.updateWeatherForSelectedTime(getSelectedAppTime());
          }
          updateAdvancedTrayButton();
          if(typeof requestModeAutoLocation === "function") requestModeAutoLocation("advanced", {onlyOnce:true});
        }else if(activeMode === "nautical"){
          activeBottomTab="nautical";
          seaSelectionActive=false;
          setSeaAreaVisible(false);
          closeAdvancedSheet();
          userTrackingMode = "follow";
          nauticalCompassMode = "north";
          if(typeof setBaseMapMode === "function") setBaseMapMode("nautical");
          if(typeof updateModeUI === "function") updateModeUI();
          updateNauticalCompassHud();
          if(typeof requestModeAutoLocation === "function") requestModeAutoLocation("nautical", {onlyOnce:true});
        }
        enforceModeLayers();
        setModeSwitcherState();
        updateSeaBadge();
        refreshMobileNavState();
        refreshMapSizeSoon();
      }

      function setActiveTab(id){document.querySelectorAll('.tab-btn').forEach(function(b){b.classList.remove('active');});var t=document.getElementById(id);if(t) t.classList.add('active');}
      function refreshMobileNavState(){
        if(activeMode === "advanced"){setActiveTab('tabAdvanced');return;}
        if(activeMode === "nautical"){setActiveTab('tabNautical');return;}
        setActiveTab('tabWeather');
      }
      function enterSeaMode(openSheet){setAppMode("advanced",{openSheet:openSheet!==false});}
      function minimizeSea(){closeAdvancedSheet();}
      function exitSeaMode(){seaSelectionActive=false;if(mobileSeaSheet) mobileSeaSheet.classList.remove("is-open");if(activeMode==="advanced") activeMode="weather";activeBottomTab="weather";setSeaAreaVisible(false);updateSeaBadge();refreshMobileNavState();refreshMapSizeSoon();}
      function closeSea(){closeAdvancedSheet();}
      function openMobileFilterSheet(){enforceModeLayers();activeBottomTab="layers";if(activeMode!=="advanced"){setSeaAreaVisible(false);seaSelectionActive=false;}updateSeaBadge();if(mobileSeaSheet) mobileSeaSheet.classList.remove('is-open');if(mobileSearchSheet){mobileSearchSheet.classList.remove('is-open');mobileSearchSheet.classList.remove('places-mode');}if(!mobileFilterSheet) return;mobileFilterSheet.classList.add('is-open');refreshMobileNavState();refreshMapSizeSoon();}
      function closeMobileFilterSheet(){if(!mobileFilterSheet) return;mobileFilterSheet.classList.remove('is-open');refreshMobileNavState();refreshMapSizeSoon();}
   function openSearch(){
  activeBottomTab = "search";
  if(activeMode !== "advanced"){
    setSeaAreaVisible(false);
    seaSelectionActive = false;
    updateSeaBadge();
  }

  if(mobileSeaSheet) mobileSeaSheet.classList.remove("is-open");
  if(mobileFilterSheet) mobileFilterSheet.classList.remove("is-open");
  if(!mobileSearchSheet) return;

  mobileSearchSheet.classList.remove("places-mode");
  mobileSearchSheet.classList.add("is-open");

  var title = mobileSearchSheet.querySelector(".sheet-title");
  if(title) title.textContent = "Sök plats";

  if(mobileSearchInput){
    setTimeout(function(){
      mobileSearchInput.focus();
    }, 80);
  }

  refreshMobileNavState();
}

function openPlaces(){
  activeBottomTab = "places";
  if(activeMode !== "advanced"){
    setSeaAreaVisible(false);
    seaSelectionActive = false;
    updateSeaBadge();
  }

  if(mobileSeaSheet) mobileSeaSheet.classList.remove("is-open");
  if(mobileFilterSheet) mobileFilterSheet.classList.remove("is-open");
  if(!mobileSearchSheet) return;

  mobileSearchSheet.classList.add("places-mode");
  mobileSearchSheet.classList.add("is-open");

  var title = mobileSearchSheet.querySelector(".sheet-title");
  if(title) title.textContent = "Platser";

  if(mobileSearchInput){
    mobileSearchInput.value = "";
    mobileSearchInput.blur();
  }

  if(mobileSearchResults){
    mobileSearchResults.innerHTML = "";
  }

  renderFavoritesList();
  refreshMobileNavState();
}

function closeSearch(){
  if(!mobileSearchSheet) return;

  mobileSearchSheet.classList.remove("is-open");
  mobileSearchSheet.classList.remove("places-mode");

  if(mobileSearchInput) mobileSearchInput.blur();

  refreshMobileNavState();

  setTimeout(function(){
    refreshMapSizeSoon();
  }, 120);
}
   function renderFavoritesList(){
  var list = document.getElementById("favoritePlacesList");
  if(!list) return;

  function normalizeFavoriteItem(item, sourceType){
    return Object.assign({}, item, {
      type: "place",
      sourceType: sourceType || "weather",
      radiusKm: Number(item.radiusKm || seaAreaRadiusKm),
      savedAt: Number(item.savedAt || 0)
    });
  }

  var weatherItems = getStoredFavorites().map(function(item){
    return normalizeFavoriteItem(item, "weather");
  });

  var legacySeaItems = getStoredSeaAreas().map(function(item){
    return normalizeFavoriteItem(item, "sea");
  });

  var byId = {};
  weatherItems.concat(legacySeaItems).forEach(function(item){
    var id = buildFavoriteId(item.lat, item.lon);
    if(!byId[id] || item.sourceType === "weather") byId[id] = item;
  });

  var items = Object.keys(byId).map(function(id){return byId[id];}).sort(function(a,b){
    return Number(b.savedAt || 0) - Number(a.savedAt || 0);
  });

  function openFavoriteItem(item){
    closeSearch();

    setTimeout(function(){
      var lat = Number(item.lat), lon = Number(item.lon);
      if(!isFinite(lat) || !isFinite(lon)) return;

      focusMapOnPoint(lat, lon, activeMode === "nautical" ? 11 : 9);

      // En sparad plats ska alltid fylla väderdata. I Avancerat fyller vi även analys-/havsdata inom 50 km.
      handlePrimaryMapClick(lat, lon);

      if(activeMode === "advanced"){
        selectAdvancedPoint(lat, lon, {openSheet:false});
      }else{
        seaSelectionActive = false;
        setSeaAreaVisible(false);
        updateSeaBadge();
      }

      refreshMapSizeSoon();
    }, 120);
  }

  function buildRow(item){
    var row = document.createElement("div");
    row.className = "favorite-place-item";

    var main = document.createElement("div");
    main.className = "favorite-place-main";

    var coordText = formatCoord(item.lat) + ", " + formatCoord(item.lon);
    if(activeMode === "advanced") coordText += " · analysradie " + seaAreaRadiusKm + " km";

    main.innerHTML =
      '<div class="favorite-place-name">' + escapeHtml(item.name || "Plats") + '</div>' +
      '<div class="favorite-place-coords">' + escapeHtml(coordText) + '</div>';

    main.onclick = function(){
      openFavoriteItem(item);
    };

    var actions = document.createElement("div");
    actions.className = "favorite-place-actions";

    var renameBtn = document.createElement("button");
    renameBtn.className = "favorite-place-rename";
    renameBtn.type = "button";
    renameBtn.textContent = "Byt namn";
    renameBtn.onclick = function(e){
      e.stopPropagation();
      if(item.sourceType === "sea") renameSeaAreaFavorite(item.id);
      else renameFavorite(item.id);
    };

    var removeBtn = document.createElement("button");
    removeBtn.className = "favorite-place-remove";
    removeBtn.type = "button";
    removeBtn.textContent = "Ta bort";
    removeBtn.onclick = function(e){
      e.stopPropagation();
      if(item.sourceType === "sea") removeSeaAreaFavorite(item.id);
      else removeFavorite(item.id);
    };

    actions.appendChild(renameBtn);
    actions.appendChild(removeBtn);

    row.appendChild(main);
    row.appendChild(actions);

    return row;
  }

  list.innerHTML = "";

  var title = document.createElement("div");
  title.className = "favorite-section-title";
  title.textContent = "Sparade platser";
  list.appendChild(title);

  if(!items.length){
    var empty = document.createElement("div");
    empty.className = "favorite-place-empty";
    empty.textContent = "Inga sparade platser ännu.";
    list.appendChild(empty);
    return;
  }

  items.forEach(function(item){
    list.appendChild(buildRow(item));
  });
}

      function updateMapViewportOffsets(skipPadding){
        if(!maptilerMap) return;
        try{if(typeof maptilerMap.setPadding!=="function") return;if(skipPadding){maptilerMap.setPadding({top:0,right:0,bottom:0,left:0});return;}var mobile=isMobileView(), overlay=document.getElementById("mapOverlayPanel"), timeControl=document.getElementById("timeControl"), padding={top:20,right:20,bottom:20,left:20};if(overlay && overlay.offsetParent!==null) padding.top=Math.max(20, overlay.offsetHeight+(mobile?22:26));if(timeControl && timeControl.offsetParent!==null) padding.bottom=Math.max(20, timeControl.offsetHeight+(mobile?24:26));maptilerMap.setPadding(padding);}catch(e){console.warn("Kunde inte uppdatera map padding", e);}
      }
      function focusMapOnPoint(lat, lon, zoomLevel){
        var zoom=zoomLevel || 9; try{map.setView([lat,lon],zoom,{animate:false});}catch(e){}
        if(!maptilerMap) return;
        try{updateMapViewportOffsets(true);maptilerMap.flyTo({center:[lon,lat],zoom:zoom,essential:true});setTimeout(function(){try{updateMapViewportOffsets(true);maptilerMap.easeTo({center:[lon,lat],zoom:zoom,duration:0});}catch(e){}},450);setTimeout(function(){updateMapViewportOffsets(false);},700);}catch(e){console.warn("Kunde inte fokusera kartan på punkt", e);}
      }
      function refreshMapSizeSoon(){setTimeout(function(){try{map.invalidateSize();}catch(e){} try{if(maptilerMap) maptilerMap.resize();}catch(e){} updateMapViewportOffsets();},60);}

      var map=L.map('map',{zoomControl:false}).setView([58.15,11.55],9);
      var MAPTILER_API_KEY='72WUquDNJCLDzyB9DSky';

      var weatherMarker=null, waveSelectionMarker=null, lighthouseSelectionMarker=null, aisMarkerMap=new Map();
      var waveStationsLayer=L.layerGroup(), lighthouseStationsLayer=L.layerGroup();
      var waveStationsLoaded=false, lighthouseStationsLoaded=false, waveStationsLoadingPromise=null, lighthouseStationsLoadingPromise=null;
      var waveBackgroundCheckStarted=false, lighthouseBackgroundCheckStarted=false;
      var waveMarkerMap=new Map(), lighthouseMarkerMap=new Map(), waveMaptilerMarkerMap=new Map(), lighthouseMaptilerMarkerMap=new Map(), selectedWaveStationId=null, selectedLighthouseStationId=null;
      var waveStationsCache=new Map(), lighthouseStationsCache=new Map(), waterLevelStationsPromise=null, vivaStationsPromise=null, vivaStationDataCache=new Map(), vivaNearestCache=new Map(), waveEvaluationCache=new Map(), lighthouseObservationCache=new Map();

      function setWeatherMarker(lat,lon){ if(weatherMarker) map.removeLayer(weatherMarker); weatherMarker=L.marker([lat,lon]).addTo(map); }
      function setMaptilerWeatherMarker(lat,lon){ if(!maptilerMap || !window.maptilersdk) return; if(maptilerWeatherMarker) maptilerWeatherMarker.remove(); maptilerWeatherMarker=new maptilersdk.Marker().setLngLat([lon,lat]).addTo(maptilerMap); }
      function clearWeatherSelectionMarker(){try{if(weatherMarker){map.removeLayer(weatherMarker);weatherMarker=null;}}catch(e){} try{if(maptilerWeatherMarker){maptilerWeatherMarker.remove();maptilerWeatherMarker=null;}}catch(e){}}
      function saveSelection(mode,payload){savedSelections[mode]=payload;}

      var latestWeatherRequestId=0;
      function buildDailyForecast(ts){
        var dm=new Map();
        for(var i=0;i<ts.length;i++){var item=ts[i], time=item&&item.time; if(!time) continue; var tmForDay=new Date(time).getTime(), dk=formatDateKeyGlobal(isFinite(tmForDay)?tmForDay:time), inst=(item.data&&item.data.instant&&item.data.instant.details)||{}, at=inst.air_temperature, prec=((item.data&&item.data.next_1_hours&&item.data.next_1_hours.details&&item.data.next_1_hours.details.precipitation_amount)||0), sym=((item.data&&item.data.next_1_hours&&item.data.next_1_hours.summary&&item.data.next_1_hours.summary.symbol_code)||(item.data&&item.data.next_6_hours&&item.data.next_6_hours.summary&&item.data.next_6_hours.summary.symbol_code)||(item.data&&item.data.next_12_hours&&item.data.next_12_hours.summary&&item.data.next_12_hours.summary.symbol_code)||null), wind=inst.wind_speed||null, hour=new Date(time).getHours(); if(!dm.has(dk)) dm.set(dk,{date:dk,minTemp:at,maxTemp:at,precipitation:0,symbol:sym,windSpeed:wind,bestSymbolDistance:Math.abs(hour-12)}); var day=dm.get(dk); if(at!=null){day.minTemp=day.minTemp==null?at:Math.min(day.minTemp,at);day.maxTemp=day.maxTemp==null?at:Math.max(day.maxTemp,at);} day.precipitation+=Number(prec||0); var sd=Math.abs(hour-12); if(sym && (day.symbol==null || sd<day.bestSymbolDistance)){day.symbol=sym;day.bestSymbolDistance=sd;} if(wind!=null && sd<=day.bestSymbolDistance) day.windSpeed=wind;}
        return Array.from(dm.values()).slice(0,7);
      }


      var weatherHomeAutoLocationRequested=false;
      var advancedAutoLocationRequested=false;
      var nauticalAutoLocationRequested=false;
      var weatherHomeSelectedTime=null;
      var weatherHomeSelectedDayKey=null;
      var weatherHomeLastUpdatedAt=null;
      var weatherHomeHourlyScrollByDay={};
      var weatherHomePendingHourScrollTime=null;
      var weatherHomeNowcastData=null;

      function compactTemp(v){return v==null || !isFinite(Number(v)) ? "--" : Math.round(Number(v)) + "°";}
      function compactWind(v){return v==null || !isFinite(Number(v)) ? "--" : Number(v).toFixed(1).replace(".",",") + " m/s";}
      function compactRain(v){return v==null || !isFinite(Number(v)) ? "--" : Number(v).toFixed(1).replace(".",",") + " mm";}
      function getItemSymbol(item){
        var data=item && item.data || {};
        return (data.next_1_hours && data.next_1_hours.summary && data.next_1_hours.summary.symbol_code) ||
          (data.next_6_hours && data.next_6_hours.summary && data.next_6_hours.summary.symbol_code) ||
          (data.next_12_hours && data.next_12_hours.summary && data.next_12_hours.summary.symbol_code) || null;
      }
      function getWeatherItemTimeMs(item){var t=new Date(item && item.time).getTime();return isFinite(t)?t:null;}
      function findNearestWeatherItem(timeValue){
        var target=normalizeTimeMs(timeValue); if(!isFinite(target)) target=Date.now();
        var rows=Array.isArray(weatherTimeseries)?weatherTimeseries:[]; if(!rows.length) return null;
        var best=rows[0], bestDiff=Math.abs(getWeatherItemTimeMs(best)-target);
        rows.forEach(function(item){var tm=getWeatherItemTimeMs(item); if(tm==null) return; var d=Math.abs(tm-target); if(d<bestDiff){best=item;bestDiff=d;}});
        return best;
      }
      function getNearestGustRaw(timeValue){
        var rows=Array.isArray(weatherGustTimeseries)?weatherGustTimeseries:[]; if(!rows.length) return null;
        var target=normalizeTimeMs(timeValue); if(!isFinite(target)) target=Date.now();
        var best=null,bestDiff=Infinity;
        rows.forEach(function(row){var tm=new Date(row && row.time).getTime(); if(!isFinite(tm)) return; var d=Math.abs(tm-target); if(d<bestDiff){best=row;bestDiff=d;}});
        return best && best.value != null && isFinite(Number(best.value)) ? Number(best.value) : null;
      }
      function getWeatherDayKeyFromTime(timeValue){
        var ms=normalizeTimeMs(timeValue);
        if(!isFinite(ms)) ms=Date.now();
        return formatDateKeyGlobal(ms);
      }
      function getHourlyWeatherItems(dayKey){
        var rows=Array.isArray(weatherTimeseries)?weatherTimeseries:[]; if(!rows.length) return [];
        var key=dayKey || weatherHomeSelectedDayKey || getWeatherDayKeyFromTime(weatherHomeSelectedTime || Date.now());
        var now=Date.now();
        return rows.filter(function(item){
          var tm=getWeatherItemTimeMs(item);
          if(tm==null) return false;
          if(getWeatherDayKeyFromTime(tm)!==key) return false;
          if(key===getWeatherDayKeyFromTime(now) && tm < now - 45*60*1000) return false;
          return true;
        }).slice(0,30);
      }
      function firstUsefulWeatherTimeForDay(dayKey){
        var rows=getHourlyWeatherItems(dayKey);
        if(!rows.length) return null;
        var target=dayKey===getWeatherDayKeyFromTime(Date.now()) ? Date.now() : new Date(dayKey+'T08:00:00').getTime();
        var best=rows[0], bestDiff=Math.abs((getWeatherItemTimeMs(best)||0)-target);
        rows.forEach(function(item){var tm=getWeatherItemTimeMs(item); if(tm==null) return; var d=Math.abs(tm-target); if(d<bestDiff){best=item;bestDiff=d;}});
        return getWeatherItemTimeMs(best);
      }
      function buildWeatherHomeDailyRows(activeDayKey){
        var days=Array.isArray(currentForecastDays)?currentForecastDays:[];
        var todayKey=formatDateKeyGlobal(Date.now());
        var tomorrow=new Date(); tomorrow.setDate(tomorrow.getDate()+1); var tomorrowKey=formatDateKeyGlobal(tomorrow);
        return days.slice(0,6).map(function(day){
          var dateObj=new Date(day.date+"T12:00:00");
          var key=formatDateKeyGlobal(dateObj);
          var label=key===todayKey ? "Idag" : (key===tomorrowKey ? "Imorgon" : dateObj.toLocaleDateString('sv-SE',{weekday:'long'}).replace(/^./,function(c){return c.toUpperCase();}));
          var dateLabel=dateObj.toLocaleDateString('sv-SE',{day:'numeric',month:'short'});
          var rain=day.precipitation!=null ? compactRain(day.precipitation) : "--";
          var active=key===activeDayKey;
          return '<button type="button" class="weather-day-row '+(active?'is-active':'')+'" data-weather-day="'+escapeHtml(key)+'" aria-label="Visa timmar för '+escapeHtml(label)+'">'+
            '<div><div class="weather-day-name">'+escapeHtml(label)+'</div><span class="weather-day-date">'+escapeHtml(dateLabel)+'</span></div>'+
            '<div class="weather-day-icon">'+weatherIconFromSymbol(day.symbol)+'</div>'+
            '<div class="weather-day-range"><span class="weather-day-low">'+escapeHtml(compactTemp(day.minTemp))+'</span><span class="weather-day-bar"></span><span class="weather-day-high">'+escapeHtml(compactTemp(day.maxTemp))+'</span></div>'+
            '<div class="weather-day-rain">💧 '+escapeHtml(rain)+'</div>'+
          '</button>';
        }).join('');
      }
      function getWeatherDayLabel(dayKey){
        var todayKey=formatDateKeyGlobal(Date.now());
        var tomorrow=new Date(); tomorrow.setDate(tomorrow.getDate()+1); var tomorrowKey=formatDateKeyGlobal(tomorrow);
        if(dayKey===todayKey) return 'Timvis idag';
        if(dayKey===tomorrowKey) return 'Timvis imorgon';
        var d=new Date(dayKey+'T12:00:00');
        if(!isFinite(d.getTime())) return 'Timvis';
        var dayName=d.toLocaleDateString('sv-SE',{weekday:'long'}).replace(/^./,function(c){return c.toUpperCase();});
        return 'Timvis '+dayName;
      }
      function renderWeatherHomeEmpty(title, text, showButton){
        var content=document.getElementById('weatherHomeContent'); if(!content) return;
        content.innerHTML='<div class="weather-home-empty"><strong>'+escapeHtml(title||'Hämtar väder')+'</strong><div>'+escapeHtml(text||'Vi försöker välja din plats automatiskt.')+'</div>'+(showButton?'<div class="weather-place-actions" style="margin-top:14px;"><button class="weather-place-action primary" type="button" id="weatherHomeLocateEmptyBtn"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"></circle><path d="M12 3v3M12 18v3M3 12h3M18 12h3"></path></svg>Min plats</button><button class="weather-place-action" type="button" id="weatherHomeSearchEmptyBtn"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>Sök</button><button class="weather-place-action" type="button" id="weatherHomePlacesEmptyBtn"><svg viewBox="0 0 24 24"><path d="M5 4h14v17l-7-4-7 4V4Z"></path></svg>Sparade</button></div>':'')+'</div>';
        var btn=document.getElementById('weatherHomeLocateEmptyBtn'); if(btn) btn.addEventListener('click',function(){requestWeatherHomeLocation({force:true});});
        var sbtn=document.getElementById('weatherHomeSearchEmptyBtn'); if(sbtn) sbtn.addEventListener('click',function(){if(typeof openSearch==='function') openSearch();});
        var pbtn=document.getElementById('weatherHomePlacesEmptyBtn'); if(pbtn) pbtn.addEventListener('click',function(){if(typeof openPlaces==='function') openPlaces();});
      }
      function rememberWeatherHomeHourlyScroll(){
        var strip=document.querySelector('#weatherHomeContent .weather-hourly-strip');
        if(!strip || !weatherHomeSelectedDayKey) return;
        weatherHomeHourlyScrollByDay[weatherHomeSelectedDayKey]=strip.scrollLeft || 0;
      }
      function syncWeatherHomeHourlyScroll(){
        var strip=document.querySelector('#weatherHomeContent .weather-hourly-strip');
        if(!strip) return;
        var active=strip.querySelector('.weather-hour-card.is-active');
        var dayKey=weatherHomeSelectedDayKey;
        var saved=dayKey && weatherHomeHourlyScrollByDay[dayKey];
        var targetTime=weatherHomePendingHourScrollTime;
        weatherHomePendingHourScrollTime=null;

        if(active && targetTime!=null){
          var desired=active.offsetLeft - Math.max(12, (strip.clientWidth - active.offsetWidth) / 2);
          strip.scrollLeft=Math.max(0, desired);
        } else if(saved!=null && isFinite(Number(saved))){
          strip.scrollLeft=Math.max(0, Number(saved));
        } else if(active){
          var left=active.offsetLeft;
          var right=left + active.offsetWidth;
          if(left < strip.scrollLeft || right > strip.scrollLeft + strip.clientWidth){
            strip.scrollLeft=Math.max(0, active.offsetLeft - Math.max(12, (strip.clientWidth - active.offsetWidth) / 2));
          }
        }

        if(dayKey){
          weatherHomeHourlyScrollByDay[dayKey]=strip.scrollLeft || 0;
          strip.addEventListener('scroll', function(){
            weatherHomeHourlyScrollByDay[dayKey]=strip.scrollLeft || 0;
          }, {passive:true});
        }
      }
      function renderWeatherHome(){
        if(activeMode !== 'weather') return;
        var content=document.getElementById('weatherHomeContent'); if(!content) return;
        rememberWeatherHomeHourlyScroll();
        if(!Array.isArray(weatherTimeseries) || !weatherTimeseries.length){
          renderWeatherHomeEmpty('Välj plats', 'Använd min plats eller sök efter en plats för att visa prognosen.', true);
          return;
        }
        var selected=weatherHomeSelectedTime || getAnalysisFocusTime() || getSelectedAppTime();
        var item=findNearestWeatherItem(selected) || weatherTimeseries[0];
        var timeMs=getWeatherItemTimeMs(item) || Date.now();
        var selectedDayKey=weatherHomeSelectedDayKey || getWeatherDayKeyFromTime(timeMs);
        if(getWeatherDayKeyFromTime(timeMs)!==selectedDayKey){
          var dayTime=firstUsefulWeatherTimeForDay(selectedDayKey);
          if(dayTime!=null){
            timeMs=dayTime;
            item=findNearestWeatherItem(timeMs) || item;
          } else {
            selectedDayKey=getWeatherDayKeyFromTime(timeMs);
          }
        }
        weatherHomeSelectedTime=timeMs;
        weatherHomeSelectedDayKey=selectedDayKey;
        var data=item.data || {}, inst=(data.instant && data.instant.details) || {};
        var symbol=getItemSymbol(item);
        var precip=getForecastPrecipitation(item);
        var precipHomeSummary=summarizePrecipitationForCard(timeMs, precip.amount, weatherHomeNowcastData, precip.hours);
        var gust=getNearestGustRaw(timeMs);
        var dayKey=getWeatherDayKeyFromTime(timeMs);
        var day=(currentForecastDays||[]).find(function(d){return d.date===dayKey;}) || null;
        var place=(selectedPlaceName && selectedPlaceName.trim()) ? selectedPlaceName.trim() : 'Min plats';
        var titlePrefix= place==='Min plats' ? 'Min plats' : 'Min plats · ' + place;
        var temp=inst.air_temperature;
        var feels=inst.apparent_temperature != null ? inst.apparent_temperature : calculateFeelsLikeTemperature(inst.air_temperature, inst.wind_speed, inst.relative_humidity);
        var condition=weatherLabelFromSymbol(symbol);
        var windDir=degreesToCompass(inst.wind_from_direction);
        var updated=weatherHomeLastUpdatedAt ? formatClockDotGlobal(weatherHomeLastUpdatedAt) : formatClockDotGlobal(Date.now());
        var hourlyItems=getHourlyWeatherItems(weatherHomeSelectedDayKey);
        if(!hourlyItems.length){
          weatherHomeSelectedDayKey=getWeatherDayKeyFromTime(timeMs);
          hourlyItems=getHourlyWeatherItems(weatherHomeSelectedDayKey);
        }
        var nowLabelTime=null;
        if(weatherHomeSelectedDayKey===getWeatherDayKeyFromTime(Date.now()) && hourlyItems.length){
          var nowTs=Date.now();
          hourlyItems.forEach(function(hourItem){
            var ht=getWeatherItemTimeMs(hourItem);
            if(ht==null) return;
            if(nowLabelTime==null || Math.abs(ht-nowTs)<Math.abs(nowLabelTime-nowTs)) nowLabelTime=ht;
          });
        }
        var hourly=hourlyItems.map(function(hourItem){
          var hTime=getWeatherItemTimeMs(hourItem); var hInst=(hourItem.data&&hourItem.data.instant&&hourItem.data.instant.details)||{}; var hPrecip=getForecastPrecipitation(hourItem); var active=Math.abs(hTime-timeMs)<31*60*1000;
          var label=(nowLabelTime!=null && hTime===nowLabelTime) ? 'Nu' : formatClockDotGlobal(hTime).replace('.',':');
          var rainText=hPrecip.amount!=null && Number(hPrecip.amount)>0 ? compactRain(hPrecip.amount) : '0 mm';
          return '<button type="button" class="weather-hour-card '+(active?'is-active':'')+'" data-weather-hour="'+String(hTime)+'">'+
            '<span class="weather-hour-time">'+escapeHtml(label)+'</span>'+
            '<span class="weather-hour-icon">'+weatherIconFromSymbol(getItemSymbol(hourItem))+'</span>'+
            '<span class="weather-hour-temp">'+escapeHtml(compactTemp(hInst.air_temperature))+'</span>'+
            '<span class="weather-hour-rain">💧 '+escapeHtml(rainText)+'</span>'+
          '</button>';
        }).join('');
        var daysHtml=buildWeatherHomeDailyRows(weatherHomeSelectedDayKey);
        content.innerHTML=
          '<div class="weather-location-card" id="weatherHomePlaceBtn" role="group" aria-label="Plats och platsval">'+
            '<div class="weather-location-pin"><svg viewBox="0 0 24 24"><path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z"></path><circle cx="12" cy="10" r="2.5"></circle></svg></div>'+
            '<div class="weather-location-main"><div class="weather-location-title">'+escapeHtml(titlePrefix)+'</div><div class="weather-location-sub">Prognos för vald plats</div></div>'+
            '<button class="weather-location-action" type="button" id="weatherHomeLocateBtn" aria-label="Använd min plats"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"></circle><path d="M12 3v3M12 18v3M3 12h3M18 12h3"></path></svg></button>'+
            '<div class="weather-place-actions" aria-label="Platsval">'+
              '<button class="weather-place-action primary" type="button" id="weatherHomeSearchBtn"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>Sök plats</button>'+
              '<button class="weather-place-action" type="button" id="weatherHomePlacesBtn"><svg viewBox="0 0 24 24"><path d="M5 4h14v17l-7-4-7 4V4Z"></path></svg>Sparade</button>'+
              '<button class="weather-place-action" type="button" id="weatherHomeUseMyBtn"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"></circle><path d="M12 3v3M12 18v3M3 12h3M18 12h3"></path></svg>Min plats</button>'+
            '</div>'+
          '</div>'+
          '<div class="weather-hero-card">'+
            '<div class="weather-hero-top"><div><div class="weather-hero-temp">'+escapeHtml(compactTemp(temp))+'</div></div><div class="weather-hero-icon">'+weatherIconFromSymbol(symbol)+'</div></div>'+
            '<div class="weather-hero-condition">'+escapeHtml(condition)+'</div>'+
            '<div class="weather-hero-meta">'+(feels !== '--' ? '<span class="weather-chip">Känns som '+escapeHtml(compactTemp(feels))+'</span>' : '')+'<span class="weather-highlow">Högst <strong>'+escapeHtml(compactTemp(day&&day.maxTemp))+'</strong> · Lägst <strong style="color:#6fb8ff">'+escapeHtml(compactTemp(day&&day.minTemp))+'</strong></span></div>'+
            '<div class="weather-hero-metrics"><div class="weather-hero-metric"><span>Vind</span><strong>'+escapeHtml(compactWind(inst.wind_speed))+'</strong><small>'+escapeHtml(windDir)+'</small></div><div class="weather-hero-metric"><span>Byvind</span><strong>'+escapeHtml(compactWind(gust))+'</strong><small>Max nära vald tid</small></div><div class="weather-hero-metric"><span>Nederbörd</span><strong>'+escapeHtml(compactRain(precipHomeSummary.amount))+'</strong><small>'+escapeHtml(precipHomeSummary.label || (formatForecastPeriodRange(timeMs, precip.hours) || 'per timme'))+'</small></div></div>'+
          '</div>'+
          '<div class="weather-section-card"><div class="weather-section-head"><div class="weather-section-title">'+escapeHtml(getWeatherDayLabel(weatherHomeSelectedDayKey))+'</div><div class="weather-section-hint">Svep för timmar</div></div><div class="weather-hourly-strip">'+hourly+'</div></div>'+
          '<div class="weather-section-card"><div class="weather-section-head"><div class="weather-section-title">Kommande dagar</div><div class="weather-section-hint">'+escapeHtml((currentForecastDays||[]).length)+' dygn</div></div><div class="weather-days-list">'+daysHtml+'</div></div>'+
          '<div class="weather-home-footer weather-home-footer--solo"><span>Uppdaterad '+escapeHtml(updated)+'</span></div>';
        content.querySelectorAll('[data-weather-hour]').forEach(function(btn){btn.addEventListener('click',function(){var t=Number(btn.getAttribute('data-weather-hour')); if(isFinite(t)){rememberWeatherHomeHourlyScroll(); weatherHomeSelectedTime=t; weatherHomeSelectedDayKey=getWeatherDayKeyFromTime(t); weatherHomePendingHourScrollTime=t; setSelectedAppTime(t,{noClamp:false}); if(typeof syncForecastTimeToLayers==='function') syncForecastTimeToLayers(t); renderWeatherHome();}});});
        content.querySelectorAll('[data-weather-day]').forEach(function(btn){btn.addEventListener('click',function(){var key=btn.getAttribute('data-weather-day'); if(!key) return; rememberWeatherHomeHourlyScroll(); var t=firstUsefulWeatherTimeForDay(key); weatherHomeSelectedDayKey=key; if(t!=null){weatherHomeSelectedTime=t; weatherHomePendingHourScrollTime=t; setSelectedAppTime(t,{noClamp:false}); if(typeof syncForecastTimeToLayers==='function') syncForecastTimeToLayers(t);} renderWeatherHome();});});
        var locate=document.getElementById('weatherHomeLocateBtn'); if(locate) locate.addEventListener('click',function(e){e.stopPropagation();requestWeatherHomeLocation({force:true});});
        var weatherSearch=document.getElementById('weatherHomeSearchBtn'); if(weatherSearch) weatherSearch.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();if(typeof openSearch==='function') openSearch();});
        var weatherPlaces=document.getElementById('weatherHomePlacesBtn'); if(weatherPlaces) weatherPlaces.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();if(typeof openPlaces==='function') openPlaces();});
        var weatherUseMy=document.getElementById('weatherHomeUseMyBtn'); if(weatherUseMy) weatherUseMy.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();requestWeatherHomeLocation({force:true});});
        var placeBtn=document.getElementById('weatherHomePlaceBtn'); if(placeBtn) placeBtn.addEventListener('click',function(e){if(e.target && e.target.closest && e.target.closest('#weatherHomeLocateBtn')) return; if(typeof openSearch==='function') openSearch();});
        requestAnimationFrame(syncWeatherHomeHourlyScroll);
      }
      async function requestWeatherHomeLocation(options){
        options=options||{};
        if(!options.force && savedSelections && savedSelections.weather && weatherTimeseries && weatherTimeseries.length) return;
        if(!navigator.geolocation){renderWeatherHomeEmpty('Plats saknas','Din webbläsare stödjer inte platsåtkomst. Sök efter en plats istället.',true);return;}
        if(!options.force && weatherHomeAutoLocationRequested) return;
        weatherHomeAutoLocationRequested=true;
        renderWeatherHomeEmpty('Hämtar din plats','Vi väljer automatiskt vädret för din position.',false);
        navigator.geolocation.getCurrentPosition(async function(pos){
          var lat=pos && pos.coords && pos.coords.latitude, lon=pos && pos.coords && pos.coords.longitude;
          if(!isFinite(Number(lat)) || !isFinite(Number(lon))){renderWeatherHomeEmpty('Plats saknas','Vi kunde inte läsa din position. Sök efter en plats istället.',true);return;}
          clearWeatherSelectionMarker();
          saveSelection('weather',{lat:Number(lat),lon:Number(lon)});
          selectedPlaceName='';
          try{selectedPlaceName=await reverseGeocodePlace(Number(lat),Number(lon));}catch(e){selectedPlaceName='';}
          weatherHomeSelectedTime=Date.now();
          weatherHomeSelectedDayKey=getWeatherDayKeyFromTime(Date.now());
          loadWeatherForPoint(Number(lat),Number(lon));
          try{centerMapOnUserLocationOnce({immediate:true,ensureUsefulZoom:true});}catch(e){}
        },function(){
          renderWeatherHomeEmpty('Välj plats','Platsåtkomst är inte aktiverad. Sök eller tryck på min plats igen.',true);
        },{enableHighAccuracy:true,maximumAge:60000,timeout:10000});
      }

      function applyAutoLocationToMode(mode, coords){
        if(!coords) return;
        var lat=Number(coords.latitude), lon=Number(coords.longitude);
        if(!isFinite(lat) || !isFinite(lon)) return;

        handleUserPosition(coords, {
          allowCameraFollow: mode === "nautical",
          allowWeatherRefresh: false,
          immediateCamera: true
        });

        saveSelection('weather',{lat:lat,lon:lon});
        weatherSelectionMode="user";
        selectedPlaceName="";
        try{reverseGeocodePlace(lat,lon).then(function(name){selectedPlaceName=name||""; if(activeMode === "weather" && typeof renderWeatherHome === "function") renderWeatherHome();});}catch(e){}
        loadWeatherForPoint(lat,lon);

        if(mode === "advanced"){
          selectAdvancedPoint(lat, lon, {openSheet:false});
          centerMapOnUserLocationOnce({immediate:true,ensureUsefulZoom:true});
          setTimeout(function(){centerMapOnUserLocationOnce({immediate:true,ensureUsefulZoom:true});},220);
        }else if(mode === "nautical"){
          userTrackingMode = "follow";
          nauticalCompassMode = "north";
          updateNauticalCompassHud();
          updateNavigationCamera({immediate:true});
          setTimeout(function(){updateNavigationCamera({immediate:true});},260);
        }
      }

      function requestModeAutoLocation(mode, options){
        options = options || {};
        mode = mode === "nautical" ? "nautical" : (mode === "advanced" ? "advanced" : "weather");
        if(mode !== "advanced" && mode !== "nautical") return;
        if(!navigator.geolocation) return;

        if(options.onlyOnce){
          if(mode === "advanced" && advancedAutoLocationRequested) return;
          if(mode === "nautical" && nauticalAutoLocationRequested) return;
          if(mode === "advanced") advancedAutoLocationRequested = true;
          if(mode === "nautical") nauticalAutoLocationRequested = true;
        }

        // Om vi redan har en färsk position använder vi den direkt för att undvika onödiga promptar.
        if(hasUserPosition() && Date.now() - Number(userPositionState.updatedAt || 0) < 2 * 60 * 1000){
          applyAutoLocationToMode(mode, {
            latitude:userPositionState.lat,
            longitude:userPositionState.lon,
            accuracy:userPositionState.accuracy,
            speed:userPositionState.speed,
            heading:userPositionState.rawHeading
          });
          return;
        }

        navigator.geolocation.getCurrentPosition(function(pos){
          if(activeMode !== mode) return;
          applyAutoLocationToMode(mode, pos && pos.coords);
        },function(){
          // Tyst fallback: om plats nekas behåller vi sparad/manuell plats och befintlig karta.
          if(mode === "advanced"){
            prepareAdvancedFromExistingSelection(false);
          }
        },{enableHighAccuracy:true,maximumAge:60000,timeout:10000});
      }
 function loadWeatherForPoint(lat, lon){
  var requestId = ++latestWeatherRequestId;

  setOverlayHeaderDot('loading');
  updateMapOverlay('Hämtar väder...', formatCoord(lat) + ', ' + formatCoord(lon));

  Promise.all([
    fetch('/api/weather?lat=' + lat + '&lon=' + lon),
    fetch('/api/openmeteo-gust?lat=' + lat + '&lon=' + lon).catch(function(){ return null; }),
    fetch('/api/yr-nowcast?lat=' + lat + '&lon=' + lon).catch(function(){ return null; }),
    fetchOpenMeteoUvTimeseries(lat, lon)
  ]).then(async function(responses){
    if(requestId !== latestWeatherRequestId) return;

    var weatherRes = responses[0];
    var gustRes = responses[1];
    var nowcastRes = responses[2];
    var uvTimeseries = Array.isArray(responses[3]) ? responses[3] : [];

    var weatherText = await weatherRes.text();
    var gustText = gustRes ? await gustRes.text() : "";
    var nowcastText = nowcastRes ? await nowcastRes.text() : "";

    if(requestId !== latestWeatherRequestId) return;

    if(!weatherRes.ok) throw new Error(weatherText);

    var weatherData = JSON.parse(weatherText);
    var ts = (weatherData.properties && weatherData.properties.timeseries) || [];

    if(!ts.length) throw new Error('Ingen väderdata hittades.');

    weatherTimeseries = ts;
    weatherGustTimeseries = [];
    loadWeatherAnalysisHistory(lat, lon);

    var gustFormatted = '--';
    var gustTimeseries = [];

    if(gustRes && gustRes.ok){
      try{
        var gd = JSON.parse(gustText);
        gustFormatted = formatWind(gd.value);
        gustTimeseries = gd.timeseries || [];
        weatherGustTimeseries = gustTimeseries;
      }catch(e){
        gustFormatted = '--';
        gustTimeseries = [];
        weatherGustTimeseries = [];
      }
    }

    updateNauticalStatusPanel();

    var nowcastData = null;

    if(nowcastRes && nowcastRes.ok){
      try{
        nowcastData = JSON.parse(nowcastText);
      }catch(e){
        nowcastData = null;
      }
    }

    weatherHomeNowcastData = nowcastData;

    function getGustForTime(tms){
      if(!gustTimeseries.length) return gustFormatted;

      var target = roundToForecastHour(tms);
      var cl = gustTimeseries[0];
      var md = Math.abs(new Date(cl.time).getTime() - target);

      for(var i = 0; i < gustTimeseries.length; i++){
        var df = Math.abs(new Date(gustTimeseries[i].time).getTime() - target);

        if(df < md){
          md = df;
          cl = gustTimeseries[i];
        }
      }

      return formatWind(cl.value);
    }

    function getUvForTime(tms){
      return findNearestHourlyValue(uvTimeseries, tms, [
        "uvIndex",
        "uv_index",
        "value"
      ]);
    }

    var historicalWeatherCache = new Map();
    var historicalWeatherRequestSeq = 0;

    function dateKeyForWeatherHistory(timeValue){
      var d = new Date(timeValue);
      if(isNaN(d.getTime())) return null;

      var year = d.getFullYear();
      var month = String(d.getMonth() + 1).padStart(2, "0");
      var day = String(d.getDate()).padStart(2, "0");

      return year + "-" + month + "-" + day;
    }

    function isHistoricalWeatherTime(timeValue){
      if(!weatherTimeseries.length) return false;

      var firstForecastTime = new Date(weatherTimeseries[0].time).getTime();

      if(!isFinite(firstForecastTime)) return false;

      return Number(timeValue) < firstForecastTime - (30 * 60 * 1000);
    }

    function findNearestItemInTimeseries(items, timeValue){
      if(!Array.isArray(items) || !items.length) return null;

      var targetTime = roundToForecastHour(timeValue);
      var best = items[0];
      var bestDiff = Math.abs(new Date(best.time).getTime() - targetTime);

      for(var i = 1; i < items.length; i++){
        var itemTime = new Date(items[i].time).getTime();
        var diff = Math.abs(itemTime - targetTime);

        if(diff < bestDiff){
          best = items[i];
          bestDiff = diff;
        }
      }

      return best;
    }

    function fetchHistoricalWeatherForTime(timeValue){
      var dateKey = dateKeyForWeatherHistory(timeValue);

      if(!dateKey) return Promise.resolve(null);
      if(historicalWeatherCache.has(dateKey)) return historicalWeatherCache.get(dateKey);

      var promise = fetch(
        '/api/openmeteo-history?lat=' + encodeURIComponent(lat) +
        '&lon=' + encodeURIComponent(lon) +
        '&date=' + encodeURIComponent(dateKey)
      ).then(function(res){
        return res.text().then(function(text){
          if(!res.ok) throw new Error(text || 'Historiskt väder kunde inte hämtas.');
          return JSON.parse(text);
        });
      }).then(function(data){
        return (data.properties && data.properties.timeseries) || [];
      }).catch(function(err){
        console.warn('Historiskt väder kunde inte hämtas', err);
        historicalWeatherCache.delete(dateKey);
        return null;
      });

      historicalWeatherCache.set(dateKey, promise);

      return promise;
    }

    function buildWeatherOverlay(pt, temp, feelsLike, ws, wd, gust, rain, pres, humidity, symbol, lat, lon, precipSummary, uvIndex){
      var detailsButtonText = weatherDetailsExpanded ? 'Visa mindre' : 'Se mer';
      var placeName = (selectedPlaceName && selectedPlaceName.trim()) ? selectedPlaceName.trim() : 'Vald plats';
      var weatherText = weatherLabelFromSymbol(symbol);
      var weatherIcon = weatherIconFromSymbol(symbol);
      var forecastLabel = formatForecastLabelGlobal(pt);
      var tempText = formatTemp(temp);
      var feelsLikeText = formatFeelsLike(feelsLike);
      var windText = formatWindWithDirection(ws, wd);
      var gustText = gust || '--';
      var pressureText = formatPressure(pres);
      var humidityText = formatHumidity(humidity);
      var uvText = formatUvMetric(uvIndex);

  var detailsItems = [
  {label:'Lufttryck', value:pressureText},
  {label:'Luftfuktighet', value:humidityText}
];

if(uvText !== "--"){
  detailsItems.push({
    label:'UV-index',
    value:uvText
  });
}

detailsItems.push({
  label:'Koordinater',
  value:formatCoord(lat) + ', ' + formatCoord(lon)
});

var detailsHtml = weatherDetailsExpanded
  ? '<div class="weather-extra-details">' +
      buildOverlayDataGrid(detailsItems) +
    '</div>'
  : '';

      var precipitationMetric = buildPrecipitationMetric(
        precipSummary || summarizePrecipitationForCard(pt, rain, null, 1)
      );

      var feelsLikeLine = feelsLikeText !== "--"
        ? '<div class="weather-feels-like">Känns som ' + escapeHtml(feelsLikeText) + '</div>'
        : '';

   

      var content =
        '<div class="weather-overview">' +
          '<div class="weather-icon">' + weatherIcon + '</div>' +
          '<div class="weather-main">' +
            '<div class="weather-main-title">' + escapeHtml(weatherText) + '</div>' +
            '<div class="weather-main-time">' + escapeHtml(placeName) + ' · ' + escapeHtml(forecastLabel) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="weather-temp-big">' + tempText + '</div>' +
        feelsLikeLine +
        '<div class="weather-primary-metrics">' +
          '<div class="weather-metric-line"><strong>Vind</strong> ' + windText + '</div>' +
    '<div class="weather-metric-line"><strong>Byvind</strong> ' + gustText + '</div>' +
precipitationMetric +
'</div>' +
        '<div class="weather-point-actions">' +
          '<button type="button" class="weather-favorite-btn" id="saveFavoriteBtn">' + (isFavorite(lat, lon) ? 'Sparad' : 'Spara plats') + '</button>' +
          '<button type="button" class="weather-details-toggle" id="weatherDetailsToggleBtn">' + detailsButtonText + '</button>' +
        '</div>' +
        detailsHtml;

      return {
        expandedTitle: placeName,
        collapsedTitle: weatherIcon + ' ' + weatherText + ' · ' + tempText,
        content: content
      };
    }

    function applyWeatherOverlay(payload){
      updateMapOverlay(payload.expandedTitle, payload.content, {
        expandedTitle: payload.expandedTitle,
        collapsedTitle: payload.collapsedTitle
      });
    }

    window.updateWeatherForSelectedTime = function(timeValue){
      var targetTime = roundToForecastHour(timeValue || selectedForecastTime);

      if(!weatherTimeseries.length || !targetTime || !isFinite(targetTime)) return;

      var renderSeq = ++historicalWeatherRequestSeq;

      function renderWeatherItem(cl, options){
        options = options || {};

        if(!cl || renderSeq !== historicalWeatherRequestSeq) return;

        var matchedForecastTime = roundToForecastHour(new Date(cl.time).getTime());

        var data = cl.data || {};
        var si = (data.instant && data.instant.details) || {};
        var sn1 = data.next_1_hours || {};
        var sn6 = data.next_6_hours || {};
        var sn12 = data.next_12_hours || {};

        var ss =
          (sn1.summary && sn1.summary.symbol_code) ||
          (sn6.summary && sn6.summary.symbol_code) ||
          (sn12.summary && sn12.summary.symbol_code) ||
          null;

        var precip = getForecastPrecipitation(cl);
        var sp = precip.amount;

        var precipSummary = summarizePrecipitationForCard(
          matchedForecastTime,
          sp,
          options.isHistorical ? null : nowcastData,
          precip.hours
        );

        var feelsLike = si.apparent_temperature != null
          ? si.apparent_temperature
          : calculateFeelsLikeTemperature(
              si.air_temperature,
              si.wind_speed,
              si.relative_humidity
            );

        var uvIndex = options.isHistorical ? null : getUvForTime(matchedForecastTime);
        var gust = si.wind_speed_of_gust != null
          ? formatWind(si.wind_speed_of_gust)
          : getGustForTime(matchedForecastTime);

        applyWeatherOverlay(
          buildWeatherOverlay(
            matchedForecastTime,
            si.air_temperature,
            feelsLike,
            si.wind_speed,
            si.wind_from_direction,
            gust,
            sp,
            si.air_pressure_at_sea_level,
            si.relative_humidity,
            ss,
            lat,
            lon,
            precipSummary,
            uvIndex
          )
        );
      }

      if(isHistoricalWeatherTime(targetTime)){
        fetchHistoricalWeatherForTime(targetTime).then(function(historyItems){
          if(renderSeq !== historicalWeatherRequestSeq) return;

          var historicalItem = findNearestItemInTimeseries(historyItems, targetTime);

          if(historicalItem){
            renderWeatherItem(historicalItem, {isHistorical:true});
          }else{
            updateMapOverlay('Väder saknas', 'Det finns ingen väderdata för den valda tiden.');
          }
        });

        return;
      }

      renderWeatherItem(findNearestWeatherTimeseriesItem(targetTime));
    };

    if(requestId !== latestWeatherRequestId) return;

    var targetTime = selectedForecastTime
      ? roundToForecastHour(selectedForecastTime)
      : roundToForecastHour(Date.now());

    setSelectedAppTime(targetTime);

    window.updateWeatherForSelectedTime(selectedForecastTime);

    currentForecastDays = buildDailyForecast(ts);
    if(activeMode === 'weather'){
      if(!weatherHomeSelectedDayKey) weatherHomeSelectedDayKey=getWeatherDayKeyFromTime(weatherHomeSelectedTime || Date.now());
      if(weatherHomeSelectedTime==null) weatherHomeSelectedTime=Date.now();
    }
    weatherHomeLastUpdatedAt = Date.now();
    if(activeMode === "weather" && typeof renderWeatherHome === "function") renderWeatherHome();
    if(activeMode === "advanced") renderAdvancedAccordion();
    setOverlayHeaderDot('ready');
  }).catch(function(err){
    if(requestId !== latestWeatherRequestId) return;

    console.error(err);
    setOverlayHeaderDot('ready');
    updateMapOverlay('Väder kunde inte hämtas', 'Försök igen eller välj en annan punkt på kartan.');
    if(activeMode === "weather" && typeof renderWeatherHomeEmpty === "function") renderWeatherHomeEmpty('Väder kunde inte hämtas', 'Försök igen eller välj en annan plats.', true);
  });
}

      async function fetchNearestPlaceByType(lat,lon,type){
        try{var url="https://api.maptiler.com/geocoding/"+encodeURIComponent(String(lon)+","+String(lat))+".json?key="+MAPTILER_API_KEY+"&language=sv&limit=10&types="+encodeURIComponent(type);var res=await fetch(url);var data=await res.json();var features=Array.isArray(data&&data.features)?data.features:[];if(!features.length) return "";var best=null,bestDist=Infinity;features.forEach(function(feature){if(!feature||!Array.isArray(feature.center)||feature.center.length<2) return;var fLon=Number(feature.center[0]), fLat=Number(feature.center[1]);if(!isFinite(fLat)||!isFinite(fLon)) return;var dist=distanceKmBetween(lat,lon,fLat,fLon);if(dist<bestDist){bestDist=dist;best=feature;}});return extractPlaceLabel(best);}catch(e){console.warn("MapTiler typ-sökning misslyckades", type, e);return "";}
      }
      function extractPlaceLabel(feature){if(!feature) return "";var props=feature.properties||{};var name=props.name||feature.text||feature.place_name||"";if(!name) return "";return String(name).split(",")[0].trim();}
      async function reverseGeocodePlace(lat,lon){
        var typeOrder=["municipality","city","town","village","locality","hamlet"];
        for(var i=0;i<typeOrder.length;i++){var place=await fetchNearestPlaceByType(lat,lon,typeOrder[i]);if(place) return place;}
        try{var fallbackUrl="https://api.maptiler.com/geocoding/"+encodeURIComponent(String(lon)+","+String(lat))+".json?key="+MAPTILER_API_KEY+"&language=sv&limit=1";var fallbackRes=await fetch(fallbackUrl);var fallbackData=await fallbackRes.json();var fallbackFeatures=Array.isArray(fallbackData&&fallbackData.features)?fallbackData.features:[];if(fallbackFeatures.length) return extractPlaceLabel(fallbackFeatures[0]);return "";}catch(e){console.warn("Reverse geocoding misslyckades", e);return "";}
      }

      async function handlePrimaryMapClick(lat,lon){
        if(Date.now()-lastObjectInteractionAt<500) return;
        weatherSelectionMode="manual"; weatherDetailsExpanded=false; syncWeatherOverlayExpandedState(); saveSelection('weather',{lat:lat,lon:lon}); setWeatherMarker(lat,lon); setMaptilerWeatherMarker(lat,lon);
        selectedPlaceName=""; updateMapOverlay("Hämtar plats...","Söker närmaste plats...");
        try{selectedPlaceName=await reverseGeocodePlace(lat,lon);}catch(e){selectedPlaceName="";}
        loadWeatherForPoint(lat,lon);
      }
      function selectAdvancedPoint(lat, lon, options){
        options = options || {};
        seaSelectionActive=true;
        selectedSeaArea={lat:lat,lon:lon,radiusKm:seaAreaRadiusKm,selectedAt:Date.now()};
        selectedSeaAreaData=null;
        selectedSeaTimeseriesData=null;
        updateSeaAreaLayer();
        renderAdvancedAccordion();
        loadSeaAreaData(lat,lon,seaAreaRadiusKm);
        loadSeaTimeseriesData(lat,lon,seaAreaRadiusKm);
        openAdvancedSheet(options.openSheet !== false);
      }
      function prepareAdvancedFromExistingSelection(openSheet){
        var sel = savedSelections && savedSelections.weather ? savedSelections.weather : null;
        if(sel && isFinite(Number(sel.lat)) && isFinite(Number(sel.lon))){
          selectAdvancedPoint(Number(sel.lat), Number(sel.lon), {openSheet: !!openSheet});
          if(!weatherTimeseries || !weatherTimeseries.length){
            loadWeatherForPoint(Number(sel.lat), Number(sel.lon));
          }
          return true;
        }
        if(typeof hasUserPosition === 'function' && hasUserPosition()){
          selectAdvancedPoint(userPositionState.lat, userPositionState.lon, {openSheet: !!openSheet});
          saveSelection('weather',{lat:userPositionState.lat,lon:userPositionState.lon});
          loadWeatherForPoint(userPositionState.lat,userPositionState.lon);
          return true;
        }
        updateAdvancedTrayButton();
        return false;
      }
      function handleMapClick(lat,lon){
        if(activeMode === "advanced"){
          handlePrimaryMapClick(lat,lon);
          selectAdvancedPoint(lat,lon,{openSheet:false});
          return;
        }
        if(activeMode === "nautical"){
          handlePrimaryMapClick(lat,lon);
          return;
        }
        if(isSeaActive()){selectSeaArea(lat,lon);return;}
        handlePrimaryMapClick(lat,lon);
      }
      map.on('click',function(e){handleMapClick(e.latlng.lat,e.latlng.lng);});

      var overlayCollapseBtn=document.getElementById('overlayCollapseBtn'), mapOverlayPanel=document.getElementById('mapOverlayPanel'), overlayContentEl=document.getElementById('overlayContent');
      function updateOverlayCollapseButtonText(){if(!overlayCollapseBtn || !mapOverlayPanel) return; overlayCollapseBtn.textContent=mapOverlayPanel.classList.contains('is-collapsed')?'Visa':'Dölj';}
      function syncWeatherOverlayExpandedState(){if(!mapOverlayPanel) return; mapOverlayPanel.classList.toggle("weather-expanded",!!weatherDetailsExpanded); refreshMapSizeSoon();}
      function toggleOverlayCollapsed(forceState){if(!mapOverlayPanel) return;if(typeof forceState==='boolean') mapOverlayPanel.classList.toggle('is-collapsed',forceState); else mapOverlayPanel.classList.toggle('is-collapsed');updateOverlayCollapseButtonText();syncOverlayTitle();refreshMapSizeSoon();}
      if(overlayCollapseBtn) overlayCollapseBtn.addEventListener('click',function(e){e.stopPropagation();toggleOverlayCollapsed();});
      if(overlayContentEl){
        overlayContentEl.addEventListener("click",function(e){
          if(e.target && e.target.id==="weatherDetailsToggleBtn"){e.stopPropagation();weatherDetailsExpanded=!weatherDetailsExpanded;syncWeatherOverlayExpandedState();if(window.updateWeatherForSelectedTime) window.updateWeatherForSelectedTime();return;}
          if(e.target && e.target.id==="saveFavoriteBtn"){e.stopPropagation();var sel=savedSelections.weather;if(!sel) return;var favId=buildFavoriteId(sel.lat,sel.lon);if(isFavorite(sel.lat,sel.lon)) return;addFavorite({id:favId,name:selectedPlaceName || ("Plats "+formatCoord(sel.lat)+", "+formatCoord(sel.lon)),lat:sel.lat,lon:sel.lon,radiusKm:seaAreaRadiusKm,savedAt:Date.now()});if(window.updateWeatherForSelectedTime) window.updateWeatherForSelectedTime();}
        });
      }
      if(isMobileView()) toggleOverlayCollapsed(true); else updateOverlayCollapseButtonText();

      var filterDrawer=document.getElementById('filterDrawer'), filterToggleBtn=document.getElementById('filterToggleBtn'), filterCloseBtn=document.getElementById('filterCloseBtn');
      function closeFilterDrawer(){if(filterDrawer) filterDrawer.classList.add('is-hidden');}
      function protectFilterPanelClicks(panel){
        if(!panel) return;
        panel.addEventListener('click',function(e){e.stopPropagation();});
        panel.addEventListener('pointerdown',function(e){e.stopPropagation();});
        panel.addEventListener('mousedown',function(e){e.stopPropagation();});
        panel.addEventListener('touchstart',function(e){e.stopPropagation();},{passive:true});
      }
      protectFilterPanelClicks(filterDrawer);
      protectFilterPanelClicks(mobileFilterSheet);
      if(filterToggleBtn) filterToggleBtn.addEventListener('click',function(e){e.stopPropagation();if(filterDrawer) filterDrawer.classList.toggle('is-hidden');refreshMapSizeSoon();});
      if(filterCloseBtn) filterCloseBtn.addEventListener('click',function(e){e.stopPropagation();closeFilterDrawer();refreshMapSizeSoon();});

      function handleSaveSeaAreaClick(e){
        var saveBtn=e.target&&e.target.closest?e.target.closest("#saveSeaAreaBtn"):null;
        if(saveBtn){e.preventDefault();e.stopPropagation();if(!selectedSeaArea) return;var id=buildFavoriteId(selectedSeaArea.lat,selectedSeaArea.lon);if(isFavorite(selectedSeaArea.lat,selectedSeaArea.lon)) return;var name=window.prompt("Namn på platsen:","Plats "+formatCoord(selectedSeaArea.lat)+", "+formatCoord(selectedSeaArea.lon));if(name===null) return;name=String(name).trim();if(!name) name="Plats "+formatCoord(selectedSeaArea.lat)+", "+formatCoord(selectedSeaArea.lon);addFavorite({id:id,name:name,lat:selectedSeaArea.lat,lon:selectedSeaArea.lon,radiusKm:seaAreaRadiusKm,savedAt:Date.now()});renderSeaAreaPanel();return;}
        e.stopPropagation();
      }
      if(mobileSeaSheet) mobileSeaSheet.addEventListener("click", handleSaveSeaAreaClick);
      if(mobileSearchCloseBtn) mobileSearchCloseBtn.addEventListener('click',function(e){e.stopPropagation();closeSearch();});
      if(mobileFilterCloseBtn) mobileFilterCloseBtn.addEventListener('click',function(e){e.stopPropagation();closeMobileFilterSheet();});
      if(mobileSeaCloseBtn) mobileSeaCloseBtn.addEventListener('click',function(e){e.stopPropagation();closeSea();});
      var seaAreaTabBtn=document.getElementById('seaAreaTabBtn'); if(seaAreaTabBtn) seaAreaTabBtn.addEventListener('click',function(e){e.stopPropagation();setSeaMode('area');});
      var seaStationsTabBtn=document.getElementById('seaStationsTabBtn'); if(seaStationsTabBtn) seaStationsTabBtn.addEventListener('click',function(e){e.stopPropagation();setSeaMode('stations');});

      var tabWeather=document.getElementById('tabWeather'); if(tabWeather) tabWeather.addEventListener("click",function(e){e.stopPropagation();setAppMode("weather");});
      var tabAdvanced=document.getElementById('tabAdvanced'); if(tabAdvanced) tabAdvanced.addEventListener("click",function(e){e.stopPropagation();if(activeMode==="advanced" && mobileSeaSheet && mobileSeaSheet.classList.contains("is-open")) closeAdvancedSheet(); else setAppMode("advanced",{openSheet:false});});
      var advancedTrayBtn=document.getElementById('advancedTrayBtn'); if(advancedTrayBtn) advancedTrayBtn.addEventListener('click',function(e){e.stopPropagation();if(activeMode!=="advanced"){setAppMode("advanced",{openSheet:true});return;} if(mobileSeaSheet && mobileSeaSheet.classList.contains("is-open")){closeAdvancedSheet();return;} if(!selectedSeaArea) prepareAdvancedFromExistingSelection(true); openAdvancedSheet(true);});
      var tabNautical=document.getElementById('tabNautical'); if(tabNautical) tabNautical.addEventListener('click',function(e){e.stopPropagation();setAppMode("nautical");});
      var quickLayerBtn=document.getElementById('quickLayerBtn'); if(quickLayerBtn){
        ['pointerdown','touchstart','mousedown'].forEach(function(evtName){
          quickLayerBtn.addEventListener(evtName,function(e){e.stopPropagation();},{passive:true});
        });
        quickLayerBtn.addEventListener('click',function(e){
          e.preventDefault();
          e.stopPropagation();
          if(activeMode==='nautical' && typeof setNauticalFreeMapFromUserGesture==='function'){
            // Do not let this UI tap be interpreted as a chart pan/gesture.
            mapCameraProgrammaticUntil = Date.now() + 450;
          }
          if(mobileFilterSheet && mobileFilterSheet.classList.contains('is-open')) closeMobileFilterSheet(); else openMobileFilterSheet();
        });
      }
      var quickSearchBtn=document.getElementById('quickSearchBtn'); if(quickSearchBtn) quickSearchBtn.addEventListener('click',function(e){e.stopPropagation();if(mobileSearchSheet && mobileSearchSheet.classList.contains('is-open') && activeBottomTab==="search") closeSearch(); else openSearch();});
      var quickPlacesBtn=document.getElementById('quickPlacesBtn'); if(quickPlacesBtn) quickPlacesBtn.addEventListener('click',function(e){e.stopPropagation();if(mobileSearchSheet && mobileSearchSheet.classList.contains('is-open') && activeBottomTab==="places") closeSearch(); else openPlaces();});
      var modeSwitcher=document.getElementById('modeSwitcher'), modeSwitcherBtn=document.getElementById('modeSwitcherBtn');
      if(modeSwitcherBtn){modeSwitcherBtn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();if(modeSwitcher) modeSwitcher.classList.toggle('is-open');});}
      document.querySelectorAll('[data-mode-option]').forEach(function(btn){btn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();if(modeSwitcher) modeSwitcher.classList.remove('is-open');var nextMode=btn.getAttribute('data-mode-option') || 'weather';setAppMode(nextMode,{openSheet:false});});});
      document.querySelectorAll('[data-launch-mode]').forEach(function(btn){btn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();var nextMode=btn.getAttribute('data-launch-mode') || 'weather';setAppMode(nextMode,{openSheet:false});});});
      document.querySelectorAll('[data-weather-home-mode]').forEach(function(btn){btn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();var nextMode=btn.getAttribute('data-weather-home-mode') || 'weather';setAppMode(nextMode,{openSheet:false});});});

      function clickedInsideMapControl(target){return !!(target&&target.closest&&target.closest('.maplibregl-ctrl, .mapboxgl-ctrl, .maplibregl-popup, .mapboxgl-popup, #timeControl, #mapOverlayPanel, #weatherHomeView, #launchScreen, #modeSwitcher, #mobileQuickActions, #mobileSeaSheet, #mobileFilterSheet, #mobileSearchSheet')) ;}
      document.addEventListener('click',function(e){
        if(clickedInsideMapControl(e.target)) return;
        var clickedAdvancedTab=e.target&&e.target.closest?e.target.closest('#tabAdvanced'):null, clickedLayer=e.target&&e.target.closest?e.target.closest('#quickLayerBtn'):null, clickedSearch=e.target&&e.target.closest?e.target.closest('#quickSearchBtn'):null, clickedPlaces=e.target&&e.target.closest?e.target.closest('#quickPlacesBtn'):null;
        if(mobileSeaSheet&&mobileSeaSheet.classList.contains('is-open')&&!mobileSeaSheet.contains(e.target)&&!clickedAdvancedTab){var clickedMap=e.target&&e.target.closest&&e.target.closest('#maptilerMap, #map'); if(!clickedMap) closeAdvancedSheet();}
        if(mobileFilterSheet&&mobileFilterSheet.classList.contains('is-open')&&!mobileFilterSheet.contains(e.target)&&!clickedLayer) closeMobileFilterSheet();
        if(mobileSearchSheet&&mobileSearchSheet.classList.contains('is-open')&&!mobileSearchSheet.contains(e.target)&&!clickedSearch&&!clickedPlaces) closeSearch();
      });

      if(mobileSearchInput){
        mobileSearchInput.addEventListener('input',function(){
          clearTimeout(mobileSearchTimer);
          mobileSearchTimer=setTimeout(async function(){
            var q=mobileSearchInput.value.trim(), requestId=++mobileSearchRequestId;
            if(q.length<2){mobileSearchResults.innerHTML='';return;}
            try{var res=await fetch('https://api.maptiler.com/geocoding/'+encodeURIComponent(q)+'.json?key='+MAPTILER_API_KEY+'&language=sv');if(requestId!==mobileSearchRequestId) return;var data=await res.json();mobileSearchResults.innerHTML='';(data.features||[]).forEach(function(f){var div=document.createElement('div');div.className='search-result-item';div.textContent=f.place_name || f.text || 'Okänd plats';div.onclick=function(){var lon=f.center[0], lat=f.center[1];closeSearch();setTimeout(function(){focusMapOnPoint(lat,lon,9);handleMapClick(lat,lon);refreshMapSizeSoon();},120);};mobileSearchResults.appendChild(div);});}catch(err){if(requestId!==mobileSearchRequestId) return;console.error('Sökfel',err);mobileSearchResults.innerHTML='<div class="search-result-item">Sökningen kunde inte genomföras just nu.</div>';}
          },250);
        });
      }

      function createShipElement(rotation){var outer=document.createElement("div");outer.className="ais-ship-marker";outer.style.width="36px";outer.style.height="36px";outer.style.display="flex";outer.style.alignItems="center";outer.style.justifyContent="center";outer.style.cursor="pointer";outer.style.pointerEvents="auto";outer.style.touchAction="manipulation";outer.innerHTML='<div class="ais-ship-inner" style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;transform:rotate('+(Number(rotation)||0)+'deg);transform-origin:50% 50%;filter:drop-shadow(0 0 7px rgba(123,199,255,0.75));"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 L16 9 L15 17 L12 22 L9 17 L8 9 Z" fill="#7bc7ff" stroke="#ffffff" stroke-width="1.4"></path><circle cx="12" cy="10" r="2" fill="rgba(4,9,19,0.72)"></circle></svg></div>';return outer;}
      function firstDefined(){for(var i=0;i<arguments.length;i++){if(arguments[i]!==undefined&&arguments[i]!==null&&arguments[i]!=="") return arguments[i];}return null;}
      function getAisMmsi(v){return firstDefined(v.mmsi,v.MMSI,v.mmsiNumber,v.Mmsi,v.UserID,v.userId,v.user_id,v.static&&v.static.mmsi,v.static&&v.static.MMSI,v.MetaData&&v.MetaData.MMSI,v.metadata&&v.metadata.mmsi,v.Message&&v.Message.PositionReport&&v.Message.PositionReport.UserID,v.Message&&v.Message.StandardClassBPositionReport&&v.Message.StandardClassBPositionReport.UserID,v.Message&&v.Message.ExtendedClassBPositionReport&&v.Message.ExtendedClassBPositionReport.UserID);}
      function getAisLat(v){return firstDefined(v.lat,v.latitude,v.Latitude,v.LAT,v.y,v.position&&v.position.lat,v.position&&v.position.latitude,v.Position&&v.Position.Latitude,v.location&&v.location.lat,v.location&&v.location.latitude,v.Message&&v.Message.PositionReport&&v.Message.PositionReport.Latitude,v.Message&&v.Message.StandardClassBPositionReport&&v.Message.StandardClassBPositionReport.Latitude,v.Message&&v.Message.ExtendedClassBPositionReport&&v.Message.ExtendedClassBPositionReport.Latitude);}
      function getAisLon(v){return firstDefined(v.lon,v.lng,v.longitude,v.Longitude,v.LON,v.x,v.position&&v.position.lon,v.position&&v.position.lng,v.position&&v.position.longitude,v.Position&&v.Position.Longitude,v.location&&v.location.lon,v.location&&v.location.lng,v.location&&v.location.longitude,v.Message&&v.Message.PositionReport&&v.Message.PositionReport.Longitude,v.Message&&v.Message.StandardClassBPositionReport&&v.Message.StandardClassBPositionReport.Longitude,v.Message&&v.Message.ExtendedClassBPositionReport&&v.Message.ExtendedClassBPositionReport.Longitude);}
      function getAisCog(v){return firstDefined(v.cog,v.course,v.Course,v.courseOverGround,v.CourseOverGround,v.COG,v.Message&&v.Message.PositionReport&&v.Message.PositionReport.Cog,v.Message&&v.Message.PositionReport&&v.Message.PositionReport.COG,v.Message&&v.Message.StandardClassBPositionReport&&v.Message.StandardClassBPositionReport.Cog,v.Message&&v.Message.StandardClassBPositionReport&&v.Message.StandardClassBPositionReport.COG,v.Message&&v.Message.ExtendedClassBPositionReport&&v.Message.ExtendedClassBPositionReport.Cog,v.Message&&v.Message.ExtendedClassBPositionReport&&v.Message.ExtendedClassBPositionReport.COG);}
      function getAisSog(v){return firstDefined(v.sog,v.speed,v.Speed,v.speedOverGround,v.SpeedOverGround,v.SOG,v.Message&&v.Message.PositionReport&&v.Message.PositionReport.Sog,v.Message&&v.Message.PositionReport&&v.Message.PositionReport.SOG,v.Message&&v.Message.StandardClassBPositionReport&&v.Message.StandardClassBPositionReport.Sog,v.Message&&v.Message.StandardClassBPositionReport&&v.Message.StandardClassBPositionReport.SOG,v.Message&&v.Message.ExtendedClassBPositionReport&&v.Message.ExtendedClassBPositionReport.Sog,v.Message&&v.Message.ExtendedClassBPositionReport&&v.Message.ExtendedClassBPositionReport.SOG);}
      function getAisName(v){return firstDefined(v.name,v.shipName,v.ShipName,v.vesselName,v.VesselName,v.callsign,v.callSign,v.CallSign,v.static&&v.static.name,v.static&&v.static.shipName,v.static&&v.static.ShipName,v.MetaData&&v.MetaData.ShipName,v.metadata&&v.metadata.shipName) || "Fartyg";}
      function normalizeAisCourse(v){var n=Number(v);if(!isFinite(n)) return 0;return ((n%360)+360)%360;}
      function getAisKey(v){if(!v) return "";var mmsi=getAisMmsi(v);if(mmsi!=null&&mmsi!=="") return "mmsi:"+String(mmsi);var lat=Number(getAisLat(v)), lon=Number(getAisLon(v));if(isFinite(lat)&&isFinite(lon)) return "pos:"+lat.toFixed(4)+":"+lon.toFixed(4);return "";}
      function getAisTypeLabel(value){if(value==null||value==="") return "Okänd typ";var n=Number(value);if(!isFinite(n)){var s=String(value).trim();return s||"Okänd typ";}if(n===30) return "Fiskefartyg";if(n===31||n===32) return "Bogsering";if(n===33) return "Muddring / undervattensarbete";if(n===34) return "Dykfartyg";if(n===35) return "Militärt fartyg";if(n===36) return "Segelfartyg";if(n===37) return "Privat / fritidsfartyg";if(n>=40&&n<=49) return "Höghastighetsfartyg";if(n>=50&&n<=59) return "Service / specialfartyg";if(n>=60&&n<=69) return "Passagerarfartyg";if(n>=70&&n<=79) return "Lastfartyg";if(n>=80&&n<=89) return "Tanker / olja";if(n>=90&&n<=99) return "Annat fartyg";return "Okänd typ";}
      function getAisShipTypeValue(v){if(!v) return null;return (v.shipType ?? v.ShipType ?? v.type ?? v.Type ?? (v.static && (v.static.shipType ?? v.static.ShipType ?? v.static.Type ?? v.static.ShipAndCargoType)) ?? null);}
      function formatAisAge(lastSeenAt){var t=Number(lastSeenAt);if(!isFinite(t)) return "";var diffMs=Date.now()-t;if(diffMs<0) diffMs=0;var diffSec=Math.round(diffMs/1000);if(diffSec<60) return diffSec+" sek sedan";var diffMin=Math.round(diffSec/60);if(diffMin<60) return diffMin+" min sedan";return "";}
      function getAisPopupText(v){var lines=[];lines.push(getAisName(v));var mmsi=getAisMmsi(v);if(mmsi) lines.push("MMSI: "+mmsi);var shipTypeValue=getAisShipTypeValue(v);if(shipTypeValue!=null&&shipTypeValue!=="") lines.push("Typ: "+getAisTypeLabel(shipTypeValue)+" ("+shipTypeValue+")"); else lines.push("Typ: Okänd / ej skickad");var sog=getAisSog(v);if(sog!=null&&sog!=="") lines.push("Fart: "+Number(sog).toFixed(1)+" kn");var cog=getAisCog(v);if(cog!=null&&cog!=="") lines.push("Kurs: "+Math.round(Number(cog))+"°");var destination=firstDefined(v.destination,v.Destination,v.dest,v.static&&v.static.destination,v.static&&v.static.Destination);if(destination) lines.push("Destination: "+destination);var age=formatAisAge(v.lastSeenAt||v.receivedAt||v.timestamp||v.time||v.cachedAt);if(age) lines.push("Senast sedd: "+age);return lines.join("\n");}

var aisVesselCache=new Map(), aisLoadTimer=null, aisRefreshInterval=null, aisLatestRequestId=0, aisFetchInFlight=false, aisLastFetchAt=0, aisPendingLoadAfterCurrent=false;
var AIS_LISTEN_MS=isMobileView()?3000:5000, AIS_REFRESH_INTERVAL_MS=isMobileView()?45*1000:25*1000, AIS_MARKER_TTL_MS=20*60*1000, AIS_FETCH_THROTTLE_MS=isMobileView()?10000:7000, AIS_MAX_MARKERS=isMobileView()?90:250, AIS_MIN_ZOOM=isMobileView()?8:7, aisZoomBlocked=false, aisControlsReady=false;
      function syncAisToast(){var toast=document.getElementById('aisMapToast');if(!toast) return;toast.classList.toggle('is-visible',!!(showAisObjects && aisZoomBlocked));}
      function syncAisButtons(){
  var deskBtn=document.getElementById('toggleAisLayerBtn'), mobileBtn=document.getElementById('mobileToggleAisBtn');
  var label='Av';

  if(showAisObjects) label=aisZoomBlocked?'Zooma in':'På';

  if(deskBtn){
    deskBtn.textContent=label;
    deskBtn.disabled=!aisControlsReady;
    deskBtn.classList.toggle('is-disabled',!aisControlsReady);
    deskBtn.classList.toggle('is-on',showAisObjects&&!aisZoomBlocked);
    deskBtn.classList.toggle('is-off',!showAisObjects);
    deskBtn.classList.toggle('is-zoom-needed',showAisObjects&&aisZoomBlocked);
    deskBtn.title=showAisObjects&&aisZoomBlocked?'AIS är aktivt. Zooma in för att visa fartyg.':'';
  }

  if(mobileBtn){
    mobileBtn.disabled=!aisControlsReady;
    mobileBtn.classList.toggle('is-disabled',!aisControlsReady);
    mobileBtn.classList.toggle('is-on',showAisObjects&&!aisZoomBlocked);
    mobileBtn.classList.toggle('is-zoom-needed',showAisObjects&&aisZoomBlocked);
    mobileBtn.setAttribute('aria-label',showAisObjects&&aisZoomBlocked?'AIS är aktivt. Zooma in för att visa fartyg.':showAisObjects?'AIS är på':'AIS är av');
  }

  syncAisToast();
}
      function setAisZoomBlocked(blocked){aisZoomBlocked=!!blocked;syncAisButtons();}
      function clearAisMarkers(){if(aisLoadTimer){clearTimeout(aisLoadTimer);aisLoadTimer=null;}if(aisRefreshInterval){clearInterval(aisRefreshInterval);aisRefreshInterval=null;}aisPendingLoadAfterCurrent=false;aisLastFetchAt=0;aisMarkerMap.forEach(function(item){try{if(item&&item.marker) item.marker.remove(); else if(item&&item.remove) item.remove();}catch(e){}});aisMarkerMap.clear();if(aisVesselCache) aisVesselCache.clear();}
      function setAisMarkersVisible(visible){aisMarkerMap.forEach(function(item){try{if(item&&item.element) item.element.style.display=visible?'flex':'none';}catch(e){}});}
      function clearAisMarkersOnly(){aisMarkerMap.forEach(function(item){try{if(item&&item.marker) item.marker.remove(); else if(item&&item.remove) item.remove();}catch(e){}});aisMarkerMap.clear();if(aisVesselCache) aisVesselCache.clear();}
      function onAisToggle(){
  if(!aisControlsReady) return;

  showAisObjects=!showAisObjects;
  if(showAisObjects&&maptilerMap&&maptilerMap.getZoom) setAisZoomBlocked(maptilerMap.getZoom()<AIS_MIN_ZOOM);
  else setAisZoomBlocked(false);

  if(showAisObjects) startAisAutoRefresh();
  else{
    stopAisAutoRefresh();
    clearAisMarkers();
  }

  syncAisButtons();
  refreshMobileNavState();
}
      function getExpandedAisBbox(){var bounds=maptilerMap.getBounds(), west=bounds.getWest(), south=bounds.getSouth(), east=bounds.getEast(), north=bounds.getNorth(), lonSpan=Math.abs(east-west), latSpan=Math.abs(north-south), lonPad=Math.max(lonSpan*0.20,0.06), latPad=Math.max(latSpan*0.20,0.05);west=Math.max(-180,west-lonPad);east=Math.min(180,east+lonPad);south=Math.max(-85,south-latPad);north=Math.min(85,north+latPad);return {west:west,south:south,east:east,north:north,query:[west,south,east,north].join(",")};}
      function isAisPointInsideBbox(item,bbox){if(!item||!bbox) return false;var lon=Number(item.lon),lat=Number(item.lat);if(!isFinite(lat)||!isFinite(lon)) return false;return lon>=bbox.west&&lon<=bbox.east&&lat>=bbox.south&&lat<=bbox.north;}
      function pruneOldAisMarkers(activeBbox){var now=Date.now();aisMarkerMap.forEach(function(item,key){if(!item) return;var tooOld=item.lastSeenAt&&now-item.lastSeenAt>AIS_MARKER_TTL_MS;if(tooOld){try{if(item.marker) item.marker.remove();}catch(e){}aisMarkerMap.delete(key);aisVesselCache.delete(key);}});}
      function limitAisMarkers(){if(!aisMarkerMap||aisMarkerMap.size<=AIS_MAX_MARKERS) return;var items=Array.from(aisMarkerMap.entries()).sort(function(a,b){return Number(a[1].lastSeenAt||0)-Number(b[1].lastSeenAt||0);});while(aisMarkerMap.size>AIS_MAX_MARKERS&&items.length){var entry=items.shift(),key=entry[0],item=entry[1];try{if(item&&item.marker) item.marker.remove();}catch(e){}aisMarkerMap.delete(key);aisVesselCache.delete(key);}}
      function updateAisMarkerRotation(item,cog){if(!item||!item.element) return;var inner=item.element.querySelector(".ais-ship-inner");if(inner) inner.style.transform="rotate("+cog+"deg)";}
      function bindAisMarkerClick(marker,element){if(!marker||!element) return;function stopOnly(e){if(e) e.stopPropagation();markObjectInteraction();}element.addEventListener("mousedown",stopOnly);element.addEventListener("pointerdown",stopOnly);element.addEventListener("touchstart",stopOnly,{passive:true});element.addEventListener("click",function(e){if(e){e.preventDefault();e.stopPropagation();}markObjectInteraction();try{if(typeof marker.togglePopup==="function") marker.togglePopup();else{var popup=marker.getPopup&&marker.getPopup();if(popup&&maptilerMap) popup.addTo(maptilerMap);}}catch(err){console.warn("AIS-popup kunde inte öppnas", err);}});}
      function updateAisMarkers(vessels,activeBbox){
        if(!maptilerMap||!Array.isArray(vessels)) return;var now=Date.now();
        vessels.forEach(function(v){if(v==null) return;var lat=Number(getAisLat(v)),lon=Number(getAisLon(v));if(!isFinite(lat)||!isFinite(lon)) return;var key=getAisKey(v);if(!key) return;var cog=normalizeAisCourse(getAisCog(v)),sog=getAisSog(v),mmsi=getAisMmsi(v),existingCache=aisVesselCache.get(key)||{};var observedAt=Number(firstDefined(v.receivedAt,v.lastSeenAt,v.timestamp,v.time,v.Time,v.createdAt,v.cachedAt,now));if(!isFinite(observedAt)) observedAt=now;var merged=Object.assign({},existingCache,v,{mmsi:mmsi||existingCache.mmsi||null,lat:lat,lon:lon,cog:cog,sog:sog==null?existingCache.sog:sog,lastSeenAt:observedAt});aisVesselCache.set(key,merged);var existingMarkerItem=aisMarkerMap.get(key);if(existingMarkerItem&&existingMarkerItem.marker){existingMarkerItem.mmsi=merged.mmsi||existingMarkerItem.mmsi||null;existingMarkerItem.lat=lat;existingMarkerItem.lon=lon;existingMarkerItem.cog=cog;existingMarkerItem.sog=merged.sog==null?existingMarkerItem.sog:merged.sog;existingMarkerItem.name=getAisName(merged);existingMarkerItem.lastSeenAt=observedAt;try{existingMarkerItem.marker.setLngLat([lon,lat]);}catch(e){}updateAisMarkerRotation(existingMarkerItem,cog);try{existingMarkerItem.marker.setPopup(new maptilersdk.Popup({offset:18,closeButton:true,closeOnClick:false}).setText(getAisPopupText(merged)));}catch(e){}return;}var el=createShipElement(cog);var marker=new maptilersdk.Marker({element:el,anchor:"center"}).setLngLat([lon,lat]).addTo(maptilerMap);marker.setPopup(new maptilersdk.Popup({offset:18,closeButton:true,closeOnClick:false}).setText(getAisPopupText(merged)));bindAisMarkerClick(marker,el);aisMarkerMap.set(key,{marker:marker,element:el,mmsi:merged.mmsi||null,lat:lat,lon:lon,cog:cog,sog:merged.sog==null?null:merged.sog,name:getAisName(merged),lastSeenAt:observedAt});});
        pruneOldAisMarkers(activeBbox);limitAisMarkers();
      }
      function scheduleAisDataLoad(force){if(!showAisObjects) return;if(aisLoadTimer) clearTimeout(aisLoadTimer);aisLoadTimer=setTimeout(function(){aisLoadTimer=null;loadAisData(!!force);},700);}
      function startAisAutoRefresh(){if(aisRefreshInterval){clearInterval(aisRefreshInterval);aisRefreshInterval=null;}aisLastFetchAt=0;loadAisData(true);aisRefreshInterval=setInterval(function(){if(showAisObjects) loadAisData(false);},AIS_REFRESH_INTERVAL_MS);}
      function stopAisAutoRefresh(){if(aisLoadTimer){clearTimeout(aisLoadTimer);aisLoadTimer=null;}if(aisRefreshInterval){clearInterval(aisRefreshInterval);aisRefreshInterval=null;}}
      async function loadAisData(force){
        if(!maptilerMap||!showAisObjects) return;var zoom=maptilerMap.getZoom?maptilerMap.getZoom():0;if(zoom<AIS_MIN_ZOOM){setAisZoomBlocked(true);setAisMarkersVisible(false);return;}setAisZoomBlocked(false);setAisMarkersVisible(true);if(aisFetchInFlight){if(force) aisPendingLoadAfterCurrent=true;return;}var now=Date.now(), sinceLast=now-aisLastFetchAt;if(!force&&sinceLast<AIS_FETCH_THROTTLE_MS){scheduleAisDataLoad(false);return;}aisFetchInFlight=true;aisLastFetchAt=now;var requestId=++aisLatestRequestId, activeBbox=getExpandedAisBbox();
        try{var url="/api/ais?bbox="+encodeURIComponent(activeBbox.query)+"&listenMs="+encodeURIComponent(String(AIS_LISTEN_MS));var res=await fetch(url);var data=await res.json();if(requestId!==aisLatestRequestId) return;if(!res.ok) throw new Error((data&&data.error)||"AIS-fel");if(!showAisObjects||requestId!==aisLatestRequestId) return;var vesselsWithPosition=(data.vessels||[]).filter(function(v){var lat=Number(getAisLat(v)),lon=Number(getAisLon(v));return isFinite(lat)&&isFinite(lon);});updateAisMarkers(vesselsWithPosition,activeBbox);}catch(err){console.error("AIS kunde inte hämtas", err);}finally{aisFetchInFlight=false;if(aisPendingLoadAfterCurrent&&showAisObjects){aisPendingLoadAfterCurrent=false;scheduleAisDataLoad(true);}}
      }
      document.addEventListener("visibilitychange",function(){if(document.hidden){aisLatestRequestId++;aisPendingLoadAfterCurrent=false;stopAisAutoRefresh();}else if(showAisObjects) startAisAutoRefresh();});

      function updateActiveLayersBadge(){var count=[windLayerVisible,precipitationLayerVisible,satelliteLayerVisible,radarLayerVisible,smhiRadarObservationVisible,temperatureLayerVisible].filter(Boolean).length;var badge=document.getElementById("activeLayersBadge"), text=document.getElementById("activeLayersText"), fb=document.getElementById("filterBadge");if(badge&&text){badge.classList.toggle("visible",count>0);if(count>0) text.textContent=count+" lager";}if(fb) fb.classList.toggle("visible",count>0);}

      var windLayerVisible=false, precipitationLayerVisible=false, satelliteLayerVisible=true, radarLayerVisible=false, temperatureLayerVisible=false;
      var NAUTICAL_LIGHT_BASE_TILE_URL="https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png";
      var NAUTICAL_SEAMARK_TILE_URL="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png";
      // EMODnet Bathymetry WMTS test for Swedish west coast. This is an orientation/depth-feel layer, not official navigational depth data.
      // EMODnet WMTS uses the documented template: /2020/baselayer/{TileMatrixSet}/{TileMatrix}/{TileCol}/{TileRow}.png.
      // In MapLibre/MapTiler XYZ notation this becomes /2020/baselayer/web_mercator/{z}/{x}/{y}.png.
      // The source maxzoom is only the highest EMODnet tile zoom to overscale from; it must not restrict the map camera zoom.
      var NAUTICAL_EMODNET_DEPTH_TILE_URL="https://tiles.emodnet-bathymetry.eu/2020/baselayer/web_mercator/{z}/{x}/{y}.png";
      // Keep the test available on/around the Swedish west coast, but do not hide it too aggressively while testing.
      var NAUTICAL_DEPTH_WEST_COAST_BOUNDS={west:10.65,south:57.55,east:12.35,north:58.75}; // Orust, Tjörn, Marstrand, Lysekil och omgivande kust
      var OPEN_METEO_CLOUD_METADATA_URL="https://map-tiles.open-meteo.com/data_spatial/dwd_icon/latest.json";
      var OPEN_METEO_CLOUD_METADATA_PROXY_URL="/api/openmeteo-cloud-metadata";
      var OPEN_METEO_CLOUD_VARIABLE="cloud_cover";
      var OPEN_METEO_CLOUD_SOURCE_ID="openmeteo-cloud-source";
      var OPEN_METEO_CLOUD_LAYER_ID="openmeteo-cloud-layer";
      var OPEN_METEO_CLOUD_APPLY_INTERVAL_MS=90, OPEN_METEO_CLOUD_MAX_CACHED_STEPS=isMobileView()?12:24, OPEN_METEO_CLOUD_DRAG_RADIUS=isMobileView()?2:3, OPEN_METEO_CLOUD_STARTUP_RADIUS=isMobileView()?3:5, OPEN_METEO_CLOUD_PRELOAD_BATCH_DELAY_MS=isMobileView()?420:220, OPEN_METEO_CLOUD_PRELOAD_OPACITY=0.01, OPEN_METEO_CLOUD_VISIBLE_OPACITY=0.42;
      var openMeteoCloudPreloadQueue=[], openMeteoCloudPreloadSet=new Set(), openMeteoCloudPreloadRunning=false, openMeteoCloudStartupWarmupStarted=false, forecastTimelineInitialized=false;
      // Keep a small cloud window warm in the background so Advanced/Sjökort can show Moln immediately.
      // The layer is added at near-zero opacity while inactive; visible opacity is only used when Moln is actually enabled.
      var openMeteoCloudBackgroundPreload=true;

      function getFirstWeatherOverlayLayerId(){
        if(!maptilerMap||!maptilerMap.getStyle) return null;var style=maptilerMap.getStyle(), layers=Array.isArray(style&&style.layers)?style.layers:[], fixedIds=["timeline-controller-layer","main-wind-layer","main-precipitation-layer","main-radar-layer","smhi-radar-observation-layer","main-temperature-layer"];
        for(var i=0;i<layers.length;i++){var id=layers[i].id || "";if(fixedIds.indexOf(id)!==-1) return id;if(id.indexOf(OPEN_METEO_CLOUD_LAYER_ID+"-")===0) return id;}return null;
      }
      function refreshNauticalLayerOrder(){if(!maptilerMap) return;try{var hasBase=maptilerMap.getLayer&&maptilerMap.getLayer(nauticalBaseLayerId), hasDepth=maptilerMap.getLayer&&maptilerMap.getLayer(nauticalDepthLayerId), hasSeamark=maptilerMap.getLayer&&maptilerMap.getLayer(nauticalSeamarkLayerId);if(hasBase){var firstWeatherLayerId=getFirstWeatherOverlayLayerId();if(firstWeatherLayerId&&firstWeatherLayerId!==nauticalBaseLayerId) maptilerMap.moveLayer(nauticalBaseLayerId,firstWeatherLayerId);else if(hasDepth) maptilerMap.moveLayer(nauticalBaseLayerId,nauticalDepthLayerId);else if(hasSeamark) maptilerMap.moveLayer(nauticalBaseLayerId,nauticalSeamarkLayerId);}if(hasDepth){if(hasSeamark) maptilerMap.moveLayer(nauticalDepthLayerId,nauticalSeamarkLayerId);else maptilerMap.moveLayer(nauticalDepthLayerId);}if(hasSeamark) maptilerMap.moveLayer(nauticalSeamarkLayerId);

if(typeof bringSeaAreaLayersToFront === "function"){
  bringSeaAreaLayersToFront();
}

if(typeof bringCustomUserLocationLayersToFront === "function"){
  bringCustomUserLocationLayersToFront();
}}catch(e){console.warn("Kunde inte justera sjökortets lagerordning", e);}}
      function viewportIntersectsBounds(bounds){if(!maptilerMap||!bounds||!maptilerMap.getBounds) return false;try{var b=maptilerMap.getBounds(), west=b.getWest(), east=b.getEast(), south=b.getSouth(), north=b.getNorth();return !(east<bounds.west||west>bounds.east||north<bounds.south||south>bounds.north);}catch(e){return false;}}
      function shouldShowNauticalDepthLayer(){
        // During this depth test we keep the layer visible whenever the nautical basemap is active.
        // The previous viewport gate could make the test look broken if the map started just outside the bbox.
        return !!(nauticalDepthTestEnabled && baseMapMode==="nautical");
      }
      function syncNauticalDepthLayerVisibility(){if(!maptilerMap||!(maptilerMap.getLayer&&maptilerMap.getLayer(nauticalDepthLayerId))) return;try{maptilerMap.setLayoutProperty(nauticalDepthLayerId,"visibility",shouldShowNauticalDepthLayer()?"visible":"none");}catch(e){}}
      function scheduleNauticalLayerOrderRefresh(){if(nauticalLayerOrderTimer) clearTimeout(nauticalLayerOrderTimer);nauticalLayerOrderTimer=setTimeout(function(){nauticalLayerOrderTimer=null;refreshNauticalLayerOrder();},0);setTimeout(refreshNauticalLayerOrder,180);}
      function ensureNauticalChartLayers(){
        if(!maptilerMap) return false;
        try{
          if(!(maptilerMap.getSource&&maptilerMap.getSource(nauticalBaseSourceId))) maptilerMap.addSource(nauticalBaseSourceId,{type:"raster",tiles:[NAUTICAL_LIGHT_BASE_TILE_URL],tileSize:256,attribution:"© OpenStreetMap contributors © CARTO"});
          if(!(maptilerMap.getLayer&&maptilerMap.getLayer(nauticalBaseLayerId))) maptilerMap.addLayer({id:nauticalBaseLayerId,type:"raster",source:nauticalBaseSourceId,layout:{visibility:baseMapMode==="nautical"?"visible":"none"},paint:{"raster-opacity":1}},getFirstWeatherOverlayLayerId()||undefined);
          if(!(maptilerMap.getSource&&maptilerMap.getSource(nauticalDepthSourceId))) maptilerMap.addSource(nauticalDepthSourceId,{type:"raster",tiles:[NAUTICAL_EMODNET_DEPTH_TILE_URL],tileSize:256,minzoom:0,maxzoom:15,attribution:"Bathymetry © EMODnet Bathymetry Consortium"});
          if(!(maptilerMap.getLayer&&maptilerMap.getLayer(nauticalDepthLayerId))) maptilerMap.addLayer({id:nauticalDepthLayerId,type:"raster",source:nauticalDepthSourceId,layout:{visibility:shouldShowNauticalDepthLayer()?"visible":"none"},paint:{"raster-opacity":0.72,"raster-resampling":"nearest","raster-saturation":-0.05,"raster-contrast":0.14,"raster-brightness-min":0.02,"raster-brightness-max":0.98}},getFirstWeatherOverlayLayerId()||undefined);
          if(!(maptilerMap.getSource&&maptilerMap.getSource(nauticalSeamarkSourceId))) maptilerMap.addSource(nauticalSeamarkSourceId,{type:"raster",tiles:[NAUTICAL_SEAMARK_TILE_URL],tileSize:256,attribution:"© OpenSeaMap contributors"});
          if(!(maptilerMap.getLayer&&maptilerMap.getLayer(nauticalSeamarkLayerId))) maptilerMap.addLayer({id:nauticalSeamarkLayerId,type:"raster",source:nauticalSeamarkSourceId,layout:{visibility:baseMapMode==="nautical"?"visible":"none"},paint:{"raster-opacity":1,"raster-resampling":"nearest"}},getFirstWeatherOverlayLayerId()||undefined);
          attachNauticalDepthMoveSync();syncNauticalDepthLayerVisibility();scheduleNauticalLayerOrderRefresh();applyNauticalTheme();return true;
        }catch(e){console.warn("Sjökortslagret kunde inte läggas till", e);return false;}
      }
      var nauticalDepthMoveSyncAttached=false;
      function attachNauticalDepthMoveSync(){if(nauticalDepthMoveSyncAttached||!maptilerMap||!maptilerMap.on) return;nauticalDepthMoveSyncAttached=true;try{maptilerMap.on("moveend",function(){syncNauticalDepthLayerVisibility();});maptilerMap.on("zoomend",function(){syncNauticalDepthLayerVisibility();});}catch(e){}}

      function setBaseMapMode(mode){
  baseMapMode = mode === "nautical" ? "nautical" : "standard";

  if(maptilerMap){
    ensureNauticalChartLayers();

    var visibility = baseMapMode === "nautical" ? "visible" : "none";

    try{
      if(maptilerMap.getLayer && maptilerMap.getLayer(nauticalBaseLayerId)){
        maptilerMap.setLayoutProperty(nauticalBaseLayerId, "visibility", visibility);
      }

      if(maptilerMap.getLayer && maptilerMap.getLayer(nauticalDepthLayerId)){
        maptilerMap.setLayoutProperty(nauticalDepthLayerId, "visibility", shouldShowNauticalDepthLayer() ? "visible" : "none");
      }

      if(maptilerMap.getLayer && maptilerMap.getLayer(nauticalSeamarkLayerId)){
        maptilerMap.setLayoutProperty(nauticalSeamarkLayerId, "visibility", visibility);
      }

      scheduleNauticalLayerOrderRefresh();
    }catch(e){
      console.warn("Kunde inte byta kartläge", e);
    }
  }

  syncBaseMapButtons();
  applyNauticalTheme();
  syncCustomUserLocationVisuals();
        if(baseMapMode === "nautical" && activeMode === "nautical"){
  startNauticalGps();
  if(userTrackingMode === "off") userTrackingMode = "follow";

  if(hasUserPosition() && userTrackingMode !== "off"){
    updateNavigationCamera({ immediate:true });
  }
}else{
  userTrackingMode = "off";
  if(activeMode !== "nautical" && typeof stopNauticalHud === "function") stopNauticalHud();
}
}

      function toggleBaseMapMode(){setBaseMapMode(baseMapMode==="standard"?"nautical":"standard");}
      function normalizeBearing(value){
  var n = Number(value);

  if(!isFinite(n)) return null;

  n = n % 360;

  if(n < 0) n += 360;

  return n;
}
      function smoothBearing(previous, next, factor){
  if(previous == null || !isFinite(Number(previous))){
    return normalizeBearing(next);
  }

  if(next == null || !isFinite(Number(next))){
    return normalizeBearing(previous);
  }

  var prev = normalizeBearing(previous);
  var target = normalizeBearing(next);

  if(prev == null) return target;
  if(target == null) return prev;

  var diff = ((target - prev + 540) % 360) - 180;

  return normalizeBearing(prev + diff * factor);
}
function hasUserPosition(){
  return (
    userPositionState &&
    isFinite(Number(userPositionState.lat)) &&
    isFinite(Number(userPositionState.lon))
  );
}

function getCurrentUserLocation(){
  if(!hasUserPosition()) return null;

  return {
    lat: userPositionState.lat,
    lon: userPositionState.lon,
    accuracy: userPositionState.accuracy,
    speed: userPositionState.speed,
    heading: navigationCourse.heading,
    updatedAt: userPositionState.updatedAt
  };
}

function distanceMetersBetween(lon1, lat1, lon2, lat2){
  var R = 6371000;
  var toRad = Math.PI / 180;

  var p1 = lat1 * toRad;
  var p2 = lat2 * toRad;
  var dp = (lat2 - lat1) * toRad;
  var dl = (lon2 - lon1) * toRad;

  var a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) *
    Math.sin(dl / 2) * Math.sin(dl / 2);

  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function bearingBetweenPoints(lon1, lat1, lon2, lat2){
  var toRad = Math.PI / 180;
  var toDeg = 180 / Math.PI;

  var p1 = lat1 * toRad;
  var p2 = lat2 * toRad;
  var dl = (lon2 - lon1) * toRad;

  var y = Math.sin(dl) * Math.cos(p2);
  var x =
    Math.cos(p1) * Math.sin(p2) -
    Math.sin(p1) * Math.cos(p2) * Math.cos(dl);

  return normalizeBearing(Math.atan2(y, x) * toDeg);
}

function isNavigationCourseFresh(){
  return (
    navigationCourse &&
    navigationCourse.heading != null &&
    isFinite(Number(navigationCourse.heading)) &&
    Date.now() - navigationCourse.updatedAt < 12000
  );
}

function getNavigationCourseHeading(){
  if(!isNavigationCourseFresh()) return null;

  return normalizeBearing(navigationCourse.heading);
}      

function getMapBearing(){
  if(!maptilerMap || typeof maptilerMap.getBearing !== "function") return 0;

  var bearing = Number(maptilerMap.getBearing());

  return isFinite(bearing) ? bearing : 0;
}

function setMapBearing(bearing){
  if(!maptilerMap) return;
  mapCameraProgrammaticUntil = Date.now() + 700;

  var b = normalizeBearing(bearing);
  if(b == null) return;

  try{
    if(typeof maptilerMap.easeTo === "function"){
      maptilerMap.easeTo({
        bearing:b,
        duration:420,
        essential:true
      });
    }else if(typeof maptilerMap.rotateTo === "function"){
      maptilerMap.rotateTo(b, {
        duration:420
      });
    }
  }catch(e){}
}
      function distanceMetersBetween(lon1, lat1, lon2, lat2){
  var R = 6371000;
  var toRad = Math.PI / 180;

  var p1 = lat1 * toRad;
  var p2 = lat2 * toRad;
  var dp = (lat2 - lat1) * toRad;
  var dl = (lon2 - lon1) * toRad;

  var a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) *
    Math.sin(dl / 2) * Math.sin(dl / 2);

  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function bearingBetweenPoints(lon1, lat1, lon2, lat2){
  var toRad = Math.PI / 180;
  var toDeg = 180 / Math.PI;

  var p1 = lat1 * toRad;
  var p2 = lat2 * toRad;
  var dl = (lon2 - lon1) * toRad;

  var y = Math.sin(dl) * Math.cos(p2);
  var x =
    Math.cos(p1) * Math.sin(p2) -
    Math.sin(p1) * Math.cos(p2) * Math.cos(dl);

  return normalizeBearing(Math.atan2(y, x) * toDeg);
}

function formatKnotsFromMetersPerSecond(speed){
  if(speed == null || !isFinite(Number(speed))) return "-- kn";

  var knots = Math.max(0, Number(speed) * 1.943844);

  return knots.toFixed(1).replace(".", ",") + " kn";
}

function getGpsCourseHeading(){
  return getNavigationCourseHeading();
}

function getDeviceCompassHeading(){
  return null;
}

function getBestNauticalHeading(){
  return getNavigationCourseHeading();
}

function formatNauticalCourseValue(heading){
  if(heading == null || !isFinite(Number(heading))) return "--°";
  return Math.round(normalizeBearing(Number(heading))) + "°";
}

function getNauticalModeLabel(){
  if(userTrackingMode === "follow-course") return "Kurs upp";
  if(userTrackingMode === "follow") return "Följer";
  return "Fri karta";
}

function findNearestWeatherItemForTime(list, targetTime){
  if(!Array.isArray(list) || !list.length || !isFinite(Number(targetTime))) return null;
  var best=null, bestDiff=Infinity;
  for(var i=0;i<list.length;i++){
    var item=list[i];
    var t=new Date(item && item.time).getTime();
    if(!isFinite(t)) continue;
    var diff=Math.abs(t-Number(targetTime));
    if(diff<bestDiff){best=item;bestDiff=diff;}
  }
  return best;
}

function findNearestGustValueForTime(targetTime){
  if(!Array.isArray(weatherGustTimeseries) || !weatherGustTimeseries.length || !isFinite(Number(targetTime))) return null;
  var best=null, bestDiff=Infinity;
  for(var i=0;i<weatherGustTimeseries.length;i++){
    var item=weatherGustTimeseries[i];
    var t=new Date(item && item.time).getTime();
    var v=item && item.value;
    if(!isFinite(t) || v==null || !isFinite(Number(v))) continue;
    var diff=Math.abs(t-Number(targetTime));
    if(diff<bestDiff){best=Number(v);bestDiff=diff;}
  }
  return best;
}

function getNauticalWindSnapshot(){
  var target=roundToForecastHour(Date.now());
  var item=findNearestWeatherItemForTime(weatherTimeseries,target) || findNearestWeatherItemForTime(weatherHistoryTimeseries,target);
  var details=item && item.data && item.data.instant && item.data.instant.details || {};
  var wind=details.wind_speed;
  var direction=details.wind_from_direction;
  var gust=findNearestGustValueForTime(target);
  if((gust==null || !isFinite(Number(gust))) && details.wind_speed_of_gust!=null && isFinite(Number(details.wind_speed_of_gust))){
    gust=Number(details.wind_speed_of_gust);
  }
  return {
    wind: wind==null || !isFinite(Number(wind)) ? null : Number(wind),
    gust: gust==null || !isFinite(Number(gust)) ? null : Number(gust),
    direction: direction==null || !isFinite(Number(direction)) ? null : Number(direction)
  };
}

function updateNauticalStatusPanel(){
  var speedEl=document.getElementById("nauticalPanelSpeed");
  var modeEl=document.getElementById("nauticalPanelMode");
  var courseEl=document.getElementById("nauticalPanelCourse");
  var courseSubEl=document.getElementById("nauticalPanelCourseSub");
  var windEl=document.getElementById("nauticalPanelWind");
  var windSubEl=document.getElementById("nauticalPanelWindSub");

  if(speedEl) speedEl.textContent=formatKnotsFromMetersPerSecond(nauticalLastSpeed);
  if(modeEl) modeEl.textContent=getNauticalModeLabel();

  var heading=getBestNauticalHeading();
  if(courseEl) courseEl.textContent=formatNauticalCourseValue(heading);
  if(courseSubEl) courseSubEl.textContent=heading==null ? "GPS" : degreesToCompass(heading);

  var snap=getNauticalWindSnapshot();
  if(windEl) windEl.textContent=snap.wind==null ? "--" : formatWind(snap.wind);

  var subParts=[];
  if(snap.gust!=null) subParts.push("Byar " + formatWind(snap.gust));
  if(snap.direction!=null) subParts.push(degreesToCompass(snap.direction));
  if(windSubEl) windSubEl.textContent=subParts.length ? subParts.join(" · ") : "Byar --";
}

function updateNauticalCompassHud(){
  var hud = document.getElementById("nauticalCompassHud");
  var ring = document.getElementById("nauticalCompassRing");
  var arrow = document.getElementById("nauticalPhoneArrow");
  var speedEl = document.getElementById("nauticalSpeedValue");
  var modeEl = document.getElementById("nauticalCompassMode");

  if(!hud) return;

  var nautical = baseMapMode === "nautical";
  var mapBearing = getMapBearing();
  var heading = getBestNauticalHeading();

  hud.classList.toggle("is-hidden", !nautical);
  hud.classList.toggle("is-following", userTrackingMode === "follow" || userTrackingMode === "follow-course");
  hud.classList.toggle("is-course", userTrackingMode === "follow-course");
  hud.classList.toggle("is-free", userTrackingMode === "off");
  hud.classList.toggle("is-missing-heading", heading == null);

  if(ring){
    ring.style.transform = "rotate(" + (-mapBearing).toFixed(1) + "deg)";
  }

  if(arrow){
    var arrowBearing = heading == null ? 0 : heading - mapBearing;
    arrow.style.transform = "rotate(" + arrowBearing.toFixed(1) + "deg)";
  }

  if(speedEl){
    speedEl.textContent = formatKnotsFromMetersPerSecond(nauticalLastSpeed);
  }

if(modeEl){
  modeEl.textContent = getNauticalModeLabel();
}
updateNauticalStatusPanel();
}

function handleNauticalPosition(position){
  if(!position || !position.coords) return;

  handleUserPosition(position.coords, {
    allowWeatherRefresh: false,
    allowCameraFollow: baseMapMode === "nautical" && userTrackingMode !== "off",
    immediateCamera: false
  });
}
function startNauticalGps(){
  if(nauticalGeoWatchId != null) return;
  if(!navigator.geolocation) return;

  try{
    nauticalGeoWatchId = navigator.geolocation.watchPosition(
      handleNauticalPosition,
      function(){
        nauticalLastSpeed = null;
        updateNauticalCompassHud();
      },
      {
        enableHighAccuracy:true,
        maximumAge:3000,
        timeout:12000
      }
    );
  }catch(e){}
}

function stopNauticalGps(){
  if(nauticalGeoWatchId == null) return;

  try{
    navigator.geolocation.clearWatch(nauticalGeoWatchId);
  }catch(e){}

  nauticalGeoWatchId = null;
}

function handleDeviceOrientation(event){
  return;
}
async function startNauticalOrientation(){
  if(nauticalOrientationStarted) return;

  try{
    if(
      window.DeviceOrientationEvent &&
      typeof DeviceOrientationEvent.requestPermission === "function"
    ){
      var permission = await DeviceOrientationEvent.requestPermission();

      if(permission !== "granted"){
        updateNauticalCompassHud();
        return;
      }
    }

    window.addEventListener("deviceorientationabsolute", handleDeviceOrientation, true);
    window.addEventListener("deviceorientation", handleDeviceOrientation, true);

    nauticalOrientationStarted = true;
  }catch(e){
    updateNauticalCompassHud();
  }
}

function startNauticalHud(){
  if(userTrackingMode !== "off") nauticalFollowInitialized = true;
  startNauticalGps();
  updateNauticalCompassHud();

  if(hasUserPosition()){
    updateNavigationCamera({ immediate:true });
  }
}
function stopNauticalHud(){
  stopNauticalGps();
  nauticalFollowInitialized = false;
  userTrackingMode = "off";
  nauticalCompassMode = "north";
  setMapBearing(0);
  updateNauticalCompassHud();
}
function toggleNauticalCompassMode(){
  if(baseMapMode !== "nautical") return;

  if(userTrackingMode === "off"){
    userTrackingMode = "follow";
    nauticalCompassMode = "north";
    setMapBearing(0);
    updateNauticalCompassHud();
    if(hasUserPosition()) updateNavigationCamera({ immediate:true });
    return;
  }

  if(userTrackingMode === "follow"){
    userTrackingMode = "follow-course";
    nauticalCompassMode = "follow";
    updateNauticalCompassHud();
    if(hasUserPosition()) updateNavigationCamera({ immediate:true });
    return;
  }

  userTrackingMode = "follow";
  nauticalCompassMode = "north";
  setMapBearing(0);
  updateNauticalCompassHud();
  if(hasUserPosition()) updateNavigationCamera({ immediate:true });
}

function bindNauticalCompassHud(){
  var hud = document.getElementById("nauticalCompassHud");

  if(!hud || hud.dataset.bound === "1") return;

  hud.dataset.bound = "1";

  hud.addEventListener("click", function(e){
    e.preventDefault();
    e.stopPropagation();
    toggleNauticalCompassMode();
  });

  hud.addEventListener("touchstart", function(e){
    e.stopPropagation();
  }, {passive:true});
}

function applyNauticalTheme(){
  var theme = nauticalTheme === "evening" ? "evening" : "day";
  document.body.setAttribute("data-nautical-theme", theme);
  var btn = document.getElementById("nauticalThemeToggle");
  if(btn) btn.textContent = theme === "evening" ? "Kväll" : "Dag";

  if(!maptilerMap) return;
  try{
    if(maptilerMap.getLayer && maptilerMap.getLayer(nauticalBaseLayerId)){
      maptilerMap.setPaintProperty(nauticalBaseLayerId, "raster-opacity", theme === "evening" ? 0.82 : 1);
      maptilerMap.setPaintProperty(nauticalBaseLayerId, "raster-brightness-min", theme === "evening" ? 0.02 : 0);
      maptilerMap.setPaintProperty(nauticalBaseLayerId, "raster-brightness-max", theme === "evening" ? 0.62 : 1);
      maptilerMap.setPaintProperty(nauticalBaseLayerId, "raster-saturation", theme === "evening" ? -0.28 : 0);
      maptilerMap.setPaintProperty(nauticalBaseLayerId, "raster-contrast", theme === "evening" ? 0.16 : 0);
    }
    if(maptilerMap.getLayer && maptilerMap.getLayer(nauticalDepthLayerId)){
      maptilerMap.setPaintProperty(nauticalDepthLayerId, "raster-opacity", theme === "evening" ? 0.32 : 0.46);
      maptilerMap.setPaintProperty(nauticalDepthLayerId, "raster-brightness-min", theme === "evening" ? 0.02 : 0.03);
      maptilerMap.setPaintProperty(nauticalDepthLayerId, "raster-brightness-max", theme === "evening" ? 0.58 : 0.96);
      maptilerMap.setPaintProperty(nauticalDepthLayerId, "raster-saturation", theme === "evening" ? -0.28 : -0.10);
      maptilerMap.setPaintProperty(nauticalDepthLayerId, "raster-contrast", theme === "evening" ? 0.16 : 0.08);
    }
    if(maptilerMap.getLayer && maptilerMap.getLayer(nauticalSeamarkLayerId)){
      maptilerMap.setPaintProperty(nauticalSeamarkLayerId, "raster-opacity", theme === "evening" ? 0.92 : 1);
      maptilerMap.setPaintProperty(nauticalSeamarkLayerId, "raster-brightness-min", theme === "evening" ? 0.04 : 0);
      maptilerMap.setPaintProperty(nauticalSeamarkLayerId, "raster-brightness-max", theme === "evening" ? 0.86 : 1);
      maptilerMap.setPaintProperty(nauticalSeamarkLayerId, "raster-saturation", theme === "evening" ? -0.08 : 0);
      maptilerMap.setPaintProperty(nauticalSeamarkLayerId, "raster-contrast", theme === "evening" ? 0.24 : 0);
    }
  }catch(e){
    console.warn("Kunde inte uppdatera sjökortstema", e);
  }
}

function toggleNauticalTheme(){
  nauticalTheme = nauticalTheme === "evening" ? "day" : "evening";
  try{ localStorage.setItem("weatherbear:nauticalTheme", nauticalTheme); }catch(e){}
  applyNauticalTheme();
}

function bindNauticalThemeToggle(){
  var btn = document.getElementById("nauticalThemeToggle");
  if(!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";
  btn.addEventListener("click", function(e){
    e.preventDefault();
    e.stopPropagation();
    toggleNauticalTheme();
  });
  btn.addEventListener("touchstart", function(e){ e.stopPropagation(); }, {passive:true});
}

function syncNauticalHud(){
  bindNauticalCompassHud();
  bindNauticalThemeToggle();
  applyNauticalTheme();

  if(baseMapMode === "nautical" && activeMode === "nautical"){
    startNauticalHud();
  }else{
    stopNauticalHud();
  }
}
     function makeCirclePolygon(lon, lat, radiusMeters){
  var points = [];
  var earthRadius = 6371000;
  var latRad = lat * Math.PI / 180;
  var lonRad = lon * Math.PI / 180;
  var distance = Math.max(5, Number(radiusMeters || 0)) / earthRadius;

  for(var i = 0; i <= 72; i++){
    var bearing = i * 2 * Math.PI / 72;

    var pointLat = Math.asin(
      Math.sin(latRad) * Math.cos(distance) +
      Math.cos(latRad) * Math.sin(distance) * Math.cos(bearing)
    );

    var pointLon = lonRad + Math.atan2(
      Math.sin(bearing) * Math.sin(distance) * Math.cos(latRad),
      Math.cos(distance) - Math.sin(latRad) * Math.sin(pointLat)
    );

    points.push([
      pointLon * 180 / Math.PI,
      pointLat * 180 / Math.PI
    ]);
  }

  return {
    type:"Feature",
    geometry:{
      type:"Polygon",
      coordinates:[points]
    },
    properties:{}
  };
}

function destinationPoint(lon, lat, bearingDeg, distanceMeters){
  var earthRadius = 6371000;
  var bearing = Number(bearingDeg) * Math.PI / 180;
  var distance = Math.max(0, Number(distanceMeters || 0)) / earthRadius;
  var lat1 = lat * Math.PI / 180;
  var lon1 = lon * Math.PI / 180;

  var lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distance) +
    Math.cos(lat1) * Math.sin(distance) * Math.cos(bearing)
  );

  var lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(distance) * Math.cos(lat1),
    Math.cos(distance) - Math.sin(lat1) * Math.sin(lat2)
  );

  return [
    lon2 * 180 / Math.PI,
    lat2 * 180 / Math.PI
  ];
}

function ensureCustomUserLocationLayers(){
  if(!maptilerMap || !maptilerMap.getSource) return;

  try{
    if(!maptilerMap.getSource(customUserAccuracySourceId)){
      maptilerMap.addSource(customUserAccuracySourceId, {
        type:"geojson",
        data:{
          type:"FeatureCollection",
          features:[]
        }
      });
    }

    if(!maptilerMap.getLayer(customUserAccuracyLayerId)){
      maptilerMap.addLayer({
        id:customUserAccuracyLayerId,
        type:"fill",
        source:customUserAccuracySourceId,
        paint:{
          "fill-color":"rgba(123,199,255,0.18)",
          "fill-outline-color":"rgba(123,199,255,0.34)"
        }
      });
    }

    if(!maptilerMap.getSource(customUserCourseSourceId)){
      maptilerMap.addSource(customUserCourseSourceId, {
        type:"geojson",
        data:{
          type:"FeatureCollection",
          features:[]
        }
      });
    }

    if(!maptilerMap.getLayer(customUserCourseLayerId)){
      maptilerMap.addLayer({
        id:customUserCourseLayerId,
        type:"line",
        source:customUserCourseSourceId,
        layout:{
          "line-cap":"round",
          "line-join":"round"
        },
          paint:{
  "line-color":"#000000",
  "line-width":2,
  "line-opacity":0.9,
  "line-blur":0
}
      });
    }
  }catch(e){
    console.warn("Kunde inte skapa egen Min plats-visning", e);
  }
}

function createCustomUserLocationMarker(){
  if(customUserLocationMarker || !maptilerMap || !window.maptilersdk) return;

  customUserLocationEl = document.createElement("div");
  customUserLocationEl.className = "custom-user-location-marker";

  customUserLocationArrowEl = document.createElement("div");
  customUserLocationArrowEl.className = "custom-user-location-arrow";

  var dot = document.createElement("div");
  dot.className = "custom-user-location-dot";

  customUserLocationEl.appendChild(customUserLocationArrowEl);
  customUserLocationEl.appendChild(dot);

  customUserLocationMarker = new maptilersdk.Marker({
    element: customUserLocationEl,
    anchor: "center"
  });
}

function getCourseLineLengthMeters(speedMs){
  var speed = Number(speedMs);

  if(!isFinite(speed) || speed < 0.4){
    return 180;
  }

  var knots = speed * 1.943844;
  var length = 140 + knots * 45;

  return Math.max(180, Math.min(650, length));
}
function clearCustomUserLocationCourse(){
  if(!maptilerMap || !maptilerMap.getSource) return;

  var courseSource = maptilerMap.getSource(customUserCourseSourceId);

  if(courseSource){
    courseSource.setData({
      type:"FeatureCollection",
      features:[]
    });
  }
}
function bringCustomUserLocationLayersToFront(){
  if(!maptilerMap || !maptilerMap.getLayer) return;

  try{
    if(maptilerMap.getLayer(customUserAccuracyLayerId)){
      maptilerMap.moveLayer(customUserAccuracyLayerId);
    }

    if(maptilerMap.getLayer(customUserCourseLayerId)){
      maptilerMap.moveLayer(customUserCourseLayerId);
    }
  }catch(e){}
}
function updateCustomUserLocationLayers(){
  var loc = getCurrentUserLocation();

  if(!loc || !maptilerMap || !maptilerMap.getSource) return;

  ensureCustomUserLocationLayers();

  var lon = loc.lon;
  var lat = loc.lat;
  var accuracy = loc.accuracy;
  var heading = getNavigationCourseHeading();
  var speed = loc.speed;

  var accuracySource = maptilerMap.getSource(customUserAccuracySourceId);
  var courseSource = maptilerMap.getSource(customUserCourseSourceId);

  if(accuracySource){
    accuracySource.setData({
      type:"FeatureCollection",
      features:[
        makeCirclePolygon(lon, lat, Math.min(Math.max(Number(accuracy || 20), 10), 800))
      ]
    });
  }

var showCourseLine =
  baseMapMode === "nautical" &&
  heading != null &&
  isNavigationCourseFresh();

if(courseSource){
  if(showCourseLine){
    var lengthMeters = getCourseLineLengthMeters(speed);
    var end = destinationPoint(lon, lat, heading, lengthMeters);

    courseSource.setData({
      type:"FeatureCollection",
      features:[
        {
          type:"Feature",
          geometry:{
            type:"LineString",
            coordinates:[
              [lon, lat],
              end
            ]
          },
          properties:{}
        }
      ]
    });
  }else{
    courseSource.setData({
      type:"FeatureCollection",
      features:[]
    });
  }
}

  try{
    if(maptilerMap.getLayer(customUserAccuracyLayerId)){
      maptilerMap.setLayoutProperty(
        customUserAccuracyLayerId,
        "visibility",
       hasUserPosition() ? "visible" : "none"
      );
    }

    if(maptilerMap.getLayer(customUserCourseLayerId)){
      maptilerMap.setLayoutProperty(
        customUserCourseLayerId,
        "visibility",
        baseMapMode === "nautical" ? "visible" : "none"
      );
    }
  }catch(e){}
}

function updateCustomUserLocationMarker(){
  var loc = getCurrentUserLocation();

  if(!loc || !maptilerMap) return;

  createCustomUserLocationMarker();

  if(!customUserLocationMarker) return;

customUserLocationMarker.setLngLat([
  loc.lon,
  loc.lat
]);

  if(!customUserLocationMarker._map){
    customUserLocationMarker.addTo(maptilerMap);
  }

  var heading = getBestNauticalHeading();
  var mapBearing = getMapBearing();

  if(customUserLocationEl){
    customUserLocationEl.classList.toggle("has-heading", heading != null);
    customUserLocationEl.classList.toggle("is-nautical", baseMapMode === "nautical");
  }

  if(customUserLocationArrowEl && heading != null){
    customUserLocationArrowEl.style.transform =
      "translate(-50%,-27px) rotate(" + (heading - mapBearing).toFixed(1) + "deg)";
  }
}
var lastNavigationCameraAt = 0;
var NAVIGATION_CAMERA_INTERVAL_MS = 1200;

function updateNavigationCamera(options){
  options = options || {};

  if(!maptilerMap || !hasUserPosition()) return;
  if(baseMapMode !== "nautical") return;

  if(userTrackingMode !== "follow" && userTrackingMode !== "follow-course"){
    return;
  }

  var now = Date.now();

  if(!options.immediate && now - lastNavigationCameraAt < NAVIGATION_CAMERA_INTERVAL_MS){
    return;
  }

  lastNavigationCameraAt = now;
  mapCameraProgrammaticUntil = Date.now() + (options.immediate ? 520 : 840);

  var easeOptions = {
    center: [userPositionState.lon, userPositionState.lat],
    duration: options.immediate ? 350 : 650,
    essential: true
  };

  if(userTrackingMode === "follow-course"){
    var heading = getNavigationCourseHeading();

    if(heading != null){
      easeOptions.bearing = heading;
    }
  }

  maptilerMap.easeTo(easeOptions);
}

function centerMapOnUserLocationOnce(options){
  options = options || {};

  if(!maptilerMap || !hasUserPosition()) return;

  mapCameraProgrammaticUntil = Date.now() + 700;

  var currentZoom = null;
  try{
    currentZoom = maptilerMap.getZoom ? maptilerMap.getZoom() : null;
  }catch(e){
    currentZoom = null;
  }

  var nextZoom = currentZoom;

  if(options.ensureUsefulZoom && (!isFinite(nextZoom) || nextZoom < 10)){
    nextZoom = 10;
  }

  var easeOptions = {
    center: [userPositionState.lon, userPositionState.lat],
    duration: options.immediate ? 320 : 520,
    essential: true
  };

  if(isFinite(nextZoom)){
    easeOptions.zoom = nextZoom;
  }

  try{
    maptilerMap.easeTo(easeOptions);
  }catch(e){
    try{
      maptilerMap.flyTo(easeOptions);
    }catch(err){}
  }
}

function updateNavigationCourseFromCoords(coords, lat, lon, now){
  var speed = Number(coords.speed);
  var accuracy = Number(coords.accuracy);
  var rawHeading = normalizeBearing(coords.heading);

  var hasUsableSpeed = isFinite(speed) && speed > 0.5;

  if(rawHeading != null && hasUsableSpeed){
    navigationCourse.heading = smoothBearing(navigationCourse.heading, rawHeading, 0.35);
    navigationCourse.source = "gps-heading";
    navigationCourse.updatedAt = now;
    navigationCourse.confidence = 1;
    return;
  }

  if(userPositionState.previous){
    var prev = userPositionState.previous;

    var movedMeters = distanceMetersBetween(
      prev.lon,
      prev.lat,
      lon,
      lat
    );

    var accuracyOk =
      !isFinite(accuracy) ||
      accuracy <= 80;

    if(movedMeters >= 10 && accuracyOk){
      var computedHeading = bearingBetweenPoints(
        prev.lon,
        prev.lat,
        lon,
        lat
      );

      if(computedHeading != null){
        navigationCourse.heading = smoothBearing(navigationCourse.heading, computedHeading, 0.25);
        navigationCourse.source = "computed-from-movement";
        navigationCourse.updatedAt = now;
        navigationCourse.confidence = 0.7;
      }
    }
  }
}

function handleUserPosition(coords, options){
  options = options || {};

  if(!coords) return;

  var lat = Number(coords.latitude);
  var lon = Number(coords.longitude);

  if(!isFinite(lat) || !isFinite(lon)) return;

  var now = Date.now();

  var previousPosition = hasUserPosition()
    ? {
        lat: userPositionState.lat,
        lon: userPositionState.lon,
        accuracy: userPositionState.accuracy,
        speed: userPositionState.speed,
        rawHeading: userPositionState.rawHeading,
        updatedAt: userPositionState.updatedAt
      }
    : null;

  userPositionState.previous = previousPosition;
  userPositionState.lat = lat;
  userPositionState.lon = lon;
  userPositionState.accuracy = Number(coords.accuracy || 30);
  userPositionState.speed = coords.speed;
  userPositionState.rawHeading = coords.heading;
  userPositionState.updatedAt = now;

  nauticalLastSpeed = coords.speed;

  updateNavigationCourseFromCoords(coords, lat, lon, now);

  updateCustomUserLocationMarker();
  updateCustomUserLocationLayers();
  updateNauticalCompassHud();

  if(options.allowCameraFollow){
    updateNavigationCamera({
      immediate: !!options.immediateCamera
    });
  }

  if(options.allowWeatherRefresh){
    handleUserLocationUpdate(lat, lon, {
      fromLocateButton: !!options.fromLocateButton
    });
  }
}

function updateCustomUserLocationFromCoords(coords, options){
  options = options || {};

  handleUserPosition(coords, {
    allowCameraFollow: !!options.followMap,
    allowWeatherRefresh: !options.suppressWeather,
    fromLocateButton: !!options.fromLocateButton,
    immediateCamera: !!options.immediateCamera
  });
}
function syncCustomUserLocationVisuals(){
  if(!hasUserPosition()) return;

  updateCustomUserLocationMarker();
  updateCustomUserLocationLayers();
}
      function syncBaseMapButtons(){
  var desktopBtn = document.getElementById("toggleBaseMapBtn");
  var mobileBtn = document.getElementById("mobileToggleBaseMapBtn");
  var nautical = baseMapMode === "nautical";

  if(desktopBtn){
    desktopBtn.textContent = nautical ? "Sjökort" : "Standard";
    desktopBtn.classList.toggle("is-on", nautical);
    desktopBtn.classList.toggle("is-off", !nautical);
  }

  if(mobileBtn){
    mobileBtn.classList.toggle("is-on", nautical);
  }

  syncNauticalHud();
     syncCustomUserLocationVisuals();   
}

      function isOpenMeteoWeatherLayerAvailable(){return !!(window.OMWeatherMapLayer && window.OMWeatherMapLayer.omProtocol);}
      function registerOpenMeteoProtocol(){if(openMeteoProtocolRegistered) return true;if(!window.maptilersdk || !isOpenMeteoWeatherLayerAvailable()) return false;try{var omProtocolSettings=window.OMWeatherMapLayer.defaultOmProtocolSettings;maptilersdk.addProtocol("om",function(params,abortController){params.url=params.url.replace("https//","https://");return window.OMWeatherMapLayer.omProtocol(params,abortController,omProtocolSettings);});openMeteoProtocolRegistered=true;return true;}catch(e){console.warn("Open-Meteo protokoll kunde inte registreras", e);openMeteoCloudLastError=e;return false;}}
      async function ensureOpenMeteoCloudMetadata(){if(openMeteoCloudMetadataPromise) return openMeteoCloudMetadataPromise;openMeteoCloudMetadataPromise=fetch(OPEN_METEO_CLOUD_METADATA_PROXY_URL).then(function(res){if(!res.ok) throw new Error("Open-Meteo metadata kunde inte hämtas");return res.json();}).then(function(data){var variables=Array.isArray(data&&data.variables)?data.variables:[], validTimes=Array.isArray(data&&data.valid_times)?data.valid_times:[];if(variables.indexOf(OPEN_METEO_CLOUD_VARIABLE)===-1) throw new Error("Open-Meteo saknar variabeln "+OPEN_METEO_CLOUD_VARIABLE);if(!validTimes.length) throw new Error("Open-Meteo saknar prognostider");openMeteoCloudValidTimes=validTimes;return data;}).catch(function(e){openMeteoCloudMetadataPromise=null;openMeteoCloudLastError=e;throw e;});return openMeteoCloudMetadataPromise;}
      function warmOpenMeteoCloudMetadata(){
        if(openMeteoCloudMetadataPromise || openMeteoCloudValidTimes.length) return;
        var run=function(){ensureOpenMeteoCloudMetadata().catch(function(e){openMeteoCloudLastError=e;});};
        if(window.requestIdleCallback) requestIdleCallback(run,{timeout:1800});
        else setTimeout(run,500);
      }
      function showOpenMeteoCloudLoadingState(on){
        ["toggleSatelliteLayerBtn","mobileToggleSatelliteBtn"].forEach(function(id){
          var el=document.getElementById(id); if(!el) return;
          el.classList.toggle("is-loading",!!on);
          if(id==="toggleSatelliteLayerBtn") el.textContent=on?"Laddar":"På";
        });
      }
      function getNearestOpenMeteoTimeStep(timeValue){if(!openMeteoCloudValidTimes.length) return "current_time_1H";var targetTime=Number(timeValue||getSelectedAppTime());if(!isFinite(targetTime)) targetTime=Date.now();var bestIndex=0,bestDiff=Infinity;for(var i=0;i<openMeteoCloudValidTimes.length;i++){var t=new Date(openMeteoCloudValidTimes[i]).getTime();if(!isFinite(t)) continue;var diff=Math.abs(t-targetTime);if(diff<bestDiff){bestDiff=diff;bestIndex=i;}}return "valid_times_"+bestIndex;}
      function buildOpenMeteoCloudUrl(timeValue){var timeStep=getNearestOpenMeteoTimeStep(timeValue);return "om://"+OPEN_METEO_CLOUD_METADATA_URL+"?variable="+encodeURIComponent(OPEN_METEO_CLOUD_VARIABLE)+"&time_step="+encodeURIComponent(timeStep)+"&dark=true";}
      function sanitizeOpenMeteoTimeStepKey(timeStep){return String(timeStep||"current_time_1H").replace(/[^a-zA-Z0-9_-]/g,"_");}
      function getOpenMeteoCloudIds(timeStep){var safeKey=sanitizeOpenMeteoTimeStepKey(timeStep);return {sourceId:OPEN_METEO_CLOUD_SOURCE_ID+"-"+safeKey,layerId:OPEN_METEO_CLOUD_LAYER_ID+"-"+safeKey};}
      function getNearestOpenMeteoIndex(timeValue){if(!openMeteoCloudValidTimes.length) return -1;var targetTime=Number(timeValue||getSelectedAppTime());if(!isFinite(targetTime)) return -1;var bestIndex=-1,bestDiff=Infinity;for(var i=0;i<openMeteoCloudValidTimes.length;i++){var t=new Date(openMeteoCloudValidTimes[i]).getTime();if(!isFinite(t)) continue;var diff=Math.abs(t-targetTime);if(diff<bestDiff){bestDiff=diff;bestIndex=i;}}return bestIndex;}
      function hideAllOpenMeteoCloudLayers(){if(!maptilerMap) return;openMeteoCloudSourceCache.forEach(function(entry){if(!entry||!entry.layerId) return;try{if(maptilerMap.getLayer&&maptilerMap.getLayer(entry.layerId)){maptilerMap.setLayoutProperty(entry.layerId,"visibility","visible");maptilerMap.setPaintProperty(entry.layerId,"raster-opacity",OPEN_METEO_CLOUD_PRELOAD_OPACITY);}}catch(e){}});}
      function showCachedOpenMeteoCloudLayerForTime(timeValue){if(!maptilerMap||!satelliteLayerVisible||!openMeteoCloudValidTimes.length) return false;var timeStep=getNearestOpenMeteoTimeStep(timeValue), cached=openMeteoCloudSourceCache.get(timeStep);if(!cached||!cached.layerId) return false;try{hideAllOpenMeteoCloudLayers();if(maptilerMap.getLayer&&maptilerMap.getLayer(cached.layerId)){maptilerMap.setLayoutProperty(cached.layerId,"visibility","visible");maptilerMap.setPaintProperty(cached.layerId,"raster-opacity",OPEN_METEO_CLOUD_VISIBLE_OPACITY);cached.lastUsedAt=Date.now();cached.wasShownAtLeastOnce=true;openMeteoCloudSourceActiveKey=timeStep;scheduleNauticalLayerOrderRefresh();return true;}}catch(e){console.warn("Kunde inte visa cachat satellitlager", e);}return false;}
      function getNearestCachedOpenMeteoCloudTime(timeValue){if(!openMeteoCloudValidTimes.length||!openMeteoCloudSourceCache.size) return null;var targetTime=Number(timeValue||getSelectedAppTime());if(!isFinite(targetTime)) return null;var bestTime=null,bestDiff=Infinity;openMeteoCloudSourceCache.forEach(function(entry){if(!entry||!entry.timeStep) return;var match=String(entry.timeStep).match(/^valid_times_(\d+)$/);if(!match) return;var index=Number(match[1]);if(!isFinite(index)) return;var validTimeRaw=openMeteoCloudValidTimes[index];if(!validTimeRaw) return;var validTime=new Date(validTimeRaw).getTime();if(!isFinite(validTime)) return;var diff=Math.abs(validTime-targetTime);if(diff<bestDiff){bestDiff=diff;bestTime=validTime;}});return bestTime;}
      function queueOpenMeteoCloudStepByIndex(index,priority){if(!openMeteoCloudValidTimes.length) return;if(index<0||index>=openMeteoCloudValidTimes.length) return;var timeStep="valid_times_"+index;if(openMeteoCloudSourceCache.has(timeStep)||openMeteoCloudPreloadSet.has(timeStep)) return;openMeteoCloudPreloadSet.add(timeStep);openMeteoCloudPreloadQueue.push({index:index,timeStep:timeStep,priority:priority||0});openMeteoCloudPreloadQueue.sort(function(a,b){return b.priority-a.priority;});runOpenMeteoCloudPreloadQueue();}
      function queueOpenMeteoCloudWindow(timeValue,radius,priority){if((!satelliteLayerVisible && !openMeteoCloudBackgroundPreload)||!openMeteoCloudValidTimes.length) return;var centerIndex=getNearestOpenMeteoIndex(timeValue);if(centerIndex<0) return;queueOpenMeteoCloudStepByIndex(centerIndex,(priority||0)+100);for(var offset=1;offset<=radius;offset++){queueOpenMeteoCloudStepByIndex(centerIndex+offset,(priority||0)+radius-offset);queueOpenMeteoCloudStepByIndex(centerIndex-offset,(priority||0)+radius-offset);}}
      function runOpenMeteoCloudPreloadQueue(){if(openMeteoCloudPreloadRunning) return;if((!satelliteLayerVisible && !openMeteoCloudBackgroundPreload)||!maptilerMap) return;openMeteoCloudPreloadRunning=true;function next(){if((!satelliteLayerVisible && !openMeteoCloudBackgroundPreload)||!maptilerMap){openMeteoCloudPreloadRunning=false;return;}var item=openMeteoCloudPreloadQueue.shift();if(!item){openMeteoCloudPreloadRunning=false;return;}openMeteoCloudPreloadSet.delete(item.timeStep);var rawTime=openMeteoCloudValidTimes[item.index], preloadTime=new Date(rawTime).getTime();if(isFinite(preloadTime)) addOrUpdateOpenMeteoCloudLayer(preloadTime,{show:false,preload:true});setTimeout(next,OPEN_METEO_CLOUD_PRELOAD_BATCH_DELAY_MS);}next();}
      function cancelOpenMeteoCloudWarmup(){openMeteoCloudPreloadQueue=[];openMeteoCloudPreloadSet.clear();openMeteoCloudPreloadRunning=false;}
      function trimOpenMeteoCloudCache(){if(!maptilerMap) return;if(openMeteoCloudSourceCache.size<=OPEN_METEO_CLOUD_MAX_CACHED_STEPS) return;var entries=Array.from(openMeteoCloudSourceCache.entries()).sort(function(a,b){return (a[1].lastUsedAt||0)-(b[1].lastUsedAt||0);});while(openMeteoCloudSourceCache.size>OPEN_METEO_CLOUD_MAX_CACHED_STEPS&&entries.length){var item=entries.shift(),key=item[0],entry=item[1];if(key===openMeteoCloudSourceActiveKey) continue;try{if(entry.layerId&&maptilerMap.getLayer&&maptilerMap.getLayer(entry.layerId)) maptilerMap.removeLayer(entry.layerId);}catch(e){}try{if(entry.sourceId&&maptilerMap.getSource&&maptilerMap.getSource(entry.sourceId)) maptilerMap.removeSource(entry.sourceId);}catch(e){}openMeteoCloudSourceCache.delete(key);}}
      function addOrUpdateOpenMeteoCloudLayer(timeValue,options){options=options||{};var shouldShow=options.show!==false,isPreload=options.preload===true||shouldShow===false;if(!maptilerMap||(!satelliteLayerVisible && !isPreload)) return false;var timeStep=getNearestOpenMeteoTimeStep(timeValue);if(isPreload&&timeStep===openMeteoCloudSourceActiveKey) return true;var ids=getOpenMeteoCloudIds(timeStep), cached=openMeteoCloudSourceCache.get(timeStep);if(!cached){try{if(!(maptilerMap.getSource&&maptilerMap.getSource(ids.sourceId))) maptilerMap.addSource(ids.sourceId,{type:"raster",url:buildOpenMeteoCloudUrl(timeValue),tileSize:512,minzoom:3,maxzoom:8});if(!(maptilerMap.getLayer&&maptilerMap.getLayer(ids.layerId))){maptilerMap.addLayer({id:ids.layerId,type:"raster",source:ids.sourceId,layout:{visibility:"visible"},paint:{"raster-opacity":isPreload?OPEN_METEO_CLOUD_PRELOAD_OPACITY:OPEN_METEO_CLOUD_VISIBLE_OPACITY,"raster-resampling":"linear"}});scheduleNauticalLayerOrderRefresh();}cached={timeStep:timeStep,sourceId:ids.sourceId,layerId:ids.layerId,createdAt:Date.now(),lastUsedAt:Date.now()};openMeteoCloudSourceCache.set(timeStep,cached);}catch(e){console.warn("Open-Meteo satellitlager kunde inte läggas till", e);openMeteoCloudLastError=e;return false;}}cached.lastUsedAt=Date.now();try{if(maptilerMap.getLayer&&maptilerMap.getLayer(cached.layerId)){maptilerMap.setLayoutProperty(cached.layerId,"visibility","visible");maptilerMap.setPaintProperty(cached.layerId,"raster-opacity",shouldShow?OPEN_METEO_CLOUD_VISIBLE_OPACITY:OPEN_METEO_CLOUD_PRELOAD_OPACITY);}}catch(e){}if(!shouldShow){trimOpenMeteoCloudCache();return true;}try{hideAllOpenMeteoCloudLayers();if(maptilerMap.getLayer&&maptilerMap.getLayer(cached.layerId)){maptilerMap.setLayoutProperty(cached.layerId,"visibility","visible");maptilerMap.setPaintProperty(cached.layerId,"raster-opacity",OPEN_METEO_CLOUD_VISIBLE_OPACITY);}openMeteoCloudSourceActiveKey=timeStep;trimOpenMeteoCloudCache();scheduleNauticalLayerOrderRefresh();return true;}catch(e){console.warn("Open-Meteo satellitlager kunde inte visas", e);openMeteoCloudLastError=e;return false;}}
      function removeOpenMeteoCloudLayer(){if(!maptilerMap) return;openMeteoCloudSourceCache.forEach(function(entry){if(!entry||!entry.layerId) return;try{if(maptilerMap.getLayer&&maptilerMap.getLayer(entry.layerId)) maptilerMap.setLayoutProperty(entry.layerId,"visibility","none");}catch(e){}});openMeteoCloudSourceActiveKey=null;}
      function syncOpenMeteoCloudLayerForSelectedTime(timeValue,options){
        options=options||{};
        if(!maptilerMap) return;
        if(!satelliteLayerVisible){removeOpenMeteoCloudLayer();showOpenMeteoCloudLoadingState(false);return;}
        if(!registerOpenMeteoProtocol()){console.warn("Open-Meteo satellit kunde inte startas: protokoll saknas.");showOpenMeteoCloudLoadingState(false);return;}
        var runNow=!!options.immediate, shouldPreload=options.preload!==false, targetTime=Number(timeValue||getSelectedAppTime());
        if(!isFinite(targetTime)) targetTime=Date.now();
        if(!runNow){
          openMeteoCloudPendingTime=targetTime;
          var now=Date.now(), wait=Math.max(0,OPEN_METEO_CLOUD_APPLY_INTERVAL_MS-(now-openMeteoCloudLastAppliedAt));
          if(openMeteoCloudApplyTimer) return;
          openMeteoCloudApplyTimer=setTimeout(function(){
            openMeteoCloudApplyTimer=null;
            var pending=openMeteoCloudPendingTime;
            openMeteoCloudPendingTime=null;
            syncOpenMeteoCloudLayerForSelectedTime(pending,{immediate:true,preload:shouldPreload});
          },wait);
          return;
        }
        if(openMeteoCloudApplyTimer){clearTimeout(openMeteoCloudApplyTimer);openMeteoCloudApplyTimer=null;}
        openMeteoCloudPendingTime=null;
        openMeteoCloudLastAppliedAt=Date.now();

        var requestId=++openMeteoCloudRequestId;
        var hasExactMetadata=!!openMeteoCloudValidTimes.length;

        // Cold start: show Open-Meteo's built-in current step immediately instead of waiting for metadata.
        // When metadata arrives, we replace it with the nearest exact forecast step.
        if(!hasExactMetadata){
          showOpenMeteoCloudLoadingState(true);
          try{addOrUpdateOpenMeteoCloudLayer(targetTime,{preload:false,show:true});}catch(e){}
        }

        ensureOpenMeteoCloudMetadata().then(function(){
          if(requestId!==openMeteoCloudRequestId) return;
          if(!satelliteLayerVisible) return;
          showOpenMeteoCloudLoadingState(false);
          var ok=addOrUpdateOpenMeteoCloudLayer(targetTime);
          if(ok&&shouldPreload) queueOpenMeteoCloudWindow(targetTime,OPEN_METEO_CLOUD_DRAG_RADIUS,50);
        }).catch(function(e){
          if(requestId!==openMeteoCloudRequestId) return;
          console.warn("Open-Meteo satellit misslyckades", e);
          openMeteoCloudLastError=e;
          showOpenMeteoCloudLoadingState(false);
          // Keep any already visible fallback layer if possible; otherwise hide.
          if(!openMeteoCloudSourceActiveKey) removeOpenMeteoCloudLayer();
        });
      }
      function startOpenMeteoCloudStartupWarmup(timeValue){
        if(openMeteoCloudStartupWarmupStarted) return;
        openMeteoCloudStartupWarmupStarted=true;
        ensureOpenMeteoCloudMetadata().then(function(){
          setTimeout(function(){
            // Preload around current app time even while Weather home is active. This makes Moln ready
            // when the user switches to Avancerat and also reduces blank steps when nudging time forward.
            queueOpenMeteoCloudWindow(timeValue || getSelectedAppTime(),OPEN_METEO_CLOUD_STARTUP_RADIUS,20);
          },650);
        }).catch(function(e){console.warn("Start-warmup för satellit misslyckades", e);});
      }

      function setWaveMarkerColorById(id,state,tip){var isSelected=selectedWaveStationId===id, baseColor=isSelected?'#00e5ff':'#4fc3ff', glowColor=isSelected?'rgba(0,229,255,0.38)':'rgba(79,195,255,0.22)';var m=waveMarkerMap.get(id);if(m){if(state==='active'){m.setRadius(isSelected?9:7);m.setStyle({color:baseColor,fillColor:baseColor,fillOpacity:0.98,opacity:1,stroke:true,weight:isSelected?3:2});}else{m.setRadius(5);m.setStyle({opacity:0,fillOpacity:0,stroke:false});}if(tip) m.bindTooltip(tip,{direction:'top'});}var md=waveMaptilerMarkerMap.get(id);if(md&&md.element){var el=md.element;if(state==='active'){el.style.display=showWaveObjects?'block':'none';el.style.background=baseColor;el.style.width=isSelected?'18px':'14px';el.style.height=isSelected?'18px':'14px';el.style.boxShadow='0 0 0 '+(isSelected?'5px ':'4px ')+glowColor;el.style.border=isSelected?'2px solid rgba(255,255,255,0.98)':'2px solid rgba(255,255,255,0.75)';}else el.style.display='none';el.title=tip||'';}}
      function setLighthouseMarkerColorById(id,state,tip){var isSelected=selectedLighthouseStationId===id, baseColor=isSelected?'#ff4d6d':'#ff9f1c', glowColor=isSelected?'rgba(255,77,109,0.38)':'rgba(255,159,28,0.24)';var m=lighthouseMarkerMap.get(id);if(m){if(state==='active'){m.setRadius(isSelected?9:7);m.setStyle({color:baseColor,fillColor:baseColor,fillOpacity:0.98,opacity:1,stroke:true,weight:isSelected?3:2});}else{m.setRadius(5);m.setStyle({opacity:0,fillOpacity:0,stroke:false});}if(tip) m.bindTooltip(tip,{direction:'top'});}var md=lighthouseMaptilerMarkerMap.get(id);if(md&&md.element){var el=md.element;if(state==='active'){el.style.display=showLighthouseObjects?'block':'none';el.style.background=baseColor;el.style.width=isSelected?'18px':'14px';el.style.height=isSelected?'18px':'14px';el.style.boxShadow='0 0 0 '+(isSelected?'5px ':'4px ')+glowColor;el.style.border=isSelected?'2px solid rgba(255,255,255,0.98)':'2px solid rgba(255,255,255,0.75)';}else el.style.display='none';el.title=tip||'';}}
      function clearWaveSelection(){selectedWaveStationId=null;if(waveSelectionMarker){map.removeLayer(waveSelectionMarker);waveSelectionMarker=null;}hideWaveOverlay();waveMarkerMap.forEach(function(_,id){var station=waveStationsCache.get(id);if(station) setWaveMarkerColorById(id,'active',station.name+' • data tillgänglig');});refreshMapSizeSoon();}
      function clearLighthouseSelection(){selectedLighthouseStationId=null;if(lighthouseSelectionMarker){map.removeLayer(lighthouseSelectionMarker);lighthouseSelectionMarker=null;}hideLighthouseOverlay();lighthouseMarkerMap.forEach(function(_,id){var station=lighthouseStationsCache.get(id);if(station) setLighthouseMarkerColorById(id,'active',station.name+' • data tillgänglig');});refreshMapSizeSoon();}
      function toggleWaveObjects(){
        showWaveObjects=!showWaveObjects;
        updateModeUI();
      }
      function toggleLighthouseObjects(){
        showLighthouseObjects=!showLighthouseObjects;
        updateModeUI();
      }
      function updateModeUI(){waveMaptilerMarkerMap.forEach(function(d){if(d.element) d.element.style.display=showWaveObjects?'block':'none';});lighthouseMaptilerMarkerMap.forEach(function(d){if(d.element) d.element.style.display=showLighthouseObjects?'block':'none';});if(showWaveObjects){ensureWaveStationsLoaded();if(!map.hasLayer(waveStationsLayer)) map.addLayer(waveStationsLayer);}else{if(map.hasLayer(waveStationsLayer)) map.removeLayer(waveStationsLayer);clearWaveSelection();}if(showLighthouseObjects){ensureLighthouseStationsLoaded();if(!map.hasLayer(lighthouseStationsLayer)) map.addLayer(lighthouseStationsLayer);}else{if(map.hasLayer(lighthouseStationsLayer)) map.removeLayer(lighthouseStationsLayer);clearLighthouseSelection();}var waveBtn=document.getElementById('toggleWaveModeBtn'), lighthouseBtn=document.getElementById('toggleLighthouseModeBtn');if(waveBtn){waveBtn.textContent=showWaveObjects?'På':'Av';waveBtn.classList.toggle('is-on',showWaveObjects);waveBtn.classList.toggle('is-off',!showWaveObjects);}if(lighthouseBtn){lighthouseBtn.textContent=showLighthouseObjects?'På':'Av';lighthouseBtn.classList.toggle('is-on',showLighthouseObjects);lighthouseBtn.classList.toggle('is-off',!showLighthouseObjects);}var mobileWaveBtn=document.getElementById('mobileToggleWaveBtn'), mobileLighthouseBtn=document.getElementById('mobileToggleLighthouseBtn');if(mobileWaveBtn) mobileWaveBtn.classList.toggle('is-on',showWaveObjects);if(mobileLighthouseBtn) mobileLighthouseBtn.classList.toggle('is-on',showLighthouseObjects);syncAisButtons();if(!savedSelections.weather) updateMapOverlay('Väderpunkt','Välj en punkt på kartan för att visa lokal väderdata.');refreshMobileNavState();refreshMapSizeSoon();}
      async function ensureWaveStationsLoaded(){if(waveStationsLoaded) return;if(waveStationsLoadingPromise) return waveStationsLoadingPromise;waveStationsLoadingPromise=(async function(){try{var res=await fetch('/api/ocean-wave-stations'), data=await res.json(), stations=Array.isArray(data&&data.stations)?data.stations:[];stations.forEach(function(s){waveStationsCache.set(s.id,s);});waveStationsLoaded=true;startWaveBackgroundCheck();}catch(e){console.error(e);}finally{waveStationsLoadingPromise=null;}})();return waveStationsLoadingPromise;}
      function createWaveStationMarkers(s){if(waveMarkerMap.has(s.id)||waveMaptilerMarkerMap.has(s.id)) return;var lm=L.circleMarker([s.latitude,s.longitude],{radius:7,weight:2,color:'#4fc3ff',fillColor:'#4fc3ff',fillOpacity:0.95,opacity:1,stroke:true});lm.bindTooltip(s.name+' • data tillgänglig',{direction:'top'});lm.on('click',function(e){L.DomEvent.stopPropagation(e);selectWaveStation(s);});waveMarkerMap.set(s.id,lm);waveStationsLayer.addLayer(lm);if(maptilerMap&&window.maptilersdk){var el=document.createElement('div');Object.assign(el.style,{width:'14px',height:'14px',borderRadius:'999px',background:'#4fc3ff',border:'2px solid rgba(255,255,255,0.75)',boxShadow:'0 0 0 4px rgba(79,195,255,0.22)',cursor:'pointer',display:showWaveObjects?'block':'none'});el.title=s.name+' • data tillgänglig';el.addEventListener('click',function(e){e.stopPropagation();selectWaveStation(s);});var mm=new maptilersdk.Marker({element:el}).setLngLat([s.longitude,s.latitude]).addTo(maptilerMap);waveMaptilerMarkerMap.set(s.id,{marker:mm,element:el});}}
      function extractLatestValue(data){if(Array.isArray(data&&data.value)&&data.value.length) return data.value[data.value.length-1];if(Array.isArray(data&&data.values)&&data.values.length) return data.values[data.values.length-1];return null;}
      function extractNumericValue(v){if(v==null) return null;if(typeof v==='number') return isFinite(v)?v:null;var m=String(v).replace(',','.').trim().match(/-?\d+(?:\.\d+)?/g);if(!m||!m.length) return null;var p=Number(m[m.length-1]);return isFinite(p)?p:null;}
      function extractVivaSample(sd,names){var samples=Array.isArray(sd&&sd.Samples)?sd.Samples:[];for(var i=0;i<names.length;i++){var s=samples.find(function(x){return x&&x.Name===names[i];});if(!s) continue;var nv=extractNumericValue(s.Value);if(nv==null) continue;return Object.assign({},s,{numericValue:nv});}return null;}
      function formatWaveSourceLabel(r){if(!r) return '--';return r.source==='VIVA'?'VIVA':(r.period||r.source||'--');}
      function buildVivaNearestCacheKey(lat,lon,names,lm){return Number(lat).toFixed(3)+':'+Number(lon).toFixed(3)+':'+names.join('|')+':'+(lm?'light':'full');}
      function buildWaveEvaluationCacheKey(s,lm){return s.id+':'+(lm?'light':'full');}
      async function fetchWaveDataForStation(id){for(var p of ['latest-hour','latest-day','latest-months']){var res=await fetch('/api/ocean-wave-height?stationId='+id+'&period='+p), data=await res.json();if(!res.ok) continue;var l=extractLatestValue(data);if(l&&l.value!=null&&l.value!=='') return {latest:l,period:p,source:'SMHI'};}return null;}
      async function getWaterLevelStations(){if(!waterLevelStationsPromise){waterLevelStationsPromise=(async function(){var res=await fetch('/api/ocean-stations'), data=await res.json();var st=Array.isArray(data&&data.station)?data.station:Array.isArray(data&&data.stations)?data.stations:Array.isArray(data&&data.resource)?data.resource:[];return st.map(function(s){var id=s.id||s.key||s.stationId, lat=Number(s.latitude), lon=Number(s.longitude);if(!id||isNaN(lat)||isNaN(lon)) return null;return {id:id,name:s.name||'Okänd station',latitude:lat,longitude:lon};}).filter(Boolean);})();}return waterLevelStationsPromise;}
      async function getVivaStations(){if(!vivaStationsPromise){vivaStationsPromise=(async function(){var res=await fetch('/api/viva-stations'), data=await res.json();if(!res.ok) throw new Error(data&&data.message||'Fel');return Array.isArray(data&&data.stations)?data.stations:[];})();}return vivaStationsPromise;}
      async function fetchVivaStationData(id){if(vivaStationDataCache.has(id)) return vivaStationDataCache.get(id);var p=(async function(){var res=await fetch('/api/viva-station?stationId='+id), data=await res.json();if(!res.ok) throw new Error(data&&data.message||'Fel');return data.station||null;})();vivaStationDataCache.set(id,p);try{return await p;}catch(e){vivaStationDataCache.delete(id);throw e;}}
      async function findNearestVivaObservationForPoint(lat,lon,names,lm){var ck=buildVivaNearestCacheKey(lat,lon,names,lm);if(vivaNearestCache.has(ck)) return vivaNearestCache.get(ck);var p=(async function(){var st=await getVivaStations();var rk=st.map(function(s){return Object.assign({},s,{distanceKm:distanceKm(lat,lon,s.latitude,s.longitude)});}).sort(function(a,b){return a.distanceKm-b.distanceKm;}).slice(0,lm?4:10);for(var s of rk){if(s.distanceKm>80) continue;try{var sd=await fetchVivaStationData(s.id), sa=extractVivaSample(sd,names);if(sa) return {station:s,latest:{value:sa.numericValue,time:sa.Updated||null},source:'VIVA',sampleName:sa.Name};}catch(e){console.warn('VIVA misslyckades',s.id,e);}}return null;})();vivaNearestCache.set(ck,p);try{return await p;}catch(e){vivaNearestCache.delete(ck);throw e;}}
      async function findNearestWaterLevelForPoint(lat,lon,lm){var st=await getWaterLevelStations();var rk=st.map(function(s){return Object.assign({},s,{distanceKm:distanceKm(lat,lon,s.latitude,s.longitude)});}).sort(function(a,b){return a.distanceKm-b.distanceKm;}).slice(0,lm?5:15);var periods=lm?['latest-hour','latest-day']:['latest-hour','latest-day','latest-months'];for(var s of rk){for(var per of periods){var res=await fetch('/api/ocean-water-level?stationId='+s.id+'&period='+per), data=await res.json();if(!res.ok) continue;var l=extractLatestValue(data);if(l&&l.value!=null&&l.value!=='') return {station:s,latest:l,period:per,source:'SMHI'};}}return null;}
      async function evaluateWaveStation(s,lm){var ck=buildWaveEvaluationCacheKey(s,lm);if(waveEvaluationCache.has(ck)) return waveEvaluationCache.get(ck);var p=(async function(){var results=await Promise.all([findNearestVivaObservationForPoint(s.latitude,s.longitude,['Våghöjd'],lm),findNearestVivaObservationForPoint(s.latitude,s.longitude,['Vattenstånd'],lm),findNearestVivaObservationForPoint(s.latitude,s.longitude,['Vattentemperatur','Vatten Temperatur','Ytvattentemperatur'],lm)]);var vw=results[0],vwt=results[1],vwtp=results[2];var fallbackResults=await Promise.all([vw?Promise.resolve(null):fetchWaveDataForStation(s.id),vwt?Promise.resolve(null):findNearestWaterLevelForPoint(s.latitude,s.longitude,lm)]);var sw=fallbackResults[0],swt=fallbackResults[1];var wr=vw||sw,wtr=vwt||swt,wtrp=vwtp||null;return {waveResult:wr,waterResult:wtr,waterTempResult:wtrp,hasAnySeaData:Boolean(wr||wtr)};})();waveEvaluationCache.set(ck,p);try{return await p;}catch(e){waveEvaluationCache.delete(ck);throw e;}}
      async function selectWaveStation(s){markObjectInteraction();if(selectedWaveStationId===s.id){clearWaveSelection();return;}selectedWaveStationId=s.id;saveSelection('wave',{id:s.id,name:s.name,lat:s.latitude,lon:s.longitude});updateWaveOverlay(s.name||'Boj / våg','Hämtar havsdata...');try{var result=await evaluateWaveStation(s,false), wr=result.waveResult, wtr=result.waterResult, wtrp=result.waterTempResult, has=result.hasAnySeaData;var wv=wr?formatObservedValue(formatWave(wr.latest.value),wr.latest):'--', wo=wr?formatObsTime(wr.latest.date||wr.latest.time)+' ('+formatWaveSourceLabel(wr)+')':'--', wlv=wtr?formatObservedValue(formatWaterLevel(wtr.latest.value),wtr.latest):'--', wtv=wtrp?formatObservedValue(formatTemp(wtrp.latest.value),wtrp.latest):'--';updateWaveOverlay(s.name||'Boj / våg',buildOverlayDataGrid([{label:'Våghöjd',value:wv,highlight:true},{label:'Vattentemp',value:wtv},{label:'Vattenst.',value:wlv},{label:'Obs',value:wo}]));setWaveMarkerColorById(s.id,has?'active':'inactive',s.name+' • '+(has?'data tillgänglig':'ingen data'));waveMarkerMap.forEach(function(_,otherId){if(otherId!==s.id){var otherStation=waveStationsCache.get(otherId);if(otherStation) setWaveMarkerColorById(otherId,'active',otherStation.name+' • data tillgänglig');}});refreshMapSizeSoon();}catch(e){console.error(e);updateWaveOverlay(s.name||'Boj / våg','Det gick inte att hämta havsdata.');setWaveMarkerColorById(s.id,'inactive',s.name+' • kunde inte hämtas');}}
      async function startWaveBackgroundCheck(){if(waveBackgroundCheckStarted) return;waveBackgroundCheckStarted=true;var stations=Array.from(waveStationsCache.values()), index=0;async function worker(){while(index<stations.length){var s=stations[index++];try{var r=await evaluateWaveStation(s,true);if(r.hasAnySeaData) createWaveStationMarkers(s);}catch(e){console.warn('Boj kunde inte verifieras',s.id,e);}}}await Promise.all(Array.from({length:3},function(){return worker();}));}
      async function ensureLighthouseStationsLoaded(){if(lighthouseStationsLoaded) return;if(lighthouseStationsLoadingPromise) return lighthouseStationsLoadingPromise;lighthouseStationsLoadingPromise=(async function(){try{var res=await fetch('/api/lighthouse-stations'), data=await res.json(), stations=Array.isArray(data&&data.stations)?data.stations:[];stations.forEach(function(s){lighthouseStationsCache.set(s.id,s);});lighthouseStationsLoaded=true;startLighthouseBackgroundCheck();}catch(e){console.error(e);}finally{lighthouseStationsLoadingPromise=null;}})();return lighthouseStationsLoadingPromise;}
      function createLighthouseStationMarkers(s){if(lighthouseMarkerMap.has(s.id)||lighthouseMaptilerMarkerMap.has(s.id)) return;var lm=L.circleMarker([s.latitude,s.longitude],{radius:7,weight:2,color:'#ff9f1c',fillColor:'#ff9f1c',fillOpacity:0.95,opacity:1,stroke:true});lm.bindTooltip(s.name+' • data tillgänglig',{direction:'top'});lm.on('click',function(e){L.DomEvent.stopPropagation(e);selectLighthouseStation(s);});lighthouseMarkerMap.set(s.id,lm);lighthouseStationsLayer.addLayer(lm);if(maptilerMap&&window.maptilersdk){var el=document.createElement('div');Object.assign(el.style,{width:'14px',height:'14px',borderRadius:'999px',background:'#ff9f1c',border:'2px solid rgba(255,255,255,0.75)',boxShadow:'0 0 0 4px rgba(255,159,28,0.24)',cursor:'pointer',display:showLighthouseObjects?'block':'none'});el.title=s.name+' • data tillgänglig';el.addEventListener('click',function(e){e.stopPropagation();selectLighthouseStation(s);});var mm=new maptilersdk.Marker({element:el}).setLngLat([s.longitude,s.latitude]).addTo(maptilerMap);lighthouseMaptilerMarkerMap.set(s.id,{marker:mm,element:el});}}
      async function fetchLighthouseObservations(id){if(lighthouseObservationCache.has(id)) return lighthouseObservationCache.get(id);var p=(async function(){var res=await fetch('/api/lighthouse-observations?stationId='+id), data=await res.json();if(!res.ok) throw new Error(data&&data.message||'Fel');var obs=data.observations||{};var has=Boolean((obs.temp&&obs.temp.value!=null)||(obs.windSpeed&&obs.windSpeed.value!=null)||(obs.windDir&&obs.windDir.value!=null)||(obs.pressure&&obs.pressure.value!=null)||(obs.gust&&obs.gust.value!=null));return {obs:obs,hasAnyData:has};})();lighthouseObservationCache.set(id,p);try{return await p;}catch(e){lighthouseObservationCache.delete(id);throw e;}}
      async function selectLighthouseStation(s){markObjectInteraction();if(selectedLighthouseStationId===s.id){clearLighthouseSelection();return;}selectedLighthouseStationId=s.id;saveSelection('lighthouse',{id:s.id,name:s.name,lat:s.latitude,lon:s.longitude});updateLighthouseOverlay(s.name||'Fyr / station','Hämtar data...');try{var result=await fetchLighthouseObservations(s.id), obs=result.obs, has=result.hasAnyData;var tv=formatObservedValue(formatTemp(obs.temp&&obs.temp.value),obs.temp), wv=formatObservedValue(formatWind(obs.windSpeed&&obs.windSpeed.value),obs.windSpeed), dv=formatObservedValue(formatWindDirection(obs.windDir&&obs.windDir.value),obs.windDir), gv=formatObservedValue(formatWind(obs.gust&&obs.gust.value),obs.gust), pv=formatObservedValue(formatPressure(obs.pressure&&obs.pressure.value),obs.pressure);updateLighthouseOverlay(s.name||'Fyr / station',buildOverlayDataGrid([{label:'Temp',value:tv,highlight:true},{label:'Vind',value:wv},{label:'Byar',value:gv},{label:'Riktning',value:dv},{label:'Tryck',value:pv}]));setLighthouseMarkerColorById(s.id,has?'active':'inactive',s.name+' • '+(has?'data tillgänglig':'ingen data'));lighthouseMarkerMap.forEach(function(_,otherId){if(otherId!==s.id){var otherStation=lighthouseStationsCache.get(otherId);if(otherStation) setLighthouseMarkerColorById(otherId,'active',otherStation.name+' • data tillgänglig');}});refreshMapSizeSoon();}catch(e){console.error(e);updateLighthouseOverlay(s.name||'Fyr / station','Det gick inte att hämta data.');setLighthouseMarkerColorById(s.id,'inactive',s.name+' • kunde inte hämtas');}}
      async function startLighthouseBackgroundCheck(){if(lighthouseBackgroundCheckStarted) return;lighthouseBackgroundCheckStarted=true;var stations=Array.from(lighthouseStationsCache.values()), index=0;async function worker(){while(index<stations.length){var s=stations[index++];try{var result=await fetchLighthouseObservations(s.id);if(result.hasAnyData) createLighthouseStationMarkers(s);}catch(e){console.warn('Fyr kunde inte verifieras',s.id,e);}}}await Promise.all(Array.from({length:5},function(){return worker();}));}

      if(window.maptilersdk){
        maptilersdk.config.apiKey=MAPTILER_API_KEY;
        maptilerMap=new maptilersdk.Map({container:'maptilerMap',style:maptilersdk.MapStyle.STREETS.DARK,center:[11.55,58.15],zoom:9,geolocateControl:false});
maptilerMap.on("rotate", function(){
  updateNauticalCompassHud();
  syncCustomUserLocationVisuals();
});

maptilerMap.on("move", function(){
  if(baseMapMode === "nautical"){
    updateNauticalCompassHud();
  }

  syncCustomUserLocationVisuals();
});

function setNauticalFreeMapFromUserGesture(){
  if(activeMode !== "nautical" || baseMapMode !== "nautical") return;
  if(Date.now() < mapCameraProgrammaticUntil) return;
  if(userTrackingMode === "off") return;
  userTrackingMode = "off";
  nauticalCompassMode = "north";
  updateNauticalCompassHud();
}
maptilerMap.on("dragstart", setNauticalFreeMapFromUserGesture);
maptilerMap.on("rotatestart", setNauticalFreeMapFromUserGesture);
maptilerMap.on("pitchstart", setNauticalFreeMapFromUserGesture);
maptilerMap.on("wheel", setNauticalFreeMapFromUserGesture);
maptilerMap.on("touchstart", function(){
  if(activeMode === "nautical" && baseMapMode === "nautical" && Date.now() >= mapCameraProgrammaticUntil){
    setTimeout(setNauticalFreeMapFromUserGesture, 0);
  }
});

        var weatherGeolocateControl=new maptilersdk.GeolocateControl({
  positionOptions:{
    enableHighAccuracy:true,
    maximumAge:0,
    timeout:10000
  },
  fitBoundsOptions:{
    maxZoom:16
  },
  trackUserLocation:false,
  showUserLocation:false,
  showAccuracyCircle:false,
  showUserHeading:false
});
        maptilerMap.addControl(weatherGeolocateControl,'top-right');
        var lastGeolocateWeatherAt=0, GEOLOCATE_CLICK_WINDOW_MS=2500, weatherSelectionMode="manual", lastUserWeatherLat=null,lastUserWeatherLon=null,lastUserWeatherAt=0, USER_WEATHER_MIN_MOVE_KM=0.5, USER_WEATHER_MIN_INTERVAL_MS=60*1000;
        function centerAfterLocateButton(coords){
          if(!coords) return;

          var isNauticalMode = activeMode === "nautical";

          if(isNauticalMode){
            userTrackingMode = "follow";
            nauticalCompassMode = "north";
          }else{
            userTrackingMode = "off";
          }

          handleUserPosition(coords, {
            allowWeatherRefresh: true,
            fromLocateButton: true,
            allowCameraFollow: isNauticalMode,
            immediateCamera: true
          });

          if(isNauticalMode){
            updateNavigationCamera({immediate:true});
          }else{
            centerMapOnUserLocationOnce({immediate:true,ensureUsefulZoom:true});
            setTimeout(function(){centerMapOnUserLocationOnce({immediate:true,ensureUsefulZoom:true});},220);
          }
        }

        function requestLocateButtonCenter(){
          if(!navigator.geolocation) return;
          navigator.geolocation.getCurrentPosition(function(pos){
            if(pos && pos.coords) centerAfterLocateButton(pos.coords);
          },function(err){
            console.warn("Manuell Min plats-centrering misslyckades", err);
          },{
            enableHighAccuracy:true,
            maximumAge:0,
            timeout:10000
          });
        }

        setTimeout(function(){var geolocateButton=document.querySelector(".maplibregl-ctrl-geolocate, .mapboxgl-ctrl-geolocate");if(geolocateButton){var markLocateButtonPressed=function(){lastGeolocateWeatherAt=Date.now();};var triggerLocateButtonCenter=function(){lastGeolocateWeatherAt=Date.now();setTimeout(requestLocateButtonCenter,0);};geolocateButton.addEventListener("pointerdown",markLocateButtonPressed,true);geolocateButton.addEventListener("touchstart",markLocateButtonPressed,true);geolocateButton.addEventListener("click",triggerLocateButtonCenter,true);}},0);
        function shouldRefreshWeatherForUserLocation(lat,lon){var now=Date.now();if(lastUserWeatherLat==null||lastUserWeatherLon==null){lastUserWeatherLat=lat;lastUserWeatherLon=lon;lastUserWeatherAt=now;return true;}var movedKm=distanceKmBetween(lastUserWeatherLat,lastUserWeatherLon,lat,lon), movedEnough=movedKm>=USER_WEATHER_MIN_MOVE_KM, waitedEnough=now-lastUserWeatherAt>=USER_WEATHER_MIN_INTERVAL_MS;if(movedEnough||waitedEnough){lastUserWeatherLat=lat;lastUserWeatherLon=lon;lastUserWeatherAt=now;return true;}return false;}
        async function updateWeatherFromUserLocation(lat,lon){weatherSelectionMode="user";clearWeatherSelectionMarker();saveSelection('weather',{lat:lat,lon:lon});selectedPlaceName="";updateMapOverlay("Hämtar plats...","Söker närmaste plats...");try{selectedPlaceName=await reverseGeocodePlace(lat,lon);}catch(e){selectedPlaceName="";}loadWeatherForPoint(lat,lon);}
        function selectAdvancedFromUserLocation(lat,lon){
          if(activeMode !== "advanced") return;
          selectAdvancedPoint(lat,lon,{openSheet:false});
        }
        function handleUserLocationUpdate(lat,lon,options){options=options||{};if(options.suppressWeather) return;if(options.fromLocateButton){lastUserWeatherLat=lat;lastUserWeatherLon=lon;lastUserWeatherAt=Date.now();updateWeatherFromUserLocation(lat,lon);selectAdvancedFromUserLocation(lat,lon);return;}if(weatherSelectionMode!=="user") return;if(shouldRefreshWeatherForUserLocation(lat,lon)){updateWeatherFromUserLocation(lat,lon);selectAdvancedFromUserLocation(lat,lon);}}
weatherGeolocateControl.on('geolocate',function(e){
  if(!e || !e.coords) return;

  var clickedLocateRecently =
    Date.now() - lastGeolocateWeatherAt < GEOLOCATE_CLICK_WINDOW_MS;

  if(clickedLocateRecently){
    lastGeolocateWeatherAt = 0;
  }

  var isNauticalMode = activeMode === "nautical";

  if(isNauticalMode){
    userTrackingMode = "follow";
    nauticalCompassMode = "north";
  }else{
    userTrackingMode = "off";
  }

  handleUserPosition(e.coords, {
    allowWeatherRefresh: clickedLocateRecently,
    fromLocateButton: clickedLocateRecently,
    allowCameraFollow: isNauticalMode,
    immediateCamera: true
  });

  // Min plats should always center the map in every mode/layer.
  // In Sjökort this also re-enters follow mode; outside Sjökort it is a one-time center.
  if(isNauticalMode){
    updateNavigationCamera({immediate:true});
  }else{
    centerMapOnUserLocationOnce({
      immediate: true,
      ensureUsefulZoom: true
    });
    setTimeout(function(){
      centerMapOnUserLocationOnce({
        immediate: true,
        ensureUsefulZoom: true
      });
    },220);
  }
});
        weatherGeolocateControl.on('error',function(e){console.warn("Min plats kunde inte aktiveras", e);});

        maptilerMap.on('load',function(){
          if(!window.maptilerweather){console.error('MapTiler Weather ej tillgänglig');return;}
          try{
            maptilerWindLayer=new maptilerweather.WindLayer({id:'main-wind-layer',colorramp:maptilerweather.ColorRamp.builtin.NULL,speed:0.001,fadeFactor:0.03,maxAmount:128,density:2,size:2.7,color:[80,220,120,90],fastColor:[255,70,70,180],fastSpeed:0.9});
            maptilerPrecipitationLayer=new maptilerweather.PrecipitationLayer({id:'main-precipitation-layer',colorramp:maptilerweather.ColorRamp.builtin.PRECIPITATION,opacity:0.95,smooth:true});
            maptilerRadarLayer=new maptilerweather.RadarLayer({id:'main-radar-layer',colorramp:maptilerweather.ColorRamp.builtin.RADAR,opacity:0.38,smooth:false});
            maptilerTemperatureLayer=new maptilerweather.TemperatureLayer({id:'main-temperature-layer',colorramp:maptilerweather.ColorRamp.builtin.TEMPERATURE_2,opacity:0.45});
            maptilerTimelineLayer=new maptilerweather.PrecipitationLayer({id:'timeline-controller-layer',opacity:0,smooth:true});
            maptilerMap.addLayer(maptilerTimelineLayer);
           ensureNauticalChartLayers(); setBaseMapMode(baseMapMode); ensureSeaAreaLayers(); ensureCustomUserLocationLayers(); renderSeaAreaPanel();
            if(windLayerVisible) maptilerMap.addLayer(maptilerWindLayer);
            if(precipitationLayerVisible) maptilerMap.addLayer(maptilerPrecipitationLayer);
            if(satelliteLayerVisible && activeMode!=="weather") syncOpenMeteoCloudLayerForSelectedTime(getSelectedAppTime(),{immediate:true,preload:true});
            warmOpenMeteoCloudMetadata();
            startOpenMeteoCloudStartupWarmup(getSelectedAppTime());
            if(radarLayerVisible) maptilerMap.addLayer(maptilerRadarLayer);
            if(temperatureLayerVisible) maptilerMap.addLayer(maptilerTemperatureLayer);

            var timeSlider=document.getElementById('timeSlider'), timeValueLabel=document.getElementById('timeValueLabel'), timePlayPauseBtn=document.getElementById('timePlayPauseBtn'), timeMinusHourBtn=document.getElementById('timeMinusHourBtn'), timePlusHourBtn=document.getElementById('timePlusHourBtn');
            var isTimePlaying = false;
            function setDeskBtn(id,on){var b=document.getElementById(id);if(!b) return;b.textContent=on?'På':'Av';b.classList.toggle('is-on',on);b.classList.toggle('is-off',!on);}
            function setMobToggle(id,on){var b=document.getElementById(id);if(b) b.classList.toggle('is-on',on);}
            function syncAllLayerButtons(){setDeskBtn('toggleWindLayerBtn',windLayerVisible);setDeskBtn('togglePrecipLayerBtn',precipitationLayerVisible);setDeskBtn('toggleSatelliteLayerBtn',satelliteLayerVisible);setDeskBtn('toggleRadarLayerBtn',radarLayerVisible);setDeskBtn('toggleRadarObservationBtn',smhiRadarObservationVisible);setDeskBtn('toggleTemperatureLayerBtn',temperatureLayerVisible);setDeskBtn('toggleWaveModeBtn',showWaveObjects);setDeskBtn('toggleLighthouseModeBtn',showLighthouseObjects);setMobToggle('mobileToggleWindBtn',windLayerVisible);setMobToggle('mobileTogglePrecipBtn',precipitationLayerVisible);setMobToggle('mobileToggleSatelliteBtn',satelliteLayerVisible);setMobToggle('mobileToggleRadarBtn',radarLayerVisible);setMobToggle('mobileToggleRadarObservationBtn',smhiRadarObservationVisible);setMobToggle('mobileToggleTemperatureBtn',temperatureLayerVisible);setMobToggle('mobileToggleWaveBtn',showWaveObjects);setMobToggle('mobileToggleLighthouseBtn',showLighthouseObjects);syncBaseMapButtons();syncAisButtons();updateActiveLayersBadge();refreshMobileNavState();}
            function updateTimeSliderProgress(){if(!timeSlider) return;var min=Number(timeSlider.min),max=Number(timeSlider.max),value=Number(timeSlider.value);if(!isFinite(min)||!isFinite(max)||max<=min||!isFinite(value)){timeSlider.style.setProperty('--time-progress','0%');return;}var progress=((value-min)/(max-min))*100;progress=Math.max(0,Math.min(100,progress));timeSlider.style.setProperty('--time-progress',progress+'%');}
  
            function updateTimeLabel(){if(timeValueLabel) timeValueLabel.textContent=selectedForecastTime?formatForecastLabelGlobal(selectedForecastTime):'--';var nowLabel=document.getElementById('timeNowLabel');if(nowLabel) nowLabel.textContent='Nu '+formatClockDotGlobal(new Date());updateTimeSliderProgress();updateTimeStepButtons();}
            function updateTimeStepButtons(){var ready=!!(forecastStartTime&&forecastEndTime&&selectedForecastTime);if(timeMinusHourBtn) timeMinusHourBtn.disabled=!ready||selectedForecastTime<=forecastStartTime;if(timePlusHourBtn) timePlusHourBtn.disabled=!ready||selectedForecastTime>=forecastEndTime;}
          function stepForecastTime(hours){
  if(!forecastStartTime || !forecastEndTime) return;

  stopTimePlayback();

  var base = getSelectedAppTime();
  var next = roundToForecastHour(base) + (hours * 60 * 60 * 1000);

  next = clampForecastTime(next);

  applySelectedForecastTimeImmediate(next);
}
    function applySelectedForecastTimeImmediate(timeValue){
  if(!timeValue) return;

  setSelectedAppTime(timeValue);

  if(!isFinite(selectedForecastTime)) return;

  var s = selectedForecastTime / 1000;

  try{
    if(maptilerTimelineLayer) maptilerTimelineLayer.setAnimationTime(s);
  }catch(e){}

  try{
    if(windLayerVisible && maptilerWindLayer){
      maptilerWindLayer.setAnimationTime(s);
    }
  }catch(e){}

  try{
    if(precipitationLayerVisible && maptilerPrecipitationLayer){
      maptilerPrecipitationLayer.setAnimationTime(s);
    }
  }catch(e){}

  try{
    if(radarLayerVisible && maptilerRadarLayer){
      maptilerRadarLayer.setAnimationTime(s);
    }
  }catch(e){}

  try{
    if(smhiRadarObservationVisible){
      syncSmhiRadarObservationForSelectedTime();
    }
  }catch(e){}

  try{
    if(temperatureLayerVisible && maptilerTemperatureLayer){
      maptilerTemperatureLayer.setAnimationTime(s);
    }
  }catch(e){}

  try{
    if(satelliteLayerVisible){
      var shownFromCache = false;

      if(typeof showCachedOpenMeteoCloudLayerForTime === "function"){
        shownFromCache = showCachedOpenMeteoCloudLayerForTime(selectedForecastTime);
      }

      if(!shownFromCache && typeof syncOpenMeteoCloudLayerForSelectedTime === "function"){
        syncOpenMeteoCloudLayerForSelectedTime(selectedForecastTime, {
          immediate: true,
          preload: true
        });
      }else if(
        typeof queueOpenMeteoCloudWindow === "function" &&
        openMeteoCloudValidTimes.length
      ){
        queueOpenMeteoCloudWindow(
          selectedForecastTime,
          OPEN_METEO_CLOUD_DRAG_RADIUS,
          100
        );
      }
    }
  }catch(e){}

  if(timeSlider){
    timeSlider.value = String(selectedForecastTime);
  }

  updateTimeLabel();

  if(window.updateWeatherForSelectedTime){
    window.updateWeatherForSelectedTime(selectedForecastTime);
  }

  if(activeMode === "advanced" && typeof renderAdvancedAccordion === "function"){
    renderAdvancedAccordion();
  }
}
            function stopTimePlayback(){if(timePlaybackTimer){clearInterval(timePlaybackTimer);timePlaybackTimer=null;}isTimePlaying=false;}
            function getFirstReadyTimelineLayer(){var candidates=[maptilerTimelineLayer,maptilerPrecipitationLayer,maptilerRadarLayer,maptilerTemperatureLayer,maptilerWindLayer];for(var i=0;i<candidates.length;i++){var layer=candidates[i];if(!layer) continue;var sd=layer.getAnimationStartDate&&layer.getAnimationStartDate(), ed=layer.getAnimationEndDate&&layer.getAnimationEndDate(), cd=layer.getAnimationTimeDate&&layer.getAnimationTimeDate();if(sd&&ed&&cd&&isFinite(+sd)&&isFinite(+ed)&&isFinite(+cd)) return {layer:layer,start:+sd,end:+ed,current:+cd};}return null;}
            function initializeForecastTimeline(){
  if(!timeSlider) return false;

  var timeline = getFirstReadyTimelineLayer();
  if(!timeline) return false;

  if(forecastTimelineInitialized) return true;

  forecastTimelineInitialized = true;

  setForecastTimeBounds(timeline.start, timeline.end);

  setSelectedAppTime(Date.now());

  timeSlider.min = String(forecastStartTime);
  timeSlider.max = String(forecastEndTime);
  timeSlider.step = String(60 * 60 * 1000);
  timeSlider.value = String(selectedForecastTime);

  updateTimeLabel();
  applySelectedForecastTimeImmediate(selectedForecastTime);

  if(satelliteLayerVisible){
    syncOpenMeteoCloudLayerForSelectedTime(selectedForecastTime, {
      immediate:true,
      preload:true
    });

    startOpenMeteoCloudStartupWarmup(selectedForecastTime);
  }

  refreshMapSizeSoon();

  return true;
}
            function isMapLayerAdded(layerId){try{return !!(maptilerMap&&maptilerMap.getLayer&&maptilerMap.getLayer(layerId));}catch(e){return false;}}
            function safeAddWeatherLayer(layer,layerId){if(!maptilerMap||!layer) return false;try{if(isMapLayerAdded(layerId)) return true;maptilerMap.addLayer(layer);scheduleNauticalLayerOrderRefresh();if(selectedForecastTime&&layer.setAnimationTime) layer.setAnimationTime(selectedForecastTime/1000);return true;}catch(e){console.warn("Kunde inte lägga till lager:", layerId, e);return false;}}
            function safeRemoveWeatherLayer(layerId){if(!maptilerMap) return false;try{if(isMapLayerAdded(layerId)) maptilerMap.removeLayer(layerId);return true;}catch(e){console.warn("Kunde inte ta bort lager:", layerId, e);return false;}}
            function setRadarObservationNotice(visible,text){var el=document.getElementById('radarObservationNotice');if(!el) return;if(text) el.textContent=text;el.classList.toggle('is-visible',!!visible);}
            function isForecastTimeInFuture(timeValue){return isFutureAppTime(timeValue || getSelectedAppTime(), 2*60*1000);}
            function sweref99TmToWgs84(easting,northing){
              var axis=6378137.0, invFlattening=298.257222101, centralMeridian=15.0, scale=0.9996, falseNorthing=0.0, falseEasting=500000.0;
              var flattening=1.0/invFlattening, e2=flattening*(2.0-flattening), n=flattening/(2.0-flattening);
              var aRoof=axis/(1.0+n)*(1.0+n*n/4.0+Math.pow(n,4)/64.0);
              var d1=n/2.0-2.0*n*n/3.0+37.0*Math.pow(n,3)/96.0-Math.pow(n,4)/360.0;
              var d2=n*n/48.0+Math.pow(n,3)/15.0-437.0*Math.pow(n,4)/1440.0;
              var d3=17.0*Math.pow(n,3)/480.0-37.0*Math.pow(n,4)/840.0;
              var d4=4397.0*Math.pow(n,4)/161280.0;
              var xi=(northing-falseNorthing)/(scale*aRoof);
              var eta=(easting-falseEasting)/(scale*aRoof);
              var xiPrim=xi-d1*Math.sin(2.0*xi)*Math.cosh(2.0*eta)-d2*Math.sin(4.0*xi)*Math.cosh(4.0*eta)-d3*Math.sin(6.0*xi)*Math.cosh(6.0*eta)-d4*Math.sin(8.0*xi)*Math.cosh(8.0*eta);
              var etaPrim=eta-d1*Math.cos(2.0*xi)*Math.sinh(2.0*eta)-d2*Math.cos(4.0*xi)*Math.sinh(4.0*eta)-d3*Math.cos(6.0*xi)*Math.sinh(6.0*eta)-d4*Math.cos(8.0*xi)*Math.sinh(8.0*eta);
              var phiStar=Math.asin(Math.sin(xiPrim)/Math.cosh(etaPrim));
              var deltaLambda=Math.atan(Math.sinh(etaPrim)/Math.cos(xiPrim));
              var A=e2;
              var B=(5.0*e2*e2-Math.pow(e2,3))/6.0;
              var C=(104.0*Math.pow(e2,3)-45.0*Math.pow(e2,4))/120.0;
              var D=1237.0*Math.pow(e2,4)/1260.0;
              var sinPhi=Math.sin(phiStar), cosPhi=Math.cos(phiStar);
              var lat=phiStar+sinPhi*cosPhi*(A+B*sinPhi*sinPhi+C*Math.pow(sinPhi,4)+D*Math.pow(sinPhi,6));
              var lon=centralMeridian*Math.PI/180.0+deltaLambda;
              return [lon*180.0/Math.PI, lat*180.0/Math.PI];
            }
            function getSmhiRadarObservationTileCoordinates(col,row,cols,rows){
              var west=126648, east=1075693, south=5983984, north=7771252;
              var left=west+(east-west)*(col/cols);
              var right=west+(east-west)*((col+1)/cols);
              var top=north-(north-south)*(row/rows);
              var bottom=north-(north-south)*((row+1)/rows);
              return [sweref99TmToWgs84(left,top),sweref99TmToWgs84(right,top),sweref99TmToWgs84(right,bottom),sweref99TmToWgs84(left,bottom)];
            }
            function loadSmhiRadarImage(url){return new Promise(function(resolve,reject){var img=new Image();img.onload=function(){resolve(img);};img.onerror=reject;img.src=url;});}
            function makeSmhiRadarTileDataUrl(img,col,row,cols,rows){
              var sx=Math.round(img.naturalWidth*col/cols), sy=Math.round(img.naturalHeight*row/rows);
              var sx2=Math.round(img.naturalWidth*(col+1)/cols), sy2=Math.round(img.naturalHeight*(row+1)/rows);
              var sw=Math.max(1,sx2-sx), sh=Math.max(1,sy2-sy);
              var canvas=document.createElement('canvas');canvas.width=sw;canvas.height=sh;
              var ctx=canvas.getContext('2d');ctx.drawImage(img,sx,sy,sw,sh,0,0,sw,sh);
              return canvas.toDataURL('image/png');
            }
            function removeSmhiRadarObservationLayer(){if(!maptilerMap) return;var layerIds=(smhiRadarObservationTileIds&&smhiRadarObservationTileIds.length)?smhiRadarObservationTileIds:[smhiRadarObservationLayerId];var sourceIds=(smhiRadarObservationSourceIds&&smhiRadarObservationSourceIds.length)?smhiRadarObservationSourceIds:[smhiRadarObservationSourceId];layerIds.forEach(function(id){try{if(maptilerMap.getLayer&&maptilerMap.getLayer(id)) maptilerMap.removeLayer(id);}catch(e){}});sourceIds.forEach(function(id){try{if(maptilerMap.getSource&&maptilerMap.getSource(id)) maptilerMap.removeSource(id);}catch(e){}});smhiRadarObservationTileIds=[];smhiRadarObservationSourceIds=[];smhiRadarObservationActiveKey=null;setRadarObservationNotice(false);}
            function addOrUpdateSmhiRadarObservationLayer(frame){if(!maptilerMap||!frame||!frame.imageUrl) return Promise.resolve(false);var key=frame.timestamp||String(Date.now());if(smhiRadarObservationActiveKey===key&&smhiRadarObservationTileIds&&smhiRadarObservationTileIds.length) return Promise.resolve(true);return loadSmhiRadarImage(frame.imageUrl).then(function(img){removeSmhiRadarObservationLayer();var cols=6, rows=8;try{for(var row=0;row<rows;row++){for(var col=0;col<cols;col++){var sourceId=smhiRadarObservationSourceId+'-'+row+'-'+col;var layerId=smhiRadarObservationLayerId+'-'+row+'-'+col;maptilerMap.addSource(sourceId,{type:'image',url:makeSmhiRadarTileDataUrl(img,col,row,cols,rows),coordinates:getSmhiRadarObservationTileCoordinates(col,row,cols,rows)});maptilerMap.addLayer({id:layerId,type:'raster',source:sourceId,paint:{'raster-opacity':0.72,'raster-fade-duration':180}});smhiRadarObservationSourceIds.push(sourceId);smhiRadarObservationTileIds.push(layerId);}}scheduleNauticalLayerOrderRefresh();smhiRadarObservationActiveKey=key;setRadarObservationNotice(false);return true;}catch(e){console.warn('Kunde inte visa SMHI radarobservation',e);removeSmhiRadarObservationLayer();return false;}}).catch(function(e){console.warn('Kunde inte ladda SMHI radarbild',e);removeSmhiRadarObservationLayer();return false;});}
            function syncSmhiRadarObservationForSelectedTime(){if(!smhiRadarObservationVisible) return;if(!isLayerAllowedInMode('radarObservation')){smhiRadarObservationVisible=false;removeSmhiRadarObservationLayer();syncAllLayerButtons();return;}var radarTime=getSmhiRadarObservationRequestTime(getSelectedAppTime());var target=radarTime.requestMs;if(radarTime.isForecast){removeSmhiRadarObservationLayer();setRadarObservationNotice(true,'Observation finns bara för nu och tidigare tider');return;}var requestId=++smhiRadarObservationRequestId;var url='/api/frames?time='+encodeURIComponent(new Date(target).toISOString())+'&nearest=1';fetch(url).then(function(resp){if(!resp.ok) throw new Error('SMHI radar '+resp.status);return resp.json();}).then(function(data){if(requestId!==smhiRadarObservationRequestId||!smhiRadarObservationVisible) return;if(!data||data.available===false||!data.frames||!data.frames[0]){removeSmhiRadarObservationLayer();setRadarObservationNotice(true,(data&&data.message)||'Radar observation saknas för vald tid');return;}return addOrUpdateSmhiRadarObservationLayer(data.frames[0]).then(function(ok){if(requestId!==smhiRadarObservationRequestId||!smhiRadarObservationVisible) return;if(!ok) setRadarObservationNotice(true,'Radar observation kunde inte visas');});}).catch(function(e){if(requestId!==smhiRadarObservationRequestId) return;console.warn('SMHI radarobservation kunde inte hämtas',e);removeSmhiRadarObservationLayer();setRadarObservationNotice(true,'Radar observation kunde inte laddas');});}
            function onRadarObservationToggle(){if(!isLayerAllowedInMode('radarObservation')) return;smhiRadarObservationVisible=!smhiRadarObservationVisible;if(smhiRadarObservationVisible) syncSmhiRadarObservationForSelectedTime(); else removeSmhiRadarObservationLayer();syncAllLayerButtons();}
            function onWindToggle(){if(!isLayerAllowedInMode("wind") || !maptilerWindLayer) return;if(windLayerVisible){safeRemoveWeatherLayer('main-wind-layer');windLayerVisible=false;}else windLayerVisible=safeAddWeatherLayer(maptilerWindLayer,'main-wind-layer');syncAllLayerButtons();}
            function onPrecipToggle(){if(!isLayerAllowedInMode("precip") || !maptilerPrecipitationLayer) return;if(precipitationLayerVisible){try{maptilerMap.removeLayer('main-precipitation-layer');}catch(e){}}else{try{maptilerMap.addLayer(maptilerPrecipitationLayer);scheduleNauticalLayerOrderRefresh();if(selectedForecastTime) maptilerPrecipitationLayer.setAnimationTime(selectedForecastTime/1000);}catch(e){}}precipitationLayerVisible=!precipitationLayerVisible;syncAllLayerButtons();}
            function onSatelliteToggle(){if(!isLayerAllowedInMode("satellite")) return;satelliteLayerVisible=!satelliteLayerVisible;if(satelliteLayerVisible){syncOpenMeteoCloudLayerForSelectedTime(getSelectedAppTime(),{immediate:true,preload:true});openMeteoCloudStartupWarmupStarted=false;startOpenMeteoCloudStartupWarmup(getSelectedAppTime());}else{cancelOpenMeteoCloudWarmup();removeOpenMeteoCloudLayer();}syncAllLayerButtons();}
            function onRadarToggle(){if(!isLayerAllowedInMode("radar") || !maptilerRadarLayer) return;if(radarLayerVisible) maptilerMap.removeLayer('main-radar-layer'); else{maptilerMap.addLayer(maptilerRadarLayer);scheduleNauticalLayerOrderRefresh();if(selectedForecastTime) maptilerRadarLayer.setAnimationTime(selectedForecastTime/1000);}radarLayerVisible=!radarLayerVisible;syncAllLayerButtons();}
            function onTemperatureToggle(){if(!isLayerAllowedInMode("temperature") || !maptilerTemperatureLayer) return;if(temperatureLayerVisible) maptilerMap.removeLayer('main-temperature-layer'); else{maptilerMap.addLayer(maptilerTemperatureLayer);scheduleNauticalLayerOrderRefresh();if(selectedForecastTime) maptilerTemperatureLayer.setAnimationTime(selectedForecastTime/1000);}temperatureLayerVisible=!temperatureLayerVisible;syncAllLayerButtons();}

            ['toggleBaseMapBtn','mobileToggleBaseMapBtn'].forEach(function(id){var el=document.getElementById(id);if(el) el.addEventListener('click',function(e){e.stopPropagation();if(!isLayerAllowedInMode("base")) return;toggleBaseMapMode();});});
            ['toggleWindLayerBtn','mobileToggleWindBtn'].forEach(function(id){var el=document.getElementById(id);if(el) el.addEventListener('click',onWindToggle);});
            ['togglePrecipLayerBtn','mobileTogglePrecipBtn'].forEach(function(id){var el=document.getElementById(id);if(el) el.addEventListener('click',onPrecipToggle);});
            ['toggleSatelliteLayerBtn','mobileToggleSatelliteBtn'].forEach(function(id){var el=document.getElementById(id);if(el) el.addEventListener('click',onSatelliteToggle);});
            ['toggleRadarLayerBtn','mobileToggleRadarBtn'].forEach(function(id){var el=document.getElementById(id);if(el) el.addEventListener('click',onRadarToggle);});
            ['toggleRadarObservationBtn','mobileToggleRadarObservationBtn'].forEach(function(id){var el=document.getElementById(id);if(el) el.addEventListener('click',onRadarObservationToggle);});
            ['toggleTemperatureLayerBtn','mobileToggleTemperatureBtn'].forEach(function(id){var el=document.getElementById(id);if(el) el.addEventListener('click',onTemperatureToggle);});
            var desktopToggleWaveBtn=document.getElementById('toggleWaveModeBtn');
            if(desktopToggleWaveBtn && !desktopToggleWaveBtn.dataset.boundClick){desktopToggleWaveBtn.dataset.boundClick='1';desktopToggleWaveBtn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();if(!isLayerAllowedInMode("wave")) return;toggleWaveObjects();syncAllLayerButtons();});}
            var desktopToggleLighthouseBtn=document.getElementById('toggleLighthouseModeBtn');
            if(desktopToggleLighthouseBtn && !desktopToggleLighthouseBtn.dataset.boundClick){desktopToggleLighthouseBtn.dataset.boundClick='1';desktopToggleLighthouseBtn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();if(!isLayerAllowedInMode("lighthouse")) return;toggleLighthouseObjects();syncAllLayerButtons();});}
            var mobileToggleWaveBtn=document.getElementById('mobileToggleWaveBtn');
            if(mobileToggleWaveBtn && !mobileToggleWaveBtn.dataset.boundClick){mobileToggleWaveBtn.dataset.boundClick='1';mobileToggleWaveBtn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();if(!isLayerAllowedInMode("wave")) return;toggleWaveObjects();syncAllLayerButtons();});}
            var mobileToggleLighthouseBtn=document.getElementById('mobileToggleLighthouseBtn');
            if(mobileToggleLighthouseBtn && !mobileToggleLighthouseBtn.dataset.boundClick){mobileToggleLighthouseBtn.dataset.boundClick='1';mobileToggleLighthouseBtn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();if(!isLayerAllowedInMode("lighthouse")) return;toggleLighthouseObjects();syncAllLayerButtons();});}
           var desktopToggleAisBtn=document.getElementById('toggleAisLayerBtn');
if(desktopToggleAisBtn && !desktopToggleAisBtn.dataset.boundClick){
  desktopToggleAisBtn.dataset.boundClick='1';
  desktopToggleAisBtn.addEventListener('click',function(e){
    e.preventDefault();
    e.stopPropagation();
    if(!isLayerAllowedInMode("ais")) return;onAisToggle();
  });
}

var mobileToggleAisBtn=document.getElementById('mobileToggleAisBtn');
if(mobileToggleAisBtn && !mobileToggleAisBtn.dataset.boundClick){
  mobileToggleAisBtn.dataset.boundClick='1';
  mobileToggleAisBtn.addEventListener('click',function(e){
    e.preventDefault();
    e.stopPropagation();
    if(!isLayerAllowedInMode("ais")) return;onAisToggle();
  });
}

aisControlsReady=true;
syncAisButtons();
            [maptilerTimelineLayer,maptilerPrecipitationLayer,maptilerRadarLayer,maptilerTemperatureLayer,maptilerWindLayer].forEach(function(layer){if(!layer||!layer.on) return;layer.on('sourceReady',function(){initializeForecastTimeline();});});
            setTimeout(function(){initializeForecastTimeline();},800);setTimeout(function(){initializeForecastTimeline();},1400);syncAllLayerButtons();
           if(timeSlider){
  var handleInput = function(){
    stopTimePlayback();

    var rounded = clampForecastTime(parseInt(timeSlider.value, 10));

    timeSlider.value = String(rounded);

    applySelectedForecastTimeImmediate(rounded);
  };

  var handleFinalChange = function(){
    stopTimePlayback();

    var finalTime = clampForecastTime(parseInt(timeSlider.value, 10));

    timeSlider.value = String(finalTime);

    applySelectedForecastTimeImmediate(finalTime);
  };

  var stopTouch = function(e){
    e.stopPropagation();
  };

  timeSlider.addEventListener('input', handleInput);
  timeSlider.addEventListener('change', handleFinalChange);

  timeSlider.addEventListener('touchstart', stopTouch, {passive:true});
  timeSlider.addEventListener('touchmove', stopTouch, {passive:true});
  timeSlider.addEventListener('touchend', function(e){
    stopTouch(e);
    handleFinalChange();
  }, {passive:true});

  timeSlider.addEventListener('pointerdown', stopTouch);
  timeSlider.addEventListener('pointermove', stopTouch);
  timeSlider.addEventListener('pointerup', function(e){
    stopTouch(e);
    handleFinalChange();
  });

  var tc = document.getElementById('timeControl');

  if(tc){
    tc.addEventListener('touchstart', stopTouch, {passive:true});
    tc.addEventListener('touchmove', stopTouch, {passive:true});
    tc.addEventListener('pointerdown', stopTouch);
  }

  if(timePlayPauseBtn){
    timePlayPauseBtn.addEventListener('touchstart', stopTouch, {passive:true});
    timePlayPauseBtn.addEventListener('touchend', stopTouch, {passive:true});
    timePlayPauseBtn.addEventListener('pointerdown', stopTouch);
    timePlayPauseBtn.addEventListener('click', stopTouch);
  }

  if(timeMinusHourBtn){
    timeMinusHourBtn.addEventListener('touchstart', stopTouch, {passive:true});
    timeMinusHourBtn.addEventListener('touchend', stopTouch, {passive:true});
    timeMinusHourBtn.addEventListener('pointerdown', stopTouch);
  }

  if(timePlusHourBtn){
    timePlusHourBtn.addEventListener('touchstart', stopTouch, {passive:true});
    timePlusHourBtn.addEventListener('touchend', stopTouch, {passive:true});
    timePlusHourBtn.addEventListener('pointerdown', stopTouch);
  }
}
            function resetForecastTimeToNow(){
  if(!forecastStartTime || !forecastEndTime) return;

  stopTimePlayback();

  var target = clampForecastTime(Date.now());

  applySelectedForecastTimeImmediate(target);
}
            if(timeMinusHourBtn) timeMinusHourBtn.addEventListener('click',function(e){e.stopPropagation();stepForecastTime(-1);});
            if(timePlusHourBtn) timePlusHourBtn.addEventListener('click',function(e){e.stopPropagation();stepForecastTime(1);});
            if(timePlayPauseBtn) timePlayPauseBtn.addEventListener('click',function(e){e.stopPropagation();resetForecastTimeToNow();});
            refreshMapSizeSoon();
          }catch(err){console.error('Fel vid skapande av väderlager.', err);}
        });
        var isSyncMT=false,isSyncL=false;
        maptilerMap.on('moveend',function(){
  if(isSyncL) return;

  var currentZoom = maptilerMap.getZoom ? maptilerMap.getZoom() : 0;

  if(showAisObjects){
    var blocked = currentZoom < AIS_MIN_ZOOM;
    setAisZoomBlocked(blocked);
    setAisMarkersVisible(!blocked);

    if(!blocked) scheduleAisDataLoad(true);
  }

  isSyncMT = true;
  var c = maptilerMap.getCenter();
  map.setView([c.lat,c.lng],currentZoom,{animate:false});

  if(satelliteLayerVisible && selectedForecastTime && typeof queueOpenMeteoCloudWindow==="function" && openMeteoCloudValidTimes.length){
    queueOpenMeteoCloudWindow(getSelectedAppTime(),OPEN_METEO_CLOUD_DRAG_RADIUS,40);
  }

  setTimeout(function(){isSyncMT=false;},0);
});
        maptilerMap.on('click',function(e){if(e.lngLat) handleMapClick(e.lngLat.lat,e.lngLat.lng);});
      }else{
        console.error('MapTiler SDK ej tillgänglig');
      }

      window.addEventListener('resize',refreshMapSizeSoon);
      window.addEventListener('orientationchange',function(){setTimeout(function(){refreshMapSizeSoon();},250);});
      updateModeUI(); updateActiveLayersBadge(); renderFavoritesList(); setTimeout(function(){refreshMapSizeSoon();},120); setTimeout(function(){refreshMapSizeSoon();},500);
    

    (function(){
      var splashDelay=1500, fadeDuration=300, appShown=false;
      function showAppAfterSplash(){
        if(appShown) return; appShown=true;
        var splash=document.getElementById("appSplash"), appRoot=document.getElementById("appRoot");
        if(appRoot) appRoot.style.visibility="visible";
        if(splash){splash.classList.add("is-hidden");window.setTimeout(function(){if(splash&&splash.parentNode) splash.parentNode.removeChild(splash);},fadeDuration);}
      }
      window.addEventListener("load",function(){window.setTimeout(showAppAfterSplash,splashDelay);});
      window.setTimeout(showAppAfterSplash,2200);
    })();
  

    (function(){
      function setAdvancedTimelineHeight(){
        try{
          var timeControl=document.getElementById('timeControl');
          if(!timeControl) return;
          var h=Math.ceil(timeControl.getBoundingClientRect().height || timeControl.offsetHeight || 96);
          if(h<72) h=96;
          document.documentElement.style.setProperty('--advanced-timebar-height', h+'px');
        }catch(e){}
      }
      window.addEventListener('resize', setAdvancedTimelineHeight);
      window.addEventListener('orientationchange', function(){setTimeout(setAdvancedTimelineHeight, 180);});
      window.addEventListener('load', function(){setAdvancedTimelineHeight(); setTimeout(setAdvancedTimelineHeight, 250); setTimeout(setAdvancedTimelineHeight, 800);});
      document.addEventListener('click', function(){setTimeout(setAdvancedTimelineHeight, 40);}, true);
      setAdvancedTimelineHeight();
    })();
  