import test from "node:test";
import assert from "node:assert/strict";
import { ParticleLife } from "../src/physics.js";
import { PRESETS } from "../src/presets.js";

test("seeded worlds are reproducible and different seeds produce new arrangements", () => {
  const a = new ParticleLife(100, PRESETS[0], 42);
  const b = new ParticleLife(100, PRESETS[0], 42);
  const c = new ParticleLife(100, PRESETS[0], 99);
  for (let i = 0; i < 30; i++) {
    a.step();
    b.step();
    c.step();
  }
  assert.deepEqual(a.positions, b.positions);
  assert.notDeepEqual(a.positions, c.positions);
});

test("every world stays finite, bounded, and moving over two simulated minutes", () => {
  for (const preset of PRESETS) {
    const world = new ParticleLife(350, preset, 42);
    for (let frame = 0; frame < 7200; frame++) world.step();
    assert.ok(
      world.positions.every(Number.isFinite),
      `${preset.id}: finite positions`,
    );
    assert.ok(
      world.positions.every((n) => Math.abs(n) < 1200),
      `${preset.id}: contained particles`,
    );
    const velocity =
      world.velocities.reduce((sum, n) => sum + Math.abs(n), 0) /
      world.velocities.length;
    assert.ok(velocity > 0.05, `${preset.id}: still moving (${velocity})`);
  }
});

test("asymmetric species interactions change trajectories", () => {
  const interacting = new ParticleLife(500, PRESETS[0], 42);
  const neutral = new ParticleLife(500, PRESETS[0], 42);
  neutral.matrix.fill(0);
  for (let frame = 0; frame < 120; frame++) {
    interacting.step();
    neutral.step();
  }
  let difference = 0;
  for (let i = 0; i < interacting.positions.length; i++)
    difference += Math.abs(interacting.positions[i] - neutral.positions[i]);
  assert.ok(
    difference > 100,
    "species attraction has a measurable effect beyond the ambient current",
  );
});

test("pointer attraction and repulsion, resize, and fast steps stay stable", () => {
  const world = new ParticleLife(600, PRESETS[0], 42);
  const initial = world.positions.slice();
  world.resize(0.46);
  for (let i = 0; i < 1000; i++)
    world.step(1 / 30, { active: true, repel: i > 500, x: 200, y: 50 });
  assert.ok(world.positions.every(Number.isFinite));
  assert.ok(world.velocities.every((n) => Math.abs(n) <= 5.01));
  assert.notDeepEqual(world.positions, initial);
});
