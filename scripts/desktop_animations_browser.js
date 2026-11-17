/** Real default/consumer desktop animation check, using native cells and actual chrome input. */
import { chromium } from "playwright";
import { runtimeHost } from "../src/runtime/host.ts";

let server, browser;
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
try {
  if (!runtimeHost.args[0]) {
    const root = new URL("../docs/", import.meta.url);
    server = runtimeHost.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (request) => {
      const path = decodeURIComponent(new URL(request.url).pathname);
      if (path.includes("..")) return new Response("Not found", { status: 404 });
      try {
        return new Response(await runtimeHost.readFile(new URL(path === "/" ? "index.html" : path.slice(1), root)), {
          headers: {
            "content-type": path.endsWith(".js")
              ? "text/javascript"
              : path.endsWith(".png")
              ? "image/png"
              : "text/html",
          },
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    });
  }
  browser = await chromium.launch({
    executablePath: runtimeHost.env.get("EXOTUI_CHROMIUM") ?? "/snap/bin/chromium",
    args: [
      "--no-sandbox",
      "--disable-gpu",
      ...(runtimeHost.env.get("TECH_STACK_TLS_SPKI")
        ? [`--ignore-certificate-errors-spki-list=${runtimeHost.env.get("TECH_STACK_TLS_SPKI")}`]
        : []),
    ],
  });
  const context = await browser.newContext({ viewport: { width: 2100, height: 1100 } });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(runtimeHost.args[0] ?? `http://127.0.0.1:${server.addr.port}/`);
  await page.waitForFunction(() => globalThis.__desktop?.windows().length > 0);
  await page.waitForTimeout(2300);
  const consumer = await page.evaluate(() => !!globalThis.__techStack);
  if (!consumer) {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.waitForTimeout(200);
  }
  const rootId = consumer ? "ecosystem" : "about", productId = consumer ? "selene" : "clock";
  await page.evaluate(() => {
    globalThis.__animationSamples = [];
    let prior = "";
    function sample() {
      const effects = __desktop.animations();
      if (effects.length) {
        const rows = Array.from({ length: __desktop.stats().rows }, (_, row) => __desktop.row(row)).join("\n");
        const key = JSON.stringify(effects) + rows;
        if (prior !== key) {
          __animationSamples.push({ effects, rows });
          if (__animationSamples.length > 240) __animationSamples.shift();
          prior = key;
        }
      }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  const point = (column, row) =>
    page.evaluate(({ column, row }) => {
      const size = __desktop.stats().size, rect = document.querySelector("#app").getBoundingClientRect();
      return {
        x: rect.x + (column + .5) * rect.width / size.columns,
        y: rect.y + (row + .5) * rect.height / size.rows,
      };
    }, { column, row });
  const click = async (column, row) => {
    const p = await point(column, row);
    await page.mouse.click(p.x, p.y);
  };
  const settled = () => page.waitForFunction(() => __desktop.animations().length === 0);
  const clear = () =>
    page.evaluate(() => {
      __animationSamples.length = 0;
    });
  const observed = async (transition, animated = true) => {
    if (animated) {
      await page.waitForFunction(
        (transition) => __animationSamples.some((s) => s.effects.some((effect) => effect.transition === transition)),
        transition,
      );
    }
    await settled();
    const samples = await page.evaluate(
      (transition) => __animationSamples.filter((s) => s.effects.some((effect) => effect.transition === transition)),
      transition,
    );
    const landed = await page.evaluate(() =>
      Array.from({ length: __desktop.stats().rows }, (_, row) => __desktop.row(row)).join("\n")
    );
    const grids = new Set([...samples.map((sample) => sample.rows), landed]);
    check(
      animated ? samples.length >= 1 && grids.size >= 2 : samples.length === 0,
      `${transition}: expected ${
        animated ? "changing animated native cells" : "no motion"
      }; observed ${samples.length} animated frames and ${grids.size} animation/settled cell grids`,
    );
  };
  const launch = async (id) => {
    await click(2, 0);
    await page.waitForTimeout(60);
    const index = await page.evaluate((id) => __desktop.menu().items.findIndex((item) => item.id === id), id);
    check(index >= 0, `Missing app ${id}`);
    for (let step = 0; step < index; step++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
  };
  const chrome = async (kind) => {
    const rect = await page.evaluate(
      ({ id, kind }) =>
        __desktop.windows().find((window) => window.id === id)?.controls.find((control) =>
          control.kind === kind || kind === "maximize" && control.kind === "restore"
        )
          ?.hitRect,
      { id: productId, kind },
    );
    check(rect, `Missing ${kind} control`);
    await click(rect.column + Math.floor(rect.width / 2), rect.row);
  };
  // Headless software presentation can skip a normal 220ms effect entirely.
  // Select the real persisted slow setting through the terminal UI so the
  // independent browser oracle can inspect intermediate native-cell frames.
  await launch("settings");
  await page.waitForFunction(() => __desktop.windows().find((w) => w.active)?.id === "settings");
  await settled();
  const settingRow = (needle) =>
    page.evaluate((needle) => {
      const w = __desktop.windows().find((w) => w.id === "settings");
      for (let y = w.clientRect.row; y < w.clientRect.row + w.clientRect.height; y++) {
        if (
          __desktop.row(y).slice(w.clientRect.column, w.clientRect.column + w.clientRect.width).includes(needle)
        ) return { column: w.clientRect.column, row: y };
      }
    }, needle);
  const plain = await settingRow("plain —");
  check(plain, "Settings did not expose the plain background");
  await click(plain.column + 8, plain.row);
  let speed;
  for (let step = 0; step < 150; step++) {
    const enabledShader = await settingRow("☑");
    if (enabledShader) {
      // The independent cell-coordinate oracle uses unwarped input, not a
      // duplicate of the shader's curved/animated hit-test implementation.
      await click(enabledShader.column + 8, enabledShader.row);
      await page.waitForTimeout(100);
      continue;
    }
    speed = await settingRow("animation speed");
    if (speed) break;
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(25);
  }
  check(speed, "Animation speed not discoverable in Settings");
  await click(speed.column + 29, speed.row);
  await page.waitForFunction(() => __desktop.animationSettings().speed === "slow");
  const settingsClose = await page.evaluate(() =>
    __desktop.windows().find((w) => w.id === "settings").controls.find((c) => c.kind === "close").hitRect
  );
  await click(settingsClose.column, settingsClose.row);
  await settled();
  await clear();
  await launch(productId);
  await observed("open");
  check(
    await page.evaluate((id) => __desktop.windows().find((w) => w.active)?.id === id, productId),
    "Open did not immediately focus the product",
  );
  await clear();
  await chrome("minimize");
  await page.waitForFunction((id) => !__desktop.windows().some((w) => w.id === id), productId);
  await observed("minimize");
  await clear();
  await launch(productId);
  await observed("restore");
  await clear();
  await chrome("maximize");
  await observed("maximize");
  await clear();
  await chrome("maximize");
  await observed("maximize");
  await clear();
  const exposed = await page.evaluate(({ rootId, productId }) => {
    const root = __desktop.windows().find((w) => w.id === rootId),
      product = __desktop.windows().find((w) => w.id === productId);
    for (let y = root.clientRect.row; y < root.clientRect.row + root.clientRect.height; y++) {
      for (let x = root.clientRect.column; x < root.clientRect.column + root.clientRect.width; x++) {
        if (
          x < product.rect.column || x >= product.rect.column + product.rect.width || y < product.rect.row ||
          y >= product.rect.row + product.rect.height
        ) return { x, y };
      }
    }
  }, { rootId, productId });
  check(exposed, "No exposed background client cell to focus");
  await click(exposed.x, exposed.y);
  await observed("raise");
  check(
    await page.evaluate(() =>
      __animationSamples.some((s) => s.effects.some((effect) => effect.transition === "lower"))
    ),
    "Focus did not animate the lowered titlebar",
  );
  check(
    await page.evaluate((id) => __desktop.windows().find((w) => w.active)?.id === id, rootId),
    "Background client click failed to raise immediately",
  );
  await launch(productId);
  await settled();
  await clear();
  await chrome("close");
  await observed("close");
  check(
    await page.evaluate((id) => !__desktop.windows().some((w) => w.id === id), productId),
    "Closed window remained live",
  );
  await clear();
  await launch(productId);
  await page.waitForFunction(() => __desktop.animations().some((effect) => effect.incoming));
  await page.setViewportSize({ width: 1500, height: 960 });
  await page.waitForTimeout(100);
  check(
    await page.evaluate(() => __desktop.animations().length === 0),
    "Resize left stale ghosts or incoming suppression",
  );
  await launch("settings");
  await page.waitForFunction(() => __desktop.windows().find((w) => w.active)?.id === "settings");
  await settled();
  let offRow = await settingRow("animation speed");
  for (let step = 0; step < 150 && !offRow; step++) {
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(25);
    offRow = await settingRow("animation speed");
  }
  check(offRow, "Settings lost its animation control on reopening");
  await click(offRow.column + 29, offRow.row);
  await page.waitForFunction(() => __desktop.animationSettings().speed === "off");
  const closeSettings = await page.evaluate(() =>
    __desktop.windows().find((w) => w.id === "settings").controls.find((c) => c.kind === "close").hitRect
  );
  await click(closeSettings.column + Math.floor(closeSettings.width / 2), closeSettings.row);
  await page.waitForTimeout(150);
  await launch(productId);
  await page.waitForFunction((id) => __desktop.windows().some((w) => w.id === id && w.active), productId);
  // Floating windows retain their original size/position on desktop resize;
  // the host guarantees a reachable title, not that every control is on-screen.
  const overflow = await page.evaluate((id) => {
    const w = __desktop.windows().find((w) => w.id === id);
    return {
      column: w.rect.column + 5,
      row: w.rect.row,
      right: w.rect.column + w.rect.width - __desktop.stats().columns,
    };
  }, productId);
  if (overflow.right > 0) {
    const from = await point(overflow.column, overflow.row),
      to = await point(overflow.column - overflow.right - 2, overflow.row);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
  }
  await chrome("close");
  await page.waitForFunction((id) => !__desktop.windows().some((w) => w.id === id), productId).catch(async (error) => {
    const state = await page.evaluate(() => ({
      windows: __desktop.windows().map((w) => ({
        id: w.id,
        active: w.active,
        state: w.state,
        rect: w.rect,
        controls: w.controls.map((c) => ({ kind: c.kind, rect: c.hitRect })),
      })),
      pointer: __desktop.pointer(),
      menu: __desktop.menu(),
      settings: __desktop.animationSettings(),
    }));
    throw new Error(`Off-mode close did not land: ${JSON.stringify(state)}`, { cause: error });
  });
  await clear();
  await launch(productId);
  await page.waitForFunction((id) => __desktop.windows().some((w) => w.id === id && w.active), productId);
  await page.waitForTimeout(350);
  await observed("open", false);
  await page.reload();
  await page.waitForFunction(() => globalThis.__desktop?.windows().length > 0);
  await page.waitForFunction(() => __desktop.animationSettings().speed === "off");
  check(
    await page.evaluate(() => __desktop.animationSettings().speed === "off"),
    "Animation speed did not survive reload through IndexedDB",
  );
  // Compare genuine overlapping-window glass with independently sampled opaque
  // upper colors and the actual scene exposed by minimizing that window.
  await page.setViewportSize({ width: 2100, height: 1100 });
  await page.waitForTimeout(200);
  await launch(rootId);
  await launch(productId);
  const opacity = async (label) => {
    await launch("settings");
    await page.waitForFunction(() => __desktop.windows().find((w) => w.active)?.id === "settings");
    await page.waitForTimeout(100);
    let row = await settingRow(label);
    for (let step = 0; step < 150 && !row; step++) {
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(25);
      row = await settingRow(label);
    }
    check(row, `Missing opacity setting: ${label}`);
    await click(row.column + 8, row.row);
    const close = await page.evaluate(() =>
      __desktop.windows().find((w) => w.id === "settings").controls.find((c) => c.kind === "close").hitRect
    );
    await click(close.column + Math.floor(close.width / 2), close.row);
    await launch(productId);
    await page.waitForTimeout(150);
  };
  await opacity("solid windows");
  const candidates = await page.evaluate(({ rootId, productId }) => {
    const a = __desktop.windows().find((w) => w.id === rootId).clientRect;
    const b = __desktop.windows().find((w) => w.id === productId).clientRect;
    globalThis.__glassRaw = [];
    for (let y = Math.max(a.row, b.row) + 1; y < Math.min(a.row + a.height, b.row + b.height) - 2; y++) {
      for (let x = Math.max(a.column, b.column) + 1; x < Math.min(a.column + a.width, b.column + b.width) - 2; x++) {
        const cell = __desktop.cell(x, y);
        if (cell?.char === " " && cell.background) __glassRaw.push({ x, y, raw: cell.background });
      }
    }
    return __glassRaw.length;
  }, { rootId, productId });
  check(candidates > 3, "No native overlap cells for the independent glass oracle");
  await opacity("65% opacity");
  await chrome("minimize");
  await page.waitForFunction((id) => !__desktop.windows().some((w) => w.id === id), productId);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(150);
  const count = await page.evaluate(() => {
    globalThis.__glassExpected = __glassRaw.flatMap(({ x, y, raw }) => {
      const below = __desktop.cell(x, y);
      if (!below?.foreground || !below.background || !below.char || below.char === " ") return [];
      const coverage = ({ "░": .25, "▒": .5, "▓": .75, "█": 1 })[below.char] ?? .55;
      // Ordinary alpha arithmetic applied to captured source colors, not a call
      // into the implementation or a synthesized copy of the lower document.
      const impression = below.background.map((value, channel) =>
        Math.round(value + (below.foreground[channel] - value) * coverage)
      );
      return [{ x, y, expected: impression.map((value, channel) => Math.round(value + (raw[channel] - value) * .65)) }];
    }).slice(0, 32);
    return __glassExpected.length;
  });
  check(count >= 3, "Need lower-window ink, not wallpaper-only samples");
  await launch(productId);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);
  const wrong = await page.evaluate(() =>
    __glassExpected.filter(({ x, y, expected }) =>
      JSON.stringify(__desktop.cell(x, y)?.background) !== JSON.stringify(expected)
    )
  );
  check(!wrong.length, `Overlapping glass ignored/miscomposited lower windows: ${JSON.stringify(wrong.slice(0, 3))}`);
  await context.close();

  const reduced = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
  const reducedPage = await reduced.newPage();
  reducedPage.on("pageerror", (error) => errors.push(error.message));
  await reducedPage.goto(runtimeHost.args[0] ?? `http://127.0.0.1:${server.addr.port}/`);
  await reducedPage.waitForFunction(() => globalThis.__desktop?.windows().length > 0);
  await reducedPage.evaluate(() => {
    globalThis.__reducedGhosts = false;
    function sample() {
      __reducedGhosts ||= __desktop.animations().length > 0;
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  // Use the actual launcher in both hosts.
  await reducedPage.keyboard.press("Escape");
  const reducedPoint = await reducedPage.evaluate(() => {
    const size = __desktop.stats().size, rect = document.querySelector("#app").getBoundingClientRect();
    return { x: rect.x + 2.5 * rect.width / size.columns, y: rect.y + .5 * rect.height / size.rows };
  });
  await reducedPage.mouse.click(reducedPoint.x, reducedPoint.y);
  const index = await reducedPage.evaluate(
    (id) => __desktop.menu().items.findIndex((item) => item.id === id),
    productId,
  );
  for (let i = 0; i < index; i++) await reducedPage.keyboard.press("ArrowDown");
  await reducedPage.keyboard.press("Enter");
  await reducedPage.waitForTimeout(400);
  check(
    await reducedPage.evaluate(() => !__reducedGhosts && __desktop.animations().length === 0),
    "Reduced motion played a detached animation",
  );
  check(
    await reducedPage.evaluate((id) => __desktop.windows().some((w) => w.id === id && w.active), productId),
    "Reduced motion hid or blocked the product",
  );
  await reduced.close();
  check(errors.length === 0, errors.join("\n"));
  console.log(
    `PASS: ${
      consumer ? "tech-stack" : "default ExotUI"
    } actual native-cell open/close, taskbar flights, maximize/unmaximize, client-click raise/lower, resize cancellation, Settings/off persistence, ${count} independent overlapping-glass colors and reduced motion.`,
  );
} finally {
  await browser?.close();
  await server?.shutdown();
}
