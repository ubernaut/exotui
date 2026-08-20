// Copyright 2023 Im-Beast. MIT license.

// Three.js-backed visualisations, behind their own specifier.
//
// The core of this library has no runtime dependencies and `./viz` keeps that
// promise: its projected charts are arithmetic, and they draw anywhere. This is
// the other path — retained geometry rendered through the ASCII pipeline, which
// costs a dependency on `three` and buys shading, depth and post-processing that
// a wireframe cannot reach. Importing it is the choice to pay for that.
export * from "./scene.ts";
export * from "./scenes.ts";
