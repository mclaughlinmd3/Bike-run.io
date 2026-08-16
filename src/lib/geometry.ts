import * as turf from '@turf/turf';
import type { Feature, Polygon } from 'geojson';
import type { TrackPoint } from './types';

// GPS jitter smoothing: collapses noise below ~this many degrees (~3m at
// mid-latitudes) so tiny wobble doesn't register as a false self-crossing.
const SIMPLIFY_TOLERANCE_DEG = 0.00003;

// A track that ends within this distance of where it started (or of an
// earlier point on itself) is treated as "closed the loop", matching how a
// runner/rider actually experiences finishing a lap.
const CLOSE_LOOP_THRESHOLD_M = 30;

// Discard slivers from residual GPS noise rather than awarding them as claims.
const MIN_LOOP_AREA_SQM = 50;

type Ring = [number, number][];

/**
 * Given a raw GPS track, returns every closed loop the path traced.
 *
 * Loop detection walks the (simplified) path segment by segment. Whenever the
 * newest segment crosses an earlier segment of the still-open path, the loop
 * between the crossing point and the current position is cut off as a claim
 * — the same left-to-right "cut on self-crossing" rule Paper.io/Slither.io
 * use, which handles multi-lap routes (figure-8s, repeated laps) without
 * needing a general polygon-self-intersection solver. A final check handles
 * the common case of a route that simply returns near its own start.
 */
export function detectClaimedPolygons(track: TrackPoint[]): Feature<Polygon>[] {
  if (track.length < 4) return [];

  const rawCoords: [number, number][] = track.map((p) => [p.lng, p.lat]);
  const simplified = turf.simplify(turf.lineString(rawCoords), {
    tolerance: SIMPLIFY_TOLERANCE_DEG,
    highQuality: true,
  });

  let pts = simplified.geometry.coordinates as [number, number][];
  pts = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
  if (pts.length < 4) return [];

  const polygons: Feature<Polygon>[] = [];
  let segStart = 0;

  for (let i = segStart + 2; i < pts.length; i++) {
    const newSeg = turf.lineString([pts[i - 1], pts[i]]);
    let crossing: { j: number; point: [number, number] } | null = null;

    // Skip the segment immediately before the newest one — it shares an
    // endpoint with it, which isn't a meaningful self-crossing.
    for (let j = segStart; j < i - 2; j++) {
      const prevSeg = turf.lineString([pts[j], pts[j + 1]]);
      const hit = turf.lineIntersect(newSeg, prevSeg);
      if (hit.features.length > 0) {
        crossing = { j, point: hit.features[0].geometry.coordinates as [number, number] };
        break;
      }
    }

    if (crossing) {
      const ring: Ring = [crossing.point, ...pts.slice(crossing.j + 1, i), pts[i], crossing.point];
      const poly = ringToClaim(ring);
      if (poly) polygons.push(poly);
      segStart = i;
    }
  }

  const tailStart = pts[segStart];
  const tailEnd = pts[pts.length - 1];
  if (
    pts.length - segStart >= 3 &&
    turf.distance(tailStart, tailEnd, { units: 'meters' }) <= CLOSE_LOOP_THRESHOLD_M
  ) {
    const ring: Ring = [...pts.slice(segStart), tailStart];
    const poly = ringToClaim(ring);
    if (poly) polygons.push(poly);
  }

  return polygons;
}

function ringToClaim(ring: Ring): Feature<Polygon> | null {
  if (ring.length < 4) return null;
  try {
    const poly = turf.polygon([ring]);
    const rewound = turf.rewind(poly, { reverse: false }) as Feature<Polygon>;
    if (turf.area(rewound) < MIN_LOOP_AREA_SQM) return null;
    return rewound;
  } catch {
    // Degenerate ring (self-touching, zero-width, etc.) — not a usable claim.
    return null;
  }
}

export function trackDistanceMeters(track: TrackPoint[]): number {
  if (track.length < 2) return 0;
  const line = turf.lineString(track.map((p) => [p.lng, p.lat]));
  return turf.length(line, { units: 'kilometers' }) * 1000;
}

export function squareMetersToKm2(sqm: number): number {
  return sqm / 1_000_000;
}
