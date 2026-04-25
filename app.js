function findFuelPriceOverride(osmStation) {
  const fuelType = state.settings.fuelType;

  const candidates = state.fuelPriceOverrides.filter(
    (item) =>
      item.fuelType === fuelType &&
      typeof item.price === "number"
  );

  if (!candidates.length) return null;

  const osmBrand = normalizeBrand(osmStation.brand || osmStation.name);
  const osmCity = normalizeText(osmStation.city || extractCity(osmStation.address));

  // 🔵 1. PRIO: SAMME BRAND + SAMME BY
  const cityMatches = candidates.filter((item) => {
    const itemBrand = normalizeBrand(item.brand || item.name);
    const itemCity = normalizeText(item.city || extractCity(item.address));

    return (
      itemBrand === osmBrand &&
      itemCity &&
      osmCity &&
      itemCity === osmCity
    );
  });

  if (cityMatches.length) {
    return cityMatches.sort((a, b) => a.price - b.price)[0];
  }

  // 🟡 2. PRIO: SAMME BRAND + TÆT PÅ (op til 5 km)
  const nearbyMatches = candidates
    .map((item) => {
      if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return null;

      return {
        ...item,
        distance: haversineMeters(
          osmStation.lat,
          osmStation.lng,
          item.lat,
          item.lng
        )
      };
    })
    .filter((item) => item && item.distance < 5000)
    .sort((a, b) => {
      if (a.price !== b.price) return a.price - b.price;
      return a.distance - b.distance;
    });

  if (nearbyMatches.length) {
    return nearbyMatches[0];
  }

  // 🔴 3. FALLBACK: BILLIGSTE I HELE DK (samme brand)
  const brandMatches = candidates.filter((item) => {
    const itemBrand = normalizeBrand(item.brand || item.name);
    return itemBrand === osmBrand;
  });

  if (brandMatches.length) {
    return brandMatches.sort((a, b) => a.price - b.price)[0];
  }

  return null;
}
