import type { OpenCV } from "../utils/types";

/**
 * Computes the absolute difference between consecutive grayscale frames,
 * the foundation for motion / air-disturbance detection. Only real captured
 * pixel differences are used - nothing here is synthesized.
 */
export class FrameDifference {
  constructor(private readonly cv: OpenCV) {}

  /** dst = |current - previous|, both single-channel Mats of equal size. */
  public compute(current: any, previous: any, dst: any): void {
    this.cv.absdiff(current, previous, dst);
  }

  /**
   * Suppresses differences below a sensitivity-derived threshold so static
   * sensor noise does not appear as motion.
   */
  public threshold(diff: any, dst: any, sensitivity: number): void {
    const cv = this.cv;
    // Higher sensitivity -> lower threshold -> smaller real changes pass through.
    const thresholdValue = Math.round(30 * (1 - sensitivity)) + 2;
    cv.threshold(diff, dst, thresholdValue, 255, cv.THRESH_TOZERO);
  }
}
