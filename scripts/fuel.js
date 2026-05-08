// TILFØJ ØVERST I scripts/fuel.js
// sammen med de øvrige imports

import L from "leaflet";



// TILFØJ UNDER KONSTANTERNE

const OVERVIEW_MARKER_LIMIT = 5;



// TILFØJ DENNE FUNKTION

function createFuelMarkerIcon(station, rank = 0) {
  const brand = (station.brand || station.name || "")
    .toLowerCase();

  let logo = "⛽";

  if (brand.includes("ok")) {
    logo = "OK";
  } else if (brand.includes("shell")) {
    logo = "Shell";
  } else if (brand.includes("q8")) {
    logo = "Q8";
  } else if (brand.includes("ingo")) {
    logo = "INGO";
  } else if (brand.includes("circle")) {
    logo = "C";
  } else if (brand.includes("uno")) {
    logo = "UNO-X";
  }

  const price =
    typeof station.price === "number"
      ? formatPrice(station.price)
      : "—";

  const bestClass =
    rank === 0
      ? "best"
      : "";

  return L.divIcon({
    className: "fuel-overview-marker",
    html: `
      <div class="fuel-overview-pin ${bestClass}">
        <div class="fuel-overview-logo">
          ${logo}
        </div>

        <div class="fuel-overview-price">
          ${price}
        </div>
      </div>
    `,
    iconSize: [84, 54],
    iconAnchor: [42, 27]
  });
}



// ERSTAT HELE updateFuelMarkers()

export function updateFuelMarkers() {
  clearFuelMarkers();

  if (!state.map) {
    return;
  }

  // INGEN MARKERS under navigation
  if (state.navigationActive) {
    return;
  }

  const stations = getStationsInRange()
    .filter(station =>
      typeof station.price === "number"
    )
    .slice()
    .sort((a, b) =>
      a.price - b.price ||
      a.distanceToRoute - b.distanceToRoute
    )
    .slice(0, OVERVIEW_MARKER_LIMIT);

  stations.forEach((station, index) => {
    const icon = createFuelMarkerIcon(
      station,
      index
    );

    const marker = L.marker(
      [station.lat, station.lng],
      {
        icon,
        zIndexOffset:
          index === 0
            ? 1000
            : 0
      }
    );

    marker.bindPopup(`
      <strong>${escapeHtml(station.name)}</strong><br>
      ${formatPrice(station.price)}<br>
      Fra rute: ${formatDistance(station.distanceToRoute)}<br>
      <a
        href="${buildGoogleMapsLink(station)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        Åbn via Google Maps
      </a>
    `);

    marker.addTo(state.map);

    state.fuelMarkers.push(marker);
  });
}
