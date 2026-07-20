import { CameraMode, type OpenCV, type ProcessingSettings } from "../utils/types";
import { NoiseReduction } from "../filters/NoiseReduction";
import { ContrastEnhancement } from "../filters/ContrastEnhancement";
import { FrameDifference } from "../filters/FrameDifference";
import { TemporalFilter } from "../filters/TemporalFilter";
import { EdgeDetection } from "../filters/EdgeDetection";
import { FalseColor } from "../filters/FalseColor";
import { OpticalFlow } from "./OpticalFlow";
import { MotionAmplification } from "./MotionAmplification";

export type ProcessedOutput =
  | { kind: "rgba"; data: Uint8ClampedArray; width: number; height: number }
  | { kind: "gray"; data: Uint8ClampedArray; width: number; height: number; colorize: boolean };

export interface FrameStats {
  meanIntensity: number;
  maxIntensity: number;
  minIntensity: number;
  changedPixelRatio: number;
}

/**
 * Central computer-vision pipeline. Owns all persistent OpenCV Mats and
 * routes each incoming frame through the filters/algorithms appropriate to
 * the active CameraMode. All processing operates exclusively on real pixel
 * data captured from the RGB camera sensor - no synthetic values are ever
 * introduced.
 */
export class FrameProcessor {
  private readonly cv: OpenCV;
  private width = 0;
  private height = 0;

  // Persistent Mats, allocated once per resolution and reused every frame to
  // avoid WASM heap churn (critical for sustained mobile performance).
  private srcRGBA: any = null;
  private gray: any = null;
  private prevGray: any = null;
  private scratch8u1: any = null;
  private scratch8u1b: any = null;
  private scratch8u3: any = null;

  private readonly noiseReduction: NoiseReduction;
  private readonly contrast: ContrastEnhancement;
  private readonly frameDiff: FrameDifference;
  private readonly temporalFilter: TemporalFilter;
  private readonly edgeDetection: EdgeDetection;
  private readonly falseColor: FalseColor;
  private readonly opticalFlow: OpticalFlow;
  private readonly motionAmplification: MotionAmplification;

  constructor(cv: OpenCV) {
    this.cv = cv;
    this.noiseReduction = new NoiseReduction(cv);
    this.contrast = new ContrastEnhancement(cv);
    this.frameDiff = new FrameDifference(cv);
    this.temporalFilter = new TemporalFilter(cv);
    this.edgeDetection = new EdgeDetection(cv);
    this.falseColor = new FalseColor(cv);
    this.opticalFlow = new OpticalFlow(cv);
    this.motionAmplification = new MotionAmplification(cv);
  }

  private ensureBuffers(width: number, height: number): void {
    if (this.width === width && this.height === height && this.srcRGBA) {
      return;
    }
    this.disposeBuffers();
    const cv = this.cv;
    this.width = width;
    this.height = height;
    this.srcRGBA = new cv.Mat(height, width, cv.CV_8UC4);
    this.gray = new cv.Mat(height, width, cv.CV_8UC1);
    this.prevGray = new cv.Mat(height, width, cv.CV_8UC1);
    this.scratch8u1 = new cv.Mat(height, width, cv.CV_8UC1);
    this.scratch8u1b = new cv.Mat(height, width, cv.CV_8UC1);
    this.scratch8u3 = new cv.Mat(height, width, cv.CV_8UC3);
    this.temporalFilter.reset();
    this.motionAmplification.reset();
  }

  private disposeBuffers(): void {
    for (const mat of [this.srcRGBA, this.gray, this.prevGray, this.scratch8u1, this.scratch8u1b, this.scratch8u3]) {
      if (mat) mat.delete();
    }
    this.srcRGBA = null;
    this.gray = null;
    this.prevGray = null;
    this.scratch8u1 = null;
    this.scratch8u1b = null;
    this.scratch8u3 = null;
  }

  /**
   * Processes one ImageData frame (already downscaled to processing
   * resolution by the caller) for the given mode and settings.
   */
  public process(imageData: ImageData, mode: CameraMode, settings: ProcessingSettings): ProcessedOutput {
    const cv = this.cv;
    this.ensureBuffers(imageData.width, imageData.height);

    this.srcRGBA.data.set(imageData.data);
    cv.cvtColor(this.srcRGBA, this.gray, cv.COLOR_RGBA2GRAY);

    // Always denoise lightly before analysis; strength scales the kernel.
    this.noiseReduction.gaussian(this.gray, 0.25 + settings.strength * 0.35);

    let output: ProcessedOutput;

    switch (mode) {
      case CameraMode.AirFlow:
        output = this.processAirFlow(settings);
        break;
      case CameraMode.Breath:
        output = this.processBreath(settings);
        break;
      case CameraMode.MotionDiff:
        output = this.processMotionDiff(settings);
        break;
      case CameraMode.EdgeVision:
        output = this.processEdgeVision(settings);
        break;
      case CameraMode.Scientific:
        output = this.processScientific(settings);
        break;
      case CameraMode.Normal:
      default:
        output = this.toRGBA(this.srcRGBA);
        break;
    }

    this.gray.copyTo(this.prevGray);
    return output;
  }

  private processAirFlow(settings: ProcessingSettings): ProcessedOutput {
    const cv = this.cv;
    const flow = this.opticalFlow.compute(this.prevGray, this.gray, settings.sensitivity);
    this.opticalFlow.toVisualization(flow, this.scratch8u3, settings.strength);
    cv.cvtColor(this.scratch8u3, this.srcRGBA, cv.COLOR_BGR2RGBA);
    return this.toRGBA(this.srcRGBA);
  }

  private processBreath(settings: ProcessingSettings): ProcessedOutput {
    this.temporalFilter.update(this.gray, 0.6, 0.02 + (1 - settings.sensitivity) * 0.05);
    this.temporalFilter.getBandpass(this.scratch8u1);

    const amplificationFactor = 3 + settings.strength * 25;
    this.motionAmplification.amplify(this.scratch8u1, this.scratch8u1b, amplificationFactor, 0.05);

    this.contrast.applyCLAHE(this.scratch8u1b, this.scratch8u1, settings.strength);

    return {
      kind: "gray",
      data: new Uint8ClampedArray(this.scratch8u1.data),
      width: this.width,
      height: this.height,
      colorize: true
    };
  }

  private processMotionDiff(settings: ProcessingSettings): ProcessedOutput {
    this.frameDiff.compute(this.gray, this.prevGray, this.scratch8u1);
    this.frameDiff.threshold(this.scratch8u1, this.scratch8u1b, settings.sensitivity);

    const scale = 1.5 + settings.strength * 4;
    this.contrast.linear(this.scratch8u1b, this.scratch8u1, scale, 0);

    return {
      kind: "gray",
      data: new Uint8ClampedArray(this.scratch8u1.data),
      width: this.width,
      height: this.height,
      colorize: true
    };
  }

  private processEdgeVision(settings: ProcessingSettings): ProcessedOutput {
    this.edgeDetection.canny(this.gray, this.scratch8u1, settings.sensitivity);
    return {
      kind: "gray",
      data: new Uint8ClampedArray(this.scratch8u1.data),
      width: this.width,
      height: this.height,
      colorize: settings.strength > 0
    };
  }

  private processScientific(settings: ProcessingSettings): ProcessedOutput {
    const cv = this.cv;

    // Contrast-enhanced base layer.
    this.contrast.applyCLAHE(this.gray, this.scratch8u1, settings.strength);

    // Structural edge layer.
    this.edgeDetection.canny(this.gray, this.scratch8u1b, settings.sensitivity);

    // Blend edges into the contrast layer to highlight structural + optical change together.
    cv.addWeighted(this.scratch8u1, 0.75, this.scratch8u1b, 0.25, 0, this.scratch8u1);

    this.falseColor.apply(this.scratch8u1, this.scratch8u3, "inferno");
    cv.cvtColor(this.scratch8u3, this.srcRGBA, cv.COLOR_BGR2RGBA);
    return this.toRGBA(this.srcRGBA);
  }

  /** Computes real, camera-derived statistics for the HUD (never fabricated). */
  public computeStats(output: ProcessedOutput): FrameStats {
    let sum = 0;
    let min = 255;
    let max = 0;
    let changed = 0;
    const isGray = output.kind === "gray";
    const stride = isGray ? 1 : 4;
    const total = output.width * output.height;

    for (let i = 0; i < total; i++) {
      const idx = i * stride;
      const v = isGray
        ? output.data[idx]
        : (output.data[idx] + output.data[idx + 1] + output.data[idx + 2]) / 3;
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
      if (v > 25) changed++;
    }

    return {
      meanIntensity: total > 0 ? sum / total : 0,
      minIntensity: min,
      maxIntensity: max,
      changedPixelRatio: total > 0 ? changed / total : 0
    };
  }

  private toRGBA(mat: any): ProcessedOutput {
    return {
      kind: "rgba",
      data: new Uint8ClampedArray(mat.data),
      width: this.width,
      height: this.height
    };
  }

  public dispose(): void {
    this.disposeBuffers();
    this.contrast.dispose();
    this.opticalFlow.dispose();
    this.temporalFilter.dispose();
    this.motionAmplification.dispose();
  }
}
