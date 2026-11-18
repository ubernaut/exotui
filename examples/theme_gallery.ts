import { runtimeHost } from "../src/runtime/host.ts";
import {
  createThemeGallery,
  createThemeProvider,
  createThemeProviderReport,
  createThemeRegistry,
  filterThemeGalleryItems,
  formatThemeProviderReportMarkdown,
  grWizardThemePacks,
  selectThemeGalleryItem,
  standardThemeComponentNames,
} from "../mod.ts";

interface ThemeGalleryArgs {
  query: string;
  select?: string;
}

const args = parseArgs(runtimeHost.args);
const provider = createThemeProvider({
  registry: createThemeRegistry(grWizardThemePacks),
  activeId: "grwizard-arcane",
  layers: [
    {
      id: "focus-rings",
      label: "Focus Rings",
      options: {
        components: {
          Button: { variants: { primary: { focused: "accent", active: "success" } } },
          DataTable: { variants: { selected: { active: "accent" } } },
        },
      },
    },
    {
      id: "review-states",
      label: "Review States",
      enabled: false,
      options: {
        components: {
          Badge: { variants: { review: { base: "warning" } } },
          StatusBar: { variants: { review: { active: "warning" } } },
        },
      },
    },
  ],
});

const showcaseComponents = [
  "Badge",
  "Button",
  "DataTable",
  "Frame",
  "Input",
  "Modal",
  "ProgressBar",
  "StatusBar",
  "Table",
  "ThreeAscii",
  "WindowManager",
] as const;

if (args.select) {
  const selection = selectThemeGalleryItem(provider, args.select, galleryOptions(args.query));
  if (!selection.selected) {
    console.log(`Could not select ${args.select}: ${selection.reason ?? "unknown"}`);
  }
}

const gallery = createThemeGallery(provider, galleryOptions(args.query));
const standardReport = createThemeProviderReport(provider, {
  preview: false,
  coverage: { components: standardThemeComponentNames() },
});

console.log("Theme gallery demo");
console.log(`active=${gallery.activeId} query=${gallery.query || "(none)"} themes=${gallery.count}`);
console.log(
  `standard coverage=${
    standardReport.summary.completeCoverage ? "complete" : "incomplete"
  } components=${standardReport.summary.componentCount} missing-states=${standardReport.summary.missingStateCount}`,
);
console.log("select with: deno task theme-gallery -- --select grwizard-forge");
console.log("");

for (const match of gallery.matches) {
  const item = match.item;
  console.log(
    `${
      item.active ? ">" : " "
    } ${item.id}: ${item.label} palette=${item.palette} valid=${item.valid} score=${match.score}`,
  );
  if (item.description) {
    console.log(`  ${item.description}`);
  }
  console.log(`  layers=${item.activeLayers.join(", ") || "none"}`);
  console.log(`  matched=${match.matched.join(", ") || "none"}`);
  console.log(`  tokens=${item.preview.tokens.map((token) => token.preview.styled).join(" ")}`);
  console.log(
    `  button=${preview(item, "Button", "default", "focused")} status=${
      preview(item, "StatusBar", "warning", "base")
    } badge=${preview(item, "Badge", "review", "base")}`,
  );
}

console.log("");
console.log(
  `Quick filter "brass": ${filterThemeGalleryItems(gallery.items, "brass").map((item) => item.id).join(", ")}`,
);
console.log("");
console.log(formatThemeProviderReportMarkdown(provider, {
  title: "Theme Provider Audit",
  preview: false,
  coverage: { components: showcaseComponents },
}));

function galleryOptions(query: string) {
  return {
    query,
    sample: "LIVE",
    tokens: ["foreground", "muted", "accent", "success", "warning", "danger"] as const,
    components: showcaseComponents,
    states: ["base", "focused", "active"] as const,
  };
}

function preview(
  item: ReturnType<typeof createThemeGallery>["items"][number],
  component: string,
  variant: string,
  state: string,
): string {
  return item.preview.components.find((entry) =>
    entry.component === component && entry.variant === variant && entry.state === state
  )?.preview.styled ?? "(missing)";
}

function parseArgs(values: readonly string[]): ThemeGalleryArgs {
  const terms: string[] = [];
  let select: string | undefined;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--select" || value === "-s") {
      select = values[++index];
    } else if (value.startsWith("--select=")) {
      select = value.slice("--select=".length);
    } else if (value !== "--") {
      terms.push(value);
    }
  }

  return { query: terms.join(" "), select };
}
