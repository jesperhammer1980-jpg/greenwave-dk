import fs from "fs/promises";

const OUTPUT_FILE = "./fuel-prices.json";

const CIRCLEK_INGO_API_URL =
  "https://api.circlek.com/eu/prices/v1/fuel/countries/DK";

async function fetchCircleKIngoPrices() {
  try {
    const res = await fetch(CIRCLEK_INGO_API_URL, {
      headers: {
        Accept: "application/json",
        "X-App-Name": "PRICES"
      }
    });

    if (!res.ok) {
      console.log("Circle K/INGO API fejl:", res.status, res.statusText);
      return [];
    }

    const data = await res.json();

    const sites = Array.isArray(data)
      ? data
      : Array.isArray(data.sites)
        ? data.sites
        : Array.isArray(data.data)
          ? data.data
          : [];

    console.log(`Circle K/INGO rå sites: ${sites.length}`);

    return sites.map(normalizeCircleKIngoSite).filter(Boolean);
  } catch (err) {
    console.log("Circle K/INGO fetch fejl:", err.message);
    return [];
  }
}

function normalizeCircleKIngoSite(site) {
  const lat =
    Number(site.latitude) ||
    Number(site.lat) ||
    Number(site.location?.latitude) ||
    Number(site.location?.lat) ||
    Number(site.coordinates?.latitude) ||
    Number(site.coordinates?.lat);

  const lng =
    Number(site.longitude) ||
    Number(site.lng) ||
    Number(site.lon) ||
    Number(site.location?.longitude) ||
    Number(site.location?.lng) ||
    Number(site.location?.lon) ||
    Number(site.coordinates?.longitude) ||
    Number(site.coordinates?.lng) ||
    Number(site.coordinates?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const id = String(site.id || site.siteId || site.code || `${lat},${lng}`);
  const brand = detectBrand(site);
  const name =
    site.name ||
    site.siteName ||
    site.displayName ||
    site.title ||
    `${brand} station`;

  const address = buildAddress(site);
  const prices = extractCircleKIngoPrices(site);

  return {
    id: `${slugify(brand)}-${slugify(id)}`,
    name,
    brand,
    address,
    lat,
    lng,
    country: "DK",
    fuelTypes: {
      benzin95: {
        price: prices.benzin95,
        currency: "DKK",
        unit: "liter",
        updatedAt: prices.updatedAt,
        source: `${brand} API`
      },
      diesel: {
        price: prices.diesel,
        currency: "DKK",
        unit: "liter",
        updatedAt: prices.updatedAt,
        source: `${brand} API`
      }
    }
  };
}

function detectBrand(site) {
  const raw = String(
    site.brand ||
      site.brandName ||
      site.company ||
      site.operator ||
      site.name ||
      site.siteName ||
      site.displayName ||
      ""
  ).toLowerCase();

  if (raw.includes("ingo")) return "INGO";
  if (raw.includes("circle")) return "Circle K";

  return "Circle K";
}

function buildAddress(site) {
  const direct =
    site.address ||
    site.streetAddress ||
    site.addressLine ||
    site.location?.address ||
    site.contact?.address;

  if (typeof direct === "string" && direct.trim()) return direct.trim();

  if (direct && typeof direct === "object") {
    const street = [
      direct.street,
      direct.streetName,
      direct.houseNumber,
      direct.number
    ].filter(Boolean).join(" ");

    const city = [
      direct.postalCode || direct.zipCode,
      direct.city
    ].filter(Boolean).join(" ");

    const combined = [street, city].filter(Boolean).join(", ");
    if (combined) return combined;
  }

  const street = [
    site.street,
    site.streetName,
    site.houseNumber,
    site.number
  ].filter(Boolean).join(" ");

  const city = [
    site.postalCode || site.zipCode || site.postcode,
    site.city || site.town
  ].filter(Boolean).join(" ");

  return [street, city].filter(Boolean).join(", ");
}

function extractCircleKIngoPrices(site) {
  const now = new Date().toISOString();

  const updatedAt =
    site.lastUpdated ||
    site.updatedAt ||
    site.priceUpdatedAt ||
    site.modifiedAt ||
    now;

  const priceContainers = [
    site.prices,
    site.fuelPrices,
    site.products,
    site.fuels,
    site.priceList,
    site.sitePrices,
    site
  ].filter(Boolean);

  let benzin95 = null;
  let diesel = null;

  for (const container of priceContainers) {
    const found95 =
      getPriceByKeys(container, [
        "benzin95",
        "benzine95",
        "gasoline95",
        "miles95",
        "miles 95",
        "e10",
        "E10",
        "e5",
        "E5",
        "95",
        "octane95"
      ]) ?? findPriceInArray(container, [
        "benzin95",
        "benzine95",
        "gasoline95",
        "miles95",
        "miles 95",
        "e10",
        "e5",
        "95",
        "octane95"
      ]);

    const foundDiesel =
      getPriceByKeys(container, [
        "diesel",
        "Diesel",
        "b7",
        "B7",
        "miles diesel",
        "milesdiesel"
      ]) ?? findPriceInArray(container, [
        "diesel",
        "b7",
        "miles diesel",
        "milesdiesel"
      ]);

    if (benzin95 === null && found95 !== null) benzin95 = found95;
    if (diesel === null && foundDiesel !== null) diesel = foundDiesel;
  }

  return {
    benzin95,
    diesel,
    updatedAt
  };
}

function getPriceByKeys(source, keys) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;

  for (const key of keys) {
    if (source[key] !== undefined) {
      const parsed = parsePrice(source[key]);
      if (parsed !== null) return parsed;
    }
  }

  return null;
}

function findPriceInArray(source, names) {
  if (!Array.isArray(source)) return null;

  for (const item of source) {
    if (!item || typeof item !== "object") continue;

    const name = String(
      item.name ||
        item.displayName ||
        item.productName ||
        item.fuelType ||
        item.type ||
        item.product ||
        item.description ||
        ""
    ).toLowerCase();

    const isMatch = names.some((candidate) =>
      name.includes(candidate.toLowerCase())
    );

    if (!isMatch) continue;

    const parsed = parsePrice(
      item.price ??
        item.amount ??
        item.value ??
        item.currentPrice ??
        item.unitPrice
    );

    if (parsed !== null) return parsed;
  }

  return null;
}

function parsePrice(value) {
  if (value === null || value === undefined) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    return normalizePriceNumber(value);
  }

  if (typeof value === "object") {
    const nested =
      value.price ??
      value.amount ??
      value.value ??
      value.currentPrice ??
      value.priceInclVat ??
      value.unitPrice;

    return parsePrice(nested);
  }

  const cleaned = String(value)
    .replace("kr", "")
    .replace("DKK", "")
    .replace(",", ".")
    .trim();

  const match = cleaned.match(/\d+(\.\d+)?/);
  if (!match) return null;

  const num = Number(match[0]);
  if (!Number.isFinite(num)) return null;

  return normalizePriceNumber(num);
}

function normalizePriceNumber(num) {
  if (num > 1000) return Number((num / 100).toFixed(2));
  if (num > 100) return Number((num / 10).toFixed(2));
  return Number(num.toFixed(2));
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replaceAll("æ", "ae")
    .replaceAll("ø", "oe")
    .replaceAll("å", "aa")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function dedupeStations(stations) {
  const result = [];

  for (const station of stations) {
    const duplicate = result.find((existing) => {
      return (
        haversineMeters(station.lat, station.lng, existing.lat, existing.lng) < 25 &&
        station.brand === existing.brand
      );
    });

    if (!duplicate) result.push(station);
  }

  return result;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => deg * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

async function fetchF24Prices() {
  console.log("F24: ingen offentlig API tilsluttet endnu.");
  return [];
}

async function fetchUnoXPrices() {
  console.log("Uno-X: API kræver adgang/kontakt og er ikke tilsluttet endnu.");
  return [];
}

async function run() {
  console.log("Henter brændstofpriser...");

  const circleKIngoStations = await fetchCircleKIngoPrices();
  const f24Stations = await fetchF24Prices();
  const unoXStations = await fetchUnoXPrices();

  const allStations = dedupeStations([
    ...circleKIngoStations,
    ...f24Stations,
    ...unoXStations
  ]);

  console.log(`Circle K/INGO stationer: ${circleKIngoStations.length}`);
  console.log(`F24 stationer: ${f24Stations.length}`);
  console.log(`Uno-X stationer: ${unoXStations.length}`);
  console.log(`Stationer i alt: ${allStations.length}`);

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(allStations, null, 2));

  console.log("fuel-prices.json opdateret");
}

run();
