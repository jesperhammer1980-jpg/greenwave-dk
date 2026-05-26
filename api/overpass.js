const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter'
];

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');
  response.setHeader('Access-Control-Allow-Origin', '*');

  if (request.method !== 'POST') return response.status(405).json({ error: 'POST only' });

  const query = request.body?.query;
  const timeoutMs = Math.max(3000, Math.min(15000, Number(request.body?.timeoutMs || 9000)));

  if (!query || typeof query !== 'string') return response.status(400).json({ error: 'Missing query' });

  const errors = [];
  for (const endpoint of ENDPOINTS) {
    try {
      const upstream = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: query
      }, timeoutMs);

      if (!upstream.ok) {
        errors.push(`${endpoint}: HTTP ${upstream.status}`);
        continue;
      }

      const data = await upstream.json();
      return response.status(200).json(data);
    } catch (error) {
      errors.push(`${endpoint}: ${error.message}`);
    }
  }

  return response.status(502).json({ error: 'All Overpass endpoints failed', details: errors });
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
