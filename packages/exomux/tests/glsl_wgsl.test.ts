import { assert, assertEquals, assertStringIncludes, assertThrows } from "./deps.ts";
import { guardWgslSqrt, translateShaderBody } from "../glsl_wgsl.ts";
import { EXOMUX_BUTTERCHURN_CATALOG } from "../butterchurn_catalog.ts";

Deno.test("glsl→wgsl: every shader in the catalog arrived as usable WGSL", () => {
  // Translation happens in the catalog build, not at runtime, so the corpus
  // check is on the generated artifact: a preset whose GLSL failed would ship
  // with an empty body and fall silently to MilkDrop's default pass-through.
  // The build script prints the same count and is where a regression is caught
  // first; this is what stops one being committed.
  let bodies = 0;
  for (const preset of EXOMUX_BUTTERCHURN_CATALOG) {
    for (const [body, samplers] of [[preset.warp, preset.warpSamplers], [preset.comp, preset.compSamplers]] as const) {
      if (!body) {
        assertEquals(samplers.length, 0, `${preset.name} declares samplers for a shader it does not have`);
        continue;
      }
      bodies += 1;
      assert(samplers.includes("sampler_main"), `${preset.name} does not bind sampler_main`);
      assert(!/\bvec[234]\s*\(/.test(body), `${preset.name} still contains GLSL constructors`);
      assert(!body.includes("texture2D"), `${preset.name} still contains GLSL sampling`);
    }
  }
  // 724 across the 472 vendored presets; most carry both a warp and a comp
  // shader, a good number only one, and the MilkDrop 1 packs neither.
  assertEquals(bodies, 724, "the shipped shader count changed");
});

Deno.test("glsl→wgsl: expands multi-component swizzle assignment", () => {
  // WGSL permits assigning one component at a time only, and this idiom is in
  // nearly every preset the GLSL optimizer touched.
  const { body } = translateShaderBody("shader_body { vec4 t; t.xyz = vec3(1.0, 2.0, 3.0); ret = t.xyz; }");
  assert(!/\.xyz\s*=/.test(body), `swizzle assignment survived translation:\n${body}`);
  assertStringIncludes(body, "t.x =");
  assertStringIncludes(body, "t.y =");
  assertStringIncludes(body, "t.z =");
});

Deno.test("glsl→wgsl: rewrites texture sampling and reports the samplers used", () => {
  const result = translateShaderBody("shader_body { ret = texture(sampler_blur1, uv).xyz; }");
  assertStringIncludes(result.body, "textureSampleLevel(sampler_blur1_tex, sampler_blur1_smp");
  assertEquals(result.samplers, ["sampler_blur1"]);
});

Deno.test("glsl→wgsl: maps types, builtins and constructors", () => {
  const { body } = translateShaderBody(
    "shader_body { float a = inversesqrt(4.0); vec2 b = vec2(1.0); float c = mod(5.0, 3.0); ret = vec3(a, b.x, c); }",
  );
  assertStringIncludes(body, "var a: f32");
  assertStringIncludes(body, "vec2<f32>(1.0)");
  assertStringIncludes(body, "inverseSqrt");
  // GLSL `mod` is a floored remainder, which WGSL has no builtin for.
  assertStringIncludes(body, "floor(");
});

Deno.test("glsl→wgsl: handles hoisted globals, uniform declarations and loops", () => {
  const result = translateShaderBody(`
    vec3 xlat_mutablescratch;
    uniform sampler2D sampler_cells;
    shader_body {
      xlat_mutablescratch = vec3(0.0);
      for (int i = 0; i < 4; i++) { xlat_mutablescratch += vec3(0.1); }
      ret = xlat_mutablescratch + texture(sampler_cells, uv).xyz;
    }
  `);
  assertStringIncludes(result.body, "var xlat_mutablescratch: vec3<f32>");
  assertStringIncludes(result.body, "loop {");
  // A texture the preset expects from an image pack we do not ship is reported
  // so the renderer can bind something in its place.
  assert(result.custom.includes("sampler_cells"), `custom samplers: ${result.custom.join(", ")}`);
});

Deno.test("glsl→wgsl: rejects source it does not understand", () => {
  // Emitting partial WGSL would compile into a wrong image rather than a
  // failure, and the caller could not tell the difference.
  assertThrows(() => translateShaderBody("shader_body { ret = nosuchfunc(1.0); }"), SyntaxError);
  assertThrows(() => translateShaderBody("shader_body { ret = ; }"), SyntaxError);
});

Deno.test("glsl→wgsl: splats scalars where WGSL demands a matching vector", () => {
  // `clamp(v2, 0.0, 1.0)` is ordinary GLSL and a compile error in WGSL. A third
  // of the catalog writes it, and before it was handled those presets fell
  // silently to the software renderer.
  const { body } = translateShaderBody(`shader_body {
    vec2 a = clamp(uv, 0.0, 1.0);
    vec3 b = min(hue_shader, 1.0);
    vec3 c = max(hue_shader, 0.0);
    vec2 d = step(0.5, uv);
    vec2 e = smoothstep(0.0, 1.0, uv);
    vec3 f = mix(hue_shader, hue_shader, 0.5);
    ret = vec3(a.x, b.y, c.z) + vec3(d.x, e.y, f.z);
  }`);
  assertStringIncludes(body, "clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0))");
  assertStringIncludes(body, "min(hue_shader, vec3<f32>(1.0))");
  assertStringIncludes(body, "max(hue_shader, vec3<f32>(0.0))");
  assertStringIncludes(body, "step(vec2<f32>(0.5), uv)");
  assertStringIncludes(body, "smoothstep(vec2<f32>(0.0), vec2<f32>(1.0), uv)");
  // `mix` is the exception: WGSL overloads its interpolant for a scalar, so
  // splatting it would be noise.
  assertStringIncludes(body, "mix(hue_shader, hue_shader, 0.5)");
});

Deno.test("glsl→wgsl: leaves scalar-only and unknown-typed calls alone", () => {
  const { body } = translateShaderBody(
    "shader_body { float a = clamp(bass, 0.0, 1.0); ret = vec3(a, mix(0.0, 1.0, 0.5), 0.0); }",
  );
  assertStringIncludes(body, "clamp(bass, 0.0, 1.0)");
  assert(!body.includes("vec2<f32>(0.0)"), `a scalar clamp was splatted:\n${body}`);
});

Deno.test("glsl→wgsl: keeps integers integral for subscripts and counters", () => {
  // Every numeric literal is emitted as a float, because that is what almost
  // every position wants. Subscripts and integer variables are the exceptions,
  // and WGSL mixes neither with floats.
  const { body } = translateShaderBody(
    "shader_body { vec4 v = vec4(1.0); int n = 0; for (int i = 0; i < 4; i++) { n = n + 1; } ret = vec3(v[1], v[n], 0.0); }",
  );
  assertStringIncludes(body, "var n: i32 = 0;");
  assertStringIncludes(body, "var i: i32 = 0;");
  assertStringIncludes(body, "(i < 4)");
  assertStringIncludes(body, "v[1]");
  assertStringIncludes(body, "v[n]");
  assert(!/\[\s*\d+\.0\s*\]/.test(body), `a float literal was used as a subscript:\n${body}`);
});

Deno.test("wgsl: sqrt arguments are clamped at zero, both layers", () => {
  // The compile-time pass for pre-translated bodies.
  assertEquals(
    guardWgslSqrt("let a = sqrt(x - 1.0);"),
    "let a = sqrt(max(x - 1.0, (x - 1.0) * 0.0));",
  );
  assertEquals(
    guardWgslSqrt("inverseSqrt(dot(v, v))"),
    "inverseSqrt(max(dot(v, v), (dot(v, v)) * 0.0))",
  );
  // Nested parens resolve to the matching close.
  assertEquals(
    guardWgslSqrt("sqrt(((1.0 - abs(t)) * s))"),
    "sqrt(max(((1.0 - abs(t)) * s), (((1.0 - abs(t)) * s)) * 0.0))",
  );
  // Idempotent: an already-guarded call is left alone.
  const guarded = guardWgslSqrt("sqrt(x)");
  assertEquals(guardWgslSqrt(guarded), guarded);

  // The translator emits guarded roots directly.
  const translated = translateShaderBody("shader_body { ret = vec3(sqrt(uv.x - 2.0)); }");
  assert(translated.body.includes("sqrt(max("));
});
