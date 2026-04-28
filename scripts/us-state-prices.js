const US_STATE_PRICE_FALLBACKS = {
  CA: { benzin95: 4.95, diesel: 5.25 },
  NY: { benzin95: 3.65, diesel: 4.35 },
  NJ: { benzin95: 3.45, diesel: 4.05 },
  FL: { benzin95: 3.35, diesel: 3.85 },
  TX: { benzin95: 2.95, diesel: 3.55 },
  AZ: { benzin95: 3.65, diesel: 4.05 },
  NV: { benzin95: 4.25, diesel: 4.55 },
  WA: { benzin95: 4.45, diesel: 4.85 },
  OR: { benzin95: 4.25, diesel: 4.65 },
  IL: { benzin95: 3.75, diesel: 4.05 },
  GA: { benzin95: 3.25, diesel: 3.75 },
  NC: { benzin95: 3.25, diesel: 3.75 },
  OH: { benzin95: 3.35, diesel: 3.85 },
  MI: { benzin95: 3.45, diesel: 3.95 },
  PA: { benzin95: 3.65, diesel: 4.15 },
  CO: { benzin95: 3.35, diesel: 3.85 },
  DEFAULT: { benzin95: 3.45, diesel: 3.95 }
};

export function getUsStatePriceEstimate(lat, lng, fuelType = "benzin95") {
  const stateCode = detectUsState(lat, lng);
  const statePrices =
    US_STATE_PRICE_FALLBACKS[stateCode] ||
    US_STATE_PRICE_FALLBACKS.DEFAULT;

  return {
    stateCode,
    basePrice:
      fuelType === "diesel"
        ? statePrices.diesel
        : statePrices.benzin95,
    source: "EIA-style state estimate",
    dataAgeLabel: "Estimat baseret på statsgennemsnit – ikke livepris"
  };
}

function detectUsState(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return "DEFAULT";
  }

  if (lat >= 32 && lat <= 42.5 && lng >= -124.8 && lng <= -114.1) return "CA";
  if (lat >= 40.4 && lat <= 45.1 && lng >= -79.8 && lng <= -71.8) return "NY";
  if (lat >= 38.8 && lat <= 41.4 && lng >= -75.6 && lng <= -73.8) return "NJ";
  if (lat >= 24.3 && lat <= 31.1 && lng >= -87.8 && lng <= -79.8) return "FL";
  if (lat >= 25.8 && lat <= 36.6 && lng >= -106.7 && lng <= -93.5) return "TX";
  if (lat >= 31.2 && lat <= 37.1 && lng >= -114.9 && lng <= -109.0) return "AZ";
  if (lat >= 35.0 && lat <= 42.1 && lng >= -120.1 && lng <= -114.0) return "NV";
  if (lat >= 45.5 && lat <= 49.1 && lng >= -124.8 && lng <= -116.8) return "WA";
  if (lat >= 42.0 && lat <= 46.4 && lng >= -124.8 && lng <= -116.4) return "OR";
  if (lat >= 36.9 && lat <= 42.6 && lng >= -91.6 && lng <= -87.0) return "IL";
  if (lat >= 30.3 && lat <= 35.1 && lng >= -85.7 && lng <= -80.7) return "GA";
  if (lat >= 33.8 && lat <= 36.7 && lng >= -84.4 && lng <= -75.4) return "NC";
  if (lat >= 38.3 && lat <= 42.4 && lng >= -84.9 && lng <= -80.5) return "OH";
  if (lat >= 41.6 && lat <= 48.4 && lng >= -90.5 && lng <= -82.1) return "MI";
  if (lat >= 39.6 && lat <= 42.6 && lng >= -80.6 && lng <= -74.6) return "PA";
  if (lat >= 36.9 && lat <= 41.1 && lng >= -109.1 && lng <= -102.0) return "CO";

  return "DEFAULT";
}
