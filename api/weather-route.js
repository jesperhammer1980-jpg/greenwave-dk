const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const WEATHER_ROUTE_MAX_SAMPLES = 3;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }

  try {
    const body = parseBody(req.body);
    const geometry = normalizeGeometry(body.geometry || body.coordinates || body.route?.geometry?.coordinates);
    const points = routeSamplePoints(geometry);

    if (points.length < 1) {
      return res.status(400).json({
        ok: false,
        error: "Missing or invalid route geometry",
        debug: { receivedKeys: Object.keys(body) }
      });
    }

    const weather = await fetchOpenMeteo(points);

    return res.status(200).json({
      ok: true,
      pricing: null,
      source: {
        id: "open-meteo",
        name: "Open-Meteo Forecast API",
        url: "https://open-meteo.com/"
      },
      message: "Automatisk vejr fra Open-Meteo. Manuel vejrinput bruges som fallback, hvis kilden fejler.",
      weather,
      debug: {
        sampleCount: points.length,
        points
      }
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      status: "weather-upstream-error",
      error: error.message || String(error),
      message: "Automatisk vejr ikke tilgængeligt."
    });
  }
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

function normalizeGeometry(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((point) => {
      if (Array.isArray(point)) {
        const a = Number(point[0]);
        const b = Number(point[1]);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
        return Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lng: b } : { lat: b, lng: a };
      }
      const lat = Number(point?.lat ?? point?.latitude);
      const lng = Number(point?.lng ?? point?.lon ?? point?.longitude);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    })
    .filter(Boolean);
}

function routeSamplePoints(geometry) {
  if (!geometry.length) return [];
  if (geometry.length === 1) return [geometry[0]];
  const indexes = [0, Math.floor((geometry.length - 1) / 2), geometry.length - 1];
  const unique = [];
  for (const index of indexes) {
    const point = geometry[index];
    if (point && !unique.some((p) => Math.abs(p.lat - point.lat) < 0.000001 && Math.abs(p.lng - point.lng) < 0.000001)) {
      unique.push(point);
    }
  }
  return unique.slice(0, WEATHER_ROUTE_MAX_SAMPLES);
}

async function fetchOpenMeteo(points) {
  const url = new URL(OPEN_METEO_FORECAST_URL);
  url.searchParams.set("latitude", points.map((p) => p.lat.toFixed(6)).join(","));
  url.searchParams.set("longitude", points.map((p) => p.lng.toFixed(6)).join(","));
  url.searchParams.set("current", "temperature_2m,wind_speed_10m,wind_direction_10m,precipitation,rain,snowfall");
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("timezone", "auto");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "GreenWave-DK/1.20 weather-route" },
      signal: controller.signal
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`Open-Meteo HTTP ${response.status}: ${data?.reason || data?.error || response.statusText}`);
    }
    return summarizeWeather(Array.isArray(data) ? data : [data]);
  } finally {
    clearTimeout(timeout);
  }
}

function summarizeWeather(rows) {
  const samples = rows.map(normalizeWeatherSample).filter(Boolean);
  if (!samples.length) {
    throw new Error("Open-Meteo returned no usable current weather samples");
  }

  const temperatureC = average(samples.map((s) => s.temperatureC));
  const windKmh = average(samples.map((s) => s.windKmh));
  const windDirectionDeg = averageDirection(samples.map((s) => s.windDirectionDeg));
  const precipitationMm = max(samples.map((s) => s.precipitationMm));
  const rainMm = max(samples.map((s) => s.rainMm));
  const snowfallMm = max(samples.map((s) => s.snowfallMm));

  return {
    temperatureC: round1(temperatureC),
    windKmh: round1(windKmh),
    windDirectionDeg: Math.round(windDirectionDeg),
    precipitationMm: round2(precipitationMm),
    rainMm: round2(rainMm),
    snowfallMm: round2(snowfallMm),
    precipitation: precipitationCategory({ precipitationMm, rainMm, snowfallMm }),
    time: samples.find((s) => s.time)?.time || null,
    samples
  };
}

function normalizeWeatherSample(row) {
  const current = row?.current || row?.current_weather;
  if (!current) return null;
  const temperatureC = Number(current.temperature_2m ?? current.temperature);
  const windKmh = Number(current.wind_speed_10m ?? current.windspeed);
  const windDirectionDeg = Number(current.wind_direction_10m ?? current.winddirection);
  const precipitationMm = Number(current.precipitation ?? 0);
  const rainMm = Number(current.rain ?? 0);
  const snowfallMm = Number(current.snowfall ?? 0);
  if (!Number.isFinite(temperatureC) && !Number.isFinite(windKmh)) return null;
  return {
    latitude: numberOrNull(row.latitude),
    longitude: numberOrNull(row.longitude),
    temperatureC: numberOrDefault(temperatureC, 10),
    windKmh: numberOrDefault(windKmh, 10),
    windDirectionDeg: numberOrDefault(windDirectionDeg, 0),
    precipitationMm: numberOrDefault(precipitationMm, 0),
    rainMm: numberOrDefault(rainMm, 0),
    snowfallMm: numberOrDefault(snowfallMm, 0),
    time: current.time || null
  };
}

function precipitationCategory({ precipitationMm, rainMm, snowfallMm }) {
  if (Number(snowfallMm) > 0.05) return "snow";
  const wet = Math.max(Number(precipitationMm) || 0, Number(rainMm) || 0);
  if (wet >= 2) return "heavyRain";
  if (wet > 0.05) return "rain";
  return "none";
}

function average(values) {
  const usable = values.filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : 0;
}

function max(values) {
  const usable = values.filter(Number.isFinite);
  return usable.length ? Math.max(...usable) : 0;
}

function averageDirection(values) {
  const usable = values.filter(Number.isFinite);
  if (!usable.length) return 0;
  const radians = usable.map((value) => (value * Math.PI) / 180);
  const sin = radians.reduce((sum, value) => sum + Math.sin(value), 0) / usable.length;
  const cos = radians.reduce((sum, value) => sum + Math.cos(value), 0) / usable.length;
  return (Math.atan2(sin, cos) * 180 / Math.PI + 360) % 360;
}

function numberOrDefault(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}
