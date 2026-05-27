const CIRCLEK_COUNTRY_URL = 'https://api.circlek.com/eu/prices/v1/fuel/countries/DK';
const CIRCLEK_LIST_PRICE_URL = 'https://www.circlek.dk/erhverv/braendstof/priser';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=900');
  response.setHeader('Access-Control-Allow-Origin', '*');

  const [bulk, list] = await Promise.allSettled([
    fetchCircleKBulk(),
    fetchCircleKListPrices()
  ]);

  const sources = [];
  const stations = [];

  if (bulk.status === 'fulfilled') {
    sources.push({ id: 'circlek-api', name: 'Circle K / INGO station API', ok: true, stations: bulk.value.length });
    stations.push(...bulk.value);
  } else {
    sources.push({ id: 'circlek-api', name: 'Circle K / INGO station API', ok: false, error: bulk.reason?.message || String(bulk.reason) });
  }

  let listPrices = {};

  if (list.status === 'fulfilled') {
    listPrices = list.value;
    sources.push({ id: 'circlek-list-prices', name: 'Circle K official list prices', ok: true, products: Object.keys(listPrices).length });
  } else {
    sources.push({ id: 'circlek-list-prices', name: 'Circle K official list prices', ok: false, error: list.reason?.message || String(list.reason) });
  }

  response.status(200).json({
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    sources,
    stations: dedupeStations(stations),
    listPrices
  });
}

async function fetchCircleKBulk() {
  const res = await fetch(CIRCLEK_COUNTRY_URL, {
    headers: {
      Accept: 'application/json',
      'X-App-Name': 'PRICES'
    }
  });

  if (!res.ok) throw new Error(`Circle K API HTTP ${res.status}`);

  const data = await res.json();
  const sites = Array.isArray(data.sites) ? data.sites : [];

  return sites.map(site => {
    const prices = normalizePrices(site.fuelPrices || site.prices || site.fuels || site.products || []);
    const address = site.address || {};
    const brand = String(site.name || '').toLowerCase().includes('ingo') ? 'INGO' : 'Circle K';

    return {
      id: `circlek-${site.id || site.siteId || site.name || Math.random()}`,
      source: 'Circle K / INGO station API',
      sourceId: 'circlek-api',
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
  });
}

async function fetchCircleKListPrices() {
  const res = await fetch(CIRCLEK_LIST_PRICE_URL, { headers: { Accept: 'text/html' } });
  if (!res.ok) throw new Error(`Circle K list prices HTTP ${res.status}`);

  const html = await res.text();
  const text = stripHtml(html);

  return {
    benzin95: extractPrice(text, ['Miles 95', 'miles95']),
    benzin98: extractPrice(text, ['Miles Plus 95', 'miles+95', 'Miles Plus']),
    diesel: extractPrice(text, ['Diesel', 'milesDiesel']),
    premiumDiesel: extractPrice(text, ['Miles Plus Diesel', 'miles+Diesel'])
  };
}

function extractPrice(text, needles) {
  for (const needle of needles) {
    const index = text.toLowerCase().indexOf(String(needle).toLowerCase());
    if (index === -1) continue;

    const slice = text.slice(index, index + 700);
    const matches = [...slice.matchAll(/(\d{1,2},\d{2})/g)].map(match => parseNumber(match[1]));
    const plausible = matches.find(value => value >= 8 && value <= 30);

    if (Number.isFinite(plausible)) {
      return {
        price: plausible,
        productName: needle,
        source: 'Circle K official list prices'
      };
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
    const key = station.id || `${station.sourceId}:${station.stationId}:${station.postalCode}:${station.addressText}`;

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}
