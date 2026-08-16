// SPIKE: translates a MilkDrop preset `shader_body` from GLSL to WGSL.
//
// Preset shaders ship already converted from HLSL to GLSL ES 3.0 upstream, and
// the surviving subset is small: declarations, assignments, swizzles, if/else,
// a handful of for loops, and about twenty builtins. This covers that surface.
//
// Two structural differences matter.
//
// Swizzle assignment: GLSL allows `v.xyz = e;`; WGSL only permits assigning a
// single component, so those are expanded into per-component writes through a
// temporary.
//
// Mixed scalar and vector arguments: `clamp(uv, 0.0, 1.0)` is ordinary GLSL,
// where the scalar overloads apply componentwise, and a compile error in WGSL,
// which demands all three arguments share one type. A third of the catalog
// writes it, so expressions carry their WGSL type as they are built and the
// scalars are splatted to match. Types are inferred, not checked — anything
// unrecognised is left alone rather than guessed at.

type Kind = "name" | "number" | "punct" | "end";
interface Token {
  kind: Kind;
  text: string;
  at: number;
}

const PUNCT = [
  "<<=",
  ">>=",
  "&&",
  "||",
  "^^",
  "==",
  "!=",
  "<=",
  ">=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "++",
  "--",
  "<<",
  ">>",
  "(",
  ")",
  "{",
  "}",
  "[",
  "]",
  ",",
  ";",
  "=",
  "+",
  "-",
  "*",
  "/",
  "%",
  "<",
  ">",
  "!",
  "?",
  ":",
  ".",
  "&",
  "|",
  "^",
  "~",
];

function lex(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i += 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const e = src.indexOf("*/", i + 2);
      i = e === -1 ? src.length : e + 2;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const start = i;
      while (i < src.length && /[0-9.]/.test(src[i]!)) i += 1;
      if (/[eE]/.test(src[i] ?? "")) {
        i += 1;
        if (/[+-]/.test(src[i] ?? "")) i += 1;
        while (i < src.length && /[0-9]/.test(src[i]!)) i += 1;
      }
      // GLSL float suffixes have no WGSL equivalent; drop them.
      if (/[fFuU]/.test(src[i] ?? "")) i += 1;
      out.push({ kind: "number", text: src.slice(start, i).replace(/[fFuU]$/, ""), at: start });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const start = i;
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i]!)) i += 1;
      out.push({ kind: "name", text: src.slice(start, i), at: start });
      continue;
    }
    const p = PUNCT.find((cand) => src.startsWith(cand, i));
    if (!p) throw new SyntaxError(`glsl: unexpected ${JSON.stringify(c)} at ${i}`);
    out.push({ kind: "punct", text: p, at: i });
    i += p.length;
  }
  out.push({ kind: "end", text: "", at: src.length });
  return out;
}

const TYPES: Record<string, string> = {
  float: "f32",
  int: "i32",
  uint: "u32",
  bool: "bool",
  vec2: "vec2<f32>",
  vec3: "vec3<f32>",
  vec4: "vec4<f32>",
  ivec2: "vec2<i32>",
  ivec3: "vec3<i32>",
  ivec4: "vec4<i32>",
  bvec2: "vec2<bool>",
  bvec3: "vec3<bool>",
  bvec4: "vec4<bool>",
  mat2: "mat2x2<f32>",
  mat3: "mat3x3<f32>",
  mat4: "mat4x4<f32>",
};

/** Builtins whose GLSL name differs from WGSL's. */
const RENAMED: Record<string, string> = {
  inversesqrt: "inverseSqrt",
  dFdx: "dpdx",
  dFdy: "dpdy",
  fma: "fma",
  atan: "atan", // one-argument form; the two-argument form becomes atan2
};

/** Builtins that pass straight through. */
const PASSTHROUGH = new Set([
  "abs",
  "acos",
  "asin",
  "atan2",
  "ceil",
  "clamp",
  "cos",
  "cosh",
  "cross",
  "degrees",
  "distance",
  "dot",
  "exp",
  "exp2",
  "faceForward",
  "floor",
  "fract",
  "length",
  "log",
  "log2",
  "max",
  "min",
  "mix",
  "normalize",
  "pow",
  "radians",
  "reflect",
  "refract",
  "round",
  "sign",
  "sin",
  "sinh",
  "smoothstep",
  "sqrt",
  "step",
  "tan",
  "tanh",
  "trunc",
  "saturate",
]);

/** Samplers the template exposes; each becomes a texture/sampler pair. */
export const SAMPLERS = [
  "sampler_main",
  "sampler_fc_main",
  "sampler_fw_main",
  "sampler_pc_main",
  "sampler_pw_main",
  "sampler_blur1",
  "sampler_blur2",
  "sampler_blur3",
  "sampler_noise_lq",
  "sampler_noise_lq_lite",
  "sampler_noise_mq",
  "sampler_noise_hq",
  "sampler_pw_noise_lq",
  "sampler_noisevol_lq",
  "sampler_noisevol_hq",
];
const SAMPLER_SET = new Set(SAMPLERS);

/** A translated expression and the WGSL type it evaluates to; `""` when unknown. */
interface Expr {
  readonly code: string;
  readonly type: string;
  /**
   * The same literal spelled as an integer, when it was one in GLSL.
   *
   * Literals are emitted as floats because that is what nearly every position
   * wants, but `int n = 0;`, `n < 5` and `v[1]` all need the integer spelling
   * back, and only the token itself knows it had one.
   */
  readonly integer?: string;
}

/** An expression in the integer spelling WGSL needs for counters and indices. */
function asInt(expr: Expr): string {
  return expr.integer ??
    (element(expr.type) === "i32" || element(expr.type) === "u32" ? expr.code : `i32(${expr.code})`);
}

/** Component count of a WGSL type: 1 for scalars, N for `vecN`, 0 when unknown. */
function width(type: string): number {
  if (type === "f32" || type === "i32" || type === "u32" || type === "bool") return 1;
  const match = /^vec([234])<(.+)>$/.exec(type);
  return match ? Number(match[1]) : 0;
}

/** The component type of a vector, or the type itself when it is scalar. */
function element(type: string): string {
  return /^vec([234])<(.+)>$/.exec(type)?.[2] ?? type;
}

function vector(size: number, of: string): string {
  if (of === "") return "";
  return size <= 1 ? of : `vec${size}<${of}>`;
}

/**
 * Arguments that must share one type in WGSL but may be scalars in GLSL.
 *
 * `mix`'s third argument is absent deliberately: WGSL does overload it for a
 * scalar interpolant, so splatting it would be noise.
 */
const UNIFY: Record<string, readonly number[]> = {
  atan2: [0, 1],
  clamp: [0, 1, 2],
  distance: [0, 1],
  dot: [0, 1],
  max: [0, 1],
  min: [0, 1],
  mix: [0, 1],
  pow: [0, 1],
  reflect: [0, 1],
  smoothstep: [0, 1, 2],
  step: [0, 1],
};

/** Builtins returning a scalar whatever their arguments are. */
const SCALAR_RESULT = new Set(["length", "distance", "dot", "determinant"]);

/** Operators yielding a boolean rather than the type of their operands. */
const COMPARE = new Set(["==", "!=", "<", "<=", ">", ">=", "&&", "||"]);

/** GLSL's vector comparison functions and the WGSL operator each becomes. */
const COMPARISON: Record<string, string> = {
  greaterThan: ">",
  greaterThanEqual: ">=",
  lessThan: "<",
  lessThanEqual: "<=",
  equal: "==",
  notEqual: "!=",
};

/**
 * Types of the names the shader prelude puts in scope.
 *
 * These must stay in step with `shaderPrelude` in `butterchurn_gpu.ts`, which
 * declares them. A name missing here is not an error — it simply translates
 * with an unknown type, which costs the splatting above and nothing else.
 */
const PRELUDE_TYPES: Record<string, string> = (() => {
  const types: Record<string, string> = {
    PI: "f32",
    uv: "vec2<f32>",
    uv_orig: "vec2<f32>",
    vColor: "vec4<f32>",
    resolution: "vec2<f32>",
    hue_shader: "vec3<f32>",
    ret: "vec3<f32>",
    rad: "f32",
    ang: "f32",
  };
  const scalars = [
    "time,fps,frame,decay",
    "bass,mid,treb,vol",
    "bass_att,mid_att,treb_att,vol_att",
    "blur1_min,blur2_min,blur3_min,blur1_max,blur2_max,blur3_max",
    "scale1,scale2,scale3,bias1,bias2,bias3",
  ].join(",").split(",");
  for (const name of scalars) types[name] = "f32";
  const vec4s = [
    "aspect,texsize",
    "texsize_noise_lq,texsize_noise_mq,texsize_noise_hq,texsize_noise_lq_lite",
    "texsize_noisevol_lq,texsize_noisevol_hq",
    "roam_cos,roam_sin,slow_roam_cos,slow_roam_sin",
    "rand_frame,rand_preset",
  ].join(",").split(",");
  for (const name of vec4s) types[name] = "vec4<f32>";
  for (let index = 1; index <= 32; index += 1) types[`q${index}`] = "f32";
  return types;
})();

class Translator {
  #tokens: Token[];
  #i = 0;
  #temp = 0;
  /** Samplers this body actually referenced, so bindings can be minimal. */
  readonly used = new Set<string>();
  /** Samplers the preset declared itself, which need a placeholder texture. */
  readonly custom = new Set<string>();
  /** WGSL type of every name in scope, for the scalar splatting above. */
  readonly #vars = new Map<string, string>(Object.entries(PRELUDE_TYPES));

  constructor(src: string) {
    this.#tokens = lex(src);
  }

  get #tok(): Token {
    return this.#tokens[this.#i]!;
  }

  #take(text: string): boolean {
    if (this.#tok.kind === "punct" && this.#tok.text === text) {
      this.#i += 1;
      return true;
    }
    return false;
  }

  #expect(text: string): void {
    if (!this.#take(text)) throw new SyntaxError(`glsl: expected ${text} near offset ${this.#tok.at}`);
  }

  #peek(text: string): boolean {
    const token = this.#tokens[this.#i]!;
    return token.kind === "punct" && token.text === text;
  }

  #isType(): boolean {
    return this.#tok.kind === "name" && this.#tok.text in TYPES &&
      this.#tokens[this.#i + 1]?.kind === "name";
  }

  /** Translates a whole `shader_body { ... }` into WGSL statements. */
  translateBody(): string {
    // A third of the catalog hoists scratch variables above the body, as
    // `vec3 xlat_mutableneu;` — the GLSL optimizer's doing. They are
    // per-invocation temporaries despite being written at file scope, so they
    // become locals rather than module-scope `var`, which WGSL would require an
    // address space for anyway.
    const hoisted: string[] = [];
    while (this.#tok.kind !== "end" && !(this.#tok.kind === "name" && this.#tok.text === "shader_body")) {
      hoisted.push(this.#statement());
    }
    if (this.#tok.kind === "name" && this.#tok.text === "shader_body") this.#i += 1;
    const statements = this.#take("{") ? this.#block() : this.#statementsUntilEnd();
    return hoisted.length > 0 ? `${hoisted.join("\n")}\n${statements}` : statements;
  }

  #statementsUntilEnd(): string {
    const parts: string[] = [];
    while (this.#tok.kind !== "end") parts.push(this.#statement());
    return parts.join("\n");
  }

  #block(): string {
    const parts: string[] = [];
    while (!this.#take("}")) {
      if (this.#tok.kind === "end") throw new SyntaxError("glsl: unterminated block");
      parts.push(this.#statement());
    }
    return parts.join("\n");
  }

  #statement(): string {
    if (this.#take(";")) return "";
    if (this.#take("{")) return `{\n${this.#block()}\n}`;

    if (this.#tok.kind === "name") {
      const word = this.#tok.text;
      if (word === "if") {
        this.#i += 1;
        this.#expect("(");
        const cond = this.#expression(0).code;
        this.#expect(")");
        const then = this.#statement();
        if (this.#tok.kind === "name" && this.#tok.text === "else") {
          this.#i += 1;
          return `if (${cond}) {\n${then}\n} else {\n${this.#statement()}\n}`;
        }
        return `if (${cond}) {\n${then}\n}`;
      }
      if (word === "for") {
        this.#i += 1;
        this.#expect("(");
        const init = this.#take(";") ? "" : this.#statement();
        const cond = this.#peek(";") ? "true" : this.#expression(0).code;
        this.#expect(";");
        const step = this.#peek(")") ? "" : this.#simpleStatement();
        this.#expect(")");
        return `${init}\nloop {\n  if (!(${cond})) { break; }\n${this.#statement()}\n  ${step}\n}`;
      }
      if (word === "while") {
        this.#i += 1;
        this.#expect("(");
        const cond = this.#expression(0).code;
        this.#expect(")");
        return `loop {\n  if (!(${cond})) { break; }\n${this.#statement()}\n}`;
      }
      if (word === "return") {
        this.#i += 1;
        if (this.#take(";")) return "return;";
        const value = this.#expression(0).code;
        this.#expect(";");
        return `return ${value};`;
      }
      if (word === "discard") {
        this.#i += 1;
        this.#take(";");
        return "discard;";
      }
      if (word === "break" || word === "continue") {
        this.#i += 1;
        this.#take(";");
        return `${word};`;
      }
    }

    const out = this.#simpleStatement();
    this.#expect(";");
    return out;
  }

  /** A declaration or assignment, without its trailing semicolon. */
  #simpleStatement(): string {
    // `uniform sampler2D sampler_cells;` — a preset asking for a texture from
    // an image pack we do not ship. Recorded so the caller can bind a
    // placeholder, and otherwise dropped.
    if (this.#tok.kind === "name" && (this.#tok.text === "uniform" || this.#tok.text === "varying")) {
      this.#i += 1;
      let last = "";
      while (this.#tok.kind === "name") {
        last = this.#tok.text;
        this.#i += 1;
      }
      if (last) this.custom.add(last);
      return "";
    }
    if (this.#isType()) {
      const glslType = this.#tok.text;
      this.#i += 1;
      const type = TYPES[glslType]!;
      const parts: string[] = [];
      do {
        const name = this.#tok.text;
        this.#i += 1;
        this.#vars.set(name, type);
        if (this.#take("=")) parts.push(`var ${name}: ${type} = ${this.#coerce(this.#expression(0), type)};`);
        else parts.push(`var ${name}: ${type};`);
      } while (this.#take(","));
      return parts.join("\n");
    }

    // Assignment, possibly to a swizzle.
    const start = this.#i;
    const target = this.#unary().code;
    if (this.#peek("++") || this.#peek("--")) {
      const step = this.#tokens[this.#i]!.text === "++" ? "+" : "-";
      this.#i += 1;
      return `${target} = ${target} ${step} 1;`;
    }
    const op = this.#tok;
    if (op.kind === "punct" && ["=", "+=", "-=", "*=", "/="].includes(op.text)) {
      this.#i += 1;
      const value = this.#coerce(this.#expression(0), this.#vars.get(target) ?? "");
      return this.#assign(target, op.text, value);
    }
    this.#i = start;
    // A bare expression statement; WGSL needs it bound to something.
    const expr = this.#expression(0).code;
    return `_ = ${expr};`;
  }

  /**
   * WGSL forbids assigning to a multi-component swizzle, so `v.xyz = e` is
   * expanded into per-component writes through a temporary.
   */
  #assign(target: string, op: string, value: string): string {
    const match = /^(.*)\.([xyzwrgbastpq]{2,4})$/.exec(target);
    if (!match) return `${target} ${op} ${value};`;
    const base = match[1]!;
    const swizzle = [...match[2]!];
    const temp = `_sw${this.#temp++}`;
    const lines = [`let ${temp} = ${op === "=" ? value : `(${target}) ${op[0]} (${value})`};`];
    swizzle.forEach((component, index) => {
      const to = NORMALIZE[component] ?? component;
      lines.push(`${base}.${to} = ${temp}[${index}];`);
    });
    return lines.join("\n");
  }

  /**
   * Spells `value` the way a slot of type `type` needs it.
   *
   * Only literals are respelled. Converting anything else would be inventing a
   * cast GLSL did not ask for, and GLSL promotes integers to floats where the
   * two meet rather than truncating.
   */
  #coerce(value: Expr, type: string): string {
    const of = element(type);
    return value.integer !== undefined && (of === "i32" || of === "u32") ? value.integer : value.code;
  }

  #expression(min: number): Expr {
    let left = this.#unary();
    for (;;) {
      const tok = this.#tok;
      if (tok.kind !== "punct") break;
      const prec = BINARY[tok.text];
      if (prec === undefined || prec < min) break;
      this.#i += 1;
      const right = this.#expression(prec + 1);
      // WGSL allows vector-scalar arithmetic, so a mixed operation takes the
      // wider of the two operands rather than needing either splatted. It does
      // not mix integers with floats at all, though, so a literal beside an
      // integer counter goes back to its integer spelling.
      const size = Math.max(width(left.type), width(right.type));
      const of = width(left.type) >= width(right.type) ? element(left.type) : element(right.type);
      const code = `(${this.#coerce(left, right.type)} ${tok.text} ${this.#coerce(right, left.type)})`;
      left = { code, type: COMPARE.has(tok.text) ? vector(size, "bool") : vector(size, of) };
    }
    if (min <= 1 && this.#take("?")) {
      const yes = this.#expression(0);
      this.#expect(":");
      const no = this.#expression(1);
      return { code: `select(${no.code}, ${yes.code}, ${left.code})`, type: yes.type || no.type };
    }
    return left;
  }

  #unary(): Expr {
    const tok = this.#tok;
    if (tok.kind === "punct" && (tok.text === "-" || tok.text === "!" || tok.text === "+" || tok.text === "~")) {
      this.#i += 1;
      const operand = this.#unary();
      if (tok.text === "+") return operand;
      return { code: `${tok.text}(${operand.code})`, type: operand.type };
    }
    return this.#postfix(this.#primary());
  }

  #postfix(base: Expr): Expr {
    for (;;) {
      if (this.#take(".")) {
        const field = this.#tok.text;
        this.#i += 1;
        const swizzle = [...field].map((c) => NORMALIZE[c] ?? c).join("");
        base = { code: `${base.code}.${swizzle}`, type: vector(swizzle.length, element(base.type)) };
        continue;
      }
      if (this.#take("[")) {
        const index = this.#expression(0);
        this.#expect("]");
        // WGSL will not index with anything but an integer.
        base = { code: `${base.code}[${asInt(index)}]`, type: element(base.type) };
        continue;
      }
      break;
    }
    return base;
  }

  #primary(): Expr {
    const tok = this.#tok;
    if (tok.kind === "number") {
      this.#i += 1;
      // WGSL will not implicitly widen an integer literal in every position, so
      // anything that was a float in GLSL stays a float here.
      const whole = !tok.text.includes(".") && !/[eE]/.test(tok.text);
      return whole ? { code: `${tok.text}.0`, type: "f32", integer: tok.text } : { code: tok.text, type: "f32" };
    }
    if (tok.kind === "punct" && tok.text === "(") {
      this.#i += 1;
      const inner = this.#expression(0);
      this.#expect(")");
      return { code: `(${inner.code})`, type: inner.type };
    }
    if (tok.kind === "name") {
      const name = tok.text;
      this.#i += 1;
      if (this.#take("(")) return this.#call(name);
      if (name === "true" || name === "false") return { code: name, type: "bool" };
      if (SAMPLER_SET.has(name)) this.used.add(name);
      return { code: name, type: this.#vars.get(name) ?? "" };
    }
    throw new SyntaxError(`glsl: unexpected ${JSON.stringify(tok.text)} at ${tok.at}`);
  }

  /**
   * Splats scalar arguments to match the widest vector among the ones that
   * WGSL requires to agree. Arguments of unknown type are left alone: guessing
   * would turn a shader that compiles into one that does not.
   */
  #unify(name: string, args: Expr[]): Expr[] {
    const indices = UNIFY[name];
    if (!indices) return args;
    let size = 0;
    for (const index of indices) {
      const type = args[index]?.type ?? "";
      if (element(type) === "f32") size = Math.max(size, width(type));
    }
    if (size < 2) return args;
    const wide = vector(size, "f32");
    return args.map((arg, index) => {
      if (!indices.includes(index) || arg.type !== "f32") return arg;
      return { code: `${wide}(${arg.code})`, type: wide };
    });
  }

  #call(called: string): Expr {
    const args: Expr[] = [];
    if (!this.#take(")")) {
      do args.push(this.#expression(0)); while (this.#take(","));
      this.#expect(")");
    }

    if (called === "texture" || called === "texture2D" || called === "texture3D") {
      const sampler = args[0]!.code.trim();
      this.used.add(sampler);
      // Sampling in a fragment shader with an explicit level keeps the call
      // uniform-safe inside the conditionals presets like to wrap it in.
      return {
        code: `textureSampleLevel(${sampler}_tex, ${sampler}_smp, ${args[1]?.code}, 0.0)`,
        type: "vec4<f32>",
      };
    }
    if (called === "textureLod") {
      const sampler = args[0]!.code.trim();
      this.used.add(sampler);
      return {
        code: `textureSampleLevel(${sampler}_tex, ${sampler}_smp, ${args[1]?.code}, ${args[2]?.code ?? "0.0"})`,
        type: "vec4<f32>",
      };
    }
    if (called in TYPES) {
      return { code: `${TYPES[called]!}(${args.map((arg) => arg.code).join(", ")})`, type: TYPES[called]! };
    }
    if (called === "mod") {
      const [left, right] = [args[0]!, args[1]!];
      const size = Math.max(width(left.type), width(right.type));
      return {
        code: `((${left.code}) - (${right.code}) * floor((${left.code}) / (${right.code})))`,
        type: vector(size, width(left.type) >= width(right.type) ? element(left.type) : element(right.type)),
      };
    }
    if (called in COMPARISON) {
      const size = Math.max(width(args[0]!.type), width(args[1]!.type));
      return { code: `((${args[0]!.code}) ${COMPARISON[called]} (${args[1]!.code}))`, type: vector(size, "bool") };
    }
    if (called === "any" || called === "all") return { code: `${called}(${args[0]!.code})`, type: "bool" };

    // `atan` is the one builtin whose arity picks the WGSL name.
    const name = called === "atan" && args.length === 2 ? "atan2" : called;
    const unified = this.#unify(name, args);
    // D3D — the runtime MilkDrop presets were authored against — never
    // blacks a frame over sqrt of a slightly-negative intermediate, but
    // WGSL yields NaN and one NaN propagates through the whole feedback
    // loop. The inline asin/acos expansions upstream ships are full of
    // `sqrt(1 - abs(x))` with |x| occasionally past 1 (Mandelverse's
    // comp), so both roots are clamped at zero.
    if ((name === "sqrt" || name === "inversesqrt") && unified.length === 1) {
      const argument = unified[0]!;
      const zero = argument.type === "f32" || argument.type === "" ? "0.0" : `${argument.type}(0.0)`;
      const wgslName = name === "inversesqrt" ? "inverseSqrt" : "sqrt";
      return { code: `${wgslName}(max(${argument.code}, ${zero}))`, type: argument.type || "f32" };
    }
    const joined = unified.map((arg) => arg.code).join(", ");
    const type = SCALAR_RESULT.has(name) ? "f32" : name === "cross" ? "vec3<f32>" : unified[0]?.type ?? "";
    if (name in RENAMED) return { code: `${RENAMED[name]!}(${joined})`, type };
    if (PASSTHROUGH.has(name)) return { code: `${name}(${joined})`, type };
    throw new SyntaxError(`glsl: unsupported function ${name}`);
  }
}

/** `rgba`/`stpq` swizzles normalised to `xyzw`. */
const NORMALIZE: Record<string, string> = {
  r: "x",
  g: "y",
  b: "z",
  a: "w",
  s: "x",
  t: "y",
  p: "z",
  q: "w",
  x: "x",
  y: "y",
  z: "z",
  w: "w",
};

const BINARY: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "|": 3,
  "^": 4,
  "&": 5,
  "==": 6,
  "!=": 6,
  "<": 7,
  "<=": 7,
  ">": 7,
  ">=": 7,
  "+": 9,
  "-": 9,
  "*": 10,
  "/": 10,
  "%": 10,
};

export interface TranslatedShader {
  readonly body: string;
  readonly samplers: readonly string[];
  /** Samplers the preset declared itself; these have no texture to bind. */
  readonly custom: readonly string[];
}

/** Translates one preset shader body; throws on anything unsupported. */
export function translateShaderBody(source: string): TranslatedShader {
  const translator = new Translator(source);
  const body = translator.translateBody();
  const used = [...translator.used];
  return {
    body,
    samplers: used.filter((name) => SAMPLER_SET.has(name)),
    custom: [...new Set([...translator.custom, ...used.filter((name) => !SAMPLER_SET.has(name))])],
  };
}

/**
 * Wraps every `sqrt(...)`/`inverseSqrt(...)` argument in an
 * elementwise clamp at zero — the compile-time counterpart of the
 * translator guard above, for shader bodies that were translated and
 * vendored before the guard existed. `(E) * 0.0` is the typed zero for
 * any float scalar or vector, so the rewrite never has to know the
 * argument's type.
 */
export function guardWgslSqrt(source: string): string {
  let out = "";
  let cursor = 0;
  const pattern = /\b(sqrt|inverseSqrt)\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    // Skip occurrences we already guarded (idempotence).
    const start = match.index + match[0].length;
    let depth = 1;
    let end = start;
    while (end < source.length && depth > 0) {
      const char = source[end]!;
      if (char === "(") depth += 1;
      else if (char === ")") depth -= 1;
      end += 1;
    }
    if (depth !== 0) break;
    const argument = source.slice(start, end - 1);
    if (argument.startsWith("max(")) {
      out += source.slice(cursor, end);
    } else {
      out += source.slice(cursor, match.index) +
        `${match[1]}(max(${argument}, (${argument}) * 0.0))`;
    }
    cursor = end;
    pattern.lastIndex = end;
  }
  return out + source.slice(cursor);
}
