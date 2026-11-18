// Copyright 2023 Im-Beast. MIT license.
import { toAriaAttributesWithDescription } from "../app/accessibility_tree.ts";
import { type DomRenderNode, DomRenderTarget } from "../web/dom_renderer.ts";
import { type DocumentAccessibilityTarget, snapshotDiagramAccessibility } from "./document_accessibility.ts";
import {
  diagramSemanticNamespace,
  type DiagramSemanticNode,
  snapshotDiagramSemanticContent,
} from "./document_semantics.ts";
import type { DocumentInteractionTarget } from "./document_interactions.ts";
import type { MarkdownInteraction } from "./markdown.ts";

/** Borrowed native document model; DOM semantics never compile or paint a diagram. */
export interface DocumentAccessibilitySource {
  accessibilityTargets(width: number, height?: number): readonly DocumentAccessibilityTarget[];
  interactionTargets?(width: number): readonly DocumentInteractionTarget[];
  inspect?(width: number, height: number): { offset: number };
}

let nextProjection = 0;

function actionSignature(action: MarkdownInteraction): string {
  return JSON.stringify([
    action.id,
    action.href,
    action.target,
    action.title,
    action.callbacks?.map((callback) => [callback.name, callback.args]),
  ]);
}

/** Explicit browser semantic companion to an existing native document/window.
 * The host calls update after source/revision/scroll/resize changes. This class
 * starts no timers, subscriptions, compiler jobs, callbacks or navigation.
 * It owns only its visually hidden child; the host root/model remain borrowed.
 */
export class DocumentAccessibilityDOM {
  readonly #target: DomRenderTarget;
  readonly #source: DocumentAccessibilitySource;
  readonly #prefix = `exotui-document-accessibility-${++nextProjection}`;
  readonly #label?: string;
  readonly #onAction?: (action: MarkdownInteraction, target: DocumentAccessibilityTarget, event: Event) => void;
  #signature?: string;
  #mounted = false;
  #disposed = false;
  #generation = 0;
  readonly #root: HTMLElement;

  constructor(root: HTMLElement, source: DocumentAccessibilitySource, options: {
    label?: string;
    onAction?: (action: MarkdownInteraction, target: DocumentAccessibilityTarget, event: Event) => void;
  } = {}) {
    this.#root = root;
    this.#source = source;
    this.#label = snapshotDiagramAccessibility({ title: options.label }).title;
    this.#onAction = options.onAction;
    this.#target = new DomRenderTarget(root.ownerDocument);
  }

  /** Mirror the visible viewport, or all diagrams when height is omitted. */
  update(width: number, height?: number): void {
    if (this.#disposed) return;
    try {
      const targets = this.#source.accessibilityTargets(width, height);
      if (targets.length > 4096) {
        throw new RangeError("Browser document accessibility target count exceeds its budget.");
      }
      let projectedNodes = 0, projectedUnits = 0;
      const count = (values: readonly DiagramSemanticNode[]) => {
        for (const value of values) {
          if (++projectedNodes > 16_384) {
            throw new RangeError("Browser semantic content exceeds its aggregate node budget.");
          }
          count(value.children ?? []);
        }
      };
      const prepared = targets.map((target) => {
        const content = snapshotDiagramSemanticContent(target.content ?? []);
        count(content);
        projectedUnits += JSON.stringify(content).length + JSON.stringify(target.node).length;
        if (projectedUnits > 1_000_000) {
          throw new RangeError("Browser semantic content exceeds its aggregate text budget.");
        }
        return target.content !== undefined ? { ...target, content } : target;
      });
      const signature = JSON.stringify([
        width,
        height,
        prepared.map(({ key, row, height, node, content }) => [key, row, height, node, content]),
        this.#source.inspect && height !== undefined ? this.#source.inspect(width, height).offset : undefined,
        this.#onAction
          ? this.#source.interactionTargets?.(width).map(
            (target) => [target.scope, actionSignature(target.interaction), target.ranges],
          )
          : undefined,
      ]);
      if (signature === this.#signature) return;
      const active = this.#root.ownerDocument.activeElement;
      const focusedKey =
        active?.closest("[data-exotui-document-accessibility]")?.getAttribute("data-exotui-document-accessibility") ===
            this.#prefix
          ? active.getAttribute("data-document-semantic")
          : undefined;
      this.#generation++;
      let descriptionOrdinal = 0;
      let contentNodes = 0;
      const description = (text: string): { id: string; node: DomRenderNode } => {
        let id = `${this.#prefix}-${this.#generation}-${descriptionOrdinal++}-description`;
        let collisions = 0;
        while (this.#root.ownerDocument.getElementById(id)) {
          if (++collisions > 64) {
            throw new RangeError("Browser accessibility description ID collision budget exceeded.");
          }
          id += "-";
        }
        return { id, node: { tag: "span", text, attributes: { id, "aria-hidden": "true" } } };
      };
      const contentNode = (
        value: DiagramSemanticNode,
        target: DocumentAccessibilityTarget,
        path: readonly number[],
      ): DomRenderNode | string => {
        if (++contentNodes > 16_384) {
          throw new RangeError("Browser semantic content exceeds its aggregate node budget.");
        }
        if (value.tag === "#text") return value.text!;
        const desc = value.description !== undefined ? description(value.description) : undefined;
        const action = value.interaction;
        const actionable = action && (action.href || action.callbacks?.length);
        const available = actionable && this.#onAction && this.#actionAvailable(target, action, width, height);
        const generation = this.#generation;
        const activate: EventListener = (event) => {
          if (event.type === "keydown") {
            const keyboard = event as KeyboardEvent;
            if (keyboard.ctrlKey || keyboard.altKey || keyboard.metaKey || keyboard.shiftKey || keyboard.repeat) return;
            const key = keyboard.key;
            if (key !== "Enter" && !(key === " " && !action?.href)) return;
          }
          event.preventDefault();
          if (this.#disposed || generation !== this.#generation || !action || !this.#onAction) return;
          const current = this.#source.accessibilityTargets(width, height).find((t) => t.key === target.key);
          if (
            !current || JSON.stringify(current.content) !== JSON.stringify(target.content) ||
            !this.#actionAvailable(current, action, width, height)
          ) return;
          this.#onAction(action, current, event);
        };
        return {
          ...(diagramSemanticNamespace(value.tag) === "mathml"
            ? { mathTag: value.tag as keyof MathMLElementTagNameMap }
            : { tag: value.tag as keyof HTMLElementTagNameMap }),
          text: value.text,
          ...(value.whiteSpace || value.textTransform
            ? { style: { whiteSpace: value.whiteSpace, textTransform: value.textTransform } }
            : {}),
          attributes: {
            ...value.attributes,
            ...(value.role ? { role: value.role } : actionable ? { role: action.href ? "link" : "button" } : {}),
            ...(value.label !== undefined ? { "aria-label": value.label } : {}),
            ...(value.roleDescription !== undefined ? { "aria-roledescription": value.roleDescription } : {}),
            ...(desc ? { "aria-describedby": desc.id } : {}),
            ...(available ? { tabindex: "0" } : {}),
            ...(available
              ? { "data-document-semantic": JSON.stringify([target.key, path, actionSignature(action)]) }
              : {}),
          },
          ...(available ? { on: { click: activate, keydown: activate } } : {}),
          children: [
            ...(desc ? [desc.node] : []),
            ...(value.children ?? []).map((child, index) => contentNode(child, target, [...path, index])),
          ],
        };
      };
      const children: DomRenderNode[] = prepared.map((target) => {
        const desc = target.node.description !== undefined ? description(target.node.description) : undefined;
        return {
          attributes: {
            ...toAriaAttributesWithDescription(target.node, desc?.id ?? ""),
            "data-document-target": target.key,
          },
          children: [
            ...(desc ? [desc.node] : []),
            ...(target.content ?? []).map((value, index) => contentNode(value, target, [index])),
          ],
        };
      });
      const node: DomRenderNode = {
        role: "document",
        ariaLabel: this.#label,
        attributes: { "data-exotui-document-accessibility": this.#prefix },
        // Keep this in the accessibility tree. display:none/aria-hidden on this
        // container would erase semantics; native canvas cells remain the visuals.
        style: {
          position: "absolute",
          width: "1px",
          height: "1px",
          padding: "0",
          margin: "-1px",
          overflow: "hidden",
          clipPath: "inset(50%)",
          whiteSpace: "pre-wrap",
          border: "0",
        },
        children,
      };
      if (this.#mounted) this.#target.update(node);
      else {
        this.#target.mount(this.#root, node);
        this.#mounted = true;
      }
      this.#signature = signature;
      if (focusedKey) {
        const owned = [...this.#root.querySelectorAll<HTMLElement>('[data-document-semantic][tabindex="0"]')]
          .find((element) => element.getAttribute("data-document-semantic") === focusedKey);
        owned?.focus({ preventScroll: true });
      }
    } catch (error) {
      // A rejected new source/projection must not leave the previous graph's
      // semantics exposed. Preserve borrowed root children and the model.
      this.#target.unmount();
      this.#mounted = false;
      this.#signature = undefined;
      throw error;
    }
  }

  #actionAvailable(
    target: DocumentAccessibilityTarget,
    action: MarkdownInteraction,
    width: number,
    height?: number,
  ): boolean {
    const offset = height === undefined ? undefined : this.#source.inspect?.(width, height).offset;
    if (height !== undefined && offset === undefined) return false;
    return this.#source.interactionTargets?.(width).some((candidate) =>
      candidate.scope === target.scope && actionSignature(candidate.interaction) === actionSignature(action) &&
      candidate.ranges.some((range) =>
        range.width > 0 && range.row >= target.row && range.row < target.row + target.height &&
        (height === undefined || range.row >= offset! && range.row < offset! + height)
      )
    ) ?? false;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#target.unmount();
    this.#signature = undefined;
  }
}
