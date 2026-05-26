export default async function handler(request, response) {
  response.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
  response.setHeader('Access-Control-Allow-Origin', '*');

  const fromLat = Number(request.query.fromLat);
  const fromLng = Number(request.query.fromLng);
  const toLat = Number(request.query.toLat);
  const toLng = Number(request.query.toLng);

  if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
    return response.status(400).json({ error: 'Invalid coordinates' });
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=true&alternatives=true`;
    const upstream = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!upstream.ok) return response.status(502).json({ error: `OSRM HTTP ${upstream.status}` });
    const data = await upstream.json();
    return response.status(200).json(data);
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}
