/** Real default-desktop checks; isolated loopback server, never the live exomux daemon. */
import { chromium } from "playwright";

const root = new URL("../docs/", import.meta.url);
const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (request) => {
  const pathname = decodeURIComponent(new URL(request.url).pathname);
  if (pathname.includes("..")) return new Response("Not found", { status: 404 });
  const path = pathname === "/" ? "index.html" : pathname.slice(1);
  try {
    const mime = path.endsWith(".js")
      ? "text/javascript"
      : path.endsWith(".html")
      ? "text/html"
      : path.endsWith(".png")
      ? "image/png"
      : "application/octet-stream";
    return new Response(await Deno.readFile(new URL(path, root)), { headers: { "content-type": mime } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
});
let browser;
try {
  browser = await chromium.launch({
    executablePath: Deno.env.get("EXOTUI_CHROMIUM") ?? "/snap/bin/chromium",
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    globalThis.__microphoneRequests = 0;
    navigator.mediaDevices.getUserMedia = () => {
      __microphoneRequests++;
      return Promise.reject(new Error("Test refuses microphone capture"));
    };
  });
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const settle = () => page.waitForTimeout(150);
  const point = async (column, row) => {
    return await page.evaluate(({ column, row }) => {
      const size = __desktop.stats().size, rect = document.querySelector("#app").getBoundingClientRect();
      return {
        x: rect.x + (column + .5) * rect.width / size.columns,
        y: rect.y + (row + .5) * rect.height / size.rows,
      };
    }, { column, row });
  };
  const click = async (column, row, options) => {
    const p = await point(column, row);
    await page.mouse.click(p.x, p.y, options);
    await settle();
  };
  const launch = async (id) => {
    await click(2, 0);
    const index = await page.evaluate((id) => __desktop.menu().items.findIndex((item) => item.id === id), id);
    check(index >= 0, "Missing default app: " + id);
    for (let i = 0; i < index; i++) await page.keyboard.press("ArrowDown");
    const rect = await page.evaluate((index) => __desktop.menu().itemRects[index], index);
    await click(rect.column + 7, rect.row);
  };
  await page.goto(`http://127.0.0.1:${server.addr.port}/`);
  await page.waitForFunction(() => globalThis.__desktop?.windows().some((window) => window.id === "about"));
  await page.waitForTimeout(2200);
  await launch("font-generator");
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Hello");
  await page.keyboard.press("Control+c");
  await settle();
  const expected =
    "  _  _     _ _     \n | || |___| | |___ \n | __ / -_) | / _ \\\n |_||_\\___|_|_\\___/\n                   ";
  check(
    await page.evaluate(() => navigator.clipboard.readText()) === expected,
    "Default generator did not copy actual Small output to the browser clipboard",
  );
  const gen = await page.evaluate(() => __desktop.windows().find((window) => window.id === "font-generator"));
  const p = await point(gen.clientRect.column + 1, gen.clientRect.row + 11);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  const end = await point(gen.clientRect.column + 14, gen.clientRect.row + 11);
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();
  await settle();
  const selected = await page.evaluate(() => __desktop.selection());
  check(selected.trim(), "Default window selection was empty");
  await page.mouse.click(p.x, p.y, { button: "right" });
  await settle();
  const menu = await page.evaluate(() => __desktop.context());
  const index = menu.items.findIndex((item) => item.label === "copy selected text");
  check(index >= 0, "Default desktop lacks context Copy");
  await click(menu.rect.column + 3, menu.rect.row + index + 1);
  check(
    await page.evaluate(() => navigator.clipboard.readText()) === selected,
    "Default desktop did not copy highlighted text",
  );
  check(await page.evaluate(() => __microphoneRequests) === 0, "Ordinary desktop clicks requested microphone capture");
  check(await page.evaluate(() => __desktop.audio()) === "noise", "Noise generator was not the default");
  check(errors.length === 0, errors.join("\n"));
  console.log(
    "PASS: actual default ExotUI desktop, editable Small FIGlet preview/output, real browser clipboard and right-click selection copy, default generator audio and zero automatic microphone requests.",
  );
} finally {
  await browser?.close();
  await server.shutdown();
}
