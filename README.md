# AirVision AI

Real-time, browser-based computer vision application that uses a normal RGB
smartphone camera to enhance and visualize **subtle air disturbances, breath
movement, and small optical variations** — built with TypeScript, Vite,
OpenCV.js and WebGL.

> **Scientific disclaimer:** AirVision AI does not detect temperature. It
> only enhances visible optical changes captured by the RGB camera sensor.
> Every visualization (motion, air-flow color, edges, false color) is
> computed exclusively from real pixel data captured by the camera. No
> thermal, infrared, or synthetic sensor data is generated, read, or
> simulated anywhere in this codebase.

---

## 1. What this is (and isn't)

**Is:** A computer-vision pipeline (frame differencing, temporal filtering,
dense optical flow, motion amplification, edge detection, false-color
mapping) applied in real time to a live RGB camera feed, to make otherwise
imperceptible optical changes — like heat-shimmer-style air movement, chest
movement from breathing, or faint surface vibration — visible to the eye.

**Isn't:** A thermal camera emulator. It does not read or estimate
temperature, and it does not require or use any thermal/IR hardware. All
output is a mathematical transformation of real captured RGB pixel values.

---

## 2. Features

### Camera
- Live camera preview (`getUserMedia`) with front/back camera switching
- Real-time FPS readout
- Screenshot capture (PNG)
- Video recording (WebM/MP4 via `MediaRecorder`, records exactly what is on screen)

### Computer vision pipeline (`src/processing`, `src/filters`)
- Frame differencing (`FrameDifference`)
- Temporal band-pass filtering for rhythmic signals like breathing (`TemporalFilter`)
- Gaussian / bilateral noise reduction (`NoiseReduction`)
- CLAHE + linear contrast enhancement (`ContrastEnhancement`)
- Canny edge detection (`EdgeDetection`)
- Motion amplification, Eulerian-style (`MotionAmplification`)
- Dense optical flow via Farneback's algorithm, HSV-encoded direction/magnitude (`OpticalFlow`)
- False-color visualization, both GPU (WebGL shader) and CPU (OpenCV colormap) paths
- Adjustable **Sensitivity** (how small a real change must be to appear) and
  **Strength** (how strongly it is amplified/contrasted)

### Camera modes
1. **Normal** — unprocessed live preview (GPU passthrough, no CV overhead)
2. **Air Flow** — dense optical flow visualization of subtle movement
3. **Breath** — temporal band-pass + amplification tuned to slow rhythmic motion
4. **Motion Diff** — thresholded frame-to-frame absolute difference
5. **Edge Vision** — real-time Canny edge detection
6. **Scientific** — contrast + edge composite with a false-color intensity map and live intensity statistics (mean/min/max/changed-pixel ratio — relative units, not temperature)

### UI
- Dark, professional camera-style interface
- Mobile-first, safe-area aware layout
- Sensitivity / Strength sliders, false-color toggle
- Settings panel, error/status banners for permission, browser support, and performance issues

---

## 3. Project structure

```
airvision-ai/
├── src/
│   ├── camera/
│   │   └── CameraManager.ts        # getUserMedia, device switching
│   ├── processing/
│   │   ├── FrameProcessor.ts       # per-mode CV pipeline orchestration
│   │   ├── OpticalFlow.ts          # Farneback dense optical flow
│   │   ├── MotionAmplification.ts  # Eulerian-style amplification
│   │   └── OpenCvLoader.ts         # waits for the OpenCV.js WASM runtime
│   ├── filters/
│   │   ├── FrameDifference.ts
│   │   ├── TemporalFilter.ts
│   │   ├── NoiseReduction.ts
│   │   ├── ContrastEnhancement.ts
│   │   ├── EdgeDetection.ts
│   │   └── FalseColor.ts
│   ├── ui/
│   │   ├── UIController.ts         # DOM wiring, HUD, banners
│   │   ├── ModeSelector.ts         # mode button bar
│   │   └── Controls.ts             # slider component
│   ├── utils/
│   │   ├── types.ts                # shared types/enums
│   │   ├── WebGLRenderer.ts        # GPU-accelerated colorization/render
│   │   ├── FPSCounter.ts
│   │   └── Recorder.ts             # screenshot + video recording
│   ├── main.ts                     # application bootstrap / render loop
│   └── style.css
├── public/
│   ├── manifest.webmanifest
│   ├── sw.js                       # PWA offline app-shell service worker
│   ├── _headers                    # Cloudflare Pages HTTP headers
│   └── icons/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
├── wrangler.toml
└── .gitignore
```

---

## 4. How the pipeline works

1. `CameraManager` starts a `getUserMedia` stream into a hidden `<video>` element.
2. Every animation frame, `main.ts` draws the current video frame into a
   small offscreen canvas (downscaled to a max width of 480px — real air/
   breath signal is low-frequency and spatially coarse, so this keeps every
   mode real-time on mobile without losing visible signal) and reads it back
   as `ImageData`.
3. `FrameProcessor` converts that frame to grayscale in OpenCV.js, applies
   light denoising, then routes it through the filter chain for the active
   mode (frame diff, temporal filter + amplification, optical flow, Canny,
   or the Scientific composite).
4. The result is either:
   - a single-channel intensity buffer, sent to `WebGLRenderer.renderGray()`,
     which applies GPU-side contrast shaping and false-color mapping driven
     live by the Sensitivity/Strength sliders (no CV re-run needed when a
     slider moves), or
   - an already-colored RGBA buffer (optical flow, Scientific composite),
     sent to `WebGLRenderer.renderRGBA()` unmodified.
5. **Normal mode bypasses OpenCV entirely** — the raw video frame is
   uploaded straight to a WebGL texture and drawn, for zero CV overhead when
   no processing is requested.
6. `Recorder` captures the visible `<canvas>` via `canvas.captureStream()`,
   so screenshots/recordings always match exactly what's on screen.

All persistent OpenCV `Mat` buffers are allocated once per resolution and
reused every frame (`FrameProcessor.ensureBuffers`) to avoid WASM heap churn
on mobile devices.

---

## 5. Setup

### Requirements
- Node.js 18+ and npm
- A browser with WebGL2 and `getUserMedia` support (Chrome, Edge, Safari 15+, Firefox)
- HTTPS (or `localhost`) — browsers only allow camera access on secure origins

### Install & run

```bash
npm install
npm run dev
```

Open the printed local URL (e.g. `http://localhost:5173`). To test on a
physical phone on the same network, use the printed network URL — most
mobile browsers still require HTTPS for camera access outside `localhost`,
so for real-device testing either use a tunnel (e.g. `ngrok http 5173`) or
deploy to Cloudflare Pages (see below), which serves over HTTPS by default.

### Type-check only

```bash
npm run typecheck
```

### Production build

```bash
npm run build
```

Output is written to `dist/`. Preview it locally with:

```bash
npm run preview
```

---

## 6. OpenCV.js runtime

`index.html` loads OpenCV.js from the official CDN:

```html
<script async src="https://docs.opencv.org/4.9.0/opencv.js"></script>
```

`src/processing/OpenCvLoader.ts` waits for the WebAssembly runtime to
finish initializing before any processing starts, and surfaces a clear error
if the script fails to load (e.g. offline, blocked network).

**To self-host OpenCV.js** (fully offline-capable deployments): download
`opencv.js` from https://docs.opencv.org into `public/opencv/opencv.js` and
change the `<script>` `src` in `index.html` to `./opencv/opencv.js`. No other
code changes are required.

---

## 7. Deploying to Cloudflare Pages

### Option A — Dashboard (recommended)
1. Push this repository to GitHub.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**.
3. Select the repository.
4. Build settings:
   - **Framework preset:** Vite
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
5. Deploy. Cloudflare Pages serves the site over HTTPS automatically, which
   is required for camera access on real devices.

### Option B — Wrangler CLI
```bash
npm install -g wrangler
npm run build
wrangler pages deploy dist --project-name airvision-ai
```

`wrangler.toml` in the repo root already sets `pages_build_output_dir =
"dist"` for CLI-based deploys.

### Headers
`public/_headers` is copied into `dist/` on build and is picked up
automatically by Cloudflare Pages. It sets a `Permissions-Policy` allowing
camera access for the site's own origin and disables caching for the
service worker and manifest so PWA updates roll out promptly.

---

## 8. GitHub setup

```bash
git init
git add .
git commit -m "Initial commit: AirVision AI"
git branch -M main
git remote add origin https://github.com/<your-username>/airvision-ai.git
git push -u origin main
```

`.gitignore` already excludes `node_modules/`, `dist/`, and local env files.

---

## 9. Error handling covered

- **Camera permission denied / no camera found** — mapped to a clear,
  user-facing banner (`CameraManager.mapGetUserMediaError`).
- **Unsupported browser** (no `getUserMedia` or no WebGL2) — detected before
  any camera/CV work starts, with an explanatory message.
- **OpenCV.js failed to load** (network/CDN issue) — timed wait with a
  typed error surfaced to the UI.
- **Low performance devices** — a rolling FPS counter detects sustained
  sub-10-FPS operation and suggests lighter modes/settings without crashing
  or silently failing.

---

## 10. Computer vision integrity rules followed in this codebase

- No hardcoded or simulated temperature values anywhere.
- No fabricated sensor data of any kind.
- Every visualized pixel value is derived from a real transformation
  (difference, flow, contrast, edges, temporal filtering) of frames actually
  captured by `getUserMedia`.
- "Scientific mode" statistics (mean/min/max/changed-pixel ratio) are
  computed directly from the rendered intensity buffer and labeled as
  relative intensity/ratio values, never as temperature.
