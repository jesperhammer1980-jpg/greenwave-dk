import { state } from "./state.js";

export function prepareRouteSteps() {

  if (
    !Array.isArray(
      state.routeSteps
    )
  ) {
    state.routeSteps = [];
    return;
  }

  let accumulated = 0;

  state.routeSteps =
    state.routeSteps.map(
      (step, index) => {

        const prepared = {
          ...step,

          index,

          startDistance:
            accumulated,

          endDistance:
            accumulated +
            Number(
              step.distance || 0
            )
        };

        accumulated += Number(
          step.distance || 0
        );

        return prepared;
      }
    );
}

export function getCurrentStep(
  alongMeters
) {

  if (
    !Array.isArray(
      state.routeSteps
    ) ||
    !state.routeSteps.length
  ) {
    return null;
  }

  return (
    state.routeSteps.find(
      step =>
        alongMeters >=
          step.startDistance &&
        alongMeters <=
          step.endDistance
    ) ||
    state.routeSteps[
      state.routeSteps.length - 1
    ]
  );
}

export function getDistanceToNextStep(
  alongMeters
) {

  const step =
    getCurrentStep(
      alongMeters
    );

  if (!step) {
    return Infinity;
  }

  return Math.max(
    0,
    step.endDistance -
      alongMeters
  );
}

export function getUpcomingStep(
  alongMeters
) {

  const current =
    getCurrentStep(
      alongMeters
    );

  if (!current) {
    return null;
  }

  return (
    state.routeSteps[
      current.index + 1
    ] || null
  );
}
