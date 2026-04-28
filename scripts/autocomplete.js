import { state } from "./state.js";
import { els } from "./dom.js";
import { escapeHtml } from "./utils.js";

export async function runAutocomplete() {
  const query = els.destinationInput?.value.trim();

  if (!query || query.length < 3) {
    hideAutocomplete();
    return;
  }

  if (state.autocompleteAbortController) {
    state.autocompleteAbortController.abort();
  }

  state.autocompleteAbortController = new AbortController();

  const country =
    state.settings.region === "us" ? "us" : "dk";

  try {
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?format=jsonv2` +
      `&limit=6` +
      `&addressdetails=1` +
      `&countrycodes=${country}` +
      `&q=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
      signal: state.autocompleteAbortController.signal
    });

    if (!response.ok) {
      throw new Error("Autocomplete kunne ikke hentes");
    }

    const data = await response.json();

    renderAutocomplete(Array.isArray(data) ? data : []);
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    console.error("Autocomplete fejl", error);
    hideAutocomplete();
  }
}

export function renderAutocomplete(items) {
  if (!els.autocompleteList || !els.autocompleteBox) {
    return;
  }

  els.autocompleteList.innerHTML = "";

  if (!items.length) {
    els.autocompleteList.innerHTML =
      `<div class="autocomplete-empty">Ingen forslag</div>`;

    els.autocompleteBox.classList.remove("hidden");
    return;
  }

  items.forEach(item => {
    const title =
      item.name ||
      item.address?.road ||
      item.address?.city ||
      item.address?.town ||
      String(item.display_name || "").split(",")[0];

    const button = document.createElement("button");

    button.type = "button";
    button.className = "autocomplete-item";

    button.innerHTML = `
      <span class="autocomplete-title">${escapeHtml(title)}</span>
      <span class="autocomplete-sub">${escapeHtml(item.display_name || "")}</span>
    `;

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      const lat = Number(item.lat);
      const lng = Number(item.lon);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return;
      }

      state.selectedAutocompleteItem = {
        lat,
        lng,
        displayName: item.display_name || title,
        inputLabel: title
      };

      if (els.destinationInput) {
        els.destinationInput.value = title;
      }

      hideAutocomplete();
    });

    els.autocompleteList.appendChild(button);
  });

  els.autocompleteBox.classList.remove("hidden");
}

export function hideAutocomplete() {
  els.autocompleteBox?.classList.add("hidden");
}
