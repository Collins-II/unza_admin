export type LatLng = [number, number];

export type RouteStep = {
  instruction: string;
  maneuver: string;
  distance: number; // meters covered by this step
  location: LatLng; // where the maneuver happens
};

const toRad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: LatLng, b: LatLng) {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export const formatMeters = (meters: number) =>
  meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.max(0, Math.round(meters / 5) * 5)} m`;

/** Local flat-earth projection in meters, accurate enough at campus scale. */
function project(p: LatLng, origin: LatLng): [number, number] {
  const x = toRad(p[1] - origin[1]) * Math.cos(toRad(origin[0])) * 6371000;
  const y = toRad(p[0] - origin[0]) * 6371000;
  return [x, y];
}

export type PathProgress = {
  offPath: number; // meters from the nearest point on the path
  alongPath: number; // meters travelled along the path to the nearest point
  remaining: number; // meters left from the nearest point to the end
  nearestIndex: number; // path segment index the position is closest to
};

/** Snaps a position to a polyline and reports how far along it the user is. */
export function pathProgress(path: LatLng[], pos: LatLng): PathProgress {
  if (path.length < 2) return { offPath: Infinity, alongPath: 0, remaining: 0, nearestIndex: 0 };

  const segLengths: number[] = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const l = haversine(path[i], path[i + 1]);
    segLengths.push(l);
    total += l;
  }

  let best = { offPath: Infinity, along: 0, index: 0 };
  let cumulative = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = project(path[i], pos);
    const b = project(path[i + 1], pos);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lenSq = dx * dx + dy * dy;
    // position is the origin (0,0) in this projection
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / lenSq));
    const px = a[0] + t * dx;
    const py = a[1] + t * dy;
    const dist = Math.hypot(px, py);
    if (dist < best.offPath) best = { offPath: dist, along: cumulative + t * segLengths[i], index: i };
    cumulative += segLengths[i];
  }

  return {
    offPath: best.offPath,
    alongPath: best.along,
    remaining: Math.max(0, total - best.along),
    nearestIndex: best.index,
  };
}

/** Distance along the path at which each step's maneuver happens. */
export function stepOffsets(path: LatLng[], steps: RouteStep[]): number[] {
  return steps.map((s) => pathProgress(path, s.location).alongPath);
}

type OsrmStep = {
  distance: number;
  name?: string;
  maneuver: { type: string; modifier?: string; location: [number, number] };
};

const turnWord = (modifier?: string) => {
  switch (modifier) {
    case 'left':
      return 'left';
    case 'right':
      return 'right';
    case 'slight left':
      return 'slightly left';
    case 'slight right':
      return 'slightly right';
    case 'sharp left':
      return 'sharp left';
    case 'sharp right':
      return 'sharp right';
    case 'uturn':
      return 'around (U-turn)';
    default:
      return 'straight';
  }
};

export function describeStep(step: OsrmStep, destinationName: string, isLast: boolean): string {
  const { type, modifier } = step.maneuver;
  const road = step.name ? ` onto ${step.name}` : '';
  if (type === 'depart') return `Head ${modifier === 'straight' || !modifier ? 'out' : turnWord(modifier)}${step.name ? ` on ${step.name}` : ''}`;
  if (type === 'arrive' || isLast) return `Arrive at ${destinationName}`;
  if (type === 'roundabout' || type === 'rotary') return `Enter the roundabout and continue${road}`;
  if (type === 'continue' || (type === 'new name' && (!modifier || modifier === 'straight'))) {
    return `Continue straight${step.name ? ` on ${step.name}` : ''}`;
  }
  if (type === 'end of road' || type === 'turn' || type === 'fork' || type === 'on ramp' || type === 'off ramp') {
    return `Turn ${turnWord(modifier)}${road}`;
  }
  return `Continue ${turnWord(modifier)}${road}`;
}
