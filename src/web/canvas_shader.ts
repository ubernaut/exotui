// Copyright 2023 Im-Beast. MIT license.

// Ghostty-style post-processing for the browser presenter. Ghostty applies
// Shadertoy-compatible GLSL over the terminal's frame; a real terminal user
// gets that from their emulator, and this gives the web build the same look:
// the cell canvas becomes a texture, a fragment shader becomes the screen.
// Shaders stack — any subset of the catalog runs as a multi-pass chain in
// catalog order, each pass sampling the previous pass's output — and each
// shader exposes its knobs as uniforms. The overlay canvas takes no pointer
// events, so input mapping is untouched.

/** One tunable knob a shader exposes; becomes the uniform `u_<key>`. */
export interface CanvasShaderOption {
  readonly key: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** The default; live values belong to the layer, not the definition. */
  readonly value: number;
}

/** One post shader: a Shadertoy-style mainImage body over iChannel0. */
export interface CanvasShaderDefinition {
  readonly id: string;
  readonly label: string;
  /** GLSL ES 3.00 body of mainImage(out vec4 fragColor, in vec2 fragCoord). */
  readonly body: string;
  readonly options?: readonly CanvasShaderOption[];
}

/** The built-in catalog, in the spirit of ghostty's shader packs. */
export const CANVAS_SHADERS: readonly CanvasShaderDefinition[] = [
  {
    id: "crt",
    label: "crt — curvature, vignette, fringe",
    options: [
      { key: "curve", label: "curvature", min: 0, max: 0.25, step: 0.02, value: 0.04 },
      { key: "vignette", label: "vignette", min: 0, max: 0.8, step: 0.05, value: 0.25 },
      { key: "fringe", label: "chroma fringe", min: 0, max: 0.004, step: 0.0004, value: 0.0004 },
    ],
    body: `
      vec2 uv = fragCoord / iResolution.xy;
      vec2 centered = uv * 2.0 - 1.0;
      // Tangent at the edge midpoints (r = 1): distortion vanishes there, so
      // the picture stays flush with its container where the eye lines up
      // rows, and only the corners pull in.
      centered *= 1.0 + u_curve * (1.0 + 1.2 * iMagnet) * (dot(centered, centered) - 1.0);
      uv = (centered + 1.0) * 0.5;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }
      vec3 color = sampleChannel(uv).rgb;
      float dim = 1.0 - u_vignette * pow(length(centered), 3.0);
      color *= dim;
      float fringe = u_fringe * (1.0 + 5.0 * iMagnet);
      color.r = sampleChannel(uv + vec2(fringe, 0.0)).r * dim;
      color.b = sampleChannel(uv - vec2(fringe, 0.0)).b * dim;
      fragColor = vec4(color, 1.0);
    `,
  },
  {
    id: "phosphor",
    label: "phosphor — glow and persistence",
    options: [
      { key: "glow", label: "glow", min: 0, max: 2, step: 0.15, value: 0.9 },
    ],
    body: `
      vec2 uv = fragCoord / iResolution.xy;
      vec3 color = sampleChannel(uv).rgb;
      vec3 glow = vec3(0.0);
      for (int x = -2; x <= 2; x++) {
        for (int y = -2; y <= 2; y++) {
          glow += sampleChannel(uv + vec2(float(x), float(y)) / iResolution.xy * 1.6).rgb;
        }
      }
      glow /= 25.0;
      color = color + glow * glow * u_glow * (1.0 + 0.8 * iMagnet);
      color *= vec3(0.94, 1.03, 0.96);
      fragColor = vec4(color, 1.0);
    `,
  },
  {
    id: "scanlines",
    label: "scanlines — the raster's lines",
    options: [
      { key: "strength", label: "strength", min: 0, max: 0.5, step: 0.04, value: 0.14 },
      { key: "period", label: "spacing", min: 2, max: 6, step: 1, value: 3 },
    ],
    body: `
      vec2 uv = fragCoord / iResolution.xy;
      vec3 color = sampleChannel(uv).rgb;
      float line = mod(fragCoord.y, u_period) < 1.0 ? 1.0 - u_strength * (1.0 + 0.8 * iMagnet) : 1.0;
      fragColor = vec4(color * line, 1.0);
    `,
  },
  // The Trinitron pass. Enabled, the tube magnetizes: iMagnet creeps from 0
  // toward 1 at the drift rate, warping this pass and amplifying every other
  // enabled shader. The degauss button thumps — a settling wobble and colour
  // blotch — and resets the field to near zero, to creep again.
  {
    id: "degauss",
    label: "degauss — the coil magnetizes",
    options: [
      { key: "rate", label: "drift rate", min: 0.2, max: 5, step: 0.2, value: 1 },
    ],
    body: `
      vec2 uv = fragCoord / iResolution.xy;
      float settle = exp(-2.6 * iThump);
      float wob = sin(iThump * 34.0 - uv.y * 9.0) * settle;
      vec2 centered = uv - 0.5;
      float radius = length(centered);
      float angle = wob * 0.10 * radius + iMagnet * 0.05 * sin(iTime * 0.4) * radius;
      mat2 rotate = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
      vec2 sheared = centered + vec2(iMagnet * 0.008 * sin(uv.y * 21.0 + iTime * 0.7), 0.0);
      vec2 shoved = clamp(0.5 + rotate * sheared * (1.0 + wob * 0.05), 0.0, 1.0);
      float fringe = settle * 0.010 * (0.3 + radius) + iMagnet * 0.004 * radius;
      vec3 color;
      color.r = sampleChannel(clamp(shoved + vec2(fringe * (0.4 + 0.6 * sin(iThump * 40.0)), 0.0), 0.0, 1.0)).r;
      color.g = sampleChannel(shoved).g;
      color.b = sampleChannel(clamp(shoved - vec2(fringe * (0.4 + 0.6 * sin(iThump * 47.0 + 1.0)), 0.0), 0.0, 1.0)).b;
      // The magnetized tube loses colour purity at the corners — the classic
      // green/purple stains, breathing slowly, gone the moment you degauss.
      float stain = iMagnet * smoothstep(0.32, 0.72, radius);
      float theta = atan(centered.y, centered.x) * 2.0 + iTime * 0.05;
      color *= 1.0 + stain * 0.45 * vec3(sin(theta), sin(theta + 2.1), sin(theta + 4.2));
      float sweep = 6.0 * radius - iThump * 20.0;
      color += 0.22 * settle * settle * vec3(sin(sweep), sin(sweep + 2.1), sin(sweep + 4.2));
      fragColor = vec4(color, 1.0);
    `,
  },
];

const VERTEX = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

function fragmentSource(definition: CanvasShaderDefinition): string {
  const uniforms = (definition.options ?? [])
    .map((option) => `uniform float u_${option.key};`)
    .join("\n");
  return `#version 300 es
precision highp float;
uniform sampler2D iChannel0;
uniform vec2 iResolution;
uniform float iTime;
uniform float iFlip;
uniform float iMagnet;
uniform float iThump;
${uniforms}
out vec4 outColor;
vec4 sampleChannel(vec2 uv) {
  return texture(iChannel0, iFlip > 0.5 ? vec2(uv.x, 1.0 - uv.y) : uv);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
${definition.body}
}
void main() {
  mainImage(outColor, gl_FragCoord.xy);
}
`;
}

interface CompiledPass {
  readonly program: WebGLProgram;
  readonly uniforms: Map<string, WebGLUniformLocation | null>;
}

/** Controls the shader overlay a presenter mounts over its cell canvas. */
export interface CanvasShaderLayer {
  list(): readonly CanvasShaderDefinition[];
  /** The enabled subset, in catalog (= pass) order. */
  enabled(): readonly string[];
  toggle(id: string): void;
  setEnabled(ids: readonly string[]): void;
  /** The live value of one shader's knob. */
  option(id: string, key: string): number | undefined;
  setOption(id: string, key: string, value: number): void;
  /** The Trinitron thump: a one-shot settling wobble over whatever is on. */
  degauss(): void;
  /**
   * Maps a viewed position to the source position shown there, both in
   * [0,1]² of the canvas — the same forward mapping the CRT pass samples
   * with, so pointer input aims at what the eye sees, not the flat frame.
   * Identity while nothing displaces the picture.
   */
  warpPoint(u: number, v: number): { u: number; v: number };
  dispose(): void;
}

/**
 * Mounts the overlay canvas and the render loop. An empty enabled set hides
 * the overlay entirely; anything else samples the source canvas every frame
 * and runs each enabled shader as one pass, ping-ponging between textures.
 */
export function createCanvasShaderLayer(
  root: HTMLElement,
  source: HTMLCanvasElement,
): CanvasShaderLayer {
  const overlay = document.createElement("canvas");
  overlay.style.position = "absolute";
  overlay.style.inset = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.pointerEvents = "none";
  overlay.style.display = "none";
  if (getComputedStyle(root).position === "static") root.style.position = "relative";
  root.appendChild(overlay);

  let gl: WebGL2RenderingContext | null = null;
  let sourceTexture: WebGLTexture | null = null;
  const passes = new Map<string, CompiledPass>();
  const pingPong: Array<{ texture: WebGLTexture; framebuffer: WebGLFramebuffer }> = [];
  let pingPongSize = "";
  const active = new Set<string>();
  const values = new Map<string, Map<string, number>>();
  for (const definition of CANVAS_SHADERS) {
    values.set(definition.id, new Map((definition.options ?? []).map((option) => [option.key, option.value])));
  }
  let raf = 0;
  let degaussStarted = -Infinity;
  let magnetism = 0;
  let magnetClock = 0;
  const DEGAUSS_SECONDS = 1.3;
  const started: number = performance.now();

  const stop = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    overlay.style.display = "none";
    source.style.visibility = "visible";
  };

  const makeTexture = (context: WebGL2RenderingContext): WebGLTexture => {
    const texture = context.createTexture()!;
    context.bindTexture(context.TEXTURE_2D, texture);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
    return texture;
  };

  const ensureContext = (): WebGL2RenderingContext | null => {
    if (gl) return gl;
    gl = overlay.getContext("webgl2");
    if (!gl) return null;
    const context = gl;
    const buffer = context.createBuffer();
    context.bindBuffer(context.ARRAY_BUFFER, buffer);
    context.bufferData(context.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), context.STATIC_DRAW);
    sourceTexture = makeTexture(context);
    return context;
  };

  const compile = (definition: CanvasShaderDefinition): CompiledPass | undefined => {
    const cached = passes.get(definition.id);
    if (cached) return cached;
    const context = ensureContext();
    if (!context) return undefined;
    const make = (kind: number, text: string): WebGLShader | null => {
      const shader = context.createShader(kind);
      if (!shader) return null;
      context.shaderSource(shader, text);
      context.compileShader(shader);
      return context.getShaderParameter(shader, context.COMPILE_STATUS) ? shader : null;
    };
    const vertex = make(context.VERTEX_SHADER, VERTEX);
    const fragment = make(context.FRAGMENT_SHADER, fragmentSource(definition));
    if (!vertex || !fragment) return undefined;
    const program = context.createProgram();
    if (!program) return undefined;
    context.attachShader(program, vertex);
    context.attachShader(program, fragment);
    context.linkProgram(program);
    if (!context.getProgramParameter(program, context.LINK_STATUS)) return undefined;
    const position = context.getAttribLocation(program, "position");
    context.enableVertexAttribArray(position);
    context.vertexAttribPointer(position, 2, context.FLOAT, false, 0, 0);
    const uniforms = new Map<string, WebGLUniformLocation | null>();
    for (const name of ["iChannel0", "iResolution", "iTime", "iFlip", "iMagnet", "iThump"]) {
      uniforms.set(name, context.getUniformLocation(program, name));
    }
    for (const option of definition.options ?? []) {
      uniforms.set(`u_${option.key}`, context.getUniformLocation(program, `u_${option.key}`));
    }
    const pass = { program, uniforms };
    passes.set(definition.id, pass);
    return pass;
  };

  const ensurePingPong = (context: WebGL2RenderingContext, width: number, height: number): void => {
    const key = `${width}x${height}`;
    if (pingPongSize === key && pingPong.length === 2) return;
    pingPongSize = key;
    while (pingPong.length < 2) {
      pingPong.push({ texture: makeTexture(context), framebuffer: context.createFramebuffer()! });
    }
    for (const target of pingPong) {
      context.bindTexture(context.TEXTURE_2D, target.texture);
      context.texImage2D(
        context.TEXTURE_2D,
        0,
        context.RGBA,
        width,
        height,
        0,
        context.RGBA,
        context.UNSIGNED_BYTE,
        null,
      );
      context.bindFramebuffer(context.FRAMEBUFFER, target.framebuffer);
      context.framebufferTexture2D(
        context.FRAMEBUFFER,
        context.COLOR_ATTACHMENT0,
        context.TEXTURE_2D,
        target.texture,
        0,
      );
    }
    context.bindFramebuffer(context.FRAMEBUFFER, null);
  };

  const chain = (): CanvasShaderDefinition[] =>
    CANVAS_SHADERS.filter((definition) => active.has(definition.id) && compile(definition) !== undefined);

  const frame = (): void => {
    const definitions = chain();
    const now = performance.now();
    const thumpAge = (now - degaussStarted) / 1000;
    // The field creeps while degauss is enabled — full magnetization in a
    // minute at drift rate 1 — and only the thump winds it back.
    const elapsed = magnetClock ? Math.min(0.25, (now - magnetClock) / 1000) : 0;
    magnetClock = now;
    if (active.has("degauss")) {
      const rate = values.get("degauss")?.get("rate") ?? 1;
      magnetism = Math.min(1, magnetism + elapsed * rate / 60);
    }
    if (definitions.length === 0) {
      if (thumpAge >= DEGAUSS_SECONDS) {
        // The thump has settled and nothing is on: back to the raw canvas.
        stop();
        return;
      }
      // The button works with nothing enabled: the thump alone, field zero.
      const transient = CANVAS_SHADERS.find((definition) => definition.id === "degauss");
      if (transient && compile(transient)) definitions.push(transient);
    }
    if (!gl || definitions.length === 0) return;
    const context = gl;
    if (overlay.width !== source.width || overlay.height !== source.height) {
      overlay.width = source.width;
      overlay.height = source.height;
    }
    context.viewport(0, 0, overlay.width, overlay.height);
    ensurePingPong(context, overlay.width, overlay.height);
    context.activeTexture(context.TEXTURE0);
    context.bindTexture(context.TEXTURE_2D, sourceTexture);
    try {
      context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, context.RGBA, context.UNSIGNED_BYTE, source);
    } catch {
      // A zero-sized canvas mid-resize; skip the frame.
      raf = requestAnimationFrame(frame);
      return;
    }
    const time = (performance.now() - started) / 1000;
    let input = sourceTexture!;
    for (let index = 0; index < definitions.length; index += 1) {
      const definition = definitions[index]!;
      const pass = passes.get(definition.id)!;
      const last = index === definitions.length - 1;
      const target = last ? null : pingPong[index % 2]!;
      context.bindFramebuffer(context.FRAMEBUFFER, target ? target.framebuffer : null);
      context.useProgram(pass.program);
      context.bindTexture(context.TEXTURE_2D, input);
      context.uniform2f(pass.uniforms.get("iResolution") ?? null, overlay.width, overlay.height);
      context.uniform1f(pass.uniforms.get("iTime") ?? null, time);
      context.uniform1i(pass.uniforms.get("iChannel0") ?? null, 0);
      // The source canvas texture has row 0 at the top; a pass's own output
      // lands with row 0 at the bottom. Only the first pass flips.
      context.uniform1f(pass.uniforms.get("iFlip") ?? null, index === 0 ? 1 : 0);
      context.uniform1f(pass.uniforms.get("iMagnet") ?? null, magnetism);
      context.uniform1f(pass.uniforms.get("iThump") ?? null, Math.min(thumpAge, 60));
      const tuning = values.get(definition.id);
      for (const option of definition.options ?? []) {
        context.uniform1f(pass.uniforms.get(`u_${option.key}`) ?? null, tuning?.get(option.key) ?? option.value);
      }
      context.drawArrays(context.TRIANGLES, 0, 3);
      if (target) input = target.texture;
    }
    raf = requestAnimationFrame(frame);
  };

  const apply = (): void => {
    if (chain().length === 0) {
      active.clear();
      stop();
      return;
    }
    overlay.style.display = "block";
    // The raw canvas hides beneath the processed frame, but keeps painting
    // and keeps receiving input — only its pixels are superseded.
    source.style.visibility = "hidden";
    if (!raf) raf = requestAnimationFrame(frame);
  };

  return {
    list: () => CANVAS_SHADERS,
    enabled: () => CANVAS_SHADERS.filter((definition) => active.has(definition.id)).map((definition) => definition.id),
    toggle(id: string) {
      if (active.has(id)) active.delete(id);
      else if (CANVAS_SHADERS.some((definition) => definition.id === id)) active.add(id);
      apply();
    },
    setEnabled(ids: readonly string[]) {
      active.clear();
      for (const id of ids) {
        if (CANVAS_SHADERS.some((definition) => definition.id === id)) active.add(id);
      }
      apply();
    },
    option: (id: string, key: string) => values.get(id)?.get(key),
    warpPoint(u: number, v: number): { u: number; v: number } {
      const curve = values.get("crt")?.get("curve") ?? 0;
      if (!raf || !active.has("crt") || curve === 0) return { u, v };
      const strength = curve * (1 + 1.2 * magnetism);
      const x = u * 2 - 1;
      const y = v * 2 - 1;
      const factor = 1 + strength * (x * x + y * y - 1);
      return { u: (x * factor + 1) / 2, v: (y * factor + 1) / 2 };
    },
    degauss() {
      const definition = CANVAS_SHADERS.find((candidate) => candidate.id === "degauss");
      if (!definition || !compile(definition)) return;
      degaussStarted = performance.now();
      magnetism = 0.02;
      overlay.style.display = "block";
      source.style.visibility = "hidden";
      if (!raf) raf = requestAnimationFrame(frame);
    },
    setOption(id: string, key: string, value: number) {
      const definition = CANVAS_SHADERS.find((candidate) => candidate.id === id);
      const option = definition?.options?.find((candidate) => candidate.key === key);
      if (!option) return;
      values.get(id)?.set(key, Math.min(option.max, Math.max(option.min, value)));
    },
    dispose() {
      stop();
      overlay.remove();
    },
  };
}
