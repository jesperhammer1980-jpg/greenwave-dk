import { state, HISTORY_KEY } from "./state.js";
import { els } from "./dom.js";
import { escapeHtml } from "./utils.js";

export function loadHistory() {
  try {
    state.history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    state.history = [];
  }
}

export function saveHistory(destination) {
  const item = {
    id: Date.now(),
    title: destination.inputLabel || destination.displayName || "Destination",
    subtitle: destination.displayName || "",
    lat: destination.lat,
    lng: destination.lng
  };

  state.history = [item, ...state.history.filter(x => x.title !== item.title)].slice(0, 8);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
}

export function renderHistory() {
  if (!els.historyList) return;

  if (!state.history.length) {
    els.historyList.innerHTML = `<div class="history-chip"><div class="history-chip-title">Ingen historik endnu</div><div class="history-chip-subtitle">Beregn en rute først</div></div>`;
    return;
  }

  els.historyList.innerHTML = state.history.map(item => `
    <button class="history-chip" data-id="${item.id}">
      <div class="history-chip-title">${escapeHtml(item.title)}</div>
      <div class="history-chip-subtitle">${escapeHtml(item.subtitle)}</div>
    </button>
  `).join("");

  document.querySelectorAll(".history-chip[data-id]").forEach(button => {
    button.addEventListener("click", () => {
      const item = state.history.find(x => x.id === Number(button.dataset.id));
      if (!item) return;
      els.destinationInput.value = item.title;
      state.selectedAutocompleteItem = { lat: item.lat, lng: item.lng, inputLabel: item.title, displayName: item.subtitle };
    });
  });
}
