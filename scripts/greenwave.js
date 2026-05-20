import { state } from "./state.js";
export function getGreenWaveRecommendation(current) {
  if (!state.settings.greenWaveEnabled) return { speedKmh: null };
  const speed = current?.speed || 0;
  if (state.currentMaxSpeed) return { speedKmh: Math.round(state.currentMaxSpeed * 0.9 / 5) * 5 };
  if (speed > 70) return { speedKmh: 75 };
  if (speed > 40) return { speedKmh: 55 };
  if (speed > 15) return { speedKmh: 40 };
  return { speedKmh: null };
}
