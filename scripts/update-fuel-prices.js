import fs from "fs/promises";

const OUTPUT_FILE = "./fuel-prices.json";
const OK_API_URL = "https://mobility-prices.ok.dk/api/v1/fuel-prices";

async function fetchOKPrices() {
  try {
    const res = await fetch(OK_API_URL, {
      headers: {
        Accept: "application/json"
      }
    });

    if (!res.ok) {
      console.log("OK API fejl:", res.status, res.statusText);
      return [];
    }

    const data = await res.json();

    const stations = Array.isArray(data)
      ? data
      : Array.isArray(data.stations)
        ? data.stations
        : Array.isArray(data.data)
          ? data.data
          : [];

    console.log(`OK rå stationer: ${stations.length}`);

    return stations
      .map(normalizeOKStation)
      .filter(Boolean);
  } catch (err) {
    console.log("OK fetch fejl:", err.message);
    return [];
  }
}

function normalizeOKStation(station) {
  const lat =
    Number(station.latitude) ||
    Number(station.lat) ||
    Number(station.location?.latitude) ||
    Number(station.location?.lat);

  const lng =
    Number(station.longitude) ||
    Number(station.lng) ||
    Number(station.lon) ||
    Number(station.location?.longitude) ||
    Number(station.location?.lng) ||
    Number(station.location?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const id = station.id || station.stationId || station.siteId || `${lat},${lng}`;
  const name = station.name || station.stationName || "OK";
  const address = buildAddress(station);

  const prices = extractPrices(station);

  return {
    id: `ok-${slugify(String(id))}`,
    name,
    brand: "OK",
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
        source: "OK API"
      },
      diesel: {
        price: prices.diesel,
        currency: "DKK",
        unit: "liter",
        updatedAt: prices.updatedAt,
        source: "OK API"
      }
    }
  };
}

function buildAddress(station) {
  const direct =
    station.address ||
    station.streetAddress ||
    station.addressLine ||
    station.location?.address;

  if (direct) return String(direct);

  const street = [
    station.street,
    station.houseNumber
  ].filter(Boolean).join(" ");

  const city = [
    station.postalCode || station.zipCode,
    station.city
  ].filter(Boolean).join(" ");

  return [street, city].filter(Boolean).join(", ");
}

function extractPrices(station) {
  const now = new Date().toISOString();

  const candidates = [
    station.prices,
    station.fuelPrices,
    station.products,
    station.fuels,
    station.priceList,
    station
  ].filter(Boolean);

  let benzin95 = null;
  let diesel = null;
  let updatedAt =
    station.updatedAt ||
    station.lastUpdated ||
    station.priceUpdatedAt ||
    now;

  for (const source of candidates) {
    const found95 =
      getPrice(source, ["benzin95", "benzine95", "gasoline95", "e5", "E5", "95", "octane95"]) ??
      findPriceInArray(source, ["benzin95", "benzine95", "gasoline95", "e5", "95", "octane95"]);

    const foundDiesel =
      getPrice(source, ["diesel", "Diesel", "b7", "B7"]) ??
      findPriceInArray(source, ["diesel", "b7"]);

    if (benzin95 === null && found95 !== null) benzin95 = found95;
    if (diesel === null && foundDiesel !== null) diesel = foundDiesel;
  }

  return {
    benzin95,
    diesel,
    updatedAt
  };
}

function getPrice(source, keys) {
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
      item.productName ||
      item.fuelType ||
      item.type ||
      item.product ||
      ""
    ).toLowerCase();

    const isMatch = names.some((candidate) => name.includes(candidate.toLowerCase()));
    if (!isMatch) continue;

    const parsed = parsePrice(
      item.price ??
      item.amount ??
      item.value ??
      item.currentPrice
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
      value.priceInclVat;

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
  return value
    .toLowerCase()
    .replaceAll("æ", "ae")
    .replaceAll("ø", "oe")
    .replaceAll("å", "aa")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function run() {
  console.log("Henter OK brændstofpriser...");

  const okStations = await fetchOKPrices();

  console.log(`OK stationer normaliseret: ${okStations.length}`);

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(okStations, null, 2));

  console.log("fuel-prices.json opdateret");
}

run();
