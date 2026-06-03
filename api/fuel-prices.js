const CIRCLEK_LIST_PRICE_URL = "https://www.circlek.dk/erhverv/braendstof/priser";
const CIRCLEK_COUNTRY_URL = "https://api.circlek.com/eu/prices/v1/fuel/countries/DK";
const OK_FUEL_PRICES_URL = "https://mobility-prices.ok.dk/api/v1/fuel-prices";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=1800");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const [circleK, ok, list] = await Promise.allSettled([
    fetchCircleKStations(),
    fetchOkStations(),
    fetchCircleKListPrices()
  ]);

  const sources = [];
  const stationGroups = [];
  let listPrices = {};

  if (circleK.status === "fulfilled") {
    stationGroups.push(circleK.value);
    sources.push({
      id: "circlek-api",
      name: "Circle K / INGO station API",
      ok: true,
      stations: circleK.value.length
    });
  } else {
    sources.push({
      id: "circlek-api",
      name: "Circle K / INGO station API",
      ok: false,
      error: circleK.reason?.message || String(circleK.reason)
    });
  }

  if (ok.status === "fulfilled") {
    stationGroups.push(ok.value);
    sources.push({
      id: "ok-api",
      name: "OK public fuel price API (documented structure, not live-verified here)",
      ok: true,
      stations: ok.value.length
    });
  } else {
    sources.push({
      id: "ok-api",
      name: "OK public fuel price API (documented structure, not live-verified here)",
      ok: false,
      error: ok.reason?.message || String(ok.reason)
    });
  }

  if (list.status === "fulfilled") {
    listPrices = list.value;
    sources.push({
      id: "circlek-list",
      name: "Circle K official list prices",
      ok: true,
      products: Object.values(listPrices).filter(Boolean).length
    });
  } else {
    sources.push({
      id: "circlek-list",
      name: "Circle K official list prices",
      ok: false,
      error: list.reason?.message || String(list.reason)
    });
  }

  return res.status(200).json({
    ok: true,
    generatedAt: new Date().toISOString(),
    sources,
    stations: stationGroups.flat(),
    listPrices
  });
}

async function fetchCircleKStations() {
  const response = await fetch(CIRCLEK_COUNTRY_URL, {
    headers: {
      "Accept": "application/json",
      "X-App-Name": "PRICES"
    }
  });

  if (!response.ok) throw new Error(`Circle K API HTTP ${response.status}`);

  const data = await response.json();

  return (Array.isArray(data.sites) ? data.sites : [])
    .map(normalizeCircleKSite)
    .filter(Boolean);
}

function normalizeCircleKSite(site) {
  const address = site.address || {};
  const coord = extractDanishCoordinates(site);

  return {
    id: `circlek-${site.id || site.siteId || site.name || `${coord?.lat}:${coord?.lng}`}`,
    source: "Circle K / INGO station API",
    sourceId: "circlek-api",
    stationId: String(site.id || site.siteId || ""),
    name: site.name || "Circle K",
    brand: String(site.name || "").toLowerCase().includes("ingo") ? "INGO" : "Circle K",
    addressText: [address.street, address.houseNumber, address.addressLine1].filter(Boolean).join(" "),
    postalCode: String(address.postalCode || ""),
    city: address.city || "",
    lat: coord ? coord.lat : null,
    lng: coord ? coord.lng : null,
    coordinateSource: coord ? coord.source : "none",
    prices: normalizePrices(site.fuelPrices || site.prices || site.fuels || site.products || [])
  };
}

function extractDanishCoordinates(site) {
  const candidates = [
    ["latitude/longitude", site.latitude, site.longitude],
    ["lat/lng", site.lat, site.lng],
    ["coordinates latitude/longitude", site.coordinates?.latitude, site.coordinates?.longitude],
    ["coordinates lat/lng", site.coordinates?.lat, site.coordinates?.lng],
    ["location lat/lng", site.location?.lat, site.location?.lng],
    ["location latitude/longitude", site.location?.latitude, site.location?.longitude],
    ["address coordinates", site.address?.coordinates?.latitude, site.address?.coordinates?.longitude],
    ["address location", site.address?.location?.lat, site.address?.location?.lng]
  ];

  if (Array.isArray(site.coordinates)) {
    candidates.push(["coordinates array lng/lat", site.coordinates[1], site.coordinates[0]]);
    candidates.push(["coordinates array lat/lng", site.coordinates[0], site.coordinates[1]]);
  }

  for (const [source, a, b] of candidates) {
    const pair = coordPair(a, b, source);
    if (pair) return pair;
  }

  return null;
}

function coordPair(a, b, source) {
  a = num(a);
  b = num(b);

  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (isLat(a) && isLng(b)) return { lat: a, lng: b, source };
  if (isLat(b) && isLng(a)) return { lat: b, lng: a, source: `${source} swapped` };

  return null;
}

async function fetchOkStations() {
  const response = await fetch(OK_FUEL_PRICES_URL, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "GreenWave-DK/1.0"
    }
  });

  if (!response.ok) throw new Error(`OK API HTTP ${response.status}`);

  const data = await response.json();
  const items = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];

  return items
    .map(normalizeOkStation)
    .filter(Boolean);
}

function normalizeOkStation(station) {
  if (!station || typeof station !== "object") return null;

  const coord = coordPair(
    station.coordinates?.latitude ?? station.coordinate?.latitude ?? station.latitude ?? station.lat,
    station.coordinates?.longitude ?? station.coordinate?.longitude ?? station.longitude ?? station.lng,
    "ok-api"
  );

  const stationId = String(station.facility_number ?? station.facilityNumber ?? station.id ?? station.station_id ?? "");
  const street = station.street ?? station.address?.street ?? "";
  const houseNumber = station.house_number ?? station.houseNumber ?? station.address?.house_number ?? station.address?.houseNumber ?? "";
  const city = station.city ?? station.address?.city ?? "";
  const addressText = [street, houseNumber].filter(Boolean).join(" ");

  return {
    id: `ok-${stationId || `${coord?.lat}:${coord?.lng}` || station.name || addressText}`,
    source: "OK public fuel price API",
    sourceId: "ok-api",
    stationId,
    name: station.name || ["OK", addressText, city].filter(Boolean).join(" ") || "OK",
    brand: "OK",
    addressText,
    postalCode: String(station.postal_code ?? station.postalCode ?? station.address?.postal_code ?? station.address?.postalCode ?? ""),
    city,
    lat: coord ? coord.lat : null,
    lng: coord ? coord.lng : null,
    coordinateSource: coord ? coord.source : "none",
    prices: normalizeOkPrices(
      station.prices || station.fuel_prices || station.fuelPrices || [],
      station.last_updated_time ?? station.lastUpdatedTime ?? station.updated_at
    )
  };
}

function normalizeOkPrices(prices, updatedAt) {
  return Array.isArray(prices)
    ? prices
        .map(price => {
          const productName = price.product_name || price.productName || price.name || price.displayName || price.fuelType || "";
          return {
            code: price.product_code || price.productCode || price.product_id || price.productId || price.code || "",
            displayName: productName,
            productName,
            fuelType: productName,
            octane: price.octane || "",
            price: num(price.price ?? price.amount ?? price.value),
            currency: price.currency || "DKK",
            updatedAt: price.last_updated_time || price.lastUpdatedTime || price.updated_at || updatedAt || null
          };
        })
        .filter(price => isValidFuelPrice(price.price))
    : [];
}

async function fetchCircleKListPrices() {
  const response = await fetch(CIRCLEK_LIST_PRICE_URL, {
    headers: { "Accept": "text/html" }
  });

  if (!response.ok) throw new Error(`Circle K list HTTP ${response.status}`);

  const text = stripHtml(await response.text());

  return {
    benzin95: extractPrice(text, ["Miles 95", "miles95", "Blyfri 95"]),
    benzin98: extractPrice(text, ["Miles Plus 95", "Miles+ 95", "Miles Plus"]),
    diesel: extractPrice(text, ["Miles Diesel", "Diesel"]),
    premiumDiesel: extractPrice(text, ["Miles Plus Diesel", "Miles+ Diesel"])
  };
}

function extractPrice(text, needles) {
  for (const needle of needles) {
    const index = text.toLowerCase().indexOf(needle.toLowerCase());
    if (index < 0) continue;

    const values = [...text.slice(index, index + 900).matchAll(/(\d{1,2},\d{2})/g)]
      .map(match => num(match[1]));
    const price = values.find(isValidFuelPrice);

    if (Number.isFinite(price)) {
      return {
        price,
        productName: needle,
        source: "Circle K official list prices"
      };
    }
  }

  return null;
}

function normalizePrices(prices) {
  return Array.isArray(prices)
    ? prices
        .map(price => ({
          code: price.code || price.productCode || price.id || "",
          displayName: price.displayName || price.name || price.productName || price.fuelType || "",
          productName: price.productName || price.displayName || price.name || price.fuelType || "",
          fuelType: price.fuelType || price.productName || price.displayName || price.name || "",
          octane: price.octane || "",
          price: num(price.price ?? price.amount ?? price.value),
          currency: price.currency || "DKK"
        }))
        .filter(price => isValidFuelPrice(price.price))
    : [];
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

function num(value) {
  if (value === undefined || value === null || value === "") return NaN;
  return Number(String(value).replace(",", "."));
}

function isValidFuelPrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price >= 5 && price <= 30;
}

function isLat(value) {
  return value >= 54.2 && value <= 58.2;
}

function isLng(value) {
  return value >= 7.5 && value <= 15.8;
}
