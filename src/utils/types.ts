/**
 * Shared type definitions for AirVision AI.
 */

/** Available visualization / processing modes. */
export enum CameraMode {
  Normal = "normal",
  AirFlow = "airflow",
  Breath = "breath",
  MotionDiff = "motiondiff",
  EdgeVision = "edgevision",
  Scientific = "scientific"
}

export interface ModeDescriptor {
  id: CameraMode;
  label: string;
  description: string;
}

/** User-adjustable processing parameters. */
export interface ProcessingSettings {
  /** 0..1, controls how small a captured change must be to be shown (lower = more sensitive). */
  sensitivity: number;
  /** 0..1, controls the magnitude of amplification / contrast applied to detected changes. */
  strength: number;
}

/** Facing mode for camera selection. */
export type FacingMode = "user" | "environment";

/** Runtime performance sample used for adaptive quality and FPS display. */
export interface PerformanceSample {
  fps: number;
  frameTimeMs: number;
}

/** Application-level error categories surfaced to the UI layer. */
export enum AppErrorType {
  CameraPermissionDenied = "camera_permission_denied",
  CameraNotFound = "camera_not_found",
  UnsupportedBrowser = "unsupported_browser",
  OpenCvLoadFailed = "opencv_load_failed",
  LowPerformance = "low_performance",
  Generic = "generic"
}

export class AppError extends Error {
  public readonly type: AppErrorType;
  constructor(type: AppErrorType, message: string) {
    super(message);
    this.type = type;
    this.name = "AppError";
  }
}

/** Minimal structural typing for the parts of OpenCV.js used in this project. */
export interface CVMat {
  delete(): void;
  clone(): CVMat;
  cols: number;
  rows: number;
  data: Uint8Array;
  data32F: Float32Array;
  channels(): number;
}

/**
 * OpenCV.js exposes a large, loosely-typed global `cv` object generated from
 * the C++ bindings. We intentionally type it as `any` at the boundary and
 * wrap every call site inside dedicated modules, so the rest of the codebase
 * never touches `any` directly.
 */
export type OpenCV = any;

declare global {
  interface Window {
    cv: OpenCV;
  }
}
