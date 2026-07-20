/**
 * Handles saving still screenshots and recording video directly from the
 * visible output canvas, so recordings always match exactly what the user
 * sees (including the active processing mode).
 */
export class Recorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private recording = false;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  public get isRecording(): boolean {
    return this.recording;
  }

  public screenshot(filenamePrefix = "airvision"): void {
    this.canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      this.triggerDownload(url, `${filenamePrefix}-${this.timestamp()}.png`);
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  public startRecording(filenamePrefix = "airvision"): void {
    if (this.recording) return;
    const stream = this.canvas.captureStream(30);
    const mimeType = this.pickSupportedMimeType();
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: mimeType || "video/webm" });
      const url = URL.createObjectURL(blob);
      const ext = (mimeType || "video/webm").includes("mp4") ? "mp4" : "webm";
      this.triggerDownload(url, `${filenamePrefix}-${this.timestamp()}.${ext}`);
      URL.revokeObjectURL(url);
      this.chunks = [];
    };

    this.mediaRecorder.start();
    this.recording = true;
  }

  public stopRecording(): void {
    if (!this.recording || !this.mediaRecorder) return;
    this.mediaRecorder.stop();
    this.recording = false;
  }

  private pickSupportedMimeType(): string | null {
    const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
    for (const type of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(type)) {
        return type;
      }
    }
    return null;
  }

  private triggerDownload(url: string, filename: string): void {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  private timestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, "-");
  }
}
