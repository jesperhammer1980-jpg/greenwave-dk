import fs from "fs/promises";

const OUTPUT_FILE = "./fuel-prices.json";

const BRAND_SOURCES = [
  { brand: "Uno-X", slug: "uno-x", url: "https://benzinpriser.io/brands/uno-x/" },
  { brand: "F24", slug: "f24", url: "https://benzinpriser.io/brands/f24/" },
  { brand: "INGO", slug: "ingo", url: "https://benzinpriser.io/brands/ingo/" },
  { brand: "Circle K", slug: "circle-k", url: "https://benzinpriser.io/brands/circlek/" },
  { brand: "OK", slug: "ok", url: "https://benzinpriser.io/brands/ok/" },
  { brand: "Q8", slug: "q8", url: "https://benzinpriser.io/brands/q8/" },
  { brand: "Shell", slug: "shell", url: "https://benzinpriser.io/brands/shell/" },
  { brand: "Go'on", slug: "goon", url: "https://benzinpriser.io/brands/goon/" },
  { brand: "OIL! tank & go", slug: "oil", url: "https://benzinpriser.io/brands/oil/" }
];

const FUEL_NAME_MAP = {
  e10: "benzin95",
  "premium e10": "benzin95_premium",
  e5: "benzin98",
  diesel: "diesel",
  "premium diesel": "diesel_premium",
  electric: "electric",
  "hvo 100": "hvo100",
  adblue: "adblue"
};

async function run() {
  console.log("Henter brændstofpriser via scraper...");

  const allStations = [];

  for (const source of BRAND_SOURCES) {
    const stations = await scrapeBrand(source);
    console.log(`${source.brand}: ${stations.length} stationer`);
    allStations.push(...stations);
  }

  const cleaned = dedupeStations(allStations);

  console.log(`Stationer i alt efter dedupe: ${cleaned.length}`);

  if (cleaned.length === 0) {
    console.log("Ingen data hentet. fuel-prices.json overskrives IKKE.");
    process.exit(1);
  }

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(cleaned, null, 2));
  console.log("fuel-prices.json opdateret");
}

async function scrapeBrand(source) {
  try {
    const html = await fetchText(source.url);

    const text = htmlToText(html);
    const stationSection = extractStationSection(text);

    if (!stationSection) {
      console.log(`${source.brand}: fandt ingen station-sektion`);
      return [];
    }

    const stationRows = parseStationRows(stationSection, source.brand);

    return stationRows.map((row) => {
      const fuelTypes = {};

      if (row.e10 !== null) {
        fuelTypes.benzin95 = makeFuelPrice(row.e10, row.updatedAt, "benzinpriser.io scraper");
      }

      if (row.e5 !== null) {
        fuelTypes.benzin98 = makeFuelPrice(row.e5, row.updatedAt, "benzinpriser.io scraper");
      }

      if (row.diesel !== null) {
        fuelTypes.diesel = makeFuelPrice(row.diesel, row.updatedAt, "benzinpriser.io scraper");
      }

      if (row.premiumDiesel !== null) {
        fuelTypes.diesel_premium = makeFuelPrice(row.premiumDiesel, row.updatedAt, "benzinpriser.io scraper");
      }

      return {
        id: `${source.slug}-${slugify(row.station + "-" + row.city)}`,
        name: row.station,
        brand: source.brand,
        address: row.city || "",
        lat: null,
        lng: null,
        country: "DK",
        fuelTypes
      };
    });
  } catch (error) {
    console.log(`${source.brand}: scraper fejl: ${error.message}`);
    return [];
  }
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "GreenwaveDK/0.1 fuel price updater",
      "Accept": "text/html,application/xhtml+xml"
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return await res.text();
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\r/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function extractStationSection(text) {
  const marker = "Search Stations:";
  const index = text.indexOf(marker);

  if (index === -1) return null;

  let section = text.slice(index + marker.length);

  const endMarkers = [
    "What will you build",
    "Current and long-term",
    "Register your interest",
    "Privacy Policy",
    "Terms & Conditions"
  ];

  for (const end of endMarkers) {
    const endIndex = section.indexOf(end);
    if (endIndex !== -1) {
      section = section.slice(0, endIndex);
    }
  }

  return section.trim();
}

function parseStationRows(section, brand) {
  const lines = section
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const headerIndex = lines.findIndex((line) =>
    line.toLowerCase().startsWith("station city")
  );

  const relevant = headerIndex >= 0 ? lines.slice(headerIndex + 1) : lines;

  const rows = [];
  let i = 0;

  while (i < relevant.length) {
    const line = relevant[i];

    if (!looksLikeStationLine(line, brand)) {
      i++;
      continue;
    }

    const stationCity = line;
    const numbers = [];

    let j = i + 1;
    while (j < relevant.length && numbers.length < 6) {
      const current = relevant[j];

      if (looksLikeStationLine(current, brand)) break;

      const price = parsePrice(current);
      if (price !== null) {
        numbers.push(price);
      }

      if (/\d+\s*(seconds?|minutes?|hours?|days?)\s*ago/i.test(current)) {
        break;
      }

      j++;
    }

    const parsed = splitStationCity(stationCity, brand);

    rows.push({
      station: parsed.station,
      city: parsed.city,
      e10: numbers[0] ?? null,
      diesel: numbers[1] ?? null,
      e5: numbers[2] ?? null,
      premiumDiesel: numbers[3] ?? null,
      updatedAt: new Date().toISOString()
    });

    i = Math.max(j + 1, i + 1);
  }

  return rows;
}

function looksLikeStationLine(line, brand) {
  const clean = line.toLowerCase();
  const brandClean = brand.toLowerCase();

  if (clean.includes("search stations")) return false;
  if (clean.startsWith("station city")) return false;
  if (/^\d/.test(clean)) return false;
  if (clean.includes("minutes ago")) return false;
  if (clean.includes("hours ago")) return false;

  if (brandClean === "circle k") return clean.startsWith("circle k");
  if (brandClean === "uno-x") return clean.startsWith("uno-x");
  if (brandClean === "ingo") return clean.startsWith("ingo");
  if (brandClean === "f24") return clean.startsWith("f24");
  if (brandClean === "ok") return clean.startsWith("ok ");
  if (brandClean === "q8") return clean.startsWith("q8");
  if (brandClean === "shell") return clean.startsWith("shell");
  if (brandClean === "go'on") return clean.startsWith("go’on") || clean.startsWith("go'on");
  if (brandClean.includes("oil")) return clean.startsWith("oil!");

  return clean.includes(brandClean);
}

function splitStationCity(value, brand) {
  const trimmed = value.trim();

  const knownCities = [
    "Albertslund", "Allerød", "Ballerup", "Birkerød", "Brøndby", "Charlottenlund",
    "Espergærde", "Farum", "Fredensborg", "Frederikssund", "Frederiksværk",
    "Gentofte", "Glostrup", "Greve", "Helsinge", "Helsingør", "Herlev",
    "Hillerød", "Holbæk", "Hundested", "Hvidovre", "Jyllinge", "København",
    "Køge", "Lyngby", "Nivå", "Roskilde", "Rødovre", "Skibby", "Slangerup",
    "Stenløse", "Taastrup", "Valby", "Virum", "Ølstykke"
  ];

  for (const city of knownCities) {
    if (trimmed.endsWith(city)) {
      return {
        station: trimmed.slice(0, -city.length).trim(),
        city
      };
    }
  }

  return {
    station: trimmed,
    city: ""
  };
}

function makeFuelPrice(price, updatedAt, source) {
  return {
    price,
    currency: "DKK",
    unit: "liter",
    updatedAt,
    source
  };
}

function parsePrice(value) {
  if (value === null || value === undefined) return null;

  const cleaned = String(value)
    .replace("kr", "")
    .replace("DKK", "")
    .replace(",", ".")
    .trim();

  if (!/^\d{1,2}(\.\d{1,2})?$/.test(cleaned)) return null;

  const num = Number(cleaned);

  if (!Number.isFinite(num)) return null;
  if (num < 5 || num > 40) return null;

  return Number(num.toFixed(2));
}

function dedupeStations(stations) {
  const seen = new Set();
  const result = [];

  for (const station of stations) {
    const key = `${station.brand}-${station.name}-${station.address}`.toLowerCase();

    if (seen.has(key)) continue;

    seen.add(key);
    result.push(station);
  }

  return result;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replaceAll("æ", "ae")
    .replaceAll("ø", "oe")
    .replaceAll("å", "aa")
    .replaceAll("’", "")
    .replaceAll("'", "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

run();
