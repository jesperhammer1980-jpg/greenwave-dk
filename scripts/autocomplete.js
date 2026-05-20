import { state } from "./state.js";
import { els } from "./dom.js";
import { escapeHtml } from "./utils.js";

export async function runAutocomplete() {
  const q = els.destinationInput.value.trim();

  if (q.length < 2) {
    hideAutocomplete();
    return;
  }

  try {
    const country = state.settings.region === "us" ? "us" : "dk";

    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?format=jsonv2` +
      `&addressdetails=1` +
      `&limit=7` +
      `&countrycodes=${country}` +
      `&q=${encodeURIComponent(q)}`;

    const res = await fetch(url);
    const data = await res.json();

    renderAutocomplete(Array.isArray(data) ? data : []);
  } catch {
    hideAutocomplete();
  }
}

function renderAutocomplete(items) {
  document.body.classList.add("search-open");

  if (!items.length) {
    els.autocompleteResults.innerHTML = `
      <div class="autocomplete-item">
        <div class="autocomplete-item-title">Ingen resultater</div>
      </div>
    `;

    els.autocompleteResults.classList.remove("hidden");
    return;
  }

  els.autocompleteResults.innerHTML = items.map(item => {
    const label = formatAddressLabel(item);

    return `
      <button
        class="autocomplete-item"
        data-lat="${item.lat}"
        data-lng="${item.lon}"
        data-title="${escapeHtml(label)}"
        data-display="${escapeHtml(item.display_name || label)}"
      >
        <div class="autocomplete-item-title">${escapeHtml(label)}</div>
      </button>
    `;
  }).join("");

  els.autocompleteResults.classList.remove("hidden");

  document.querySelectorAll(".autocomplete-item[data-lat]").forEach(button => {
    button.addEventListener("click", () => {
      const title = decodeHtml(button.dataset.title);
      const displayName = decodeHtml(button.dataset.display);

      state.selectedAutocompleteItem = {
        lat: Number(button.dataset.lat),
        lng: Number(button.dataset.lng),
        inputLabel: title,
        displayName
      };

      els.destinationInput.value = title;

      hideAutocomplete();
      els.destinationInput.blur();
    });
  });
}

function formatAddressLabel(item) {
  const address = item.address || {};

  const road =
    address.road ||
    address.pedestrian ||
    address.footway ||
    address.cycleway ||
    address.path ||
    item.name ||
    "";

  const house =
    address.house_number ||
    "";

  const postcode =
    address.postcode ||
    "";

  const city =
    address.city ||
    address.town ||
    address.village ||
    address.hamlet ||
    address.municipality ||
    "";

  const line1 =
    [road, house]
      .filter(Boolean)
      .join(" ")
      .trim();

  const line2 =
    [postcode, city]
      .filter(Boolean)
      .join(" ")
      .trim();

  const combined =
    [line1, line2]
      .filter(Boolean)
      .join(", ");

  return combined || item.display_name || "Ukendt adresse";
}

export function hideAutocomplete() {
  document.body.classList.remove("search-open");
  els.autocompleteResults.classList.add("hidden");
  els.autocompleteResults.innerHTML = "";
}

function decodeHtml(text) {
  const textarea = document.createElement("textarea");

  textarea.innerHTML = text || "";

  return textarea.value;
}
