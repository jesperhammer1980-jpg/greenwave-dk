import {
  getUsStatePriceEstimate
} from "./us-state-prices.js";

export function estimateUsFuelPrice(station, fuelType = "benzin95") {
  const stateEstimate = getUsStatePriceEstimate(
    station.lat,
    station.lng,
    fuelType
  );

  const base = stateEstimate.basePrice;
  const brandDelta = getBrandModifier(station.brand || station.name);
  const localDelta = getLocalMarketModifier(station.lat, station.lng);
  const stationDelta = getStableStationVariation(station);

  const price =
    base +
    brandDelta +
    localDelta +
    stationDelta;

  return {
    price: roundToCents(
      Math.max(
        2.25,
        Math.min(7.25, price)
      )
    ),
    currency: "USD",
    unit: "gallon",
    source: stateEstimate.source,
    matchMode: "estimeret USA-pris",
    stateCode: stateEstimate.stateCode,
    dataAgeLabel: stateEstimate.dataAgeLabel,
    updatedAt: null
  };
}

function getBrandModifier(value) {
  const brand = normalize(value);

  if (brand.includes("costco")) return -0.32;
  if (brand.includes("sam")) return -0.28;
  if (brand.includes("walmart")) return -0.22;
  if (brand.includes("murphy")) return -0.18;
  if (brand.includes("arco")) return -0.15;
  if (brand.includes("speedway")) return -0.08;
  if (brand.includes("valero")) return -0.06;
  if (brand.includes("citgo")) return -0.04;

  if (brand.includes("chevron")) return 0.26;
  if (brand.includes("shell")) return 0.18;
  if (brand.includes("exxon")) return 0.16;
  if (brand.includes("mobil")) return 0.16;
  if (brand.includes("bp")) return 0.12;
  if (brand.includes("76")) return 0.14;

  return 0;
}

function getLocalMarketModifier(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return 0;
  }

  /*
    Grov by-/kystjustering.
    State estimate er basen. Denne justerer lidt for dyre metroområder.
  */

  // Los Angeles / Orange County / San Diego-ish
  if (lat > 32.5 && lat < 34.5 && lng > -119.0 && lng < -116.5) {
    return 0.18;
  }

  // Bay Area-ish
  if (lat > 37.0 && lat < 38.4 && lng > -123.0 && lng < -121.5) {
    return 0.22;
  }

  // NYC metro-ish
  if (lat > 40.3 && lat < 41.1 && lng > -74.4 && lng < -73.4) {
    return 0.18;
  }

  // Seattle-ish
  if (lat > 47.2 && lat < 47.9 && lng > -122.6 && lng < -121.9) {
    return 0.12;
  }

  // Las Vegas-ish
  if (lat > 35.8 && lat < 36.4 && lng > -115.5 && lng < -114.8) {
    return 0.08;
  }

  // Houston / Dallas-ish can be cheaper
  if (
    (lat > 29.4 && lat < 30.2 && lng > -95.8 && lng < -94.8) ||
    (lat > 32.5 && lat < 33.1 && lng > -97.3 && lng < -96.4)
  ) {
    return -0.06;
  }

  return 0;
}

function getStableStationVariation(station) {
  const key =
    `${station.name || ""}-${station.brand || ""}-${station.lat || ""}-${station.lng || ""}`;

  let hash = 0;

  for (let i = 0; i < key.length; i++) {
    hash =
      ((hash << 5) - hash) +
      key.charCodeAt(i);

    hash |= 0;
  }

  /*
    Stabil variation mellem ca. -0.20 og +0.20.
    Samme station får samme estimat hver gang.
  */
  const normalized =
    Math.abs(hash % 41) / 100;

  return normalized - 0.2;
}

function roundToCents(value) {
  return Math.round(value * 100) / 100;
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .trim();
}
