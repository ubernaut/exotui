// Copyright 2023 Im-Beast. MIT license.

// PER-008: snapshots serialize as a HASH TREE, and unchanged subtrees
// are the SAME OBJECTS as last time. Every node carries its canonical
// bytes (sorted-key JSON) and an FNV-1a hash; re-serializing against the
// previous tree returns the previous node — reference-identical, bytes
// untouched — wherever the hash matches, and rebuilds only the changed
// spine. Decoding parses the canonical bytes, so a full decode always
// equals the canonical serialization by construction, and the
// schema-aware snapshot wrapper applies the same reuse per declared
// section (workspace, journal, frame, caches).

/** One serialized tree node. */
export interface SerializedNode {
  readonly hash: number;
  /** Canonical sorted-key JSON for this subtree. */
  readonly bytes: string;
  readonly children?: Readonly<Record<string, SerializedNode>>;
}

function fnv(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Serializes a value, reusing unchanged subtrees from `previous`. */
export function serializeIncremental(value: unknown, previous?: SerializedNode): SerializedNode {
  if (typeof value === "object" && value !== null) {
    const isArray = Array.isArray(value);
    const keys = isArray
      ? (value as unknown[]).map((_, index) => String(index))
      : Object.keys(value as Record<string, unknown>).sort();
    const children: Record<string, SerializedNode> = {};
    const parts: string[] = [];
    for (const key of keys) {
      const child = serializeIncremental(
        (value as Record<string, unknown>)[key],
        previous?.children?.[key],
      );
      children[key] = child;
      parts.push(isArray ? child.bytes : `${JSON.stringify(key)}:${child.bytes}`);
    }
    const bytes = isArray ? `[${parts.join(",")}]` : `{${parts.join(",")}}`;
    const hash = fnv(bytes);
    // Reference reuse: identical subtree → the previous NODE itself.
    if (previous && previous.hash === hash && previous.bytes === bytes) return previous;
    return { hash, bytes, children };
  }
  const bytes = JSON.stringify(value) ?? "null";
  const hash = fnv(bytes);
  if (previous && previous.hash === hash && previous.bytes === bytes) return previous;
  return { hash, bytes };
}

/** Decodes a node — always identical to parsing its canonical bytes. */
export function decodeSerialized(node: SerializedNode): unknown {
  return JSON.parse(node.bytes);
}

/** The declared snapshot sections. */
export interface SnapshotSections {
  readonly workspace: unknown;
  readonly journal: unknown;
  readonly frame: unknown;
  readonly caches: unknown;
}

/** One schema-aware snapshot: a node per declared section. */
export type SerializedSnapshot = Readonly<Record<keyof SnapshotSections, SerializedNode>>;

/** Serializes all sections with per-section reuse. */
export function serializeSnapshot(
  sections: SnapshotSections,
  previous?: SerializedSnapshot,
): SerializedSnapshot {
  return {
    workspace: serializeIncremental(sections.workspace, previous?.workspace),
    journal: serializeIncremental(sections.journal, previous?.journal),
    frame: serializeIncremental(sections.frame, previous?.frame),
    caches: serializeIncremental(sections.caches, previous?.caches),
  };
}
