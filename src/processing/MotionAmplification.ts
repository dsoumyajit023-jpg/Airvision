import type { OpenCV } from "../utils/types";

/**
 * Amplifies small real intensity deviations from a slowly-updated baseline,
 * analogous in spirit to Eulerian Video Magnification's amplification step
 * but simplified for real-time mobile performance. Amplifies only what the
 * sensor actually captured; the amplification factor is a linear scale
 * applied to the real measured deviation, never a fabricated value.
 */
export class MotionAmplification {
  private baseline: any = null;

  constructor(private readonly cv: OpenCV) {}

  private ensureBaseline(gray: any): void {
    const cv = this.cv;
    if (!this.baseline) {
      this.baseline = new cv.Mat(gray.rows, gray.cols, cv.CV_32FC1);
      gray.convertTo(this.baseline, cv.CV_32FC1);
    }
  }

  /**
   * Updates the slow baseline and writes the amplified frame (CV_8UC1) into
   * dst: dst = clamp(baseline + (gray - baseline) * factor).
   */
  public amplify(gray: any, dst: any, factor: number, baselineAlpha = 0.02): void {
    this.ensureBaseline(gray);
    const cv = this.cv;

    cv.accumulateWeighted(gray, this.baseline, baselineAlpha);

    const gray32 = new cv.Mat();
    gray.convertTo(gray32, cv.CV_32FC1);

    const delta = new cv.Mat();
    cv.subtract(gray32, this.baseline, delta);

    const amplified = new cv.Mat();
    cv.addWeighted(this.baseline, 1.0, delta, factor, 0, amplified);

    amplified.convertTo(dst, cv.CV_8UC1);

    gray32.delete();
    delta.delete();
    amplified.delete();
  }

  public reset(): void {
    if (this.baseline) {
      this.baseline.delete();
      this.baseline = null;
    }
  }

  public dispose(): void {
    this.reset();
  }
}
