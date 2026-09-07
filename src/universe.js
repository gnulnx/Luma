import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Pass, FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { PALETTES, makeRandom } from "./presets.js";

class LightTrails extends Pass {
  constructor() {
    super();
    this.history = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
    });
    this.combined = this.history.clone();
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        current: { value: null },
        history: { value: null },
        retention: { value: 0.9 },
        historyScale: { value: new THREE.Vector2(1, 1) },
        historyOffset: { value: new THREE.Vector2() },
      },
      vertexShader:
        "varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }",
      fragmentShader: `
        uniform sampler2D current;
        uniform sampler2D history;
        uniform float retention;
        uniform vec2 historyScale;
        uniform vec2 historyOffset;
        varying vec2 vUv;
        void main() {
          vec3 now = texture2D(current, vUv).rgb;
          vec2 oldUv = vUv * historyScale + (1.0 - historyScale) * 0.5 + historyOffset;
          vec3 past = vec3(0.0);
          if (all(greaterThanEqual(oldUv, vec2(0.0))) && all(lessThanEqual(oldUv, vec2(1.0)))) {
            past = texture2D(history, oldUv).rgb * retention;
          }
          gl_FragColor = vec4(max(now, past - 0.004 * (1.0 - retention)), 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.copy = new THREE.ShaderMaterial({
      uniforms: { map: { value: null } },
      vertexShader: this.material.vertexShader,
      fragmentShader:
        "uniform sampler2D map; varying vec2 vUv; void main(){ gl_FragColor=texture2D(map,vUv); }",
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }
  render(renderer, writeBuffer, readBuffer) {
    this.material.uniforms.current.value = readBuffer.texture;
    this.material.uniforms.history.value = this.history.texture;
    this.quad.material = this.material;
    renderer.setRenderTarget(this.combined);
    this.quad.render(renderer);
    this.copy.uniforms.map.value = this.combined.texture;
    this.quad.material = this.copy;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
    [this.history, this.combined] = [this.combined, this.history];
  }
  setSize(width, height) {
    this.history.setSize(width, height);
    this.combined.setSize(width, height);
  }
  resetHistory(renderer) {
    const target = renderer.getRenderTarget();
    renderer.setRenderTarget(this.history);
    renderer.clear();
    renderer.setRenderTarget(this.combined);
    renderer.clear();
    renderer.setRenderTarget(target);
  }
  dispose() {
    this.history.dispose();
    this.combined.dispose();
    this.material.dispose();
    this.copy.dispose();
    this.quad.dispose();
  }
}

const vertexShader = `
  attribute vec3 color;
  attribute float seed;
  uniform float time;
  uniform float pointScale;
  uniform float size;
  uniform float reveal;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p=position;
    p.z += sin(time*0.16 + seed*60.0)*8.0;
    vec4 mvPosition=modelViewMatrix*vec4(p,1.0);
    gl_Position=projectionMatrix*mvPosition;
    float bright=pow(seed,12.0);
    gl_PointSize=clamp((4.0+seed*3.5+bright*6.0)*pointScale*size,2.0,96.0);
    vColor=color*(0.78+bright*1.5);
    vAlpha=(0.65+0.35*sin(time*0.6+seed*100.0))*reveal;
  }
`;
const fragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 uv=gl_PointCoord-0.5;
    float r=length(uv)*2.0;
    if(r>1.0) discard;
    float halo=exp(-r*r*6.0)*0.12;
    float core=exp(-r*r*65.0)*1.3;
    float ray=pow(max(0.0,1.0-abs(uv.x)*70.0),2.0)*exp(-abs(uv.y)*14.0)*0.10;
    gl_FragColor=vec4(vColor*(core+halo+ray)*vAlpha,1.0);
  }
`;

export class Universe {
  constructor(canvas, onStats, onError) {
    this.canvas = canvas;
    this.onStats = onStats;
    this.onError = onError;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x030609, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-960, 960, 540, -540, 0.1, 3000);
    this.camera.position.z = 1000;
    this.historyView = new THREE.Vector4(0, 0, 960, 540);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.trails = new LightTrails();
    this.composer.addPass(this.trails);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.5, 0.23);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.pointer = { active: false, x: 0, y: 0, repel: false };
    this.settings = { speed: 1, glow: 0.7, trails: 0.65, size: 1 };
    this.paused = false;
    this.pending = false;
    this.loadId = 0;
    this.lastFrame = performance.now();
    this.lastStep = this.lastFrame;
    this.lastStats = this.lastFrame;
    this.frames = 0;
    this.simulationMs = 0;
    this.elapsed = 0;
    this.reveal = 0;
    this.renderBudget = 3200000;
    this.renderScale = 1;
    this.makeStars();
    this.resize();
    this.canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.paused = true;
      this.onError(
        "The graphics connection was interrupted. Try reloading to bring your universe back.",
      );
    });
    this.animate = this.animate.bind(this);
    this.animation = requestAnimationFrame(this.animate);
  }

  makeStars() {
    const random = makeRandom(9582);
    const positions = new Float32Array(800 * 3);
    const colors = new Float32Array(800 * 3);
    const seeds = new Float32Array(800);
    for (let i = 0; i < 800; i++) {
      positions.set(
        [
          (random() - 0.5) * 2700,
          (random() - 0.5) * 1750,
          -180 - random() * 100,
        ],
        i * 3,
      );
      colors.set(
        [
          0.045 + random() * 0.09,
          0.085 + random() * 0.13,
          0.16 + random() * 0.14,
        ],
        i * 3,
      );
      seeds[i] = random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
    this.starMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        pointScale: { value: 1 },
        size: { value: 0.6 },
        reveal: { value: 1 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.stars = new THREE.Points(geometry, this.starMaterial);
    this.scene.add(this.stars);
  }

  async load(preset, count, seed) {
    const previousWorker = this.worker;
    if (previousWorker) {
      previousWorker.onmessage = null;
      previousWorker.onerror = null;
      previousWorker.terminate();
    }
    const loadId = ++this.loadId;
    if (this.points) {
      this.scene.remove(this.points);
      this.points.geometry.dispose();
      this.material.dispose();
    }
    this.preset = preset;
    this.count = count;
    this.target = null;
    this.reveal = 0;
    this.pending = true;
    this.trails.resetHistory(this.renderer);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const random = makeRandom(seed);
    for (let i = 0; i < count; i++) {
      seeds[i] = random();
      positions[i * 3 + 2] = (random() - 0.5) * 80;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        pointScale: { value: this.pointScale * this.camera.zoom },
        size: { value: this.settings.size },
        reveal: { value: 0 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.setPalette(this.paletteOverride || preset.palette);
    this.worker = new Worker(
      new URL("./simulation.worker.js", import.meta.url),
      { type: "module" },
    );
    return new Promise((resolve, reject) => {
      const startupTimer = setTimeout(
        () =>
          reject(
            new Error(
              "The particle simulation took too long to start. Please reload.",
            ),
          ),
        15000,
      );
      this.worker.onerror = (event) => {
        clearTimeout(startupTimer);
        this.onError(
          "The particle simulation encountered a problem. Reload to start a fresh universe.",
        );
        reject(new Error(event.message));
      };
      this.worker.onmessage = ({ data }) => {
        if (loadId !== this.loadId) return;
        this.pending = false;
        this.recycleBuffer = this.target?.buffer;
        this.target = data.positions;
        if (data.type === "ready") {
          clearTimeout(startupTimer);
          for (let i = 0; i < count; i++) {
            positions[i * 3] = data.positions[i * 2];
            positions[i * 3 + 1] = data.positions[i * 2 + 1];
          }
          geometry.attributes.position.needsUpdate = true;
          this.lastStep = performance.now();
          resolve();
        } else {
          this.simulationMs = this.simulationMs * 0.9 + data.elapsed * 0.1;
        }
      };
      this.worker.postMessage({
        type: "init",
        count,
        preset,
        seed,
        aspect: innerWidth / innerHeight,
      });
    });
  }

  setPalette(id) {
    this.palette = PALETTES[id] || PALETTES.cosmic;
    if (!this.points) return;
    const colors = this.points.geometry.attributes.color.array;
    const palette = this.palette.map((hex) => new THREE.Color(hex));
    for (let i = 0; i < this.count; i++)
      palette[i % palette.length].toArray(colors, i * 3);
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  configure(settings) {
    Object.assign(this.settings, settings);
    this.bloom.strength = this.settings.glow * 1.1;
    if (this.material) this.material.uniforms.size.value = this.settings.size;
  }

  resize() {
    const width = innerWidth,
      height = innerHeight,
      aspect = width / height;
    this.pixelRatio =
      Math.min(
        devicePixelRatio,
        1.5,
        Math.sqrt(this.renderBudget / (width * height)),
      ) * this.renderScale;
    const halfHeight = 540 * Math.max(1, 1.05 / aspect);
    this.camera.left = -halfHeight * aspect;
    this.camera.right = halfHeight * aspect;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(width, height);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(width, height);
    this.pointScale =
      Math.max(0.6, height / (halfHeight * 2)) * this.pixelRatio;
    this.setZoom(this.camera.zoom);
    this.trails.resetHistory(this.renderer);
    this.worker?.postMessage({ type: "resize", aspect });
  }

  screenToWorld(clientX, clientY) {
    return {
      x:
        this.camera.position.x +
        (((clientX / innerWidth) * 2 - 1) * this.camera.right) /
          this.camera.zoom,
      y:
        this.camera.position.y +
        ((1 - (clientY / innerHeight) * 2) * this.camera.top) /
          this.camera.zoom,
    };
  }

  setZoom(value, anchor = null, destination = anchor) {
    const zoom = THREE.MathUtils.clamp(
      Number.isFinite(value) ? value : 1,
      0.5,
      6,
    );
    const world = anchor ? this.screenToWorld(anchor.x, anchor.y) : null;
    this.camera.zoom = zoom;
    if (world) {
      this.camera.position.x =
        world.x -
        (((destination.x / innerWidth) * 2 - 1) * this.camera.right) / zoom;
      this.camera.position.y =
        world.y -
        ((1 - (destination.y / innerHeight) * 2) * this.camera.top) / zoom;
    }
    // Keep the view inside the original scene; zooming out brings it home.
    const margin = Math.max(0, 1 - 1 / zoom);
    this.camera.position.x = THREE.MathUtils.clamp(
      this.camera.position.x,
      -this.camera.right * margin,
      this.camera.right * margin,
    );
    this.camera.position.y = THREE.MathUtils.clamp(
      this.camera.position.y,
      -this.camera.top * margin,
      this.camera.top * margin,
    );
    this.camera.updateProjectionMatrix();
    if (this.material)
      this.material.uniforms.pointScale.value = this.pointScale * zoom;
    this.starMaterial.uniforms.pointScale.value = this.pointScale * zoom;
    this.pointer.active = false;
    return zoom;
  }

  setPointer(event, active) {
    Object.assign(
      this.pointer,
      this.screenToWorld(event.clientX, event.clientY),
    );
    this.pointer.active = active;
    this.pointer.repel = event.shiftKey || event.buttons === 2;
  }

  animate(now) {
    this.animation = requestAnimationFrame(this.animate);
    const dt = Math.min((now - this.lastFrame) / 1000, 0.06);
    this.lastFrame = now;
    if (document.hidden) {
      this.lastStep = now;
      return;
    }
    if (this.paused) this.lastStep = now;
    if (!this.paused) this.elapsed += dt * this.settings.speed;
    this.reveal = Math.min(1, this.reveal + dt * 0.6);
    if (this.target && !this.paused) {
      const positions = this.points.geometry.attributes.position.array;
      const blend = 1 - Math.exp(-dt * 28);
      for (let i = 0; i < this.count; i++) {
        const k = i * 3,
          j = i * 2;
        if (Math.abs(this.target[j] - positions[k]) > 500)
          positions[k] = this.target[j];
        positions[k] += (this.target[j] - positions[k]) * blend;
        positions[k + 1] += (this.target[j + 1] - positions[k + 1]) * blend;
      }
      this.points.geometry.attributes.position.needsUpdate = true;
      // Physics runs at 20 Hz and the renderer interpolates between frames.
      // This keeps a 12k-particle world visually fluid without monopolizing a CPU core.
      if (!this.pending && now - this.lastStep >= 1000 / 20) {
        this.pending = true;
        const simulationDt =
          Math.min((now - this.lastStep) / 1000, 1 / 15) * this.settings.speed;
        this.lastStep = now;
        const buffer = this.recycleBuffer;
        this.recycleBuffer = null;
        this.worker.postMessage(
          {
            type: "step",
            steps: 1,
            dt: simulationDt,
            pointer: this.pointer,
            buffer,
          },
          buffer ? [buffer] : [],
        );
      }
    }
    if (this.material) {
      this.material.uniforms.time.value = this.elapsed;
      this.material.uniforms.reveal.value = this.reveal;
    }
    this.starMaterial.uniforms.time.value = this.elapsed;
    this.stars.rotation.z = Math.sin(this.elapsed * 0.009) * 0.035;
    // Time-based trail decay keeps the same look on 30, 60, and 120 Hz displays.
    const retention =
      this.settings.trails === 0
        ? 0
        : Math.exp(-dt / (0.035 + this.settings.trails * 0.42));
    this.trails.material.uniforms.retention.value = this.paused ? 1 : retention;
    // Reproject existing trails into the new view instead of leaving ghost
    // clumps at their old screen positions when the camera zooms or pans.
    const halfWidth = this.camera.right / this.camera.zoom;
    const halfHeight = this.camera.top / this.camera.zoom;
    this.trails.material.uniforms.historyScale.value.set(
      halfWidth / this.historyView.z,
      halfHeight / this.historyView.w,
    );
    this.trails.material.uniforms.historyOffset.value.set(
      (this.camera.position.x - this.historyView.x) / (2 * this.historyView.z),
      (this.camera.position.y - this.historyView.y) / (2 * this.historyView.w),
    );
    this.historyView.set(
      this.camera.position.x,
      this.camera.position.y,
      halfWidth,
      halfHeight,
    );
    this.composer.render(dt);
    this.frames++;
    if (now - this.lastStats > 2000) {
      this.onStats({
        fps: Math.round((this.frames * 1000) / (now - this.lastStats)),
        simulationMs: Math.round(this.simulationMs),
        count: this.count,
      });
      this.frames = 0;
      this.lastStats = now;
    }
  }

  dispose() {
    cancelAnimationFrame(this.animation);
    this.loadId++;
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
    }
    this.scene.traverse((object) => {
      object.geometry?.dispose();
      object.material?.dispose();
    });
    this.trails.dispose();
    this.bloom.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
