import { CameraMode, type ModeDescriptor } from "../utils/types";

export const MODES: ModeDescriptor[] = [
  { id: CameraMode.Normal, label: "Normal", description: "Unprocessed live camera preview." },
  {
    id: CameraMode.AirFlow,
    label: "Air Flow",
    description: "Dense optical flow visualization of subtle air / surface movement."
  },
  {
    id: CameraMode.Breath,
    label: "Breath",
    description: "Temporal band-pass + amplification tuned for slow rhythmic movement."
  },
  {
    id: CameraMode.MotionDiff,
    label: "Motion Diff",
    description: "Frame-to-frame absolute difference, thresholded and enhanced."
  },
  {
    id: CameraMode.EdgeVision,
    label: "Edge Vision",
    description: "Real-time Canny edge detection of the live scene."
  },
  {
    id: CameraMode.Scientific,
    label: "Scientific",
    description: "Contrast + edge composite rendered with a false-color intensity map."
  }
];

export class ModeSelector {
  private currentMode: CameraMode = CameraMode.Normal;
  private readonly buttons = new Map<CameraMode, HTMLButtonElement>();

  constructor(
    private readonly container: HTMLElement,
    private readonly onChange: (mode: CameraMode) => void
  ) {
    this.render();
  }

  private render(): void {
    this.container.innerHTML = "";
    for (const mode of MODES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mode-btn";
      btn.textContent = mode.label;
      btn.title = mode.description;
      btn.setAttribute("aria-pressed", String(mode.id === this.currentMode));
      btn.addEventListener("click", () => this.select(mode.id));
      this.buttons.set(mode.id, btn);
      this.container.appendChild(btn);
    }
    this.updateActiveState();
  }

  public select(mode: CameraMode): void {
    if (mode === this.currentMode) return;
    this.currentMode = mode;
    this.updateActiveState();
    this.onChange(mode);
  }

  private updateActiveState(): void {
    for (const [id, btn] of this.buttons) {
      const active = id === this.currentMode;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", String(active));
    }
  }

  public get mode(): CameraMode {
    return this.currentMode;
  }
}
