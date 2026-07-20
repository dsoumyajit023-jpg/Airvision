import type { OpenCV } from "../utils/types";

/**
 * CPU-side false-color mapping using OpenCV's built-in colormaps. This is
 * used as a WebGL fallback and inside Scientific mode's multi-panel layout.
 * The primary interactive false-color rendering (with live sensitivity /
 * strength sliders) is done on the GPU via WebGLRenderer for performance.
 */
export class FalseColor {
  constructor(private readonly cv: OpenCV) {}

  /** Applies a perceptual colormap to a single-channel 8-bit Mat, output is 3-channel BGR. */
  public apply(src: any, dst: any, map: "jet" | "inferno" | "hot" = "inferno"): void {
    const cv = this.cv;
    const colormap =
      map === "jet" ? cv.COLORMAP_JET : map === "hot" ? cv.COLORMAP_HOT : cv.COLORMAP_INFERNO;
    cv.applyColorMap(src, dst, colormap);
  }
}
