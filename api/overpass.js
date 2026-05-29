const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter"
];

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }

  const body = parseBody(req.body);
  const query = body.query || buildFuelQuery(body);

  if (!query) {
    return res.status(400).json({ ok: false, error: "Missing query or bbox" });
  }

  const result = await runOverpass(query, 25000);

  if (!result.ok) {
    return res.status(502).json({
      ok: false,
      error: "All Overpass endpoints failed",
      debug: {
        query,
        attempts: result.attempts
      }
    });
  }

  return res.status(200).json({
    ...result.data,
    debug: {
      query,
      endpoint: result.endpoint,
      status: result.status,
      rawElements: Array.isArray(result.data.elements) ? result.data.elements.length : 0,
      attempts: result.attempts
    }
  });
}

function buildFuelQuery(body) {
  const south = Number(body.south ?? body.minLat);
  const west = Number(body.west ?? body.minLng);
  const north = Number(body.north ?? body.maxLat);
  const east = Number(body.east ?? body.maxLng);

  if (![south, west, north, east].every(Number.isFinite)) return "";

  return `[out:json][timeout:25];
(
  node["amenity"="fuel"](${south},${west},${north},${east});
  way["amenity"="fuel"](${south},${west},${north},${east});
  relation["amenity"="fuel"](${south},${west},${north},${east});
);
out center tags;`;
}

async function runOverpass(query, timeoutMs) {
  const attempts = [];
  let firstEmpty = null;

  for (const endpoint of ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "Accept": "application/json",
          "User-Agent": "GreenWave-DK/1.0"
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: controller.signal
      });

      const text = await response.text();
      clearTimeout(timeout);

      if (!response.ok) {
        attempts.push({
          endpoint,
          ok: false,
          status: response.status,
          statusText: response.statusText,
          body: text.slice(0, 500)
        });
        continue;
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (error) {
        attempts.push({
          endpoint,
          ok: false,
          status: response.status,
          error: `Invalid Overpass JSON: ${error.message}`,
          body: text.slice(0, 500)
        });
        continue;
      }

      const rawElements = Array.isArray(data.elements) ? data.elements.length : 0;
      attempts.push({ endpoint, ok: true, status: response.status, rawElements });

      const result = { ok: true, endpoint, status: response.status, data, attempts };
      if (rawElements > 0) return result;
      if (!firstEmpty) firstEmpty = result;
    } catch (error) {
      clearTimeout(timeout);
      attempts.push({ endpoint, ok: false, error: error.message });
    }
  }

  return firstEmpty || { ok: false, attempts };
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
