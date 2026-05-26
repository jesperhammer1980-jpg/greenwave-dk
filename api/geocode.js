export default async function handler(request, response) {
  response.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  response.setHeader('Access-Control-Allow-Origin', '*');

  const q = String(request.query.q || '').trim();
  const limit = Math.max(1, Math.min(10, Number(request.query.limit || 1)));

  if (!q) return response.status(400).json({ error: 'Missing q' });

  const attempts = [];

  try {
    const dawa = await geocodeDawa(q, limit);
    attempts.push({ provider: 'DAWA', ok: true, results: dawa.length });
    if (dawa.length) return response.status(200).json(dawa.map(toPublicGeocode));
  } catch (error) {
    attempts.push({ provider: 'DAWA', ok: false, error: error.message });
  }

  try {
    const nominatim = await geocodeNominatim(q, limit);
    attempts.push({ provider: 'Nominatim', ok: true, results: nominatim.length });
    if (nominatim.length) return response.status(200).json(nominatim.map(toPublicGeocode));
  } catch (error) {
    attempts.push({ provider: 'Nominatim', ok: false, error: error.message });
  }

  return response.status(404).json({ error: 'Address not found', q, attempts });
}

async function geocodeDawa(q, limit) {
  const url = `https://api.dataforsyningen.dk/adresser?q=${encodeURIComponent(q)}&struktur=mini&per_side=${limit}`;
  const upstream = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!upstream.ok) throw new Error(`DAWA HTTP ${upstream.status}`);
  const data = await upstream.json();
  if (!Array.isArray(data)) return [];

  return data
    .map(item => {
      const coords = item?.adgangsadresse?.adgangspunkt?.koordinater || item?.adgangspunkt?.koordinater || item?.adgangsadresse?.vejpunkt?.koordinater;
      if (!Array.isArray(coords) || coords.length < 2) return null;
      return {
        provider: 'DAWA',
        lat: Number(coords[1]),
        lng: Number(coords[0]),
        displayName: item.betegnelse || q,
        raw: item
      };
    })
    .filter(item => Number.isFinite(item?.lat) && Number.isFinite(item?.lng));
}

async function geocodeNominatim(q, limit) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=${limit}&countrycodes=dk&q=${encodeURIComponent(q)}`;
  const upstream = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'GreenWave-DK-Companion/1.0 contact: jesperhammer1980@gmail.com'
    }
  });
  if (!upstream.ok) throw new Error(`Nominatim HTTP ${upstream.status}`);
  const data = await upstream.json();
  if (!Array.isArray(data)) return [];
  return data
    .map(item => ({ provider: 'Nominatim', lat: Number(item.lat), lng: Number(item.lon), displayName: item.display_name || q, raw: item }))
    .filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng));
}

function toPublicGeocode(item) {
  return {
    provider: item.provider,
    lat: item.lat,
    lng: item.lng,
    displayName: item.displayName
  };
}
