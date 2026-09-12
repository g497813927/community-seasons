import test from 'node:test';
import assert from 'node:assert/strict';
import './compile.mjs';
const { createRun, RAIL_RETURN_DURATION } = await import('./compiled/engine.mjs');
const { createRailRide } = await import('./compiled/railway.mjs');
const { railTravelFrame } = await import('./compiled/rail-transition.mjs');

test('rail boarding fades in before the gate and fully covers the geometry swap', () => {
  const s=Object.assign(createRun(),{time:70,speed:20,nextRailAt:1000,railPreparedAt:1000,distance:980});
  assert.equal(railTravelFrame(s),null);
  s.distance=990;
  assert.equal(railTravelFrame(s).direction,'boarding');
  assert.ok(Math.abs(railTravelFrame(s).opacity-.5)<1e-9);
  s.distance=1000;
  assert.equal(railTravelFrame(s).opacity,1);
  s.rail=createRailRide(()=>.4);
  assert.equal(railTravelFrame(s).opacity,1);
  s.rail.remaining=s.rail.duration-.4;
  assert.equal(railTravelFrame(s).opacity,1,'hold the destination preview briefly after boarding');
  s.rail.remaining=s.rail.duration-1.85;
  assert.equal(railTravelFrame(s),null,'overlay must clear before the first question starts');
  s.rail.phase='question';
  assert.equal(railTravelFrame(s),null);
});

test('successful rail exit is covered continuously and reveals the path during protected return', () => {
  const s=createRun();
  s.rail=createRailRide(()=>.4);
  s.rail.phase='complete';s.rail.duration=2;s.rail.remaining=1;
  assert.equal(railTravelFrame(s),null,'leave time to read the success message');
  s.rail.remaining=.5;
  assert.ok(Math.abs(railTravelFrame(s).opacity-.5)<1e-9);
  s.rail.remaining=0;
  assert.equal(railTravelFrame(s).opacity,1);
  s.rail=null;s.railReturnRemaining=RAIL_RETURN_DURATION;
  assert.equal(railTravelFrame(s).opacity,1);
  s.railReturnRemaining=RAIL_RETURN_DURATION-.2;
  assert.equal(railTravelFrame(s).opacity,1,'hold the returning destination before revealing the road');
  s.railReturnRemaining=(RAIL_RETURN_DURATION-.3)/2;
  assert.ok(Math.abs(railTravelFrame(s).opacity-.5)<1e-9);
  s.railReturnRemaining=0;
  assert.equal(railTravelFrame(s),null);
});

test('ordinary runs, unprepared stations and wrong-answer falls have no mode-change overlay', () => {
  const s=Object.assign(createRun(),{time:70,speed:20,nextRailAt:1000,distance:999});
  assert.equal(railTravelFrame(s),null);
  s.railPreparedAt=1000;s.time=10;
  assert.equal(railTravelFrame(s),null);
  s.rail=createRailRide(()=>.4);s.rail.phase='falling';
  assert.equal(railTravelFrame(s),null,'keep the broken track and incorrect-answer feedback visible');
});
