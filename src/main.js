import "./style.css";
import { PRESETS, PALETTES } from "./presets.js";
import { Universe } from "./universe.js";

const $ = (id) => document.getElementById(id);
const paths = {
  sliders:
    '<path d="M4 7h5m4 0h7M4 17h9m4 0h3"/><circle cx="11" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',
  chevron: '<path d="m7 10 5 5 5-5"/>',
  shuffle:
    '<path d="m17 3 4 4-4 4M3 17c7 0 6-10 14-10h4M3 7c3 0 4 2 5 4m4 3c1 2 3 3 5 3h4m-4-4 4 4-4 4"/>',
  pause: '<path d="M9 5v14M15 5v14" stroke-width="2.5"/>',
  play: '<path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  contract: '<path d="M3 8h5V3m13 5h-5V3M3 16h5v5m13-5h-5v5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  pointer: '<path d="m5 3 14 9-7 1-3 7Z"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
document.querySelectorAll("[data-icon]").forEach((node) => {
  node.innerHTML = icon(node.dataset.icon);
});

const STORAGE_KEY = "luma-preferences-v1";
let saved = {};
try {
  saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
} catch {
  /* Storage is optional. */
}
let presetIndex = Math.max(
  0,
  PRESETS.findIndex((preset) => preset.id === saved.preset),
);
let settingsOpen = false;
let hideTimer, toastTimer, tourTimer, wakeLock;
let loadingWorld = false;
let slowSamples = 0;
let adaptiveReduced = false;
const settings = { speed: 1, glow: 0.7, trails: 0.65, size: 1 };
let viewZoom = Number.isFinite(saved.zoom)
  ? Math.min(6, Math.max(0.5, saved.zoom))
  : 1;
const touches = new Map();
let pinch = null;
let pinching = false;
const qualityValues = ["auto", "low", "high", "ultra"];
$("quality").value = qualityValues.includes(saved.quality)
  ? saved.quality
  : "auto";
$("auto-hide").checked = saved.autoHide !== false;
$("tour").checked = saved.tour === true;
$("preset").innerHTML = PRESETS.map(
  (preset) => `<option value="${preset.id}">${preset.name}</option>`,
).join("");
let universe;

function save() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        preset: PRESETS[presetIndex].id,
        quality: $("quality").value,
        autoHide: $("auto-hide").checked,
        tour: $("tour").checked,
        mood: $("mood").value,
        settings,
        zoom: viewZoom,
      }),
    );
  } catch {
    /* Private browsing can disable persistence. */
  }
}

function showError(message) {
  $("loading").hidden = true;
  $("error-message").textContent = message;
  $("error").hidden = false;
}

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 3200);
}

function showControls() {
  document.body.classList.remove("quiet");
  clearTimeout(hideTimer);
  if ($("auto-hide").checked && !settingsOpen && !universe?.paused)
    hideTimer = setTimeout(hideControls, 6500);
}

function hideControls() {
  if (settingsOpen) return;
  if (document.activeElement instanceof HTMLElement)
    document.activeElement.blur();
  document.body.classList.add("quiet");
}

function updateRanges() {
  for (const name of ["speed", "glow", "trails", "size"]) {
    const input = $(name);
    input.value = settings[name];
    input.setAttribute(
      "aria-label",
      {
        speed: "Energy",
        glow: "Glow",
        trails: "Light trails",
        size: "Particle size",
      }[name],
    );
    input.style.setProperty(
      "--fill",
      `${((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100}%`,
    );
    $(`${name}-value`).textContent =
      name === "speed" || name === "size"
        ? `${Number(input.value).toFixed(1)}×`
        : `${Math.round(Number(input.value) * 100)}%`;
  }
}

function updateZoomControl() {
  $("zoom").value = viewZoom;
  $("zoom").style.setProperty("--fill", `${((viewZoom - 0.5) / 5.5) * 100}%`);
  $("zoom-value").textContent = `${viewZoom.toFixed(1)}×`;
}

function changeZoom(value, anchor = null, destination = anchor) {
  viewZoom = universe.setZoom(value, anchor, destination);
  updateZoomControl();
  save();
  showControls();
}

function resetView() {
  changeZoom(1);
  toast("Back to the whole universe.");
}

function pinchState() {
  const [a, b] = [...touches.values()];
  return {
    distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function getCount() {
  const quality = $("quality").value;
  if (quality === "low") return 5000;
  if (quality === "ultra") return 20000;
  if (quality === "high") return 12000;
  return adaptiveReduced ||
    innerWidth < 700 ||
    navigator.hardwareConcurrency < 6
    ? 5000
    : 12000;
}

function updatePalette() {
  const value = $("mood").value;
  universe.paletteOverride = value === "original" ? null : value;
  const palette = value === "original" ? PRESETS[presetIndex].palette : value;
  universe.setPalette(palette);
  $("palette-dots").innerHTML = PALETTES[palette]
    .map((color) => `<span style="background:${color};color:${color}"></span>`)
    .join("");
  document.querySelector(".preset-orb").style.background =
    `radial-gradient(circle at 25% 25%,${PALETTES[palette][5]},${PALETTES[palette][2]} 35%,${PALETTES[palette][0]} 75%,#13232a)`;
}

async function loadWorld(index, { keepSettings = true, first = false } = {}) {
  if (loadingWorld) return;
  loadingWorld = true;
  $("preset").disabled = true;
  $("shuffle").disabled = true;
  $("quality").disabled = true;
  presetIndex = (index + PRESETS.length) % PRESETS.length;
  const preset = PRESETS[presetIndex];
  if (!keepSettings || (first && !saved.settings)) {
    for (const key of Object.keys(settings)) settings[key] = preset[key];
    $("mood").value = "original";
  }
  if (first && saved.settings && typeof saved.settings === "object") {
    for (const key of Object.keys(settings)) {
      const n = Number(saved.settings[key]);
      if (Number.isFinite(n))
        settings[key] = Math.min(
          Number($(key).max),
          Math.max(Number($(key).min), n),
        );
    }
    if ([...$("mood").options].some((option) => option.value === saved.mood))
      $("mood").value = saved.mood;
  }
  $("preset").value = preset.id;
  $("scene-number").textContent = String(presetIndex + 1).padStart(2, "0");
  $("scene-title").textContent = preset.name;
  $("scene-description").textContent = preset.description;
  const count = getCount();
  universe.renderBudget = {
    auto: 3200000,
    low: 1800000,
    high: 6000000,
    ultra: 9000000,
  }[$("quality").value];
  universe.renderScale =
    $("quality").value === "auto" && adaptiveReduced ? 0.85 : 1;
  universe.resize();
  universe.setZoom(viewZoom);
  updateZoomControl();
  $("particle-count").textContent = count.toLocaleString();
  updateRanges();
  updatePalette();
  universe.configure(settings);
  try {
    await universe.load(
      preset,
      count,
      crypto.getRandomValues(new Uint32Array(1))[0],
    );
    $("loading").classList.add("loaded");
    setTimeout(() => {
      $("loading").hidden = true;
    }, 1400);
    save();
    scheduleTour();
  } catch (error) {
    showError(error.message);
  } finally {
    loadingWorld = false;
    $("preset").disabled = false;
    $("shuffle").disabled = false;
    $("quality").disabled = false;
  }
}

function openSettings(open) {
  settingsOpen = open;
  $("settings-panel").hidden = !open;
  $("panel-backdrop").hidden = !open;
  $("settings-open").setAttribute("aria-expanded", String(open));
  showControls();
  if (open) {
    universe.pointer.active = false;
    touches.clear();
    pinch = null;
    pinching = false;
    $("settings-close").focus();
  } else $("settings-open").focus({ preventScroll: true });
}

function togglePause() {
  universe.paused = !universe.paused;
  $("pause").innerHTML = icon(universe.paused ? "play" : "pause");
  $("pause").setAttribute(
    "aria-label",
    universe.paused ? "Resume simulation" : "Pause simulation",
  );
  $("pause").title = `${universe.paused ? "Resume" : "Pause"} · Space`;
  $("live-label").textContent = universe.paused
    ? "A MOMENT, HELD IN TIME"
    : "A LITTLE UNIVERSE, ENDLESSLY BECOMING";
  if (universe.paused) clearTimeout(tourTimer);
  else scheduleTour();
  showControls();
  toast(universe.paused ? "A moment, held in time." : "And life goes on.");
}

async function keepAwake() {
  if (
    document.fullscreenElement &&
    "wakeLock" in navigator &&
    !document.hidden
  ) {
    try {
      wakeLock = await navigator.wakeLock.request("screen");
    } catch {
      /* Fullscreen still works without wake lock support. */
    }
  }
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen)
      await document.documentElement.requestFullscreen();
    else {
      hideControls();
      toast("Immersive view · tap to return");
    }
  } catch {
    hideControls();
    toast(
      "Immersive view · use your browser’s fullscreen shortcut for the entire display.",
    );
  }
}

function scheduleTour() {
  clearTimeout(tourTimer);
  if ($("tour").checked && !universe.paused)
    tourTimer = setTimeout(() => {
      if (settingsOpen || document.hidden) scheduleTour();
      else loadWorld(presetIndex + 1, { keepSettings: true });
    }, 90000);
}

try {
  universe = new Universe(
    $("universe"),
    ({ fps, simulationMs, count }) => {
      $("performance").textContent =
        `${count?.toLocaleString() || "…"} particles · ${fps} fps`;
      if (
        $("quality").value === "auto" &&
        !universe.paused &&
        !document.hidden &&
        !loadingWorld &&
        count > 5000
      ) {
        slowSamples =
          fps < 38 || simulationMs > 45
            ? slowSamples + 1
            : Math.max(0, slowSamples - 1);
        if (slowSamples >= 4) {
          adaptiveReduced = true;
          slowSamples = 0;
          loadWorld(presetIndex, { keepSettings: true });
        }
      }
    },
    showError,
  );
  await loadWorld(presetIndex, { first: true });
} catch (error) {
  console.error(error);
  showError(
    "Luma needs a browser with WebGL 2 and hardware acceleration. Try a recent version of Chrome, Edge, Firefox, or Safari.",
  );
}

if (universe) {
  $("preset").addEventListener("change", () =>
    loadWorld(
      PRESETS.findIndex((p) => p.id === $("preset").value),
      { keepSettings: true },
    ),
  );
  $("shuffle").addEventListener("click", () => {
    loadWorld(presetIndex, { keepSettings: true });
    toast("Same world. A new beginning.");
  });
  $("pause").addEventListener("click", togglePause);
  $("fullscreen").addEventListener("click", toggleFullscreen);
  $("settings-open").addEventListener("click", () => openSettings(true));
  $("settings-close").addEventListener("click", () => openSettings(false));
  $("panel-backdrop").addEventListener("click", () => openSettings(false));
  $("zoom").addEventListener("input", () =>
    changeZoom(Number($("zoom").value)),
  );
  $("zoom-reset").addEventListener("click", resetView);
  for (const name of ["speed", "glow", "trails", "size"])
    $(name).addEventListener("input", () => {
      settings[name] = Number($(name).value);
      updateRanges();
      universe.configure(settings);
      save();
    });
  $("mood").addEventListener("change", () => {
    updatePalette();
    save();
  });
  $("quality").addEventListener("change", () => {
    slowSamples = 0;
    loadWorld(presetIndex, { keepSettings: true });
  });
  $("tour").addEventListener("change", () => {
    scheduleTour();
    save();
  });
  $("auto-hide").addEventListener("change", () => {
    showControls();
    save();
  });
  $("reset").addEventListener("click", () => {
    changeZoom(1);
    loadWorld(presetIndex, { keepSettings: false });
    toast("Back to its natural state.");
  });
  window.addEventListener("resize", () => universe.resize());
  window.addEventListener("pointermove", showControls, { passive: true });
  window.addEventListener("pointerdown", showControls, { passive: true });
  for (const surface of [$("universe"), $("wake-controls")]) {
    surface.addEventListener(
      "wheel",
      (event) => {
        if (settingsOpen) return;
        event.preventDefault();
        const pixels =
          event.deltaY *
          (event.deltaMode === 1
            ? 16
            : event.deltaMode === 2
              ? innerHeight
              : 1);
        changeZoom(
          viewZoom *
            Math.exp(
              -Math.max(-500, Math.min(500, pixels)) *
                (event.ctrlKey ? 0.006 : 0.0015),
            ),
          { x: event.clientX, y: event.clientY },
        );
      },
      { passive: false },
    );
    surface.addEventListener("pointerdown", (event) => {
      if (settingsOpen) return;
      showControls();
      $("universe").setPointerCapture(event.pointerId);
      if (event.pointerType === "touch") {
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touches.size >= 2) {
          pinch = pinchState();
          pinching = true;
        }
      }
      universe.setPointer(event, !pinching);
    });
  }
  $("universe").addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" && touches.has(event.pointerId)) {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size >= 2 && pinch) {
        const next = pinchState();
        changeZoom((viewZoom * next.distance) / pinch.distance, pinch, next);
        pinch = next;
        return;
      }
    }
    universe.setPointer(event, !pinching && Boolean(event.buttons));
  });
  const endPointer = (event) => {
    touches.delete(event.pointerId);
    pinch = touches.size >= 2 ? pinchState() : null;
    if (!touches.size) pinching = false;
    universe.pointer.active = false;
  };
  window.addEventListener("pointerup", endPointer);
  window.addEventListener("pointercancel", endPointer);
  $("universe").addEventListener("contextmenu", (event) =>
    event.preventDefault(),
  );
  $("universe").addEventListener("dblclick", toggleFullscreen);
  document.addEventListener("fullscreenchange", () => {
    const fullscreen = Boolean(document.fullscreenElement);
    $("fullscreen").innerHTML =
      `${icon(fullscreen ? "contract" : "expand")}<span>${fullscreen ? "Exit fullscreen" : "Go fullscreen"}</span>`;
    $("fullscreen").setAttribute(
      "aria-label",
      fullscreen ? "Exit fullscreen" : "Enter fullscreen",
    );
    if (fullscreen) {
      keepAwake();
      toast("Just you and the universe. Move to reveal controls.");
      setTimeout(hideControls, 2400);
    } else {
      wakeLock?.release();
      wakeLock = null;
      showControls();
    }
  });
  document.addEventListener("visibilitychange", () => {
    universe.pointer.active = false;
    touches.clear();
    pinch = null;
    pinching = false;
    if (!document.hidden) {
      keepAwake();
      scheduleTour();
    }
  });
  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (settingsOpen && event.key === "Tab") {
      const controls = [
        ...$("settings-panel").querySelectorAll("button,select,input"),
      ].filter((element) => !element.disabled);
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && target === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && target === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.key === "Escape") {
      if (settingsOpen) openSettings(false);
      else showControls();
      return;
    }
    if (
      ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName) ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    )
      return;
    if (event.key === " " && target.tagName === "BUTTON") return;
    switch (event.key.toLowerCase()) {
      case "+":
      case "=":
        event.preventDefault();
        changeZoom(viewZoom * 1.25);
        break;
      case "-":
      case "_":
        event.preventDefault();
        changeZoom(viewZoom / 1.25);
        break;
      case "0":
        event.preventDefault();
        resetView();
        break;
      case "f":
        event.preventDefault();
        toggleFullscreen();
        break;
      case " ":
        event.preventDefault();
        togglePause();
        break;
      case "s":
        openSettings(!settingsOpen);
        break;
      case "r":
        loadWorld(presetIndex, { keepSettings: true });
        toast("A new beginning.");
        break;
      case "h":
        document.body.classList.contains("quiet")
          ? showControls()
          : hideControls();
        break;
      case "arrowright":
        event.preventDefault();
        loadWorld(presetIndex + 1, { keepSettings: true });
        showControls();
        break;
      case "arrowleft":
        event.preventDefault();
        loadWorld(presetIndex - 1, { keepSettings: true });
        showControls();
        break;
    }
  });
  showControls();
  if (import.meta.hot) import.meta.hot.dispose(() => universe.dispose());
}
