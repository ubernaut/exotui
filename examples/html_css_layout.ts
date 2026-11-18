import { runtimeHost } from "../src/runtime/host.ts";
import { type ComputedLayoutBox, createMarkupLayout } from "../mod.ts";
import { yogaLayoutSolver } from "../src/layout/solvers/yoga.ts";

const useYoga = runtimeHost.args.includes("--yoga");
const layout = createMarkupLayout({
  markup: `
    <window id="workspace" class="shell">
      <menu-bar id="topbar">File View Theme Help</menu-bar>
      <div id="main" class="workspace-grid">
        <panel id="sidebar" class="surface">
          Explorer
          Widgets
          Layout
          Themes
        </panel>
        <scroll-area id="content" class="surface">
          <panel id="cpu" class="metric">CPU 42%</panel>
          <panel id="mem" class="metric">Memory 71%</panel>
          <panel id="gpu" class="metric">GPU 63%</panel>
          <panel id="net" class="metric">Network 18%</panel>
        </scroll-area>
      </div>
      <statusbar id="status">solver=${useYoga ? "yoga" : "simple"} | resize-safe cell layout</statusbar>
    </window>
  `,
  css: `
    :root {
      --surface: #111827;
      --accent: #7dd3fc;
    }

    window {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      gap: 1;
      padding: 1;
      background: var(--surface);
      color: white;
    }

    menu-bar,
    statusbar {
      height: 1;
      color: var(--accent);
    }

    #main {
      display: flex;
      flex: 1;
      gap: 2;
      overflow: auto;
    }

    #sidebar {
      width: 24;
      padding: 1;
      border: 1 single var(--accent);
    }

    #content {
      display: flex;
      flex: 1;
      flex-wrap: wrap;
      align-items: start;
      gap: 1;
      padding: 1;
      overflow: auto;
    }

    .metric {
      width: 18;
      height: 5;
      padding: 1;
      border: 1 single var(--accent);
    }
  `,
  bounds: { column: 0, row: 0, width: 100, height: 30 },
  solver: useYoga ? yogaLayoutSolver() : undefined,
});

console.log(`# HTML/CSS Layout Demo (${useYoga ? "Yoga" : "Simple"} Solver)`);
console.log("");
console.log(formatBox(layout.layout.root));

function formatBox(box: ComputedLayoutBox, depth = 0): string {
  const indent = "  ".repeat(depth);
  const rect = `${box.rect.column},${box.rect.row} ${box.rect.width}x${box.rect.height}`;
  const content = `${box.contentRect.column},${box.contentRect.row} ${box.contentRect.width}x${box.contentRect.height}`;
  const lines = [
    `${indent}- ${box.tag}#${box.id} rect=${rect} content=${content} overflow=${box.scrollWidth}x${box.scrollHeight}`,
  ];
  for (const child of box.children) {
    lines.push(formatBox(child, depth + 1));
  }
  return lines.join("\n");
}
