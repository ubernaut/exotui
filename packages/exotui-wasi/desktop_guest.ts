import { createDesktopApp } from "../../examples/web/desktop_app.ts";
import { runShellApp, type ShellPresentedFrame, type ShellPresenter } from "../../src/app/shell_presenter.ts";
import { type AsyncStore, MemoryStore } from "../../src/runtime/storage.ts";

// Scripted presenter for the guest-toolchain gate. No terminal or native permissions.
export const run = {
  async run(): Promise<void> {
    const frames: ShellPresentedFrame[] = [];
    const stores = new Map<string, AsyncStore<unknown>>();
    const size = { columns: 90, rows: 28 };
    let disposed = false;
    let resize: Parameters<ShellPresenter["onResize"]>[0] | undefined;
    let nextFrame: ((now: number) => void) | undefined;
    let resolveFrame: () => void;
    const ready = new Promise<void>((resolve) => resolveFrame = resolve);
    const presenter: ShellPresenter = {
      capabilities: { gpu: false, audioInput: false },
      size: () => ({ ...size }),
      onResize(listener) {
        resize = listener;
        return () => resize = undefined;
      },
      onKey: () => () => {},
      onPointer: () => () => {},
      onWheel: () => () => {},
      present: (frame) => frames.push(frame),
      requestFrame(callback) {
        nextFrame = callback;
        resolveFrame();
      },
      store<T>(name: string) {
        if (!stores.has(name)) stores.set(name, new MemoryStore());
        return stores.get(name) as AsyncStore<T>;
      },
      now: () => performance.now(),
      dispose() {
        disposed = true;
        nextFrame = undefined;
      },
    };
    const handle = runShellApp(presenter, createDesktopApp());
    try {
      await ready;
      nextFrame?.(presenter.now());
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
      Object.assign(size, { columns: 78, rows: 24 });
      resize?.(presenter.size());
      nextFrame?.(presenter.now());
      for (const [index, [columns, rows]] of [[90, 28], [78, 24]].entries()) {
        const frame = frames[index];
        if (frame?.length !== rows || frame.some((row) => row.length !== columns)) {
          throw new Error(`Expected a ${columns}x${rows} desktop frame`);
        }
        const text = frame.map((row) => row.map((cell) => cell.char).join("")).join("\n");
        if (!text.includes("⏻ exowebtui") || !text.includes("welcome")) throw new Error("Missing desktop furniture");
      }
    } finally {
      handle.stop();
    }
    if (!disposed) throw new Error("Presenter was not disposed");
    console.log("exotui-wasi: desktop rendered 90x28 and 78x24; disposed");
  },
};
