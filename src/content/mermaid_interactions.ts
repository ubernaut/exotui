// Copyright 2023 Im-Beast. MIT license.
import type { MarkdownCallback, MarkdownInteraction } from "./markdown.ts";
import type { MermaidStandardRuntime } from "./mermaid_standard.ts";

interface Node {
  id: string;
  domId?: string;
}
interface Database {
  getVertices?: () => Map<string, Node>;
  getClasses?: () => Map<string, Node>;
  getTasks?: () => Node[];
  getLinks?: () => Map<string, string>;
  lookUpDomId?: (id: string) => string;
  splitClassNameAndType?: (id: string) => { className: string };
}
interface Diagram {
  db: Database;
  parser?: { parser?: { yy?: Database }; yy?: Database };
}

/** Native links never navigate by themselves, and executable URL schemes are never forwarded even when trusted. */
export function safeMermaidHref(value: string | null | undefined): string | undefined {
  if (!value) return;
  if (value.length > 4096) throw new RangeError("Mermaid link exceeds its metadata budget.");
  // deno-lint-ignore no-control-regex -- reject terminal controls in host link metadata
  if (/[\x00-\x1f\x7f-\x9f]/.test(value) || /^(?:javascript|vbscript|data):/i.test(value.trim())) return;
  return value;
}

/** Bound strings before retaining them in scenes/cells or handing them to a terminal host. */
export function mermaidMetadata(value: string): string {
  if (value.length > 4096) throw new RangeError("Mermaid interaction exceeds its metadata budget.");
  // deno-lint-ignore no-control-regex -- callbacks/tooltips must not carry terminal escape payloads
  return value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, "�");
}

/**
 * Observe the pinned engine's semantic DB calls, not Mermaid source syntax.
 * Its flow/class DBs are constructed on each parse; Gantt uses a singleton.
 * This scope runs inside the shared compiler queue and restores exact method
 * descriptors on success, failure and cancellation. A retained bound wrapper
 * is inert after dispose and retains no callback data.
 */
export async function beginMermaidInteractions(
  runtime: MermaidStandardRuntime,
  source: string,
  trusted: boolean,
): Promise<
  { reset: () => void; resolve: (svg: SVGSVGElement) => ReadonlyMap<Element, MarkdownInteraction>; dispose: () => void }
> {
  const api = runtime.mermaidAPI;
  if (!api) return { reset() {}, resolve: () => new Map(), dispose() {} };
  const diagram = await api.getDiagramFromText(source) as Diagram;
  const db = diagram.db;
  const prototype = Object.getPrototypeOf(db);
  const owner = db.getVertices || db.getClasses ? prototype : db;
  const method = db.getVertices ? "setClickFun" : db.getClasses ? "setClickFunc" : "setClickEvent";
  const descriptor = owner && Object.getOwnPropertyDescriptor(owner, method);
  let recorded: { id: string; callback: MarkdownCallback }[] | undefined = [];
  let units = 0;
  let patched = false;
  try {
    if (descriptor && typeof descriptor.value === "function") {
      const original = descriptor.value;
      Object.defineProperty(owner, method, {
        ...descriptor,
        value: function (this: Database, ids: unknown, name: unknown, args: unknown) {
          if (
            recorded && trusted && api.getConfig().securityLevel === "loose" && typeof ids === "string" &&
            typeof name === "string"
          ) {
            for (const rawId of ids.split(",")) {
              const id = this.splitClassNameAndType?.(rawId).className ?? rawId;
              // Identical to the pinned official DB argument semantics, including
              // quoted commas and the default node-id argument. No evaluation.
              const values = typeof args === "string"
                ? args.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((value) => {
                  value = value.trim();
                  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
                })
                : [id];
              if (recorded.length >= 1024 || values.length > 128) {
                throw new RangeError("Mermaid callbacks exceed their metadata budget.");
              }
              const callback = { name: mermaidMetadata(name), args: values.map(mermaidMetadata) };
              units += id.length + name.length + values.reduce((sum, value) => sum + value.length, 0);
              if (units > 128_000) throw new RangeError("Mermaid callbacks exceed their metadata budget.");
              recorded.push({ id: mermaidMetadata(id), callback });
            }
          }
          return original.call(this, ids, name, args);
        },
      });
      patched = true;
    }
    return {
      reset() {
        if (recorded) recorded = [];
        units = 0;
      },
      resolve(svg) {
        const current = diagram.parser?.parser?.yy ?? diagram.parser?.yy ?? db;
        const nodes = current.getVertices?.() ?? current.getClasses?.() ?? current.getTasks?.() ?? [];
        if ((nodes instanceof Map ? nodes.size : nodes.length) > 4096) {
          throw new RangeError("Mermaid interactions exceed their node budget.");
        }
        const links = current.getLinks?.();
        const callbacks = new Map<string, MarkdownCallback[]>();
        for (const entry of recorded ?? []) {
          const list = callbacks.get(entry.id) ?? [];
          list.push(entry.callback);
          callbacks.set(entry.id, list);
        }
        const result = new Map<Element, MarkdownInteraction>();
        for (const node of nodes.values()) {
          const domId = current.lookUpDomId?.(node.id) ?? node.domId ?? node.id;
          const root = svg.getElementById(`${svg.id}-${domId}`) ?? svg.getElementById(domId);
          if (!root) continue;
          const href = safeMermaidHref(links?.get(node.id));
          const actions = callbacks.get(node.id);
          if (href || actions?.length || root.closest("a") || root.hasAttribute("data-title")) {
            const interaction: MarkdownInteraction = {
              id: mermaidMetadata(node.id),
              href,
              target: href ? "_self" : undefined,
              callbacks: actions,
            };
            result.set(root, interaction);
            // Gantt binds task bars AND their separate label elements.
            const label = svg.getElementById(`${svg.id}-${domId}-text`) ?? svg.getElementById(`${domId}-text`);
            if (label) result.set(label, interaction);
          }
        }
        return result;
      },
      dispose() {
        recorded = undefined;
        if (patched) Object.defineProperty(owner, method, descriptor!);
        patched = false;
      },
    };
  } catch (error) {
    recorded = undefined;
    if (patched) Object.defineProperty(owner, method, descriptor!);
    throw error;
  }
}
