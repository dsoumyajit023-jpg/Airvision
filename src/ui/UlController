import { AppError } from "../utils/types";
import type { FrameStats as StatsLike } from "../processing/FrameProcessor";
import { SliderControl } from "./Controls";

export interface UICallbacks {
  onSwitchCamera: () => void;
  onScreenshot: () => void;
  onToggleRecording: () => void;
  onSensitivityChange: (value: number) => void;
  onStrengthChange: (value: number) => void;
  onToggleColorize: (enabled: boolean) => void;
  onToggleSettings: () => void;
}

/**
 * Owns all non-camera-frame DOM interaction: HUD readouts, sliders, buttons,
 * settings panel, and error/status banners. Contains no computer-vision
 * logic.
 */
export class UIController {
  private readonly fpsEl: HTMLElement;
  private readonly statsEl: HTMLElement;
  private readonly errorBanner: HTMLElement;
  private readonly recordBtn: HTMLButtonElement;
  private readonly settingsPanel: HTMLElement;
  private readonly sensitivitySlider: SliderControl;
  private readonly strengthSlider: SliderControl;
  private readonly colorizeToggle: HTMLInputElement;

  constructor(root: HTMLElement, callbacks: UICallbacks) {
    this.fpsEl = this.q(root, "#fps-display");
    this.statsEl = this.q(root, "#stats-display");
    this.errorBanner = this.q(root, "#error-banner");
    this.recordBtn = this.q<HTMLButtonElement>(root, "#record-btn");
    this.settingsPanel = this.q(root, "#settings-panel");
    this.colorizeToggle = this.q<HTMLInputElement>(root, "#colorize-toggle");

    this.q<HTMLButtonElement>(root, "#switch-camera-btn").addEventListener("click", callbacks.onSwitchCamera);
    this.q<HTMLButtonElement>(root, "#screenshot-btn").addEventListener("click", callbacks.onScreenshot);
    this.recordBtn.addEventListener("click", callbacks.onToggleRecording);
    this.q<HTMLButtonElement>(root, "#settings-toggle-btn").addEventListener("click", callbacks.onToggleSettings);
    this.q<HTMLButtonElement>(root, "#error-dismiss-btn").addEventListener("click", () => this.hideError());

    this.sensitivitySlider = new SliderControl(
      this.q<HTMLInputElement>(root, "#sensitivity-slider"),
      this.q(root, "#sensitivity-value"),
      callbacks.onSensitivityChange
    );
    this.strengthSlider = new SliderControl(
      this.q<HTMLInputElement>(root, "#strength-slider"),
      this.q(root, "#strength-value"),
      callbacks.onStrengthChange
    );

    this.colorizeToggle.addEventListener("change", () => {
      callbacks.onToggleColorize(this.colorizeToggle.checked);
    });
  }

  private q<T extends HTMLElement = HTMLElement>(root: HTMLElement, selector: string): T {
    const el = root.querySelector<T>(selector);
    if (!el) throw new Error(`UIController: required element "${selector}" not found.`);
    return el;
  }

  public setFps(fps: number): void {
    this.fpsEl.textContent = `${fps.toFixed(0)} FPS`;
    this.fpsEl.classList.toggle("fps-low", fps > 0 && fps < 12);
  }

  public setStats(stats: StatsLike): void {
    this.statsEl.textContent =
      `mean ${stats.meanIntensity.toFixed(1)}  ` +
      `range ${stats.minIntensity.toFixed(0)}-${stats.maxIntensity.toFixed(0)}  ` +
      `changed ${(stats.changedPixelRatio * 100).toFixed(1)}%`;
  }

  public setRecordingState(recording: boolean): void {
    this.recordBtn.classList.toggle("recording", recording);
    this.recordBtn.setAttribute("aria-pressed", String(recording));
    this.recordBtn.title = recording ? "Stop recording" : "Start recording";
  }

  public toggleSettingsPanel(): void {
    this.settingsPanel.classList.toggle("open");
  }

  public showError(error: AppError | Error): void {
    this.errorBanner.textContent = error.message;
    this.errorBanner.classList.add("visible");
  }

  public hideError(): void {
    this.errorBanner.classList.remove("visible");
  }

  public get sensitivity(): number {
    return this.sensitivitySlider.value;
  }

  public get strength(): number {
    return this.strengthSlider.value;
  }
}
