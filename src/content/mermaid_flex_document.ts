// Copyright 2023 Im-Beast. MIT license.
import { Signal } from "../signals/mod.ts";
import type { MarkdownRenderOptions } from "./markdown.ts";
import {
  FlexMarkdownController,
  FlexMarkdownSurface,
  type FlexMarkdownSurfaceOptions,
} from "./flex_markdown_surface.ts";
import {
  type MermaidMarkdownCache,
  MermaidMarkdownController,
  type MermaidMarkdownSettings,
} from "./mermaid_document.ts";

/** Full-standard diagrams inside a continuous, component-backed flex document. */
export interface MermaidFlexMarkdownOptions
  extends Omit<FlexMarkdownSurfaceOptions, "controller" | "createController" | "render"> {
  render?: Omit<MarkdownRenderOptions, "width" | "diagram">;
  /** One window's compile/native settings; an external signal is borrowed. */
  settings?: MermaidMarkdownSettings | Signal<MermaidMarkdownSettings>;
  /** Host-owned horizontal diagram position; call refresh() when a non-signal position changes. */
  diagramOffset?: (source: string, width: number) => number;
  /** Borrowed host clock shared by all panels; no compiler/browser work occurs on paint ticks. */
  time?: Signal<number>;
}

/** Owns panel models, not the shared cache/compiler or caller-provided source/settings signals. */
export class MermaidFlexMarkdownController extends FlexMarkdownController {
  readonly settings: Signal<MermaidMarkdownSettings>;
  readonly #ownsSettings: boolean;
  #disposed = false;

  constructor(cache: MermaidMarkdownCache, options: MermaidFlexMarkdownOptions) {
    const ownsSettings = !(options.settings instanceof Signal);
    const settings = options.settings instanceof Signal ? options.settings : new Signal(options.settings ?? {});
    // A direct super call also survives Deno's generated public-type output.
    // Allocate panels only after fields exist, so failed factories can release
    // the entire document and owned settings through the normal dispose path.
    super({
      ...options,
      sections: [],
      createController: (_, model) =>
        new MermaidMarkdownController(cache, {
          source: model.source,
          render: model.render,
          settings,
          diagramOffset: options.diagramOffset,
          time: options.time,
        }),
    });
    this.settings = settings;
    this.#ownsSettings = ownsSettings;
    try {
      this.setSections(options.sections);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  override panelController(id: string): MermaidMarkdownController | undefined {
    return super.panelController(id) as MermaidMarkdownController | undefined;
  }

  /** Measure at solved content widths, wait for the current panels, then remeasure accepted native geometry. */
  async settled(width: number): Promise<void> {
    while (!this.#disposed) {
      const layout = this.layout(width);
      const controllers = layout.panels.map((box) => this.panelController(box.panel.id)!);
      await Promise.all(controllers.map((controller) => controller.settled()));
      if (this.#disposed) return;
      const current = this.layout(width);
      if (
        current.panels.length === controllers.length && current.panels.every((box, index) => {
          const controller = this.panelController(box.panel.id)!;
          const state = controller.state.peek();
          return controller === controllers[index] && state.width === box.contentRect.width &&
            (state.phase === "ready" || state.phase === "error");
        })
      ) return;
    }
  }

  /** Reproject host pan changes or retry errors; invalidate the shared cache separately for changed assets. */
  async refresh(width: number): Promise<void> {
    const layout = this.layout(width);
    await Promise.all(layout.panels.map((box) => this.panelController(box.panel.id)!.refresh()));
    await this.settled(width);
  }

  override dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    super.dispose();
    if (this.#ownsSettings) this.settings.dispose();
  }
}

/** Lazy native component views backed by the same full-standard models used for flex measurement. */
export class MermaidFlexMarkdownSurface extends FlexMarkdownSurface {
  declare readonly controller: MermaidFlexMarkdownController;

  constructor(cache: MermaidMarkdownCache, options: MermaidFlexMarkdownOptions) {
    // Options are snapshotted before the owned controller is allocated. The
    // lazy base surface allocates no child canvases/jobs during construction.
    super({ ...options, controller: new MermaidFlexMarkdownController(cache, options) });
  }

  /** Resolve all diagrams and corrected panel heights at this viewport width without starting a host/server. */
  settled(width: number): Promise<void> {
    this.layout(width);
    return this.controller.settled(width);
  }

  override dispose(): void {
    super.dispose();
    this.controller.dispose();
  }
}
