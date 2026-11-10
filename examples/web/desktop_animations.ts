// The portable desktop adapter for Exomux's shared cell-native surface engine.
// State changes are observed once per frame, so a restore/place/maximize/focus
// batch produces one animation at its final geometry, never intermediate ghosts.
import { createSurfaceTransitionAnimator } from "../../src/app/surface_transitions.ts";
import type { WorkbenchWindowChromeProjection } from "../../src/app/workbench_window_host.ts";
import {
  SURFACE_ANIMATION_KINDS,
  type SurfaceAnimationChoice,
  type SurfaceAnimationSpeed,
  type SurfaceTransition,
} from "../../src/surface_animation.ts";
import { characterWidth } from "../../src/utils/strings.ts";
import type { Rectangle } from "../../src/types.ts";
import type { VizCell } from "../../src/viz/render.ts";

export const DESKTOP_WINDOW_TRANSITIONS = [
  "open",
  "close",
  "minimize",
  "maximize",
  "restore",
  "raise",
  "lower",
] as const;
export type DesktopWindowTransition = typeof DESKTOP_WINDOW_TRANSITIONS[number];
export interface DesktopAnimationSettings {
  readonly speed: SurfaceAnimationSpeed;
  readonly kinds: Readonly<Record<DesktopWindowTransition, SurfaceAnimationChoice>>;
}
export const DEFAULT_DESKTOP_ANIMATIONS: DesktopAnimationSettings = {
  speed: "normal",
  kinds: {
    open: "fade",
    close: "disintegrate",
    minimize: "fly",
    maximize: "fade",
    restore: "fly",
    raise: "fade",
    lower: "fade",
  },
};
export const DESKTOP_ANIMATION_SPEEDS: readonly SurfaceAnimationSpeed[] = ["off", "fast", "normal", "slow"];
export const DESKTOP_ANIMATION_CHOICES: readonly SurfaceAnimationChoice[] = [...SURFACE_ANIMATION_KINDS, "random"];

/** Persisted values are untrusted; unknown values keep the Exomux defaults. */
export function desktopAnimationSettings(value: unknown): DesktopAnimationSettings {
  const saved = value as Partial<DesktopAnimationSettings> | null;
  return {
    speed: DESKTOP_ANIMATION_SPEEDS.includes(saved?.speed as SurfaceAnimationSpeed) ? saved!.speed! : "normal",
    kinds: Object.fromEntries(DESKTOP_WINDOW_TRANSITIONS.map((kind) => [
      kind,
      DESKTOP_ANIMATION_CHOICES.includes(saved?.kinds?.[kind] as SurfaceAnimationChoice)
        ? saved!.kinds![kind]
        : DEFAULT_DESKTOP_ANIMATIONS.kinds[kind],
    ])) as Record<DesktopWindowTransition, SurfaceAnimationChoice>,
  };
}

type WindowState = "normal" | "maximized" | "minimized" | "closed";
interface Snapshot {
  readonly rect: Rectangle;
  readonly cells: readonly (readonly VizCell[])[];
}
interface Playing {
  readonly snapshot: Snapshot;
  readonly transition: DesktopWindowTransition;
  readonly incoming: boolean;
  /** Lowering the old titlebar must not overpaint the newly raised window. */
  readonly exclude?: Rectangle;
}

function snapshot(frame: readonly (readonly VizCell[])[], rect: Rectangle): Snapshot {
  return {
    rect: { ...rect },
    cells: Array.from(
      { length: rect.height },
      (_, row) =>
        Array.from(
          { length: rect.width },
          (_, column) => frame[rect.row + row]?.[rect.column + column] ?? { char: " " },
        ),
    ),
  };
}

function contains(rect: Rectangle, column: number, row: number): boolean {
  return column >= rect.column && column < rect.column + rect.width && row >= rect.row && row < rect.row + rect.height;
}

/** Thin styled-snapshot compositor; physics, timing and randomness belong to the library engine. */
export class DesktopWindowAnimations {
  #settings = desktopAnimationSettings(undefined);
  readonly #animator = createSurfaceTransitionAnimator({ seed: 39 });
  readonly #snapshots = new Map<string, Snapshot>();
  readonly #playing = new Map<string, Playing>();
  readonly #pending = new Map<string, "open" | "restore">();
  #states?: Map<string, WindowState>;
  #active?: string;
  #cleanFrame: readonly (readonly VizCell[])[] = [];
  #bounds: Rectangle = { column: 0, row: 0, width: 0, height: 0 };
  #anchor: (id: string) => Rectangle | undefined = () => undefined;
  #now = 0;
  #enabled = true;

  settings(): DesktopAnimationSettings {
    return this.#settings;
  }
  setSettings(value: unknown): void {
    this.#settings = desktopAnimationSettings(value);
    this.cancel();
  }
  /** Cancel detached effects without changing a single window's live state. */
  cancel(): void {
    this.#animator.cancelAll();
    this.#playing.clear();
    this.#pending.clear();
  }
  /** A new viewport discards old-coordinate snapshots and establishes a fresh baseline. */
  resize(): void {
    this.cancel();
    this.#snapshots.clear();
    this.#cleanFrame = [];
    this.#states = undefined;
  }
  status(): readonly { id: string; transition: DesktopWindowTransition; incoming: boolean }[] {
    return [...this.#playing].map(([id, entry]) => ({ id, transition: entry.transition, incoming: entry.incoming }));
  }
  hides(id: string): boolean {
    return this.#playing.get(id)?.incoming ?? false;
  }

  beginFrame(options: {
    now: number;
    bounds: Rectangle;
    windows: readonly WorkbenchWindowChromeProjection[];
    states: readonly { id: string; state: WindowState }[];
    anchor: (id: string) => Rectangle | undefined;
    reducedMotion?: boolean;
  }): void {
    this.#now = options.now;
    this.#bounds = options.bounds;
    this.#anchor = options.anchor;
    this.#enabled = !options.reducedMotion && this.#settings.speed !== "off";
    if (!this.#enabled) this.cancel();
    for (const overlay of this.#animator.framesAt(options.now)) {
      if (overlay.frame.done) this.#playing.delete(overlay.surfaceId);
    }
    const states = new Map(options.states.map((window) => [window.id, window.state]));
    const active = options.windows.find((window) => window.active)?.id;
    if (this.#states && this.#enabled) {
      const changed = new Set<string>();
      for (const [id, state] of states) {
        const previous = this.#states.get(id) ?? "closed";
        if (state === previous) continue;
        changed.add(id);
        this.#animator.cancel(id);
        this.#playing.delete(id);
        this.#animator.cancel(`lower:${id}`);
        this.#playing.delete(`lower:${id}`);
        this.#pending.delete(id);
        const visible = options.windows.some((window) => window.id === id);
        if (visible && (previous === "closed" || previous === "minimized")) {
          this.#pending.set(id, previous === "closed" ? "open" : "restore");
        } else {
          const old = this.#snapshots.get(id);
          if (!old || previous === "closed" || previous === "minimized") continue;
          const transition = state === "closed" ? "close" : state === "minimized" ? "minimize" : "maximize";
          this.#begin(id, transition, old, false);
        }
      }
      for (const window of options.windows) {
        const entry = this.#playing.get(window.id);
        if (
          entry?.incoming &&
          Object.keys(window.rect).some((key) =>
            window.rect[key as keyof Rectangle] !== entry.snapshot.rect[key as keyof Rectangle]
          )
        ) {
          this.#animator.cancel(window.id);
          this.#playing.delete(window.id);
        }
      }
      if (
        active && active !== this.#active && !changed.has(active) && !changed.has(this.#active ?? "") &&
        !this.#playing.has(active)
      ) {
        this.#animator.cancel(`lower:${active}`);
        this.#playing.delete(`lower:${active}`);
        const raised = options.windows.find((window) => window.id === active)!;
        // An OUT reveal of the old covered area lets the new topmost window
        // appear underneath, rather than duplicating its text across the stage.
        this.#begin(active, "raise", snapshot(this.#cleanFrame, raised.rect), false);
        if (this.#active && !changed.has(this.#active) && !this.#playing.has(this.#active)) {
          const lowered = this.#snapshots.get(this.#active);
          if (lowered) {
            this.#begin(
              `lower:${this.#active}`,
              "lower",
              { rect: { ...lowered.rect, height: 1 }, cells: [lowered.cells[0] ?? []] },
              false,
              raised.rect,
            );
          }
        }
      }
    }
    this.#states = states;
    this.#active = active;
  }

  #begin(
    id: string,
    transition: DesktopWindowTransition,
    source: Snapshot,
    incoming: boolean,
    exclude?: Rectangle,
  ): void {
    const engineTransition: SurfaceTransition = transition === "raise"
      ? "open"
      : transition === "lower"
      ? "close"
      : transition;
    this.#animator.setSettings({
      speed: this.#settings.speed,
      kinds: { [engineTransition]: this.#settings.kinds[transition] },
    });
    const rect = source.rect, bounds = this.#bounds;
    const anchor = this.#anchor(id);
    const started = this.#animator.begin({
      surfaceId: id,
      transition: engineTransition,
      rect,
      now: this.#now,
      // The shared engine indexes one UTF-16 unit per cell. Blank wide/multi-unit
      // clusters just as Exomux does; don't shift columns or split surrogate pairs.
      snapshot: source.cells.map((row) =>
        row.map((cell) => cell.char.length === 1 && characterWidth(cell.char) === 1 ? cell.char : " ").join("")
      ),
      direction: incoming ? "in" : "out",
      overflow: {
        left: Math.max(0, rect.column - bounds.column),
        right: Math.max(0, bounds.column + bounds.width - rect.column - rect.width),
        up: Math.max(0, rect.row - bounds.row),
        down: Math.max(0, bounds.row + bounds.height - rect.row - rect.height),
      },
      flyTarget: anchor
        ? { column: anchor.column + Math.floor(anchor.width / 2) - rect.column, row: anchor.row - rect.row }
        : { column: 2 - rect.column, row: -rect.row },
    });
    if (started) this.#playing.set(id, { snapshot: source, transition, incoming, exclude });
  }

  /** Paint once even during fly-in so layout, selection and scroll state remain current. */
  paintWindow(frame: VizCell[][], window: WorkbenchWindowChromeProjection, paint: () => void): void {
    const incoming = this.#pending.get(window.id);
    const underneath = incoming || this.hides(window.id) ? snapshot(frame, window.rect) : undefined;
    paint();
    const clean = snapshot(frame, window.rect);
    this.#snapshots.set(window.id, clean);
    if (incoming) {
      this.#pending.delete(window.id);
      this.#begin(window.id, incoming, clean, true);
    }
    if (underneath && this.hides(window.id)) {
      for (let row = 0; row < window.rect.height; row++) {
        const target = frame[window.rect.row + row];
        if (!target) continue;
        for (let column = 0; column < window.rect.width; column++) {
          const x = window.rect.column + column;
          if (x >= 0 && x < target.length) target[x] = underneath.cells[row]![column]!;
        }
      }
    }
  }

  /** Composite below menus/taskbar/cursor; only detached glyphs travel, never input regions. */
  paintOverlays(frame: VizCell[][]): void {
    this.#cleanFrame = frame.map((row) => row.slice());
    for (const overlay of this.#animator.framesAt(this.#now)) {
      const entry = this.#playing.get(overlay.surfaceId);
      if (!entry) continue;
      for (const cell of overlay.frame.cells) {
        const x = overlay.rect.column + cell.column, y = overlay.rect.row + cell.row;
        const target = frame[y];
        if (!target || x < 0 || x >= target.length || !contains(this.#bounds, x, y)) continue;
        if (entry.exclude && contains(entry.exclude, x, y)) continue;
        const style = entry.snapshot.cells[cell.sourceRow]?.[cell.sourceColumn];
        let foreground = style?.foreground;
        if (cell.heat && foreground) {
          foreground = [
            Math.round(foreground[0] * (1 - cell.heat) + 255 * cell.heat),
            Math.round(foreground[1] * (1 - cell.heat) + 100 * cell.heat),
            Math.round(foreground[2] * (1 - cell.heat)),
          ];
        }
        target[x] = { char: cell.char, foreground, background: style?.background ?? target[x]!.background };
      }
      if (overlay.frame.done) this.#playing.delete(overlay.surfaceId);
    }
    const alive = new Set([...this.#states ?? []].filter(([, state]) => state !== "closed").map(([id]) => id));
    for (const id of this.#snapshots.keys()) if (!alive.has(id)) this.#snapshots.delete(id);
  }
}
