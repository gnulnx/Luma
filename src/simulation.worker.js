import { ParticleLife } from "./physics.js";
let simulation;

self.onmessage = ({ data }) => {
  if (data.type === "init") {
    simulation = new ParticleLife(
      data.count,
      data.preset,
      data.seed,
      data.aspect,
    );
    const positions = simulation.positions.slice();
    self.postMessage(
      { type: "ready", positions, species: simulation.species },
      [positions.buffer],
    );
  } else if (data.type === "step" && simulation) {
    const start = performance.now();
    for (let n = 0; n < data.steps; n++) simulation.step(data.dt, data.pointer);
    const positions = data.buffer
      ? new Float32Array(data.buffer)
      : new Float32Array(simulation.positions.length);
    positions.set(simulation.positions);
    self.postMessage(
      {
        type: "frame",
        positions,
        time: simulation.time,
        elapsed: performance.now() - start,
      },
      [positions.buffer],
    );
  } else if (data.type === "resize" && simulation) {
    simulation.resize(data.aspect);
  }
};
