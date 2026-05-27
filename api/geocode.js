export default async function handler(request, response) {
  response.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  response.setHeader('Access-Control-Allow-Origin', '*');

  const q = String(request.query.q || request.query.address || '').trim();
  const limit = Math.max(1, Math.min(10, Number(request.query.limit || 1)));

  if (!q) return response.status(400).json({ error: 'Missing q' });

  const result = await geocodeAddress(q, limit);

  if (result.results.length) {
    return response.status(200).json(result.results.map(item => ({
      provider: item.provider,
      lat: item.lat,
      lng: item.lng,
      displayName: item.displayName,
      attempts: request.query.debug ? result.attempts : undefined
    })));
  }

  return response.status(404).json({ error: 'Address not found', q, attempts: result.attempts });
}

const DAWA_AUTOCOMPLETE = 'https://api.dataforsyningen.dk/autocomplete';
const DAWA_ADRESSER = 'https://api.dataforsyningen.dk/adresser';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

function normalizeAddressInput(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim();
}

function makeAddressVariants(input) {
  const trimmed = normalizeAddressInput(input);
  const noComma = trimmed.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const variants = [trimmed, noComma];
  const m = noComma.match(/^(.+?)\s+(\d{4})\s+(.+)$/);
  if (m) {
    variants.push(`${m[1]}, ${m[2]} ${m[3]}`);
    variants.push(`${m[1]} ${m[2]} ${m[3]}, Danmark`);
    variants.push(`${m[1]}, ${m[2]} ${m[3]}, Danmark`);
  }
  variants.push(`${noComma}, Danmark`);
  return [...new Set(variants.filter(Boolean))];
}

async function geocodeAddress(input, limit = 1) {
  const q = normalizeAddressInput(input);
  if (!q) throw new Error('Missing address');
  const attempts = [];

  const dawaAuto = await tryDawaAutocomplete(q, limit);
  attempts.push(dawaAuto.attempt);
  if (dawaAuto.results.length) return { results: dawaAuto.results, attempts };

  const dawaAddress = await tryDawaAdresser(q, limit);
  attempts.push(dawaAddress.attempt);
  if (dawaAddress.results.length) return { results: dawaAddress.results, attempts };

  const nominatim = await tryNominatim(q, limit);
  attempts.push(nominatim.attempt);
  if (nominatim.results.length) return { results: nominatim.results, attempts };

  return { results: [], attempts };
}

async function tryDawaAutocomplete(input, limit) {
  const variants = makeAddressVariants(input);
  const all = [];
  let lastAttempt = null;

  for (const q of variants) {
    const url = `${DAWA_AUTOCOMPLETE}?q=${encodeURIComponent(q)}&type=adresse&caretpos=${encodeURIComponent(String(q.length))}&fuzzy=true&per_side=${encodeURIComponent(String(Math.max(5, limit)))}`;
    try {
      const upstream = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!upstream.ok) throw new Error(`DAWA autocomplete HTTP ${upstream.status}`);
      const data = await upstream.json();
      const items = Array.isArray(data) ? data : [];
      lastAttempt = { provider: 'DAWA autocomplete', ok: true, q, results: items.length };
      for (const item of items) {
        const normalized = normalizeDawaAutocomplete(item, input);
        if (normalized) all.push(normalized);
      }
      if (all.length) break;
    } catch (error) {
      return { attempt: { provider: 'DAWA autocomplete', ok: false, q, error: error.message }, results: [] };
    }
  }

  return { attempt: lastAttempt || { provider: 'DAWA autocomplete', ok: true, q: variants[0], results: 0 }, results: all.slice(0, limit) };
}

async function tryDawaAdresser(input, limit) {
  const variants = makeAddressVariants(input);
  const all = [];
  let lastAttempt = null;

  for (const q of variants) {
    const url = `${DAWA_ADRESSER}?q=${encodeURIComponent(q)}&struktur=mini&per_side=${encodeURIComponent(String(Math.max(5, limit)))}`;
    try {
      const upstream = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!upstream.ok) throw new Error(`DAWA adresser HTTP ${upstream.status}`);
      const data = await upstream.json();
      const items = Array.isArray(data) ? data : [];
      lastAttempt = { provider: 'DAWA adresser', ok: true, q, results: items.length };
      for (const item of items) {
        const normalized = normalizeDawaAddress(item, input);
        if (normalized) all.push(normalized);
      }
      if (all.length) break;
    } catch (error) {
      return { attempt: { provider: 'DAWA adresser', ok: false, q, error: error.message }, results: [] };
    }
  }

  return { attempt: lastAttempt || { provider: 'DAWA adresser', ok: true, q: variants[0], results: 0 }, results: all.slice(0, limit) };
}

async function tryNominatim(input, limit) {
  const variants = makeAddressVariants(input);
  const all = [];
  let lastAttempt = null;

  for (const q of variants) {
    const url = `${NOMINATIM}?format=jsonv2&addressdetails=1&limit=${encodeURIComponent(String(Math.max(5, limit)))}&countrycodes=dk&q=${encodeURIComponent(q)}`;
    try {
      const upstream = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'GreenWave-DK-Companion/1.0 contact: jesperhammer1980@gmail.com' } });
      if (!upstream.ok) throw new Error(`Nominatim HTTP ${upstream.status}`);
      const data = await upstream.json();
      const items = Array.isArray(data) ? data : [];
      lastAttempt = { provider: 'Nominatim', ok: true, q, results: items.length };
      for (const item of items) {
        const lat = Number(item.lat);
        const lng = Number(item.lon);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          all.push({ provider: 'Nominatim', lat, lng, displayName: item.display_name || input, raw: item });
        }
      }
      if (all.length) break;
    } catch (error) {
      return { attempt: { provider: 'Nominatim', ok: false, q, error: error.message }, results: [] };
    }
  }

  return { attempt: lastAttempt || { provider: 'Nominatim', ok: true, q: variants[0], results: 0 }, results: all.slice(0, limit) };
}

function normalizeDawaAutocomplete(item, fallback) {
  const data = item?.data || {};
  const lat = Number(data.y);
  const lng = Number(data.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { provider: 'DAWA autocomplete', lat, lng, displayName: item.tekst || data.betegnelse || fallback, dawaId: data.id || null, raw: item };
}

function normalizeDawaAddress(item, fallback) {
  const coords = item?.adgangsadresse?.adgangspunkt?.koordinater || item?.adgangspunkt?.koordinater || item?.adgangsadresse?.vejpunkt?.koordinater;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { provider: 'DAWA adresser', lat, lng, displayName: item.betegnelse || fallback, dawaId: item.id || null, raw: item };
}
