export function estimateUsFuelPrice(station, fuelType = "benzin95") {
  const base = getBasePrice(fuelType);
  const brandDelta = getBrandModifier(station.brand || station.name);
  const locationDelta = getLocationModifier(station.lat, station.lng);
  const stationDelta = getStableStationVariation(station);

  const price = base + brandDelta + locationDelta + stationDelta;

  return {
    price: roundToCents(Math.max(2.49, Math.min(6.99, price))),
    currency: "USD",
    unit: "gallon",
    source: "USA estimate",
    matchMode: "estimeret USA-pris"
  };
}

function getBasePrice(fuelType) {
  if (fuelType === "diesel") {
    return 3.95;
  }

  if (fuelType === "electric") {
    return 0;
  }

  return 3.45;
}

function getBrandModifier(value) {
  const brand = normalize(value);

  if (brand.includes("costco")) return -0.28;
  if (brand.includes("sam")) return -0.24;
  if (brand.includes("walmart")) return -0.18;
  if (brand.includes("murphy")) return -0.16;
  if (brand.includes("speedway")) return -0.08;
  if (brand.includes("arco")) return -0.12;
  if (brand.includes("valero")) return -0.06;
  if (brand.includes("citgo")) return -0.04;

  if (brand.includes("chevron")) return 0.22;
  if (brand.includes("shell")) return 0.16;
  if (brand.includes("exxon")) return 0.14;
  if (brand.includes("mobil")) return 0.14;
  if (brand.includes("bp")) return 0.1;
  if (brand.includes("76")) return 0.12;

  return 0;
}

function getLocationModifier(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return 0;
  }

  // California / West Coast-ish
  if (lat > 32 && lat < 42 && lng < -114 && lng > -125) {
    return 1.05;
  }

  // New York / Northeast-ish
  if (lat > 39 && lat < 45 && lng < -70 && lng > -80) {
    return 0.35;
  }

  // Florida-ish
  if (lat > 24 && lat < 31 && lng < -79 && lng > -88) {
    return 0.05;
  }

  // Texas-ish
  if (lat > 25 && lat < 37 && lng < -93 && lng > -107) {
    return -0.28;
  }

  // Midwest-ish
  if (lat > 36 && lat < 48 && lng < -82 && lng > -104) {
    return -0.12;
  }

  return 0;
}

function getStableStationVariation(station) {
  const key = `${station.name || ""}-${station.brand || ""}-${station.lat || ""}-${station.lng || ""}`;
  let hash = 0;

  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i);
    hash |= 0;
  }

  const normalized = Math.abs(hash % 41) / 100;

  return normalized - 0.2;
}

function roundToCents(value) {
  return Math.round(value * 100) / 100;
}

function normalize(value) {
  return String(value || "").toLowerCase().trim();
}
