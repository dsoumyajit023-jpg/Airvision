import type { PerformanceSample } from "./types";

/**
 * Rolling-window FPS / frame-time counter used to drive the on-screen FPS
 * readout and to detect sustained low-performance conditions on weaker
 * mobile devices.
 */
export class FPSCounter {
  private readonly windowSize: number;
  private samples: number[] = [];
  private lastTimestamp: number | null = null;

  constructor(windowSize = 30) {
    this.windowSize = windowSize;
  }

  /** Call once per rendered frame with the current high-resolution timestamp. */
  public tick(now: number = performance.now()): PerformanceSample {
    if (this.lastTimestamp !== null) {
      const delta = now - this.lastTimestamp;
      if (delta > 0) {
        this.samples.push(delta);
        if (this.samples.length > this.windowSize) {
          this.samples.shift();
        }
      }
    }
    this.lastTimestamp = now;
    return this.current();
  }

  public current(): PerformanceSample {
    if (this.samples.length === 0) {
      return { fps: 0, frameTimeMs: 0 };
    }
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    return { fps: avg > 0 ? 1000 / avg : 0, frameTimeMs: avg };
  }

  public reset(): void {
    this.samples = [];
    this.lastTimestamp = null;
  }
}
