// Copyright 2023 Im-Beast. MIT license.
/** Real browser growth/shrink regression for the shared presenter, including Canvas2D pixels. */
import { chromium } from "playwright";

const root = new URL("..", import.meta.url).pathname;
const bundled = await new Deno.Command(Deno.execPath(), {
  args: [
    "bundle",
    "--platform=browser",
    "--minify",
    "--config",
    `${root}/deno.jsonc`,
    "--frozen",
    `${root}/src/web/web_presenter.ts`,
  ],
  stdout: "piped",
  stderr: "piped",
}).output();
if (!bundled.success) throw new Error(new TextDecoder().decode(bundled.stderr));
const server = Deno.serve(
  { hostname: "127.0.0.1", port: 0, onListen() {} },
  (request) =>
    new URL(request.url).pathname === "/presenter.js"
      ? new Response(bundled.stdout, { headers: { "content-type": "text/javascript" } })
      : new Response(
        "<!doctype html><style>html,body,#app{margin:0;width:100%;height:100%;overflow:hidden}</style><div id=app></div>",
        { headers: { "content-type": "text/html" } },
      ),
);
let browser;
try {
  browser = await chromium.launch({
    executablePath: Deno.env.get("EXOTUI_CHROMIUM") ?? "/snap/bin/chromium",
    args: ["--no-sandbox", "--disable-gpu"],
  });
  let cells = 0;
  let pixels = 0;
  for (const deviceScaleFactor of [1, 2]) {
    const context = await browser.newContext({ viewport: { width: 800, height: 650 }, deviceScaleFactor });
    try {
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${server.addr.port}/`);
      await page.evaluate(async () => {
        const { webPresenter } = await import("/presenter.js") as typeof import("../src/web/web_presenter.ts");
        const presenter = webPresenter({ root: document.querySelector<HTMLElement>("#app")! });
        presenter.host.stop(); // Drive exactly one known, unanimated frame per viewport.
        (globalThis as unknown as { proof: typeof presenter }).proof = presenter;
      });
      for (
        const [width, height] of [[800, 650], [1280, 650], [1600, 900], [900, 650], [1600, 900], [1600, 600], [
          390,
          844,
        ], [1600, 1000]]
      ) {
        await page.setViewportSize({ width: width!, height: height! });
        const result = await page.evaluate(async () => {
          const p = (globalThis as unknown as { proof: import("../src/web/web_presenter.ts").WebShellPresenter }).proof;
          // ResizeObserver and the tracked Computed subscriptions must settle.
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
          const { columns, rows } = p.size();
          const frame = Array.from({ length: rows }, (_, row) =>
            Array.from({ length: columns }, (_, column) => ({
              char: String.fromCharCode(65 + (row + column) % 26),
              foreground: [220, 230, 240] as const,
              background: [17 + row % 9, 23 + column % 9, 41] as const,
            })));
          p.present(frame);
          p.host.canvas.render();
          const decoder = new TextDecoder();
          const canvas = p.host.element;
          const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
          const ratio = devicePixelRatio;
          let compared = 0;
          for (let row = 0; row < rows; row++) {
            for (let column = 0; column < columns; column++) {
              const raw = p.host.canvas.frameBuffer[row]?.[column];
              const text = (raw instanceof Uint8Array ? decoder.decode(raw) : raw ?? "").replace(
                // deno-lint-ignore no-control-regex -- Strip the ANSI styling from a real presented cell.
                /\x1b\[[0-?]*[ -/]*[@-~]/g,
                "",
              );
              if (text !== frame[row]![column]!.char) {
                throw new Error(`Missing/stale cell ${column},${row} at ${columns}x${rows}`);
              }
              // The bottom-right pixel is background, outside the text glyph.
              const x = Math.floor((column + 1) * 9 * ratio) - 1, y = Math.floor((row + 1) * 18 * ratio) - 1;
              const index = (y * canvas.width + x) * 4;
              const expected = [...frame[row]![column]!.background, 255];
              if (!expected.every((value, i) => data[index + i] === value)) {
                throw new Error(`Unpainted pixel ${x},${y} at ${columns}x${rows}`);
              }
              compared++;
            }
          }
          return compared;
        });
        cells += result;
        pixels += result;
      }
      await page.evaluate(() =>
        (globalThis as unknown as { proof: import("../src/web/web_presenter.ts").WebShellPresenter }).proof.dispose()
      );
    } finally {
      await context.close();
    }
  }
  console.log(
    `PASS: 16 real browser resize frames at DPR 1/2; ${cells} exact cells and ${pixels} Canvas2D background pixels.`,
  );
} finally {
  await browser?.close();
  await server.shutdown();
}
