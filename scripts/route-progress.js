import { state } from "./state.js";

import {
  haversine,
  projectPointToSegment
} from "./utils.js";

export function getRouteProgress(position) {
  const route = state.routeData?.geometry;

  if (!position || !Array.isArray(route) || route.length < 2) {
    return null;
  }

  let cumulative = 0;
  let best = null;

  for (let i = 1; i < route.length; i++) {
    const start = route[i - 1];
    const end = route[i];

    const segmentLength = haversine(
      start[1],
      start[0],
      end[1],
      end[0]
    );

    const projected = projectPointToSegment(
      position.lat,
      position.lng,
      start[1],
      start[0],
      end[1],
      end[0]
    );

    const along =
      cumulative +
      segmentLength * projected.t;

    if (
      !best ||
      projected.distanceMeters < best.distanceToRoute
    ) {
      best = {
        distanceAlongRoute: along,
        distanceToRoute: projected.distanceMeters,
        segmentIndex: i - 1,
        segmentStart: start,
        segmentEnd: end,
        segmentLength,
        segmentProgress: projected.t
      };
    }

    cumulative += segmentLength;
  }

  if (!best) {
    return null;
  }

  const remainingDistance =
    Math.max(0, cumulative - best.distanceAlongRoute);

  return {
    ...best,
    totalRouteDistance: cumulative,
    remainingDistance
  };
}

export function prepareRouteSteps() {
  const steps = Array.isArray(state.routeSteps)
    ? state.routeSteps
    : [];

  const route = state.routeData?.geometry;

  if (!Array.isArray(route) || route.length < 2) {
    return;
  }

  state.routeSteps = steps
    .map((step, index) => {
      const stepPosition = step.location;

      const progress = stepPosition
        ? getProgressForPoint(stepPosition)
        : null;

      return {
        ...step,
        stepIndex: index,
        distanceAlongRoute:
          progress?.distanceAlongRoute ?? 0,
        distanceToRoute:
          progress?.distanceToRoute ?? Infinity
      };
    })
    .filter(step =>
      Number.isFinite(step.distanceAlongRoute)
    )
    .sort((a, b) =>
      a.distanceAlongRoute - b.distanceAlongRoute
    );
}

export function getActiveStep(position) {
  const progress = getRouteProgress(position);

  const steps = Array.isArray(state.routeSteps)
    ? state.routeSteps
    : [];

  if (!progress || !steps.length) {
    return {
      step: null,
      nextStep: null,
      progress,
      distanceToStep: null,
      stepIndex: 0
    };
  }

  const currentAlong =
    progress.distanceAlongRoute;

  /*
    VIGTIGT:
    Step vælges ud fra distance langs ruten,
    ikke luftlinje til manøvrepunkter.

    Vi springer steps over, som allerede ligger bag bilen.
  */

  let nextIndex = steps.findIndex(step =>
    Number.isFinite(step.distanceAlongRoute) &&
    step.distanceAlongRoute > currentAlong + 18
  );

  if (nextIndex === -1) {
    nextIndex = steps.length - 1;
  }

  /*
    Undgå at vise meget lange "continue/follow road"-steps
    som næste sving, hvis der findes et mere relevant sving kortere fremme.
  */
  const candidate =
    findBetterUpcomingStep(
      steps,
      nextIndex,
      currentAlong
    );

  if (candidate) {
    nextIndex = candidate.index;
  }

  const nextStep = steps[nextIndex];

  state.currentStepIndex = nextIndex;

  const distanceToStep =
    Math.max(
      0,
      (nextStep?.distanceAlongRoute ?? currentAlong) -
      currentAlong
    );

  return {
    step: nextStep,
    nextStep,
    progress,
    distanceToStep,
    stepIndex: nextIndex
  };
}

function findBetterUpcomingStep(
  steps,
  startIndex,
  currentAlong
) {
  const maxLookAheadMeters = 6000;

  for (
    let i = startIndex;
    i < Math.min(steps.length, startIndex + 8);
    i++
  ) {
    const step = steps[i];

    if (!step) {
      continue;
    }

    const distance =
      step.distanceAlongRoute - currentAlong;

    if (distance < 0 || distance > maxLookAheadMeters) {
      continue;
    }

    if (isMeaningfulTurn(step)) {
      return {
        index: i,
        step
      };
    }
  }

  return null;
}

function isMeaningfulTurn(step) {
  const type = String(step.maneuverType || "").toLowerCase();
  const modifier = String(step.maneuverModifier || "").toLowerCase();
  const message = String(step.message || "").toLowerCase();

  if (type.includes("arrive")) return true;
  if (type.includes("roundabout")) return true;
  if (type.includes("rotary")) return true;
  if (type.includes("turn")) return true;
  if (type.includes("fork")) return true;
  if (type.includes("ramp")) return true;
  if (type.includes("merge")) return true;

  if (modifier.includes("left")) return true;
  if (modifier.includes("right")) return true;
  if (modifier.includes("uturn")) return true;

  if (message.includes("drej")) return true;
  if (message.includes("rundkør")) return true;
  if (message.includes("afkør")) return true;
  if (message.includes("hold til")) return true;

  return false;
}

export function getRouteBearingAtProgress(progress) {
  if (!progress?.segmentStart || !progress?.segmentEnd) {
    return null;
  }

  return calculateBearing(
    progress.segmentStart[1],
    progress.segmentStart[0],
    progress.segmentEnd[1],
    progress.segmentEnd[0]
  );
}

export function getRemainingRouteDistance(position) {
  const progress = getRouteProgress(position);

  if (!progress) {
    return null;
  }

  return progress.remainingDistance;
}

export function getRemainingRouteDuration(position, currentSpeedKmh = 0) {
  const remainingDistance =
    getRemainingRouteDistance(position);

  if (!Number.isFinite(remainingDistance)) {
    return null;
  }

  /*
    Brug routeData.duration som baseline hvis muligt.
    Ellers fallback til aktuel/forsigtig fart.
  */

  const totalDistance =
    state.routeData?.distance;

  const totalDuration =
    state.routeData?.duration;

  if (
    Number.isFinite(totalDistance) &&
    totalDistance > 0 &&
    Number.isFinite(totalDuration) &&
    totalDuration > 0
  ) {
    const ratio =
      remainingDistance / totalDistance;

    return Math.max(
      60,
      Math.round(totalDuration * ratio)
    );
  }

  const fallbackSpeedKmh =
    currentSpeedKmh > 10
      ? currentSpeedKmh
      : 70;

  return Math.round(
    remainingDistance /
    (fallbackSpeedKmh * 1000 / 3600)
  );
}

function getProgressForPoint(point) {
  const route = state.routeData?.geometry;

  if (!Array.isArray(route) || route.length < 2) {
    return null;
  }

  let cumulative = 0;
  let best = null;

  for (let i = 1; i < route.length; i++) {
    const start = route[i - 1];
    const end = route[i];

    const segmentLength = haversine(
      start[1],
      start[0],
      end[1],
      end[0]
    );

    const projected = projectPointToSegment(
      point.lat,
      point.lng,
      start[1],
      start[0],
      end[1],
      end[0]
    );

    const along =
      cumulative +
      segmentLength * projected.t;

    if (
      !best ||
      projected.distanceMeters < best.distanceToRoute
    ) {
      best = {
        distanceAlongRoute: along,
        distanceToRoute: projected.distanceMeters
      };
    }

    cumulative += segmentLength;
  }

  return best;
}

function calculateBearing(lat1, lng1, lat2, lng2) {
  const toRad = value => value * Math.PI / 180;
  const toDeg = value => value * 180 / Math.PI;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);

  const y =
    Math.sin(Δλ) * Math.cos(φ2);

  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) *
    Math.cos(φ2) *
    Math.cos(Δλ);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
