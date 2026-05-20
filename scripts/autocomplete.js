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
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=${country}&q=${encodeURIComponent(q)}`;
    const res = await fetch(url);
    const data = await res.json();
    renderAutocomplete(Array.isArray(data) ? data : []);
  } catch {
    hideAutocomplete();
  }
}

function renderAutocomplete(items) {
  if (!items.length) {
    els.autocompleteResults.innerHTML = `<div class="autocomplete-item"><div class="autocomplete-item-title">Ingen resultater</div></div>`;
    els.autocompleteResults.classList.remove("hidden");
    return;
  }

  els.autocompleteResults.innerHTML = items.map(item => {
    const title = item.name || item.address?.road || item.address?.city || item.display_name || "Ukendt";
    return `
      <button class="autocomplete-item" data-lat="${item.lat}" data-lng="${item.lon}" data-title="${escapeHtml(title)}" data-display="${escapeHtml(item.display_name || title)}">
        <div class="autocomplete-item-title">${escapeHtml(title)}</div>
        <div class="autocomplete-item-subtitle">${escapeHtml(item.display_name || "")}</div>
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
    });
  });
}

export function hideAutocomplete() {
  els.autocompleteResults.classList.add("hidden");
  els.autocompleteResults.innerHTML = "";
}

function decodeHtml(text) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text || "";
  return textarea.value;
}
