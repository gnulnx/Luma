import { makeRandom } from "./presets.js";

const TAU = Math.PI * 2;
const TYPES = 6;

// Local asymmetric attraction creates chasing, clustering, and species separation.
// A spatial hash bounds the neighbor search; softly moving currents compose the scene.
export class ParticleLife {
  constructor(count, preset, seed = 42, aspect = 1.7) {
    this.count = count;
    this.preset = preset;
    this.random = makeRandom(seed);
    this.time = 0;
    this.positions = new Float32Array(count * 2);
    this.velocities = new Float32Array(count * 2);
    this.species = new Uint8Array(count);
    this.groups = new Uint8Array(count);
    this.next = new Int32Array(count);
    this.matrix = new Float32Array(TYPES * TYPES);
    this.centers = new Float32Array(preset.centers * 2);
    this.resize(aspect);
    for (let a = 0; a < TYPES; a++) {
      for (let b = 0; b < TYPES; b++) {
        const delta = (b - a + TYPES) % TYPES;
        this.matrix[a * TYPES + b] =
          a === b
            ? 0.32
            : delta === 1
              ? 0.8
              : delta === 5
                ? -0.6
                : -0.18 + this.random() * 0.28;
      }
    }
    this.updateCenters();
    this.seed();
  }

  resize(aspect) {
    this.aspect = Math.max(0.4, Math.min(3.5, aspect));
    this.halfWidth = 540 * Math.max(1, this.aspect);
    this.halfHeight = 540 * Math.max(1, 1 / this.aspect);
    this.cellSize = this.preset.radius;
    this.cols = Math.ceil((this.halfWidth * 2) / this.cellSize) + 2;
    this.rows = Math.ceil((this.halfHeight * 2) / this.cellSize) + 2;
    this.heads = new Int32Array(this.cols * this.rows);
  }

  updateCenters() {
    const n = this.preset.centers;
    for (let g = 0; g < n; g++) {
      const angle = (g / n) * TAU + this.time * 0.022;
      if (n === 1) {
        this.centers[0] = 0;
        this.centers[1] = 20;
      } else if (n === 2) {
        this.centers[g * 2] =
          (g === 0 ? -1 : 1) * 255 + Math.sin(this.time * 0.04 + g * 2) * 45;
        this.centers[g * 2 + 1] =
          (g === 0 ? 65 : -65) + Math.sin(this.time * 0.055 + g * 3) * 45;
      } else {
        this.centers[g * 2] = Math.cos(angle) * (n === 3 ? 315 : 430);
        this.centers[g * 2 + 1] = Math.sin(angle) * (n === 3 ? 130 : 230);
      }
    }
  }

  seed() {
    const { shape, centers } = this.preset;
    for (let i = 0; i < this.count; i++) {
      const type = i % TYPES;
      const group = Math.floor(i / TYPES) % centers;
      this.species[i] = type;
      this.groups[i] = group;
      const k = i * 2;
      const u = this.random();
      let x, y;
      if (shape === "ribbon") {
        x = (this.random() - 0.5) * 1400;
        y =
          Math.sin(x * 0.006 + group * 1.9) * 160 +
          (type - 2.5) * 13 +
          (this.random() - 0.5) * 50;
      } else if (shape === "flower") {
        const radius = 105 + Math.pow(u, 0.65) * 355;
        const angle =
          (type / TYPES) * TAU + radius * 0.006 + (this.random() - 0.5) * 0.5;
        x = Math.cos(angle) * radius * 1.4;
        y = Math.sin(angle) * radius * 0.85;
      } else {
        const radius =
          28 +
          Math.sqrt(u) * (shape === "shoal" ? 120 : centers === 2 ? 310 : 225);
        const angle =
          (type / TYPES) * TAU +
          radius * 0.014 +
          (this.random() - 0.5) * (shape === "shoal" ? 2.5 : 0.65);
        x = this.centers[group * 2] + Math.cos(angle) * radius * 1.14;
        y = this.centers[group * 2 + 1] + Math.sin(angle) * radius * 0.86;
      }
      // A sparse halo gives the dense swarms room to breathe.
      if (this.random() < 0.09) {
        x *= 1.35;
        y *= 1.35;
      }
      this.positions[k] = x;
      this.positions[k + 1] = y;
      this.velocities[k] = -y * 0.002;
      this.velocities[k + 1] = x * 0.002;
    }
  }

  step(dt = 1 / 60, pointer = null) {
    const step = Math.min(dt * 60, 4);
    this.time += dt;
    this.updateCenters();
    const {
      positions: p,
      velocities: v,
      species,
      groups,
      next,
      heads,
      cols,
      rows,
      matrix,
      preset,
    } = this;
    const radius = preset.radius;
    const radius2 = radius * radius;
    const invRadius = 1 / radius;
    const invCell = 1 / this.cellSize;
    heads.fill(-1);
    for (let i = 0; i < this.count; i++) {
      const cx = Math.max(
        0,
        Math.min(cols - 1, Math.floor((p[i * 2] + this.halfWidth) * invCell)),
      );
      const cy = Math.max(
        0,
        Math.min(
          rows - 1,
          Math.floor((p[i * 2 + 1] + this.halfHeight) * invCell),
        ),
      );
      const cell = cy * cols + cx;
      next[i] = heads[cell];
      heads[cell] = i;
    }
    const damping = Math.pow(preset.damping, step);
    for (let i = 0; i < this.count; i++) {
      const k = i * 2,
        x = p[k],
        y = p[k + 1],
        type = species[i];
      const cx = Math.max(
        0,
        Math.min(cols - 1, Math.floor((x + this.halfWidth) * invCell)),
      );
      const cy = Math.max(
        0,
        Math.min(rows - 1, Math.floor((y + this.halfHeight) * invCell)),
      );
      let fx = 0,
        fy = 0,
        neighbors = 0;
      for (
        let gy = Math.max(0, cy - 1);
        gy <= Math.min(rows - 1, cy + 1);
        gy++
      ) {
        for (
          let gx = Math.max(0, cx - 1);
          gx <= Math.min(cols - 1, cx + 1);
          gx++
        ) {
          let j = heads[gy * cols + gx];
          while (j !== -1) {
            if (j !== i) {
              const dx = p[j * 2] - x,
                dy = p[j * 2 + 1] - y;
              const d2 = dx * dx + dy * dy;
              if (d2 < radius2 && d2 > 0.0001) {
                const d = Math.sqrt(d2),
                  r = d * invRadius;
                const force =
                  r < 0.18
                    ? (r / 0.18 - 1) * 3.4
                    : matrix[type * TYPES + species[j]] *
                      (1 - Math.abs(2 * r - 1.18) / 0.82) *
                      preset.attraction;
                fx += (dx / d) * force;
                fy += (dy / d) * force;
                neighbors++;
              }
            }
            j = next[j];
          }
        }
      }
      const normalize = 0.12 / Math.sqrt(Math.max(1, neighbors * 0.2));
      fx *= normalize;
      fy *= normalize;
      const center = groups[i] * 2;
      const dx = x - this.centers[center],
        dy = y - this.centers[center + 1];
      const distance = Math.sqrt(dx * dx + dy * dy) + 1;
      const t = this.time;
      if (preset.shape === "ribbon") {
        const targetY =
          Math.sin(x * 0.006 + groups[i] * 1.9 + t * 0.17) * 160 +
          (type - 2.5) * 13;
        fx += (1.35 + Math.sin(y * 0.01 + t * 0.15) * 0.5) * 0.065;
        fy += (targetY - y) * 0.0009;
        if (x > 1040) p[k] = -1040;
      } else {
        const spin = preset.shape === "shoal" && groups[i] % 2 ? -1 : 1;
        const desired =
          preset.shape === "flower"
            ? 180 + type * 40
            : preset.shape === "shoal"
              ? 75 + type * 9
              : 125 + type * 24;
        const radial = (desired - distance) * 0.00023;
        fx +=
          (-dy / distance) * preset.curl * spin * 0.075 +
          (dx / distance) * radial;
        fy +=
          (dx / distance) * preset.curl * spin * 0.075 +
          (dy / distance) * radial;
      }
      fx += Math.sin(y * 0.008 + t * 0.21 + type * 0.6) * preset.flow * 0.045;
      fy += Math.cos(x * 0.007 - t * 0.17 + type * 0.5) * preset.flow * 0.045;
      // Small permanent agitation prevents long-running scenes from freezing.
      fx += Math.sin(i * 1.713 + t * 0.7) * 0.007;
      fy += Math.cos(i * 1.317 + t * 0.8) * 0.007;
      if (preset.shape !== "ribbon" && Math.abs(x) > 880)
        fx -= Math.sign(x) * (Math.abs(x) - 880) * 0.001;
      if (Math.abs(y) > 465) fy -= Math.sign(y) * (Math.abs(y) - 465) * 0.001;
      if (pointer?.active) {
        const px = pointer.x - x,
          py = pointer.y - y,
          pd2 = px * px + py * py;
        if (pd2 < 220 * 220 && pd2 > 4) {
          const d = Math.sqrt(pd2),
            f = (1 - d / 220) * (pointer.repel ? -0.6 : 0.27);
          fx += (px / d) * f - (py / d) * f * 0.45;
          fy += (py / d) * f + (px / d) * f * 0.45;
        }
      }
      v[k] = (v[k] + fx * step) * damping;
      v[k + 1] = (v[k + 1] + fy * step) * damping;
      const speed2 = v[k] * v[k] + v[k + 1] * v[k + 1];
      if (speed2 > 25) {
        const limit = 5 / Math.sqrt(speed2);
        v[k] *= limit;
        v[k + 1] *= limit;
      }
    }
    // All forces use the same state, so results do not depend on update order.
    for (let k = 0; k < p.length; k++) p[k] += v[k] * step;
    return p;
  }
}
