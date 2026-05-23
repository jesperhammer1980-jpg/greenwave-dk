const PRICE_FILE = './fuel-prices.json';

let cachedPriceData = null;
let attemptedLoad = false;

export async function loadFuelPriceData() {
  if (attemptedLoad) return cachedPriceData;
  attemptedLoad = true;

  try {
    const response = await fetch(`${PRICE_FILE}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`fuel-prices.json ${response.status}`);
    const data = await response.json();
    cachedPriceData = normalizePriceData(data);
  } catch (error) {
    console.warn('Fuel price data unavailable', error);
    cachedPriceData = normalizePriceData({ generatedAt: null, stations: [] });
  }

  return cachedPriceData;
}

export function getFuelPriceStatus() {
  if (!cachedPriceData || !cachedPriceData.stations.length) {
    return {
      hasPrices: false,
      label: 'Prisdata ikke hentet endnu',
      generatedAt: null,
      sources: []
    };
  }

  return {
    hasPrices: true,
    label: `Prisdata opdateret ${formatDateTime(cachedPriceData.generatedAt)}`,
    generatedAt: cachedPriceData.generatedAt,
    sources: cachedPriceData.sources || []
  };
}

export function attachFuelPrices(stations, fuelType = 'benzin95') {
  if (!cachedPriceData || !Array.isArray(stations)) return stations;

  return stations.map(station => {
    const match = findBestPriceMatch(station, cachedPriceData.stations);

    if (!match) {
      return {
        ...station,
        price: null,
        priceProduct: null,
        priceUpdated: null,
        priceSource: null,
        priceConfidence: 'none',
        dataAgeLabel: 'Pris ikke tilgængelig'
      };
    }

    const product = chooseProduct(match.prices, fuelType);

    if (!product) {
      return {
        ...station,
        price: null,
        priceProduct: null,
        priceUpdated: null,
        priceSource: match.source,
        priceConfidence: match.confidence,
        dataAgeLabel: 'Pris ikke tilgængelig for valgt type'
      };
    }

    return {
      ...station,
      price: product.price,
      priceProduct: product.productName || product.displayName || product.fuelType,
      priceUpdated: product.lastUpdated || match.lastUpdated || cachedPriceData.generatedAt,
      priceSource: match.source,
      priceConfidence: match.confidence,
      dataAgeLabel: `Pris fra ${match.source} · ${formatDateTime(product.lastUpdated || cachedPriceData.generatedAt)}`
    };
  });
}

function normalizePriceData(data) {
  const stations = Array.isArray(data?.stations) ? data.stations : [];

  return {
    generatedAt: data?.generatedAt || null,
    sources: Array.isArray(data?.sources) ? data.sources : [],
    stations: stations.map(station => ({
      ...station,
      normalizedName: normalizeText(station.name || station.stationName || ''),
      normalizedBrand: normalizeBrand(station.brand || ''),
      normalizedAddress: normalizeText(station.addressText || station.address?.street || station.address?.addressHouseNumber || ''),
      normalizedCity: normalizeText(station.city || station.address?.city || ''),
      postalCode: String(station.postalCode || station.address?.postalCode || '').trim(),
      prices: Array.isArray(station.prices) ? station.prices : []
    }))
  };
}

function findBestPriceMatch(osmStation, priceStations) {
  const osmBrand = normalizeBrand(osmStation.brand || osmStation.operator || osmStation.name || '');
  const osmName = normalizeText(osmStation.name || '');
  const osmAddress = normalizeText(osmStation.addressText || osmStation.address || '');

  let best = null;

  for (const candidate of priceStations) {
    const score = scoreMatch({ osmBrand, osmName, osmAddress, osmStation }, candidate);

    if (!best || score.value > best.score) {
      best = { station: candidate, score: score.value, confidence: score.confidence };
    }
  }

  if (!best || best.score < 48) return null;

  return {
    ...best.station,
    confidence: best.confidence
  };
}

function scoreMatch(input, candidate) {
  let score = 0;

  if (input.osmBrand && candidate.normalizedBrand && input.osmBrand === candidate.normalizedBrand) score += 35;
  if (input.osmBrand && candidate.normalizedName.includes(input.osmBrand)) score += 18;
  if (input.osmName && candidate.normalizedName && sharesImportantToken(input.osmName, candidate.normalizedName)) score += 22;
  if (input.osmAddress && candidate.normalizedAddress && sharesImportantToken(input.osmAddress, candidate.normalizedAddress)) score += 28;

  if (Number.isFinite(candidate.lat) && Number.isFinite(candidate.lng) && Number.isFinite(input.osmStation.lat) && Number.isFinite(input.osmStation.lng)) {
    const meters = haversine(input.osmStation.lat, input.osmStation.lng, candidate.lat, candidate.lng);
    if (meters < 80) score += 55;
    else if (meters < 250) score += 42;
    else if (meters < 700) score += 25;
    else if (meters < 1500) score += 10;
  }

  return {
    value: score,
    confidence: score >= 85 ? 'high' : score >= 62 ? 'medium' : 'low'
  };
}

function chooseProduct(prices, fuelType) {
  const normalizedFuelType = String(fuelType || 'benzin95').toLowerCase();

  const candidates = prices.filter(price => Number.isFinite(Number(price.price)));

  if (!candidates.length) return null;

  if (normalizedFuelType.includes('diesel')) {
    return candidates.find(p => /diesel/i.test(`${p.fuelType} ${p.productName} ${p.displayName}`)) || null;
  }

  return candidates.find(p =>
    /95|e10|benzin|gasoline|petrol/i.test(`${p.octane} ${p.fuelType} ${p.productName} ${p.displayName}`) &&
    !/100|98|premium|diesel/i.test(`${p.octane} ${p.productName} ${p.displayName}`)
  ) || candidates.find(p => /benzin|gasoline|petrol/i.test(`${p.fuelType} ${p.productName} ${p.displayName}`)) || null;
}

function normalizeBrand(value) {
  const text = normalizeText(value);
  if (text.includes('circle') || text.includes('ingo')) return text.includes('ingo') ? 'ingo' : 'circle k';
  if (text.includes('uno')) return 'uno-x';
  if (text.includes('q8')) return 'q8';
  if (text.includes('ok')) return 'ok';
  if (text.includes('shell')) return 'shell';
  return text;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sharesImportantToken(a, b) {
  const ignore = new Set(['vej', 'gade', 'alle', 'tank', 'station', 'automat', 'circle', 'ingo', 'uno', 'k']);
  const aTokens = new Set(a.split(' ').filter(token => token.length > 2 && !ignore.has(token)));
  const bTokens = new Set(b.split(' ').filter(token => token.length > 2 && !ignore.has(token)));

  for (const token of aTokens) {
    if (bTokens.has(token)) return true;
  }

  return false;
}

function formatDateTime(value) {
  if (!value) return 'ukendt tidspunkt';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString('da-DK', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function haversine(lat1, lng1, lat2, lng2) {
  const radius = 6371000;
  const toRad = value => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
