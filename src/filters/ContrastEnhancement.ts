import type { OpenCV } from "../utils/types";

/**
 * Boosts local contrast so that small, real intensity variations captured by
 * the sensor (air shimmer, faint motion) become visible without over-driving
 * the whole frame.
 */
export class ContrastEnhancement {
  private clahe: any;

  constructor(cv: OpenCV) {
    this.clahe = new cv.CLAHE(3.0, new cv.Size(8, 8));
  }

  /** Contrast Limited Adaptive Histogram Equalization on a single-channel Mat. */
  public applyCLAHE(src: any, dst: any, strength: number): void {
    this.clahe.setClipLimit(1.0 + strength * 5.0);
    this.clahe.apply(src, dst);
  }

  /** Simple linear alpha/beta contrast+brightness scaling. */
  public linear(src: any, dst: any, alpha: number, beta = 0): void {
    src.convertTo(dst, -1, alpha, beta);
  }

  public dispose(): void {
    if (this.clahe && this.clahe.delete) {
      this.clahe.delete();
    }
  }
}
