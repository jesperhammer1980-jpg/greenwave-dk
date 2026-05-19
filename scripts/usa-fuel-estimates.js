export function estimateUsFuelPrice(station, fuelType = "benzin95") {
  const stateCode = getStateCode(station);

  const base =
    fuelType === "diesel"
      ? 3.82
      : 3.45;

  const stateAdjustment =
    getStateAdjustment(stateCode);

  const brandAdjustment =
    getBrandAdjustment(station.brand || station.name);

  return {
    price:
      Math.round(
        (base + stateAdjustment + brandAdjustment) * 100
      ) / 100,

    currency: "USD",
    unit: "gallon",
    source: "US estimate",
    matchMode: "regional estimate",
    stateCode,
    updatedAt: null,
    dataAgeLabel: "Estimeret US-pris"
  };
}

function getStateCode(station) {
  const text =
    `${station.address || ""} ${station.name || ""}`.toUpperCase();

  const match =
    text.match(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\b/);

  return match?.[1] || null;
}

function getStateAdjustment(stateCode) {
  const high = ["CA", "WA", "OR", "NV", "NY", "IL"];
  const low = ["TX", "OK", "MS", "LA", "AR", "MO"];

  if (high.includes(stateCode)) {
    return 0.65;
  }

  if (low.includes(stateCode)) {
    return -0.25;
  }

  return 0;
}

function getBrandAdjustment(value) {
  const text =
    String(value || "").toLowerCase();

  if (text.includes("shell")) return 0.08;
  if (text.includes("chevron")) return 0.12;
  if (text.includes("bp")) return 0.05;
  if (text.includes("costco")) return -0.2;
  if (text.includes("speedway")) return -0.05;

  return 0;
}
