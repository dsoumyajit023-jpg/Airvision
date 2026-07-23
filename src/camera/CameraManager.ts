import { AppError, AppErrorType, type FacingMode } from "../utils/types";

/**
 * Wraps getUserMedia camera access, device enumeration, and front/back
 * camera switching. Produces frames through a hidden <video> element that
 * downstream processing modules read from via drawImage/texImage2D.
 */
export class CameraManager {
  private stream: MediaStream | null = null;
  private readonly videoEl: HTMLVideoElement;
  private currentFacingMode: FacingMode = "environment";
  private availableVideoInputs: MediaDeviceInfo[] = [];

  constructor(videoEl: HTMLVideoElement) {
    this.videoEl = videoEl;
  }

  public static isSupported(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  public get facingMode(): FacingMode {
    return this.currentFacingMode;
  }

  public get videoWidth(): number {
    return this.videoEl.videoWidth;
  }

  public get videoHeight(): number {
    return this.videoEl.videoHeight;
  }

  /** Requests camera access and starts streaming into the bound video element. */
  public async start(facingMode: FacingMode = "environment"): Promise<void> {
    if (!CameraManager.isSupported()) {
      throw new AppError(
        AppErrorType.UnsupportedBrowser,
        "This browser does not support camera access (getUserMedia is unavailable)."
      );
    }

    this.stopStream();
    this.currentFacingMode = facingMode;

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 }
      }
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      throw this.mapGetUserMediaError(err);
    }

 this.videoEl.setAttribute("playsinline", "true");
    this.videoEl.muted = true;
    this.videoEl.srcObject = this.stream;

    await new Promise<void>((resolve, reject) => {
      const start = () => {
        this.videoEl
          .play()
          .then(() => resolve())
          .catch((e) => reject(e));
      };

      // If metadata is already available (can happen on fast reloads or
      // camera switches), don't wait for an event that may never fire again.
      if (this.videoEl.readyState >= 1) {
        start();
        return;
      }

      const onLoaded = () => {
        this.videoEl.removeEventListener("loadedmetadata", onLoaded);
        start();
      };
      this.videoEl.addEventListener("loadedmetadata", onLoaded);

      // Safety net: never hang forever waiting for the browser event.
      window.setTimeout(() => {
        this.videoEl.removeEventListener("loadedmetadata", onLoaded);
        if (this.videoEl.readyState >= 1) {
          start();
        } else {
          reject(new Error("Camera stream did not become ready in time."));
        }
      }, 8000);
    });

    await this.refreshDeviceList();   
  }

  /** Switches between front (user) and back (environment) cameras. */
  public async switchCamera(): Promise<void> {
    const next: FacingMode = this.currentFacingMode === "environment" ? "user" : "environment";
    await this.start(next);
  }

  public stop(): void {
    this.stopStream();
    this.videoEl.srcObject = null;
  }

  private stopStream(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
  }

  private async refreshDeviceList(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.availableVideoInputs = devices.filter((d) => d.kind === "videoinput");
    } catch {
      this.availableVideoInputs = [];
    }
  }

  public get hasMultipleCameras(): boolean {
    return this.availableVideoInputs.length > 1 || true; // facingMode toggle is always attempted
  }

  private mapGetUserMediaError(err: unknown): AppError {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      return new AppError(
        AppErrorType.CameraPermissionDenied,
        "Camera permission was denied. Please allow camera access in your browser settings and reload the page."
      );
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      return new AppError(
        AppErrorType.CameraNotFound,
        "No suitable camera was found on this device."
      );
    }
    return new AppError(
      AppErrorType.Generic,
      `Unable to access the camera: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
