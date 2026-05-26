const CIRCLEK_URL = 'https://api.circlek.com/eu/prices/v1/fuel/countries/DK';
const OK_URL = 'https://mobility-prices.ok.dk/api/v1/fuel-prices';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=900');
  response.setHeader('Access-Control-Allow-Origin', '*');

  const [circleK, ok] = await Promise.allSettled([fetchCircleK(), fetchOK()]);
  const sources = [];
  const stations = [];

  if (circleK.status === 'fulfilled') {
    sources.push({ id: 'circlek-ingo-dk', name: 'Circle K / INGO', ok: true, stations: circleK.value.length });
    stations.push(...circleK.value);
  } else {
    sources.push({ id: 'circlek-ingo-dk', name: 'Circle K / INGO', ok: false, error: circleK.reason?.message || String(circleK.reason) });
  }

  if (ok.status === 'fulfilled') {
    sources.push({ id: 'ok-dk', name: 'OK', ok: true, stations: ok.value.length });
    stations.push(...ok.value);
  } else {
    sources.push({ id: 'ok-dk', name: 'OK', ok: false, error: ok.reason?.message || String(ok.reason) });
  }

  response.status(200).json({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources,
    stations: dedupe(stations)
  });
}

async function fetchCircleK() {
  const result = await fetchJson(CIRCLEK_URL, {
    headers: { Accept: 'application/json', 'X-App-Name': 'PRICES' }
  });

  const sites = Array.isArray(result.sites) ? result.sites : [];
  return sites.map(site => {
    const prices = normalizePrices(site.fuelPrices || site.prices || site.fuels || site.products || []);
    if (!prices.length) return null;

    const address = site.address || {};
    const brand = String(site.name || '').toLowerCase().includes('ingo') ? 'INGO' : 'Circle K';

    return {
      source: 'Circle K / INGO',
      sourceId: 'circlek-ingo-dk',
      stationId: String(site.id || site.siteId || ''),
      name: site.name || brand,
      brand,
      addressText: [address.street, address.houseNumber, address.addressLine1].filter(Boolean).join(' '),
      postalCode: String(address.postalCode || ''),
      city: address.city || '',
      lat: parseNumber(site.latitude || site.lat || site.coordinates?.latitude || site.location?.lat),
      lng: parseNumber(site.longitude || site.lng || site.coordinates?.longitude || site.location?.lng),
      prices
    };
  }).filter(Boolean);
}

async function fetchOK() {
  const data = await fetchJson(OK_URL, { headers: { Accept: 'application/json' } });
  const items = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];

  return items.map(item => {
    const prices = normalizePrices(item.prices || item.fuelPrices || item.fuels || []);
    if (!prices.length) return null;

    return {
      source: 'OK',
      sourceId: 'ok-dk',
      stationId: String(item.facility_number || item.facilityNumber || item.id || ''),
      name: item.name || 'OK',
      brand: 'OK',
      addressText: [item.street, item.house_number, item.houseNumber, item.address].filter(Boolean).join(' '),
      postalCode: String(item.postal_code || item.postalCode || ''),
      city: item.city || '',
      lat: parseNumber(item.coordinates?.latitude || item.lat || item.latitude),
      lng: parseNumber(item.coordinates?.longitude || item.lng || item.longitude),
      prices
    };
  }).filter(Boolean);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return await response.json();
}

function normalizePrices(prices) {
  if (!Array.isArray(prices)) return [];

  return prices.map(price => ({
    code: price.code || price.productCode || price.id || '',
    displayName: price.displayName || price.name || price.productName || price.product_name || price.fuelType || '',
    productName: price.productName || price.product_name || price.displayName || price.name || price.fuelType || '',
    fuelType: price.fuelType || price.productName || price.product_name || price.displayName || price.name || '',
    octane: price.octane || '',
    price: parseNumber(price.price || price.amount || price.value),
    currency: price.currency || 'DKK',
    lastUpdated: price.lastUpdated || price.updatedAt || price.validFrom || null
  })).filter(price => Number.isFinite(price.price));
}

function parseNumber(value) {
  if (value === undefined || value === null || value === '') return NaN;
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) ? number : NaN;
}

function dedupe(stations) {
  const seen = new Set();
  return stations.filter(station => {
    const key = `${station.sourceId}:${station.stationId}:${station.postalCode}:${station.addressText}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
