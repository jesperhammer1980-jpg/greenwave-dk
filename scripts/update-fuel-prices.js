import fs from "fs/promises";

const OUTPUT_FILE = "./fuel-prices.json";

// 🔥 OK API (offentlig – virker uden login)
const OK_API_URL = "https://www.ok.dk/api/prices";

async function fetchOKPrices() {
  try {
    const res = await fetch(OK_API_URL);

    if (!res.ok) {
      console.log("❌ OK API fejl:", res.status);
      return [];
    }

    const data = await res.json();

    if (!Array.isArray(data)) {
      console.log("❌ Uventet OK dataformat");
      return [];
    }

    return data
      .map((station) => {
        const lat = Number(station.latitude);
        const lng = Number(station.longitude);

        if (!lat || !lng) return null;

        return {
          id: `ok-${station.id}`,
          name: station.name || "OK",
          brand: "OK",
          address: station.address || "",
          lat,
          lng,
          fuelTypes: {
            benzin95: {
              price: parsePrice(station.prices?.E5),
              currency: "DKK",
              unit: "liter",
              updatedAt: new Date().toISOString(),
              source: "OK API"
            },
            diesel: {
              price: parsePrice(station.prices?.Diesel),
              currency: "DKK",
              unit: "liter",
              updatedAt: new Date().toISOString(),
              source: "OK API"
            }
          }
        };
      })
      .filter(Boolean);
  } catch (err) {
    console.log("❌ OK fetch fejl:", err.message);
    return [];
  }
}

function parsePrice(value) {
  if (!value) return null;

  const num = Number(String(value).replace(",", "."));
  return Number.isFinite(num) ? num : null;
}

async function run() {
  console.log("⛽ Henter OK priser...");

  const okStations = await fetchOKPrices();

  console.log(`✅ OK stationer: ${okStations.length}`);

  const allStations = [...okStations];

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(allStations, null, 2));

  console.log("💾 fuel-prices.json opdateret");
}

run();
