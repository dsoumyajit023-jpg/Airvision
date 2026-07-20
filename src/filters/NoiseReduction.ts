import type { OpenCV } from "../utils/types";

/**
 * Reduces sensor noise before amplification. Sensor/quantization noise gets
 * amplified along with real signal in later stages, so suppressing it first
 * is essential for a clean result on subtle air/breath changes.
 */
export class NoiseReduction {
  constructor(private readonly cv: OpenCV) {}

  /** In-place Gaussian blur, kernel size derived from a 0..1 strength value. */
  public gaussian(src: any, strength: number): void {
    const cv = this.cv;
    const k = this.oddKernelSize(strength);
    if (k <= 1) return;
    cv.GaussianBlur(src, src, new cv.Size(k, k), 0, 0, cv.BORDER_DEFAULT);
  }

  /**
   * Edge-preserving bilateral filter. More expensive than Gaussian blur, used
   * when quality is prioritized over raw frame rate (e.g. Scientific mode).
   */
  public bilateral(src: any, dst: any, strength: number): void {
    const cv = this.cv;
    const d = 5 + Math.round(strength * 4); // 5..9
    const sigma = 25 + strength * 50;
    cv.bilateralFilter(src, dst, d, sigma, sigma, cv.BORDER_DEFAULT);
  }

  private oddKernelSize(strength: number): number {
    const size = Math.round(1 + strength * 6); // 1..7
    return size % 2 === 0 ? size + 1 : size;
  }
}
