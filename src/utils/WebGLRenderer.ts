import { CameraMode } from "./types";

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}`;

// Fragment shader: takes a single-channel (or RGB) processed frame and applies
// GPU-accelerated contrast shaping + a perceptual false-color map. All color
// mapping here is a deterministic function of the pixel intensity that was
// already computed by the CPU/WASM (OpenCV.js) processing stage - no synthetic
// data is introduced, only visualization of real captured intensity values.
const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_frame;
uniform float u_sensitivity; // 0..1  - lowers the threshold needed to show a change
uniform float u_strength;    // 0..1  - contrast / amplification curve steepness
uniform int u_mode;          // CameraMode as integer
uniform int u_colorize;      // 0 = grayscale passthrough, 1 = false color
uniform int u_passthrough;   // 1 = output the source texture's RGB unmodified

// Smooth polynomial approximation of a perceptually ordered "inferno-like"
// colormap, evaluated purely from the input intensity value.
vec3 falseColor(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.02, 0.02, 0.10);
  vec3 c1 = vec3(0.35, 0.02, 0.45);
  vec3 c2 = vec3(0.80, 0.15, 0.25);
  vec3 c3 = vec3(0.98, 0.55, 0.05);
  vec3 c4 = vec3(1.00, 0.98, 0.65);
  float s = t * 4.0;
  if (s < 1.0) return mix(c0, c1, s);
  if (s < 2.0) return mix(c1, c2, s - 1.0);
  if (s < 3.0) return mix(c2, c3, s - 2.0);
  return mix(c3, c4, s - 3.0);
}

vec3 airFlowColor(float t) {
  // cooler-to-warmer ramp emphasizing small deviations around mid-gray,
  // used for air / breath disturbance visualization.
  t = clamp(t, 0.0, 1.0);
  vec3 low = vec3(0.05, 0.25, 0.55);
  vec3 mid = vec3(0.05, 0.05, 0.05);
  vec3 high = vec3(0.90, 0.20, 0.10);
  if (t < 0.5) return mix(low, mid, t * 2.0);
  return mix(mid, high, (t - 0.5) * 2.0);
}

void main() {
  vec4 src = texture(u_frame, v_texCoord);

  if (u_passthrough == 1) {
    outColor = vec4(src.rgb, 1.0);
    return;
  }

  float intensity = src.r; // processing stages output intensity in the red channel

  // Sensitivity narrows the effective input range around the mid-point,
  // so smaller real captured deviations become visible.
  float lowerCut = u_sensitivity * 0.45;
  float range = max(1.0 - lowerCut * 2.0, 0.02);
  float shaped = (intensity - lowerCut) / range;
  shaped = clamp(shaped, 0.0, 1.0);

  // Strength drives an S-curve (smoothstep family) contrast boost so that
  // amplified regions stand out without clipping the whole frame.
  float k = mix(0.5, 4.0, u_strength);
  float curved = pow(shaped, 1.0 / max(k, 0.1));

  vec3 color;
  if (u_colorize == 0) {
    color = vec3(curved);
  } else if (u_mode == ${enumIndex(CameraMode.AirFlow)} || u_mode == ${enumIndex(CameraMode.Breath)}) {
    color = airFlowColor(curved);
  } else {
    color = falseColor(curved);
  }

  outColor = vec4(color, 1.0);
}`;

function enumIndex(mode: CameraMode): number {
  return Object.values(CameraMode).indexOf(mode);
}

export interface RenderParams {
  sensitivity: number;
  strength: number;
  mode: CameraMode;
  colorize: boolean;
}

/**
 * Thin WebGL2 wrapper responsible only for GPU-side visualization
 * (colorization + contrast shaping) of frames already produced by the
 * OpenCV.js processing pipeline. Keeping this stage on the GPU lets
 * sensitivity/strength sliders update instantly without re-running CPU
 * vision algorithms.
 */
export class WebGLRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly texture: WebGLTexture;
  private readonly uniforms: Record<string, WebGLUniformLocation | null>;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      depth: false,
      alpha: false,
      preserveDrawingBuffer: true
    });
    if (!gl) {
      throw new Error("WebGL2 is not supported on this device/browser.");
    }
    this.gl = gl;
    this.program = this.buildProgram();
    this.texture = this.createTexture();
    this.uniforms = {
      u_frame: gl.getUniformLocation(this.program, "u_frame"),
      u_sensitivity: gl.getUniformLocation(this.program, "u_sensitivity"),
      u_strength: gl.getUniformLocation(this.program, "u_strength"),
      u_mode: gl.getUniformLocation(this.program, "u_mode"),
      u_colorize: gl.getUniformLocation(this.program, "u_colorize"),
      u_passthrough: gl.getUniformLocation(this.program, "u_passthrough")
    };
    this.setupGeometry();
  }

  private buildProgram(): WebGLProgram {
    const gl = this.gl;
    const vs = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!program) throw new Error("Failed to create WebGL program.");
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      throw new Error(`WebGL program link error: ${info}`);
    }
    return program;
  }

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Failed to create shader.");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`WebGL shader compile error: ${info}`);
    }
    return shader;
  }

  private setupGeometry(): void {
    const gl = this.gl;
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const texCoords = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]);

    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(this.program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const texBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
    const texLoc = gl.getAttribLocation(this.program, "a_texCoord");
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);
  }

  private createTexture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture();
    if (!tex) throw new Error("Failed to create WebGL texture.");
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  /**
   * Uploads a single-channel intensity buffer (Uint8ClampedArray) produced by
   * the CV pipeline and renders it to the canvas with GPU-side colorization.
   */
  public renderGray(data: Uint8ClampedArray, width: number, height: number, params: RenderParams): void {
    const gl = this.gl;

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // Expand single channel into RGBA (R channel carries intensity) for
    // straightforward texture upload without extra format extensions.
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const v = data[i];
      rgba[i * 4] = v;
      rgba[i * 4 + 1] = v;
      rgba[i * 4 + 2] = v;
      rgba[i * 4 + 3] = 255;
    }

    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);

    gl.uniform1i(this.uniforms.u_frame, 0);
    gl.uniform1f(this.uniforms.u_sensitivity, params.sensitivity);
    gl.uniform1f(this.uniforms.u_strength, params.strength);
    gl.uniform1i(this.uniforms.u_mode, Object.values(CameraMode).indexOf(params.mode));
    gl.uniform1i(this.uniforms.u_colorize, params.colorize ? 1 : 0);
    gl.uniform1i(this.uniforms.u_passthrough, 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Uploads and draws an already-4-channel RGBA buffer unmodified (used for CV outputs that are already colored, e.g. optical flow / scientific composite). */
  public renderRGBA(data: Uint8ClampedArray, width: number, height: number): void {
    const gl = this.gl;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.uniform1i(this.uniforms.u_frame, 0);
    gl.uniform1i(this.uniforms.u_passthrough, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Uploads the current video frame directly to the GPU (fastest path, used for Normal mode - no CPU pixel processing involved). */
  public renderVideoFrame(video: HTMLVideoElement): void {
    const gl = this.gl;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width === 0 || height === 0) return;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.uniform1i(this.uniforms.u_frame, 0);
    gl.uniform1i(this.uniforms.u_passthrough, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  public dispose(): void {
    const gl = this.gl;
    gl.deleteTexture(this.texture);
    gl.deleteProgram(this.program);
  }
}
