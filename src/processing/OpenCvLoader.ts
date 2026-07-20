import { AppError, AppErrorType, type OpenCV } from "../utils/types";

/**
 * OpenCV.js is loaded from a <script> tag in index.html (see the WASM
 * runtime notes in README.md). This module simply waits for the global
 * `cv` object to finish initializing its WebAssembly runtime and surfaces a
 * clear, typed error if loading fails or times out.
 */
export function waitForOpenCV(timeoutMs = 20000): Promise<OpenCV> {
  return new Promise((resolve, reject) => {
    const start = performance.now();

    const check = () => {
      const cv = (window as any).cv;
      if (cv && (cv.Mat || cv.getBuildInformation)) {
        resolve(cv);
        return;
      }
      if (cv && typeof cv.then === "function") {
        // Some OpenCV.js builds expose a promise-like Module.
        cv.then((resolved: OpenCV) => resolve(resolved)).catch(() => {
          reject(
            new AppError(AppErrorType.OpenCvLoadFailed, "OpenCV.js failed to initialize its WebAssembly runtime.")
          );
        });
        return;
      }
      if (performance.now() - start > timeoutMs) {
        reject(
          new AppError(
            AppErrorType.OpenCvLoadFailed,
            "OpenCV.js did not load in time. Check your network connection and reload the page."
          )
        );
        return;
      }
      window.setTimeout(check, 50);
    };

    if ((window as any).cv && (window as any).cv.onRuntimeInitialized !== undefined) {
      (window as any).cv.onRuntimeInitialized = () => resolve((window as any).cv);
      window.setTimeout(check, 50);
    } else {
      check();
    }
  });
}
