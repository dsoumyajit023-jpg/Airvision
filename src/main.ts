import "./style.css";
import { CameraManager } from "./camera/CameraManager";
import { waitForOpenCV } from "./processing/OpenCvLoader";
import { FrameProcessor, type ProcessedOutput } from "./processing/FrameProcessor";
import { WebGLRenderer } from "./utils/WebGLRenderer";
import { FPSCounter } from "./utils/FPSCounter";
import { Recorder } from "./utils/Recorder";
import { UIController } from "./ui/UIController";
import { ModeSelector } from "./ui/ModeSelector";
import { AppError, AppErrorType, CameraMode, type ProcessingSettings } from "./utils/types";

// Processing is intentionally capped below the full camera resolution: real
// air/breath signal is low-frequency and spatially coarse, so downscaling
// keeps every mode running in real time on mobile GPUs/CPUs without losing
// visible signal.
const PROCESSING_MAX_WIDTH = 480;

class AirVisionApp {
  private readonly root = document.getElementById("app") as HTMLElement;
  private readonly video = document.getElementById("camera-video") as HTMLVideoElement;
  private readonly outputCanvas = document.getElementById("output-canvas") as HTMLCanvasElement;
  private readonly loadingOverlay = document.getElementById("loading-overlay") as HTMLElement;
  private readonly loadingText = document.getElementById("loading-text") as HTMLElement;
  private readonly modeContainer = document.getElementById("mode-selector") as HTMLElement;

  private readonly processingCanvas = document.createElement("canvas");
  private readonly processingCtx: CanvasRenderingContext2D;

  private cameraManager!: CameraManager;
  private frameProcessor: FrameProcessor | null = null;
  private glRenderer!: WebGLRenderer;
  private recorder!: Recorder;
  private ui!: UIController;
  private modeSelector!: ModeSelector;
  private fpsCounter = new FPSCounter();

  private settings: ProcessingSettings = { sensitivity: 0.55, strength: 0.5 };
  private colorizeEnabled = true;
  private running = false;
  private lowPerfStreak = 0;
  private lastStatsUpdate = 0;

  constructor() {
    const ctx = this.processingCanvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2D canvas context unavailable for frame downscaling.");
    this.processingCtx = ctx;
  }

  public async init(): Promise<void> {
    this.registerServiceWorker();

    try {
      this.assertBrowserSupport();
      this.glRenderer = new WebGLRenderer(this.outputCanvas);
      this.recorder = new Recorder(this.outputCanvas);
      this.cameraManager = new CameraManager(this.video);

      this.setLoadingText("Starting camera…");
      await this.cameraManager.start("environment");

      this.setLoadingText("Loading OpenCV.js runtime…");
      const cv = await this.loadOpenCvWithFallback();
      this.frameProcessor = new FrameProcessor(cv);

      this.setupUI();
      this.hideLoading();
      this.running = true;
      requestAnimationFrame(this.renderLoop);
    } catch (err) {
      this.handleFatalError(err);
    }
  }

  private assertBrowserSupport(): void {
    if (!CameraManager.isSupported()) {
      throw new AppError(AppErrorType.UnsupportedBrowser, "Camera access is not supported in this browser.");
    }
    const testCanvas = document.createElement("canvas");
    if (!testCanvas.getContext("webgl2")) {
      throw new AppError(
        AppErrorType.UnsupportedBrowser,
        "WebGL2 is required for real-time rendering and is not available in this browser."
      );
    }
  }

  private async loadOpenCvWithFallback() {
    try {
      return await waitForOpenCV();
    } catch (err) {
      throw new AppError(
        AppErrorType.OpenCvLoadFailed,
        "Failed to load the OpenCV.js computer-vision runtime. Check your internet connection and reload."
      );
    }
  }

  private setupUI(): void {
    this.modeSelector = new ModeSelector(this.modeContainer, () => {
      // Mode switch: reset temporal/motion state implicitly happens because
      // FrameProcessor keeps per-buffer state keyed to resolution only; for a
      // clean transition we simply let the next frame re-seed the filters.
    });

    this.ui = new UIController(this.root, {
      onSwitchCamera: () => this.handleSwitchCamera(),
      onScreenshot: () => this.recorder.screenshot("airvision"),
      onToggleRecording: () => this.handleToggleRecording(),
      onSensitivityChange: (v) => (this.settings = { ...this.settings, sensitivity: v }),
      onStrengthChange: (v) => (this.settings = { ...this.settings, strength: v }),
      onToggleColorize: (enabled) => (this.colorizeEnabled = enabled),
      onToggleSettings: () => this.ui.toggleSettingsPanel()
    });
  }

  private async handleSwitchCamera(): Promise<void> {
    try {
      await this.cameraManager.switchCamera();
      this.outputCanvas.classList.toggle("mirrored", this.cameraManager.facingMode === "user");
    } catch (err) {
      this.ui.showError(this.toAppError(err));
    }
  }

  private handleToggleRecording(): void {
    if (this.recorder.isRecording) {
      this.recorder.stopRecording();
      this.ui.setRecordingState(false);
    } else {
      this.recorder.startRecording("airvision");
      this.ui.setRecordingState(true);
    }
  }

  private renderLoop = (now: number): void => {
    if (!this.running) return;

    const sample = this.fpsCounter.tick(now);
    this.ui.setFps(sample.fps);
    this.monitorPerformance(sample.fps);

    const mode = this.modeSelector.mode;

    if (mode === CameraMode.Normal) {
      this.glRenderer.renderVideoFrame(this.video);
    } else if (this.frameProcessor && this.video.videoWidth > 0) {
      const imageData = this.captureDownscaledFrame();
      if (imageData) {
        const output = this.frameProcessor.process(imageData, mode, this.settings);
        this.renderOutput(output);
        this.updateStatsThrottled(now, output);
      }
    }

    requestAnimationFrame(this.renderLoop);
  };

  private captureDownscaledFrame(): ImageData | null {
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (vw === 0 || vh === 0) return null;

    const scale = Math.min(1, PROCESSING_MAX_WIDTH / vw);
    const w = Math.max(2, Math.round(vw * scale));
    const h = Math.max(2, Math.round(vh * scale));

    if (this.processingCanvas.width !== w || this.processingCanvas.height !== h) {
      this.processingCanvas.width = w;
      this.processingCanvas.height = h;
    }
    this.processingCtx.drawImage(this.video, 0, 0, w, h);
    return this.processingCtx.getImageData(0, 0, w, h);
  }

  private renderOutput(output: ProcessedOutput): void {
    if (output.kind === "rgba") {
      this.glRenderer.renderRGBA(output.data, output.width, output.height);
    } else {
      this.glRenderer.renderGray(output.data, output.width, output.height, {
        sensitivity: this.settings.sensitivity,
        strength: this.settings.strength,
        mode: this.modeSelector.mode,
        colorize: this.colorizeEnabled && output.colorize
      });
    }
  }

  private updateStatsThrottled(now: number, output: ProcessedOutput): void {
    if (now - this.lastStatsUpdate < 400 || !this.frameProcessor) return;
    this.lastStatsUpdate = now;
    this.ui.setStats(this.frameProcessor.computeStats(output));
  }

  private monitorPerformance(fps: number): void {
    if (fps > 0 && fps < 10) {
      this.lowPerfStreak++;
    } else {
      this.lowPerfStreak = 0;
    }
    if (this.lowPerfStreak === 90) {
      this.ui.showError(
        new AppError(
          AppErrorType.LowPerformance,
          "Performance is low on this device. Try Edge Vision or Motion Diff mode, or reduce Strength for smoother frame rates."
        )
      );
    }
  }

  private setLoadingText(text: string): void {
    this.loadingText.textContent = text;
  }

  private hideLoading(): void {
    this.loadingOverlay.setAttribute("hidden", "true");
  }

  private toAppError(err: unknown): AppError {
    if (err instanceof AppError) return err;
    return new AppError(AppErrorType.Generic, err instanceof Error ? err.message : String(err));
  }

  private handleFatalError(err: unknown): void {
    const appError = this.toAppError(err);
    this.loadingText.textContent = appError.message;
    const spinner = this.loadingOverlay.querySelector(".spinner");
    if (spinner) spinner.remove();
    // eslint-disable-next-line no-console
    console.error("[AirVision AI] Fatal initialization error:", appError);
  }

  private registerServiceWorker(): void {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch(() => {
          // PWA offline shell is a progressive enhancement; failures are non-fatal.
        });
      });
    }
  }
}

new AirVisionApp().init();
