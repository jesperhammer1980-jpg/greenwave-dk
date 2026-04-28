import { state, HISTORY_KEY } from "./state.js";
import { els } from "./dom.js";

export function saveHistory(destination) {
  if (!destination) {
    return;
  }

  const entry = {
    label:
      destination.inputLabel ||
      destination.displayName ||
      destination.label ||
      "Ukendt destination",

    displayName:
      destination.displayName ||
      destination.label ||
      destination.inputLabel ||
      "Ukendt destination",

    lat: Number(destination.lat),
    lng: Number(destination.lng),
    savedAt: new Date().toISOString()
  };

  if (!Number.isFinite(entry.lat) || !Number.isFinite(entry.lng)) {
    return;
  }

  const list = getHistory();

  const next = [
    entry,
    ...list.filter(item =>
      Math.abs(Number(item.lat) - entry.lat) > 0.00001 ||
      Math.abs(Number(item.lng) - entry.lng) > 0.00001
    )
  ].slice(0, 8);

  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

export function getHistory() {
  try {
    const raw = JSON.parse(
      localStorage.getItem(HISTORY_KEY) || "[]"
    );

    if (!Array.isArray(raw)) {
      return [];
    }

    return raw.filter(item =>
      item &&
      typeof item === "object" &&
      Number.isFinite(Number(item.lat)) &&
      Number.isFinite(Number(item.lng))
    );
  } catch {
    return [];
  }
}

export function renderHistory() {
  if (!els.historyList) {
    return;
  }

  els.historyList.innerHTML = "";

  const history = getHistory();

  if (!history.length) {
    const empty = document.createElement("div");
    empty.className = "autocomplete-empty";
    empty.textContent = "Ingen historik endnu.";
    els.historyList.appendChild(empty);
    return;
  }

  history.forEach(item => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "history-chip";
    button.textContent = item.label || item.displayName || "Destination";

    button.addEventListener("click", () => {
      state.selectedAutocompleteItem = {
        lat: Number(item.lat),
        lng: Number(item.lng),
        displayName: item.displayName || item.label,
        inputLabel: item.label || item.displayName
      };

      if (els.destinationInput) {
        els.destinationInput.value =
          item.label || item.displayName || "";
      }

      els.historyBox?.classList.add("hidden");
    });

    els.historyList.appendChild(button);
  });
}
