app.get("/api/openmeteo-uv", async function(req, res){
  try{
    var lat = Number(req.query.lat);
    var lon = Number(req.query.lon);

    if(!isFinite(lat) || !isFinite(lon)){
      return res.status(400).json({
        error: "lat/lon saknas eller är ogiltiga"
      });
    }

    var url =
      "https://api.open-meteo.com/v1/forecast" +
      "?latitude=" + encodeURIComponent(String(lat)) +
      "&longitude=" + encodeURIComponent(String(lon)) +
      "&hourly=uv_index" +
      "&forecast_days=7" +
      "&timezone=auto";

    var response = await fetch(url);
    var data = await response.json();

    if(!response.ok){
      return res.status(response.status).json({
        error: "Open-Meteo UV kunde inte hämtas",
        details: data
      });
    }

    var times = data.hourly && data.hourly.time ? data.hourly.time : [];
    var values = data.hourly && data.hourly.uv_index ? data.hourly.uv_index : [];

    var timeseries = times.map(function(time, index){
      return {
        time: time,
        uvIndex: values[index]
      };
    }).filter(function(row){
      return row.time && row.uvIndex != null && isFinite(Number(row.uvIndex));
    });

    res.json({
      source: "open-meteo",
      timeseries: timeseries
    });
  }catch(error){
    console.error(error);
    res.status(500).json({
      error: "UV-index kunde inte hämtas"
    });
  }
});
