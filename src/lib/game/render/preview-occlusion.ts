import type { V } from "./types";

export type PreviewPoint = [number, number];

const EPSILON = 1e-10;
const cross = (a: PreviewPoint, b: PreviewPoint, p: PreviewPoint) =>
  (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
const signedArea = (points: PreviewPoint[]) => points.reduce((area, point, i) => {
  const next = points[(i + 1) % points.length];
  return area + point[0] * next[1] - next[0] * point[1];
}, 0) / 2;

/** Cut the cached leg flush with its shoe's horizontal upper surface. */
export function clipPreviewAbove(points: V[], surfaceY: number): V[] {
  const result: V[] = [];
  for (let i = 0; i < points.length; i++) {
    const previous = points[(i + points.length - 1) % points.length], current = points[i];
    const from = previous[1] - surfaceY, to = current[1] - surfaceY;
    if ((from >= 0) !== (to >= 0)) {
      const fraction = from / (from - to);
      result.push([
        previous[0] + (current[0] - previous[0]) * fraction,
        surfaceY,
        previous[2] + (current[2] - previous[2]) * fraction,
      ]);
    }
    if (to >= 0) result.push(current);
  }
  return result;
}

/** The projected casing is convex, even when its box is viewed obliquely. */
export function previewHull(points: PreviewPoint[]): PreviewPoint[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .filter((point, i, all) => i === 0 || point[0] !== all[i - 1][0] || point[1] !== all[i - 1][1]);
  if (sorted.length < 3) return sorted;
  const chain = (points: PreviewPoint[]) => {
    const result: PreviewPoint[] = [];
    for (const point of points) {
      while (result.length >= 2 && cross(result[result.length - 2], result[result.length - 1], point) <= EPSILON) result.pop();
      result.push(point);
    }
    return result;
  };
  return [...chain(sorted).slice(0, -1), ...chain([...sorted].reverse()).slice(0, -1)];
}

function halfPlane(points: PreviewPoint[], a: PreviewPoint, b: PreviewPoint, inside: boolean): PreviewPoint[] {
  const result: PreviewPoint[] = [];
  const direction = inside ? 1 : -1;
  for (let i = 0; i < points.length; i++) {
    const previous = points[(i + points.length - 1) % points.length], current = points[i];
    const from = cross(a, b, previous) * direction, to = cross(a, b, current) * direction;
    if ((from >= 0) !== (to >= 0)) {
      const fraction = from / (from - to);
      result.push([
        previous[0] + (current[0] - previous[0]) * fraction,
        previous[1] + (current[1] - previous[1]) * fraction,
      ]);
    }
    if (to >= 0) result.push(current);
  }
  return result;
}

/** Subtract a convex casing silhouette without adding SVG masks or frame work. */
export function subtractPreviewHull(points: PreviewPoint[], hull: PreviewPoint[]): PreviewPoint[][] {
  if (points.length < 3 || Math.abs(signedArea(points)) <= EPSILON) return [];
  if (hull.length < 3 || Math.abs(signedArea(hull)) <= EPSILON) return [points];
  const boundary = signedArea(hull) < 0 ? [...hull].reverse() : hull;
  let intersection = points;
  for (let i = 0; i < boundary.length && intersection.length; i++) {
    intersection = halfPlane(intersection, boundary[i], boundary[(i + 1) % boundary.length], true);
  }
  // Avoid introducing fragment seams when the polygons only touch or miss.
  if (Math.abs(signedArea(intersection)) <= EPSILON) return [points];

  const visible: PreviewPoint[][] = [];
  let remaining = points;
  for (let i = 0; i < boundary.length && remaining.length; i++) {
    const a = boundary[i], b = boundary[(i + 1) % boundary.length];
    const outside = halfPlane(remaining, a, b, false);
    if (Math.abs(signedArea(outside)) > EPSILON) visible.push(outside);
    // Only this remainder can overlap the next piece; emitted pieces are
    // disjoint and the final inside remainder is precisely the hidden area.
    remaining = halfPlane(remaining, a, b, true);
  }
  return visible;
}
