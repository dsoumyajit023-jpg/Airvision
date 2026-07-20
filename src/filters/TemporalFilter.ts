import type { OpenCV } from "../utils/types";

/**
 * Maintains exponential moving averages of the incoming grayscale signal at
 * two different time constants and exposes their difference as a temporal
 * band-pass signal. Slow, rhythmic real intensity changes such as chest/
 * shoulder movement from breathing, or slowly drifting air disturbance,
 * fall inside this band while camera/sensor noise (very fast) and static
 * scene content (very slow / DC) are suppressed.
 *
 * This is a lightweight, real-time-friendly analogue of the temporal
 * filtering stage used in Eulerian Video Magnification. No values are
 * fabricated - every sample is derived from real captured frames.
 */
export class TemporalFilter {
  private fastAcc: any = null;
  private slowAcc: any = null;
  private readonly cv: OpenCV;

  constructor(cv: OpenCV) {
    this.cv = cv;
  }

  private ensureBuffers(gray: any): void {
    const cv = this.cv;
    if (!this.fastAcc) {
      this.fastAcc = new cv.Mat(gray.rows, gray.cols, cv.CV_32FC1);
      gray.convertTo(this.fastAcc, cv.CV_32FC1);
    }
    if (!this.slowAcc) {
      this.slowAcc = new cv.Mat(gray.rows, gray.cols, cv.CV_32FC1);
      gray.convertTo(this.slowAcc, cv.CV_32FC1);
    }
  }

  /**
   * Feeds a new grayscale (CV_8UC1) frame into the filter.
   * fastAlpha / slowAlpha are EMA coefficients in (0, 1]; fastAlpha should be
   * larger (reacts quickly) and slowAlpha smaller (reacts slowly), so their
   * difference isolates the mid-frequency breathing band.
   */
  public update(gray: any, fastAlpha = 0.5, slowAlpha = 0.03): void {
    this.ensureBuffers(gray);
    const cv = this.cv;
    cv.accumulateWeighted(gray, this.fastAcc, fastAlpha);
    cv.accumulateWeighted(gray, this.slowAcc, slowAlpha);
  }

  /** Writes |fast - slow| scaled to 8-bit into dst (single channel). */
  public getBandpass(dst: any): void {
    if (!this.fastAcc || !this.slowAcc) return;
    const cv = this.cv;
    const diff32 = new cv.Mat();
    cv.absdiff(this.fastAcc, this.slowAcc, diff32);
    diff32.convertTo(dst, cv.CV_8UC1, 1.0, 0);
    diff32.delete();
  }

  public reset(): void {
    if (this.fastAcc) {
      this.fastAcc.delete();
      this.fastAcc = null;
    }
    if (this.slowAcc) {
      this.slowAcc.delete();
      this.slowAcc = null;
    }
  }

  public dispose(): void {
    this.reset();
  }
}
