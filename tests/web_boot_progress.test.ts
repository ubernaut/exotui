import { assert, assertEquals } from "./deps.ts";
import { BOOT_DOWNLOAD_SHARE, bootProgress, bootProgressHtml } from "../examples/web/boot_progress.ts";

/** The smallest page the inline loader can run against: only what it actually touches. */
function fakePage(html: string, options: { width?: number; xhr?: "works" | "throws"; reducedMotion?: boolean } = {}) {
  const attribute = (name: string) => new RegExp(` ${name}="([^"]*)"`).exec(html)?.[1] ?? null;
  const attributes = new Map<string, string>();
  for (const name of ["data-src", "data-bytes", "data-ready", "aria-valuenow"]) {
    const value = attribute(name);
    if (value !== null) attributes.set(name, value.replaceAll("&amp;", "&").replaceAll("&quot;", '"'));
  }
  const text = { bar: { textContent: "" }, percent: { textContent: "" }, note: { textContent: "" } };
  const appended: { type: string; src: string; onerror?: () => void }[] = [];
  const timers: (() => void)[] = [];
  const frames: (() => void)[] = [];
  let removed = false;
  let canvas = false;
  let observer: (() => void) | undefined;
  const root = {
    parentNode: { removeChild: () => removed = true } as { removeChild(): void } | null,
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    querySelector: (selector: string) =>
      selector === "[data-bar]" ? text.bar : selector === "[data-percent]" ? text.percent : text.note,
  };
  const request = {
    opened: "",
    responseType: "",
    sent: false,
    onprogress: undefined as
      | ((event: { lengthComputable: boolean; loaded: number; total: number }) => void)
      | undefined,
    onloadend: undefined as (() => void) | undefined,
  };
  class Request {
    constructor() {
      if (options.xhr === "throws") throw new Error("no XMLHttpRequest here");
      return Object.assign(this, {
        open: (_method: string, url: string) => request.opened = url,
        send: () => request.sent = true,
      });
    }
    set responseType(value: string) {
      request.responseType = value;
    }
    set onprogress(handler: typeof request.onprogress) {
      request.onprogress = handler;
    }
    set onloadend(handler: typeof request.onloadend) {
      request.onloadend = handler;
    }
  }
  const window = {
    innerWidth: options.width ?? 1440,
    matchMedia: () => ({ matches: !!options.reducedMotion }),
    requestAnimationFrame: (callback: () => void) => frames.push(callback),
    MutationObserver: class {
      constructor(callback: () => void) {
        observer = callback;
      }
      observe() {}
      disconnect() {
        observer = undefined;
      }
    },
    __exotuiBoot: undefined as ReturnType<typeof bootProgress> | undefined,
  };
  const document = {
    documentElement: {},
    body: { appendChild: (node: typeof appended[number]) => appended.push(node) },
    getElementById: (id: string) => id === "exotui-boot" ? root : null,
    createElement: () => ({ type: "", src: "" }),
    querySelector: (selector: string) => selector === "canvas" && canvas ? {} : null,
  };
  const script = /<script>([\s\S]*)<\/script>/.exec(html)![1]!;
  new Function("window", "document", "XMLHttpRequest", "MutationObserver", "setTimeout", script)(
    window,
    document,
    Request,
    window.MutationObserver,
    (callback: () => void) => timers.push(callback),
  );
  return {
    boot: window.__exotuiBoot!,
    text,
    request,
    appended,
    attribute: (name: string) => attributes.get(name),
    removed: () => removed,
    /** The desktop mounts its canvas; the observer the loader installed is told. */
    mountCanvas() {
      canvas = true;
      observer?.();
    },
    runFrames(count: number) {
      for (let index = 0; index < count; index += 1) frames.shift()?.();
    },
    runTimers() {
      for (const timer of timers.splice(0)) timer();
    },
  };
}
const filled = (bar: string) => [...bar].filter((cell) => cell === "█").length;
const cells = (bar: string) => [...bar].length;

Deno.test("the shell markup is a labelled progress bar that carries the module, its size and the fallback", () => {
  const html = bootProgressHtml({
    src: './assets/desktop.js?v="1"&x',
    bytes: 899_972.4,
    name: "tsotchke <b>",
    ready: "manual",
    fallbackHtml: '<a href="./report.html">Read without the desktop</a>',
  });
  for (
    const required of [
      'id="exotui-boot"',
      'role="progressbar"',
      'aria-label="Loading tsotchke &lt;b&gt;"',
      'aria-valuemin="0"',
      'aria-valuemax="100"',
      'data-src="./assets/desktop.js?v=&quot;1&quot;&amp;x"',
      'data-bytes="899972"',
      'data-ready="manual"',
      '<a href="./report.html">Read without the desktop</a>',
      "prefers-reduced-motion",
    ]
  ) assert(html.includes(required), "missing " + required);
  assert(!html.includes("<b>"), "the name is text, never markup");
  assert(!/https?:\/\//.test(html), "the bar loads nothing from another origin");
  assert(!html.includes('<script type="module"'), "the loader starts the module itself, after its bytes arrive");
  assert(new TextEncoder().encode(html).length < 5000, "the bar must cost a page almost nothing");
  const markup = html.replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>/g, "");
  assert(!/>\s+</.test(markup), "nothing is laid out with spaces, so a reformatted page shell looks the same");
  const plain = bootProgressHtml({ src: "./a.js" });
  assert(plain.includes('data-bytes="0"') && plain.includes('data-ready="canvas"') && plain.includes("exowebtui"));
});

Deno.test("the bar follows the module's bytes, then starts the module exactly once", () => {
  const page = fakePage(bootProgressHtml({ src: "./assets/desktop.js", bytes: 1000 * 1024, ready: "manual" }));
  assertEquals(page.request.opened, "./assets/desktop.js");
  assertEquals(page.request.responseType, "blob");
  assert(page.request.sent);
  assertEquals(cells(page.text.bar.textContent), 32, "a desktop-width page gets the widest bar");
  assertEquals(filled(page.text.bar.textContent), 0);
  assertEquals(page.text.percent.textContent, "0%");
  assertEquals(page.appended.length, 0, "nothing starts before the bytes arrive");

  // A server that reports a total: half the bytes fill half of the download share.
  page.request.onprogress!({ lengthComputable: true, loaded: 500, total: 1000 });
  assertEquals(page.attribute("aria-valuenow"), String(BOOT_DOWNLOAD_SHARE * 50));
  assertEquals(page.text.percent.textContent, "40%");
  assertEquals(filled(page.text.bar.textContent), Math.round(0.4 * 32));
  // A compressed response reports none, so the size the build wrote into the page stands in.
  page.request.onprogress!({ lengthComputable: false, loaded: 750 * 1024, total: 0 });
  assertEquals(page.text.percent.textContent, "60%");
  assertEquals(page.text.note.textContent, "750K of 1000K");
  // The bar never runs backwards, and bytes beyond the hint cannot overfill the download share.
  page.request.onprogress!({ lengthComputable: false, loaded: 100 * 1024, total: 0 });
  assertEquals(page.text.percent.textContent, "60%");
  page.request.onprogress!({ lengthComputable: false, loaded: 4000 * 1024, total: 0 });
  assertEquals(page.text.percent.textContent, "80%");

  page.request.onloadend!();
  page.request.onloadend!();
  assertEquals(page.appended.map((node) => [node.type, node.src]), [["module", "./assets/desktop.js"]]);
  assertEquals(page.text.note.textContent, "starting");
  assertEquals(page.attribute("aria-valuetext"), "starting");
});

Deno.test("a page reports its own stages and decides when the bar goes away", () => {
  const page = fakePage(bootProgressHtml({ src: "./desktop.js", ready: "manual" }));
  page.request.onloadend!();
  page.boot.stage("documents", 0.5);
  assertEquals(page.text.percent.textContent, "90%");
  assertEquals(page.text.note.textContent, "documents");
  page.boot.stage("out of range", 7);
  assertEquals(page.text.percent.textContent, "100%");
  // A canvas alone does not finish a page that asked to decide for itself.
  page.mountCanvas();
  page.runFrames(10);
  assertEquals(page.attribute("data-state"), undefined);
  page.boot.done();
  assertEquals(page.attribute("data-state"), "done");
  assertEquals(page.text.note.textContent, "ready");
  assert(!page.removed(), "the bar fades before it leaves");
  page.runTimers();
  assert(page.removed());
  page.boot.stage("late", 0.1);
  page.boot.fail("late");
  assertEquals(page.attribute("data-state"), "done", "nothing changes a finished bar");
});

Deno.test("by default the bar leaves a few frames after the desktop's canvas appears", () => {
  const page = fakePage(bootProgressHtml({ src: "./desktop.js" }));
  page.request.onloadend!();
  page.runFrames(10);
  assertEquals(page.attribute("data-state"), undefined, "no canvas yet");
  page.mountCanvas();
  page.runFrames(3);
  assertEquals(page.attribute("data-state"), undefined, "the first frames are still being painted");
  page.runFrames(1);
  assertEquals(page.attribute("data-state"), "done");
});

Deno.test("a module that cannot load leaves a message, and a browser without the request still starts", () => {
  const page = fakePage(bootProgressHtml({ src: "./missing.js" }));
  page.request.onloadend!();
  page.appended[0]!.onerror!();
  assertEquals(page.attribute("data-state"), "failed");
  assertEquals(page.text.note.textContent, "could not load ./missing.js");
  page.boot.done();
  assert(!page.removed(), "a failed page keeps its message");

  const bare = fakePage(bootProgressHtml({ src: "./desktop.js" }), { xhr: "throws" });
  assertEquals(bare.appended.map((node) => node.src), ["./desktop.js"], "the module starts without a progress request");
});

Deno.test("a narrow page gets a shorter bar and reduced motion removes the bar at once", () => {
  const phone = fakePage(bootProgressHtml({ src: "./desktop.js", ready: "manual" }), {
    width: 390,
    reducedMotion: true,
  });
  assertEquals(cells(phone.text.bar.textContent), 19);
  const tiny = fakePage(bootProgressHtml({ src: "./desktop.js" }), { width: 120 });
  assertEquals(cells(tiny.text.bar.textContent), 10, "the bar never collapses");
  phone.boot.done();
  phone.runTimers();
  assert(phone.removed());
});

Deno.test("a host without a bar can still report: every call is silent", () => {
  const boot = bootProgress();
  boot.stage("anything", 0.5);
  boot.fail("nothing to show it");
  boot.done();
});
