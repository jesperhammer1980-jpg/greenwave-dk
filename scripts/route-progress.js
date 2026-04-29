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

  return {
    ...best,
    totalRouteDistance: cumulative
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

  state.routeSteps = steps.map((step, index) => {
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
  }).sort((a, b) =>
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

  let nextIndex = steps.findIndex(step =>
    Number.isFinite(step.distanceAlongRoute) &&
    step.distanceAlongRoute > currentAlong + 20
  );

  if (nextIndex === -1) {
    nextIndex = steps.length - 1;
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
