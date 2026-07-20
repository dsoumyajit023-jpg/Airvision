import type { OpenCV } from "../utils/types";

/**
 * Dense optical flow (Farneback) between consecutive grayscale frames.
 * Produces a real motion-vector field directly from captured pixel
 * intensities - used to visualize air movement and fine motion direction,
 * not a simulated effect.
 */
export class OpticalFlow {
  private flow: any = null;

  constructor(private readonly cv: OpenCV) {}

  /**
   * Computes the flow field from prev -> next (both CV_8UC1) and writes it
   * into an internal CV_32FC2 Mat, downscaled for performance.
   */
  public compute(prev: any, next: any, sensitivity: number): any {
    const cv = this.cv;
    if (!this.flow) {
      this.flow = new cv.Mat();
    }
    // Finer pyramid scale / more iterations at higher sensitivity to catch
    // subtler real displacements, at a moderate performance cost.
    const levels = 2;
    const winSize = sensitivity > 0.6 ? 11 : 15;
    const iterations = sensitivity > 0.6 ? 3 : 2;
    cv.calcOpticalFlowFarneback(prev, next, this.flow, 0.5, levels, winSize, iterations, 5, 1.2, 0);
    return this.flow;
  }

  /**
   * Converts the 2-channel flow field into an HSV-encoded visualization
   * (angle -> hue, magnitude -> value) then to BGR, matching how optical
   * flow is conventionally displayed.
   */
  public toVisualization(flow: any, dst: any, strength: number): void {
    const cv = this.cv;
    const channels = new cv.MatVector();
    cv.split(flow, channels);
    const fx = channels.get(0);
    const fy = channels.get(1);

    const magnitude = new cv.Mat();
    const angle = new cv.Mat();
    cv.cartToPolar(fx, fy, magnitude, angle, true);

    const hsv = new cv.Mat(flow.rows, flow.cols, cv.CV_8UC3);
    const hue = new cv.Mat();
    const sat = new cv.Mat(flow.rows, flow.cols, cv.CV_8UC1, new cv.Scalar(255));
    const val = new cv.Mat();

    // hue channel: angle (0..360) mapped to 0..180 (OpenCV hue range)
    angle.convertTo(hue, cv.CV_8UC1, 0.5, 0);

    // value channel: magnitude normalized and amplified by strength
    const amplification = 4 + strength * 20;
    const scaledMag = new cv.Mat();
    magnitude.convertTo(scaledMag, cv.CV_8UC1, amplification, 0);
    val.delete();
    const clippedVal = scaledMag;

    const merged = new cv.MatVector();
    merged.push_back(hue);
    merged.push_back(sat);
    merged.push_back(clippedVal);
    cv.merge(merged, hsv);
    cv.cvtColor(hsv, dst, cv.COLOR_HSV2BGR);

    fx.delete();
    fy.delete();
    magnitude.delete();
    angle.delete();
    hue.delete();
    sat.delete();
    clippedVal.delete();
    hsv.delete();
    channels.delete();
    merged.delete();
  }

  public dispose(): void {
    if (this.flow) {
      this.flow.delete();
      this.flow = null;
    }
  }
}
