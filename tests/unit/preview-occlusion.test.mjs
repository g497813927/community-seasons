import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../../src/lib/game/render/preview-occlusion.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { clipPreviewAbove, previewHull, subtractPreviewHull } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

const square = (left, top, right, bottom) => [[left, top], [right, top], [right, bottom], [left, bottom]];
const area = (points) => Math.abs(points.reduce((sum, [x, y], i) => {
  const [nextX, nextY] = points[(i + 1) % points.length];
  return sum + x * nextY - nextX * y;
}, 0)) / 2;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`);
const strictlyInside = ([x, y], polygon) => polygon.every(([ax, ay], i) => {
  const [bx, by] = polygon[(i + 1) % polygon.length];
  return (bx - ax) * (y - ay) - (by - ay) * (x - ax) > 1e-8;
});

test('the leg is cut at the shoe plane without bending its sides or keeping the buried cap', () => {
  const side = [[-.1, .5, 0], [.1, .5, 0], [.1, .1, .3], [-.1, .1, .3]];
  const original = structuredClone(side);
  const clipped = clipPreviewAbove(side, .23);
  assert.equal(clipped.length, 4);
  assert.ok(clipped.every(([, y]) => y >= .23));
  const contact = clipped.filter(([, y]) => y === .23);
  assert.equal(contact.length, 2);
  for (const [x, , z] of contact) {
    near(Math.abs(x), .1);
    near(z, .2025);
  }
  const reversed = clipPreviewAbove([...side].reverse(), .23);
  assert.equal(reversed.length, clipped.length);
  for (const point of clipped) assert.ok(reversed.some((other) => point.every((coordinate, i) => Math.abs(coordinate - other[i]) < 1e-10)));
  assert.deepEqual(clipPreviewAbove([[-.1, .1, .2], [.1, .1, .2], [.1, .15, .3], [-.1, .15, .3]], .23), []);
  assert.deepEqual(clipPreviewAbove(side, .1), side, 'a face already above the plane must retain its geometry');
  assert.deepEqual(side, original);
});

test('projected box hull discards duplicate and interior points without mutating geometry', () => {
  const silhouette = [[-2, 0], [-1, -2], [2, -1], [3, 1], [1, 3], [-2, 2]];
  const points = [...silhouette, [0, 0], [1, 1], [-2, 0], [-2, 1]].reverse();
  const original = structuredClone(points);
  const hull = previewHull(points);
  assert.equal(hull.length, 6);
  near(area(hull), area(silhouette));
  for (const point of silhouette) assert.ok(hull.some(([x, y]) => x === point[0] && y === point[1]));
  assert.deepEqual(points, original);
});

test('a leg face outside or tangent to the casing stays whole; a hidden face disappears', () => {
  const casing = square(0, 0, 2, 2);
  for (const leg of [square(3, 0, 4, 1), square(2, 0, 3, 2), [[-2, 1], [-1, 1], [1, 3], [0, 3]]]) {
    assert.deepEqual(subtractPreviewHull(leg, casing), [leg]);
  }
  assert.deepEqual(subtractPreviewHull(square(.25, .25, 1.75, 1.75), casing), []);
  assert.deepEqual(subtractPreviewHull(casing, casing), []);
});

test('only the overlapping upper leg is removed and the lower connection remains', () => {
  const leg = square(.5, 1, 1.5, 4), casing = square(0, 0, 2, 2);
  const pieces = subtractPreviewHull(leg, casing);
  assert.equal(pieces.length, 1);
  near(area(pieces[0]), 2);
  assert.ok(pieces[0].every(([, y]) => y >= 2));
  assert.ok(pieces[0].some(([, y]) => y === 4), 'the shoe connection was clipped away');
});

test('subtracting an interior casing yields disjoint pieces with the exact visible area', () => {
  const leg = square(-2, -2, 2, 2), casing = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (const boundary of [casing, [...casing].reverse()]) {
    const pieces = subtractPreviewHull(leg, boundary);
    assert.ok(pieces.length <= casing.length);
    near(pieces.reduce((sum, piece) => sum + area(piece), 0), area(leg) - area(casing));
    for (let y = -1.95; y < 2; y += .1) for (let x = -1.94; x < 2; x += .1) {
      const count = pieces.filter((piece) => strictlyInside([x, y], piece)).length;
      assert.ok(count <= 1, 'visible fragments overlap');
      if (strictlyInside([x, y], casing)) assert.equal(count, 0, 'a fragment still paints over the casing');
    }
  }
});

test('clipping stays finite and preserves area for oblique casing edges and either leg winding', () => {
  const casing = previewHull([[-1, 0], [0, -1], [2, 0], [1, 2], [-1, 1]]);
  const leg = [[-.7, -.3], [.1, -.5], [2.1, 3.3], [1.3, 3.5]];
  const forward = subtractPreviewHull(leg, casing), reverse = subtractPreviewHull([...leg].reverse(), casing);
  const visible = forward.reduce((sum, piece) => sum + area(piece), 0);
  assert.ok(visible > 0 && visible < area(leg));
  near(visible, reverse.reduce((sum, piece) => sum + area(piece), 0));
  for (const piece of [...forward, ...reverse]) {
    assert.ok(piece.flat().every(Number.isFinite));
    assert.ok(piece.every((point) => !strictlyInside(point, casing)));
  }
  assert.deepEqual(subtractPreviewHull([], casing), []);
  assert.deepEqual(subtractPreviewHull(leg, [[0, 0], [1, 0]]), [leg]);
});
