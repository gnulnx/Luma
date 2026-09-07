import test from "node:test";
import assert from "node:assert/strict";
import { OrthographicCamera } from "three";
import { Universe } from "../src/universe.js";

function makeView() {
  globalThis.innerWidth = 1920;
  globalThis.innerHeight = 1080;
  const view = Object.create(Universe.prototype);
  view.camera = new OrthographicCamera(-960, 960, 540, -540, 0.1, 3000);
  view.pointer = { active: true };
  view.pointScale = 1.5;
  view.material = { uniforms: { pointScale: { value: 1.5 } } };
  view.starMaterial = { uniforms: { pointScale: { value: 1.5 } } };
  return view;
}

test("zoom keeps the pointed clump anchored and scales particle sprites", () => {
  const view = makeView();
  const anchor = { x: 1400, y: 340 };
  const before = view.screenToWorld(anchor.x, anchor.y);
  view.setZoom(3, anchor);
  const after = view.screenToWorld(anchor.x, anchor.y);
  assert.ok(Math.abs(before.x - after.x) < 1e-8);
  assert.ok(Math.abs(before.y - after.y) < 1e-8);
  assert.equal(view.material.uniforms.pointScale.value, 4.5);
  assert.equal(view.starMaterial.uniforms.pointScale.value, 4.5);
  view.setPointer(
    { clientX: anchor.x, clientY: anchor.y, buttons: 1, shiftKey: false },
    true,
  );
  assert.ok(Math.abs(view.pointer.x - before.x) < 1e-8);
  assert.ok(Math.abs(view.pointer.y - before.y) < 1e-8);
});

test("pinch translation follows the fingers and reset returns to the whole scene", () => {
  const view = makeView();
  view.setZoom(2);
  const from = { x: 1000, y: 500 },
    to = { x: 1100, y: 450 };
  const world = view.screenToWorld(from.x, from.y);
  view.setZoom(3, from, to);
  const moved = view.screenToWorld(to.x, to.y);
  assert.ok(Math.abs(world.x - moved.x) < 1e-8);
  assert.ok(Math.abs(world.y - moved.y) < 1e-8);
  view.setZoom(1);
  assert.equal(Math.abs(view.camera.position.x), 0);
  assert.equal(Math.abs(view.camera.position.y), 0);
  assert.equal(view.camera.zoom, 1);
  assert.equal(view.pointer.active, false);
});

test("zoom is bounded and invalid values cannot corrupt the camera", () => {
  const view = makeView();
  assert.equal(view.setZoom(100), 6);
  assert.equal(view.setZoom(0), 0.5);
  assert.equal(view.setZoom(NaN), 1);
  assert.equal(view.setZoom(Infinity), 1);
  assert.ok(view.camera.projectionMatrix.elements.every(Number.isFinite));
});
