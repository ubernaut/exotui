# JSR PTY types

The JSR server rejected Exotui 0.9.0 because the package shipped an ambient module declaration used only for the Bun
consumer's TypeScript check. Remove the global shim and suppress the missing optional Deno-only module declaration at
the import site. Keep the literal specifier for Deno compilation and JSR import rewriting. This fixes the registry
package without moving the existing v0.9.0 tag or replacing its binaries.
