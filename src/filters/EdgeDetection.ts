import type { OpenCV } from "../utils/types";

/**
 * Canny edge detection with thresholds derived from the current sensitivity
 * setting, used both for "Edge Vision" mode and as a structural overlay in
 * Scientific mode.
 */
export class EdgeDetection {
  constructor(private readonly cv: OpenCV) {}

  public canny(src: any, dst: any, sensitivity: number): void {
    const cv = this.cv;
    // Higher sensitivity -> lower thresholds -> more (fainter) edges detected.
    const upper = Math.round(150 - sensitivity * 100); // 150..50
    const lower = Math.round(upper * 0.4);
    cv.Canny(src, dst, lower, upper, 3, false);
  }
}
