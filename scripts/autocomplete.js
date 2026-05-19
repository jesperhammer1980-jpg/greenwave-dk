import { state } from "./state.js";
import { els } from "./dom.js";

import {
  escapeHtml
} from "./utils.js";

export async function runAutocomplete() {

  const query =
    els.destinationInput?.value
      ?.trim();

  if (
    !query ||
    query.length < 2
  ) {
    hideAutocomplete();
    return;
  }

  try {

    const country =
      state.settings.region === "us"
        ? "us"
        : "dk";

    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?format=jsonv2` +
      `&addressdetails=1` +
      `&limit=6` +
      `&countrycodes=${country}` +
      `&q=${encodeURIComponent(query)}`;

    const response =
      await fetch(url);

    if (!response.ok) {
      throw new Error(
        "Autocomplete fejl"
      );
    }

    const data =
      await response.json();

    renderAutocomplete(
      Array.isArray(data)
        ? data
        : []
    );

  } catch (error) {

    console.error(
      "Autocomplete fejl",
      error
    );

    hideAutocomplete();
  }
}

function renderAutocomplete(
  results
) {

  if (
    !els.autocompleteResults
  ) {
    return;
  }

  if (!results.length) {

    els.autocompleteResults.innerHTML = `
      <div class="autocomplete-item">
        <div class="autocomplete-item-title">
          Ingen resultater
        </div>
      </div>
    `;

    els.autocompleteResults.classList.remove(
      "hidden"
    );

    return;
  }

  els.autocompleteResults.innerHTML =
    results
      .map(renderItem)
      .join("");

  els.autocompleteResults.classList.remove(
    "hidden"
  );

  bindAutocompleteClicks(
    results
  );
}

function renderItem(
  item
) {

  const title =
    item.name ||
    item.address?.road ||
    item.address?.city ||
    item.display_name ||
    "Ukendt";

  return `
    <button
      class="autocomplete-item"
      data-lat="${item.lat}"
      data-lng="${item.lon}"
      data-name="${escapeHtml(title)}"
      data-display="${escapeHtml(item.display_name || title)}"
    >

      <div class="autocomplete-item-title">
        ${escapeHtml(title)}
      </div>

      <div class="autocomplete-item-subtitle">
        ${escapeHtml(item.display_name || "")}
      </div>

    </button>
  `;
}

function bindAutocompleteClicks(
  results
) {

  document
    .querySelectorAll(
      ".autocomplete-item[data-lat]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const lat =
            Number(
              button.dataset.lat
            );

          const lng =
            Number(
              button.dataset.lng
            );

          const name =
            button.dataset.name ||
            "";

          const display =
            button.dataset.display ||
            "";

          state.selectedAutocompleteItem = {
            lat,
            lng,

            inputLabel:
              decodeHtml(name),

            displayName:
              decodeHtml(display)
          };

          if (
            els.destinationInput
          ) {
            els.destinationInput.value =
              decodeHtml(name);
          }

          hideAutocomplete();
        }
      );
    });
}

export function hideAutocomplete() {

  if (
    !els.autocompleteResults
  ) {
    return;
  }

  els.autocompleteResults.classList.add(
    "hidden"
  );

  els.autocompleteResults.innerHTML =
    "";
}

function decodeHtml(
  text
) {

  const textarea =
    document.createElement(
      "textarea"
    );

  textarea.innerHTML = text;

  return textarea.value;
}
