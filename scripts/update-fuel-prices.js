#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const OUTPUT_FILE = path.resolve('fuel-prices.json');

const SOURCES = [
  {
    id: 'circlek-dk-public-api',
    name: 'Circle K / INGO DK Fuel Prices API',
    type: 'circlek',
    url: 'https://api.circlek.com/eu/prices/v1/fuel/countries/DK'
  }
];

async function main() {
  const generatedAt = new Date().toISOString();
  const stations = [];
  const sourceResults = [];

  for (const source of SOURCES) {
    try {
      const result = await fetchSource(source);
      stations.push(...result.stations);
      sourceResults.push({
        id: source.id,
        name: source.name,
        ok: true,
        stations: result.stations.length,
        fetchedAt: generatedAt
      });
    } catch (error) {
      sourceResults.push({
        id: source.id,
        name: source.name,
        ok: false,
        error: error.message,
        fetchedAt: generatedAt
      });
    }
  }

  const uniqueStations = dedupeStations(stations);

  const payload = {
    schemaVersion: 1,
    generatedAt,
    sources: sourceResults,
    stations: uniqueStations
  };

  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${uniqueStations.length} priced stations to ${OUTPUT_FILE}`);
  for (const source of sourceResults) {
    console.log(`${source.ok ? 'OK' : 'FAIL'} ${source.id}: ${source.stations ?? 0} stations ${source.error ? `(${source.error})` : ''}`);
  }

  if (!uniqueStations.length) {
    throw new Error('No real fuel price stations were fetched. Keeping output explicit but failing workflow.');
  }
}

async function fetchSource(source) {
  if (source.type === 'circlek') return fetchCircleK(source);
  throw new Error(`Unsupported source type: ${source.type}`);
}

async function fetchCircleK(source) {
  const response = await fetch(source.url, {
    headers: {
      'Accept': 'application/json',
      'X-App-Name': 'PRICES'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from Circle K API`);
  }

  const data = await response.json();
  const sites = Array.isArray(data.sites) ? data.sites : [];

  return {
    stations: sites.map(site => normalizeCircleKSite(site, source)).filter(Boolean)
  };
}

function normalizeCircleKSite(site, source) {
  if (!site || !Array.isArray(site.fuelPrices) || !site.fuelPrices.length) return null;

  const address = site.address || {};
  const brand = detectCircleKBrand(site.name);

  return {
    source: source.name,
    sourceId: source.id,
    stationId: String(site.id || ''),
    name: site.name || brand,
    brand,
    addressText: address.street || '',
    postalCode: address.postalCode || '',
    city: address.city || '',
    country: address.country || 'DK',
    lat: parseCoordinate(site.latitude || site.lat || site.coordinates?.latitude),
    lng: parseCoordinate(site.longitude || site.lng || site.coordinates?.longitude),
    lastUpdated: latestUpdate(site.fuelPrices),
    prices: site.fuelPrices.map(price => ({
      code: price.code || '',
      displayName: price.displayName || '',
      productName: price.displayName || '',
      fuelType: price.displayName || '',
      price: Number(price.price),
      currency: price.currency || 'DKK',
      volumeUnit: price.volumeUnit || 'LITER',
      lastUpdated: price.lastUpdated || null
    })).filter(price => Number.isFinite(price.price))
  };
}

function detectCircleKBrand(name) {
  const normalized = String(name || '').toLowerCase();
  if (normalized.includes('ingo')) return 'INGO';
  return 'Circle K';
}

function latestUpdate(prices) {
  return prices
    .map(price => price.lastUpdated)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
}

function parseCoordinate(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(String(value).replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : null;
}

function dedupeStations(stations) {
  const seen = new Set();

  return stations.filter(station => {
    const key = `${station.sourceId}:${station.stationId || station.name}:${station.postalCode}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
