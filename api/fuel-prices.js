const CIRCLEK_COUNTRY_URL = 'https://api.circlek.com/eu/prices/v1/fuel/countries/DK';
const CIRCLEK_LIST_PRICE_URL = 'https://www.circlek.dk/erhverv/braendstof/priser';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');
  response.setHeader('Access-Control-Allow-Origin', '*');

  const generatedAt = new Date().toISOString();
  const [stationApi, listPrices] = await Promise.allSettled([
    fetchCircleKStationApi(),
    fetchCircleKListPrices()
  ]);

  const sources = [];
  const stations = [];

  if (stationApi.status === 'fulfilled') {
    sources.push({ id: 'circlek-station-api', name: 'Circle K / INGO live station API', ok: true, stations: stationApi.value.length, fetchedAt: generatedAt });
    stations.push(...stationApi.value);
  } else {
    sources.push({ id: 'circlek-station-api', name: 'Circle K / INGO live station API', ok: false, error: stationApi.reason?.message || String(stationApi.reason), fetchedAt: generatedAt });
  }

  let listPriceMap = {};
  if (listPrices.status === 'fulfilled') {
    listPriceMap = listPrices.value;
    sources.push({ id: 'circlek-list-prices', name: 'Circle K official list prices', ok: true, products: Object.values(listPriceMap).filter(Boolean).length, fetchedAt: generatedAt });
  } else {
    sources.push({ id: 'circlek-list-prices', name: 'Circle K official list prices', ok: false, error: listPrices.reason?.message || String(listPrices.reason), fetchedAt: generatedAt });
  }

  return response.status(200).json({
    schemaVersion: 3,
    generatedAt,
    mode: 'live-server-cache-no-github-workflow',
    sources,
    stations: dedupeStations(stations),
    listPrices: listPriceMap
  });
}

async function fetchCircleKStationApi() {
  const response = await fetch(CIRCLEK_COUNTRY_URL, {
    headers: { Accept: 'application/json', 'X-App-Name': 'PRICES' }
  });

  if (!response.ok) throw new Error(`Circle K station API HTTP ${response.status}`);

  const data = await response.json();
  const sites = Array.isArray(data.sites) ? data.sites : [];
  return sites.map(normalizeCircleKSite).filter(Boolean);
}

function normalizeCircleKSite(site) {
  if (!site) return null;

  const address = site.address || {};
  const brand = String(site.name || '').toLowerCase().includes('ingo') ? 'INGO' : 'Circle K';
  const prices = normalizePrices(site.fuelPrices || site.prices || site.fuels || site.products || []);
  const lat = parseNumber(site.latitude || site.lat || site.coordinates?.latitude || site.location?.lat);
  const lng = parseNumber(site.longitude || site.lng || site.coordinates?.longitude || site.location?.lng);

  return {
    id: `circlek-${site.id || site.siteId || site.name || `${lat}:${lng}`}`,
    source: 'Circle K / INGO live station API',
    sourceId: 'circlek-station-api',
    stationId: String(site.id || site.siteId || ''),
    name: site.name || brand,
    brand,
    addressText: [address.street, address.houseNumber, address.addressLine1].filter(Boolean).join(' '),
    postalCode: String(address.postalCode || ''),
    city: address.city || '',
    lat,
    lng,
    prices
  };
}

async function fetchCircleKListPrices() {
  const response = await fetch(CIRCLEK_LIST_PRICE_URL, { headers: { Accept: 'text/html' } });
  if (!response.ok) throw new Error(`Circle K list price page HTTP ${response.status}`);

  const text = stripHtml(await response.text());
  return {
    benzin95: extractPrice(text, ['Miles 95', 'miles95', '95 oktan', 'Blyfri 95']),
    benzin98: extractPrice(text, ['Miles Plus 95', 'Miles+ 95', 'miles+95', 'Miles Plus']),
    diesel: extractPrice(text, ['Miles Diesel', 'milesDiesel', 'Diesel']),
    premiumDiesel: extractPrice(text, ['Miles Plus Diesel', 'Miles+ Diesel', 'miles+Diesel'])
  };
}

function extractPrice(text, needles) {
  for (const needle of needles) {
    const index = text.toLowerCase().indexOf(String(needle).toLowerCase());
    if (index === -1) continue;

    const slice = text.slice(index, index + 900);
    const matches = [...slice.matchAll(/(\d{1,2},\d{2})/g)].map(match => parseNumber(match[1]));
    const plausible = matches.find(value => Number.isFinite(value) && value >= 8 && value <= 30);

    if (Number.isFinite(plausible)) {
      return { price: plausible, productName: needle, source: 'Circle K official list prices' };
    }
  }
  return null;
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

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

function parseNumber(value) {
  if (value === undefined || value === null || value === '') return NaN;
  const numeric = Number(String(value).replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : NaN;
}

function dedupeStations(stations) {
  const seen = new Set();
  return stations.filter(station => {
    const key = station.id || `${station.sourceId}:${station.stationId}:${station.postalCode}:${station.addressText}:${station.lat}:${station.lng}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
