# Release 0.9.0

## 2026-11-18 — Prepare registry and binary artifacts

Bump exotui to 0.9.0 and exomux to 0.5.0, with exomux linked to the new exotui minor version. Use the existing JSR
publisher for both packages and the tag-driven native binary/npm launcher workflow for exomux. The WASI desktop is
CPU-only on Linux x86-64; the WebGPU proof is not part of the distribution.
