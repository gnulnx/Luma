# Luma — a little universe

A full-window Three.js particle-life experience for a desktop, projector, or TV. Five composed worlds, glowing particles, persistent light trails, and an interface that fades away when you stop interacting.

## Run

Requires Node.js 20.19+ or 22.12+.

```sh
npm install --cache .npm-cache
npm run dev
```

Open the local URL printed in the terminal (normally `http://localhost:5173`). Click **Go fullscreen**, or press **F**. The first fullscreen entry must follow a click or keypress because browsers require a user gesture.

For a TV, connect the computer by HDMI, mirror/cast its display, or open the terminal’s Network URL in a WebGL 2 capable TV browser on the same network. The computer must keep running the server. The app requests a screen wake lock during fullscreen when the browser supports it; a TV’s own sleep timer is separate. All fonts and graphics ship locally; the running app does not need third-party requests.

## The living collection

| World           | Character                                              |
| --------------- | ------------------------------------------------------ |
| Cosmic bloom    | Two interweaving galaxies of lilac, rose, and icy blue |
| Aurora          | Flowing green and turquoise ribbons                    |
| Bioluminescence | Luminous ocean shoals that gather and drift            |
| Ember dance     | Warm, spirited vortices of gold, coral, and flame      |
| Prismatic       | Six colorful arms that curl, chase, and reorganize     |

Choose a world from the bottom dropdown. Open **Settings** for color palettes, energy, glow, trails, particle size, and detail. Energy ranges from a nearly still **0.05× drift** to 2× spirited motion. Adaptive detail starts with 12,000 particles on larger devices and 5,000 on smaller devices, and reduces load when performance stays low. Rich and Ultra explicitly select 12,000 and 20,000 particles. Actual performance depends on the browser, GPU, and display resolution.

Turn on **Let it wander** for a new world every 90 seconds. Automatic changes wait while settings are open, the simulation is paused, or the page is hidden. Your settings are saved in the current browser when local storage is available. Reimagining and changing scenes preserve your energy, glow, trails, particle size, palette, detail, and zoom. **Restore this world’s defaults** is the explicit reset when you want the new scene’s tuned starting point.

Scroll over the scene or pinch with two fingers to zoom from **0.5× to 6×**. Zoom follows the pointer or pinch midpoint, enlarging both particles and whole clumps. Two-finger dragging also moves the zoomed view. **Scene zoom** in Settings provides a slider, and **Reset view** returns to the centered 1× view. Zoom is saved and stays in place when switching worlds. Particle size remains a separate control for the size of individual dots.

| Control                    | Action                                                          |
| -------------------------- | --------------------------------------------------------------- |
| F / double-click the scene | Enter or leave fullscreen                                       |
| Space                      | Pause or resume                                                 |
| Left / Right               | Previous or next world                                          |
| R                          | Reimagine the current world                                     |
| S                          | Open or close settings                                          |
| + / −                      | Zoom in or out                                                  |
| 0                          | Reset the view to centered 1×                                   |
| H                          | Hide or show the interface                                      |
| Escape                     | Close settings / reveal controls; browser also exits fullscreen |
| Hold and drag              | Attract nearby particles into a gentle swirl                    |
| Shift + drag / right drag  | Repel nearby particles                                          |

Move the pointer or tap to reveal hidden controls. A first tap wakes the controls; hold and drag on the scene to interact. Settings support keyboard navigation and trap focus while open. This is a browser experience, not an installed operating-system screensaver.

## Build and verify

```sh
npm run build
npm run preview
npm test
# With the dev server running on port 5173 and Google Chrome installed:
npm run test:browser
npm run test:display
npm run test:zoom
```

`dist/` is a portable static build. Browser checks save desktop and mobile screenshots under `test-results/`. Physics tests cover reproducibility, sustained motion, finite positions, neighbor interactions, pointer forces, and resizing.

## How it works

Every displayed life particle has its own position, velocity, and one of six species. A Web Worker calculates local asymmetric attraction and short-range repulsion using a spatial grid. Soft vortices and currents provide each preset’s composition; this is an artistic particle-life simulation, not a scientific model or a prerecorded animation. Particle positions interpolate smoothly between worker updates. Three.js renders additive point sprites, time-based history trails, bloom, and a sparse starfield.

The physics worker updates at a measured 20 Hz while the renderer interpolates every display frame. This keeps long-running 12,000-particle scenes fluid without keeping a CPU core busy continuously. When adaptive detail detects sustained low performance, it moves to the 5,000-particle mode and lowers the render scale. Switching worlds detaches the previous worker before starting the next one.

- `src/physics.js`: particle-life forces, spatial grid, and composition currents.
- `src/presets.js`: palettes and tuning.
- `src/simulation.worker.js`: physics worker and transferable frame buffers.
- `src/universe.js`: renderer, custom light-trail pass, bloom, and adaptive resolution support.
- `src/main.js`: controls, persistence, fullscreen, and display wake lock.

Rendering follows Three.js’s [post-processing workflow](https://threejs.org/manual/en/post-processing.html). Development and production builds use [Vite](https://vite.dev/guide/).
