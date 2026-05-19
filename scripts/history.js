import {
  state,
  HISTORY_KEY
} from "./state.js";

import { els } from "./dom.js";

import {
  escapeHtml
} from "./utils.js";

export function loadHistory() {

  try {

    const raw =
      JSON.parse(
        localStorage.getItem(
          HISTORY_KEY
        ) || "[]"
      );

    state.history =
      Array.isArray(raw)
        ? raw
        : [];

  } catch (error) {

    console.error(
      "Historik fejl",
      error
    );

    state.history = [];
  }
}

export function saveHistory(
  destination
) {

  if (!destination) {
    return;
  }

  const entry = {
    id:
      Date.now(),

    title:
      destination.inputLabel ||
      destination.displayName ||
      "Destination",

    subtitle:
      destination.displayName ||
      "",

    lat:
      destination.lat,

    lng:
      destination.lng
  };

  state.history =
    [
      entry,
      ...state.history.filter(
        item =>
          normalize(item.title) !==
          normalize(entry.title)
      )
    ].slice(0, 12);

  localStorage.setItem(
    HISTORY_KEY,
    JSON.stringify(
      state.history
    )
  );
}

export function renderHistory() {

  if (!els.historyList) {
    return;
  }

  if (
    !state.history.length
  ) {

    els.historyList.innerHTML = `
      <div class="history-chip">
        <div class="history-chip-title">
          Ingen historik endnu
        </div>

        <div class="history-chip-subtitle">
          Beregn en rute for at gemme destinationer
        </div>
      </div>
    `;

    return;
  }

  els.historyList.innerHTML =
    state.history
      .map(renderHistoryItem)
      .join("");

  bindHistoryClicks();
}

function renderHistoryItem(
  item
) {

  return `
    <button
      class="history-chip"
      data-history-id="${item.id}"
    >

      <div class="history-chip-title">
        ${escapeHtml(item.title)}
      </div>

      <div class="history-chip-subtitle">
        ${escapeHtml(item.subtitle)}
      </div>

    </button>
  `;
}

function bindHistoryClicks() {

  document
    .querySelectorAll(
      ".history-chip[data-history-id]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const id =
            Number(
              button.dataset.historyId
            );

          const item =
            state.history.find(
              entry =>
                entry.id === id
            );

          if (!item) {
            return;
          }

          if (
            els.destinationInput
          ) {
            els.destinationInput.value =
              item.title;
          }

          state.selectedAutocompleteItem = {
            lat: item.lat,
            lng: item.lng,

            displayName:
              item.subtitle,

            inputLabel:
              item.title
          };
        }
      );
    });
}

function normalize(
  value
) {

  return String(value || "")
    .toLowerCase()
    .trim();
}
