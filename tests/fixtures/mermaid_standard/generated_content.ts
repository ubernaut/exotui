// Copyright 2023 Im-Beast. MIT license.
import { extractMermaidScene, type MermaidScene, renderMermaidNativeFrame } from "../../../mod.mermaid.ts";
import { mermaidSVGAccessibility } from "../../../src/content/mermaid_accessibility_dom.ts";
import {
  copyGeneratedContentAlternative,
  generatedContentAlternative,
  generatedMathTextBaseline,
  withMermaidGeneratedContent,
} from "../../../src/content/mermaid_generated_content_dom.ts";
import { captureMermaidStylesheetText } from "../../../src/content/mermaid_stylesheet_dom.ts";
import { MERMAID_COUNTER_CONTENT_FIXTURES } from "./counter_content.ts";

function require(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Authored CSS fixtures independently compared against the original browser accessibility tree. */
export const MERMAID_GENERATED_CONTENT_FIXTURES = [
  ...MERMAID_COUNTER_CONTENT_FIXTURES,
  ...[
    ["filtered-haitian", "ht", "“outer‘inner’”"],
    ["filtered-kazakh", "kk", "“outer‘inner’”"],
    ["excluded-chinese-alias", "zh-TW", "“outer‘inner’”"],
    ["explicit-chinese-script", "zh-Hant", "「outer『inner』」"],
    ["inherited-greek-variant", "el-polyton", "«outer“inner”»"],
    ["regional-tigrinya-override", "ti-ER", "‘outer‘inner’’"],
  ].map(([name, locale, text]) => ({
    name: `generated-quotes-auto-${name}`,
    body: `<div class="generated" lang="${locale}">outer<span class="generated">inner</span></div>`,
    css: ".generated{quotes:auto}.generated::before{content:open-quote}.generated::after{content:close-quote}",
    text: text!,
    math: false,
  })),
  {
    name: "generated-quotes-inherited-features",
    body: '<div class="generated">outer<span class="generated">AVAV</span></div>',
    css:
      '.generated{font-family:Arial,sans-serif;font-size:14px;font-feature-settings:"kern" 0;quotes:"“" "”" "‘" "’"}.generated::before{content:open-quote}.generated::after{content:close-quote}',
    text: "“outer‘AVAV’”",
    math: false,
  },
  {
    name: "generated-quotes-distinct-features",
    body: '<div class="generated">outer<span class="generated">AVAV</span></div>',
    css:
      '.generated{font-family:Arial,sans-serif;font-size:14px;font-feature-settings:"kern" 0;quotes:"“" "”" "‘" "’"}.generated::before{content:open-quote;font-feature-settings:"kern" 1}.generated::after{content:close-quote;font-feature-settings:"kern" 1}',
    text: "“outer‘AVAV’”",
    math: false,
  },
  {
    name: "generated-quotes-important-layer",
    body: '<div class="generated" lang="ht">outer<span class="generated">inner</span></div>',
    css:
      "@layer quote-source{.generated{quotes:auto}.generated::before{content:open-quote!important}.generated::after{content:close-quote!important}}",
    text: "“outer‘inner’”",
    math: false,
  },
  {
    name: "generated-quotes-distinct-size",
    body: '<div class="generated">outer<span class="generated">inner</span></div>',
    css:
      '.generated{font-family:Arial,sans-serif;font-size:14px;quotes:"“" "”" "‘" "’"}.generated::before{content:open-quote;font-size:24px}.generated::after{content:close-quote;font-size:20px}',
    text: "“outer‘inner’”",
    math: false,
  },
  {
    name: "generated-quotes-hidden-depth",
    body:
      '<div class="group"><span class="phantom"></span><span class="absent"></span><span class="generated">inside</span></div>',
    css:
      '.group{quotes:"[" "]" "<" ">"}.phantom{visibility:hidden}.absent{display:none}.phantom::before,.absent::before{content:open-quote}.generated::before{content:open-quote}.generated::after{content:close-quote}',
    text: "<inside>",
    math: false,
  },
  {
    name: "generated-quotes-style-scope",
    body:
      '<div class="group"><span class="phantom"></span><div class="scope"><span class="generated">inside</span></div><span class="generated">later</span></div>',
    css:
      '.group{quotes:"[" "]" "<" ">"}.phantom::before{content:no-open-quote}.scope{contain:style}.generated::before{content:open-quote}.generated::after{content:close-quote}',
    // Current Chromium does not reset quotation depth at style containment.
    // Preserve actually painted/accessible text, not an assumed scope rule.
    text: "<inside><later>",
    math: false,
  },
  {
    name: "generated-quotes-inert-escaped-system",
    body: '<div class="generated">inside</div>',
    css: String
      .raw`.generated{quotes:"\3c script\3e " "\3c /script\3e "}.generated::before{content:open-quote}.generated::after{content:close-quote}`,
    text: "<script>inside</script>",
    math: false,
  },
  {
    name: "generated-quotes-explicit",
    body: '<div class="generated">inside</div>',
    css: '.generated{quotes:"“" "”"}.generated::before{content:open-quote}.generated::after{content:close-quote}',
    text: "“inside”",
    math: false,
  },
  {
    name: "generated-quotes-nested",
    body: '<div class="quoted">outer<span class="quoted">inner<span class="quoted">deep</span></span></div>',
    css: '.quoted{quotes:"[" "]" "<" ">"}.quoted::before{content:open-quote}.quoted::after{content:close-quote}',
    text: "[outer<inner<deep>>]",
    math: false,
  },
  {
    name: "generated-quotes-phantom",
    body: '<div class="generated">inside</div>',
    css:
      '.generated{quotes:"[" "]" "<" ">"}.generated::before{content:no-open-quote open-quote}.generated::after{content:close-quote no-close-quote}',
    text: "<inside>",
    math: false,
  },
  {
    name: "generated-quotes-unbalanced",
    body: '<div class="generated">inside</div>',
    css:
      '.generated{quotes:"[" "]"}.generated::before{content:close-quote "prefix"}.generated::after{content:open-quote open-quote}',
    text: "prefixinside[[",
    math: false,
  },
  {
    name: "generated-quotes-none",
    body: '<div class="quoted">outer<span class="inner">inner</span></div>',
    css:
      '.quoted{quotes:none}.quoted::before,.inner::before{content:open-quote}.quoted::after,.inner::after{content:close-quote}.inner{quotes:"[" "]" "<" ">"}',
    text: "outer<inner>",
    math: false,
  },
  {
    name: "generated-quotes-auto-german",
    body: '<div class="generated" lang="de">inside</div>',
    css: ".generated{quotes:auto}.generated::before{content:open-quote}.generated::after{content:close-quote}",
    text: "„inside“",
    math: false,
  },
  {
    name: "generated-quotes-auto-japanese",
    body: '<div class="generated" lang="ja">inside</div>',
    css: ".generated{quotes:auto}.generated::before{content:open-quote}.generated::after{content:close-quote}",
    text: "「inside」",
    math: false,
  },
  {
    name: "generated-quotes-alternative",
    body: '<div class="generated">inside</div>',
    css:
      '.generated{quotes:"[" "]"}.generated::before{content:open-quote / "opening "}.generated::after{content:close-quote / " closing"}',
    text: "[inside]",
    semanticText: "opening inside closing",
    math: false,
  },
  {
    name: "generated-quotes-styled-math",
    body: '<math><ms class="generated">inside</ms></math>',
    css:
      '.generated{quotes:"[" "]"}.generated::before{content:open-quote;color:rgb(255,0,0);font-weight:700}.generated::after{content:close-quote;color:rgb(0,0,255);font-size:24px}',
    text: "[inside]",
    math: true,
  },
  {
    name: "generated-math-literal",
    body: '<math><ms class="generated">inside</ms></math>',
    css: '.generated::before{content:"["}.generated::after{content:"]"}',
    text: "[inside]",
    math: true,
  },
  {
    name: "generated-math-attributes",
    body: '<math><ms class="generated" lquote="aa" rquote="bb">inside</ms></math>',
    css: ".generated::before{content:attr(lquote)}.generated::after{content:attr(rquote)}",
    text: "aainsidebb",
    math: true,
  },
  {
    name: "generated-math-styled-blocks",
    body: '<math><ms class="generated">inside</ms></math>',
    css:
      '.generated::before{content:"[";color:rgb(255,0,0);font-weight:700}.generated::after{content:"]";color:rgb(0,0,255);font-size:24px}',
    text: "[inside]",
    math: true,
  },
  {
    name: "generated-math-inline",
    body: '<math><ms class="generated">inside</ms></math>',
    css: '.generated::before{content:"[";display:inline}.generated::after{content:"]";display:inline}',
    text: "[inside]",
    math: true,
  },
  {
    name: "generated-math-casing",
    body: '<math><ms class="generated" style="text-transform:uppercase">inside</ms></math>',
    css:
      '.generated::before{content:"Straße";display:inline}.generated::after{content:"MIXED";display:inline;text-transform:lowercase}',
    text: "STRASSEINSIDEmixed",
    math: true,
  },
  {
    name: "generated-html-styled",
    body: '<div class="generated">inside</div>',
    css:
      '.generated::before{content:"[";color:rgb(255,0,0);font-weight:700}.generated::after{content:"]";color:rgb(0,0,255);font-style:italic}',
    text: "[inside]",
    math: false,
  },
  {
    name: "generated-html-inline",
    body: '<div class="generated">inside</div>',
    css: '.generated::before{content:"[";display:inline}.generated::after{content:"]";display:inline}',
    text: "[inside]",
    math: false,
  },
  {
    name: "generated-html-preserved-space",
    body: '<div class="generated" style="white-space:pre">inside</div>',
    css: '.generated::before{content:"  ["}.generated::after{content:"]  "}',
    text: "  [inside]  ",
    math: false,
  },
  {
    name: "generated-html-wrapped",
    body: '<div class="generated">inside</div>',
    css:
      '.generated::before{content:"ABCDEFGHIJKLMNO";display:block;width:40px;word-break:break-all;white-space:normal}.generated::after{content:"]";display:block}',
    text: "ABCDEFGHIJKLMNOinside]",
    math: false,
  },
  {
    name: "generated-html-hidden-before",
    body: '<div class="generated">inside</div>',
    css: '.generated::before{content:"HIDDEN";display:none}.generated::after{content:"]"}',
    text: "inside]",
    math: false,
  },
  {
    name: "generated-html-escaped-text",
    body: '<div class="generated">inside</div>',
    css: String.raw`.generated::before{content:"\3c script\3e "}.generated::after{content:"\3c /script\3e "}`,
    text: "<script>inside</script>",
    math: false,
  },
  {
    name: "generated-html-alternative",
    body: '<div class="generated">inside</div>',
    css: '.generated::before{content:"shown" / "alternative"}',
    text: "showninside",
    semanticText: "alternativeinside",
    math: false,
  },
  {
    name: "generated-html-alternative-empty",
    body: '<div class="generated">inside</div>',
    css: '.generated::before{content:"DECORATIVE" / ""}',
    text: "DECORATIVEinside",
    semanticText: "inside",
    math: false,
  },
  {
    name: "generated-html-alternative-both",
    body: '<div class="generated">inside</div>',
    css: '.generated::before{content:"[" / "opening "}.generated::after{content:"]" / " closing"}',
    text: "[inside]",
    semanticText: "opening inside closing",
    math: false,
  },
  {
    name: "generated-html-alternative-attribute",
    body: '<div class="generated" data-alt="Attribute alternative">inside</div>',
    css: '.generated::before{content:"shown" / attr(data-alt)}',
    text: "showninside",
    semanticText: "Attribute alternativeinside",
    math: false,
  },
  {
    name: "generated-html-alternative-list",
    body: '<div class="generated">inside</div>',
    css: '.generated::before{content:"s" "hown" / "alt" "ernative"}',
    text: "showninside",
    semanticText: "alternativeinside",
    math: false,
  },
  {
    name: "generated-html-alternative-casing",
    body: '<div class="generated" style="text-transform:uppercase">inside</div>',
    css: '.generated::before{content:"shown" / "Alternative Straße"}',
    text: "SHOWNINSIDE",
    semanticText: "Alternative StraßeINSIDE",
    math: false,
  },
  {
    name: "generated-math-alternative",
    body: '<math><ms class="generated">inside</ms></math>',
    css: '.generated::before{content:"shown" / "alternative"}.generated::after{content:"]" / " closing"}',
    text: "showninside]",
    semanticText: "alternativeinside closing",
    math: true,
  },
  {
    name: "generated-html-alternative-no-visual",
    body: '<div class="generated">inside</div>',
    css: '.generated::before{content:"" / "audible"}',
    text: "inside",
    semanticText: "audibleinside",
    math: false,
  },
  {
    name: "generated-html-alternative-styled",
    body: '<div class="generated">inside</div>',
    css:
      '.generated::before{content:"[" / "opening ";color:rgb(255,0,0);font-weight:700}.generated::after{content:"]" / " closing";color:rgb(0,0,255);font-style:italic}',
    text: "[inside]",
    semanticText: "opening inside closing",
    math: false,
  },
  {
    name: "generated-html-alternative-whitespace",
    body: '<div class="generated">inside</div>',
    css: '.generated::before{content:"shown" / "  literal  "}',
    text: "showninside",
    semanticText: "  literal  inside",
    math: false,
  },
  {
    name: "generated-html-alternative-inert-markup",
    body: '<div class="generated">inside</div>',
    css: String.raw`.generated::before{content:"x" / "\3c script\3e "}`,
    text: "xinside",
    semanticText: "<script>inside",
    math: false,
  },
  {
    name: "generated-html-alternative-hidden",
    body: '<div class="generated">inside</div>',
    css: '.generated::before{content:"HIDDEN" / "Not exposed";visibility:hidden}.generated::after{content:"]"}',
    text: "inside]",
    semanticText: "inside]",
    math: false,
  },
] as const;

/** Verify measured rows/styles and portable paint without using a generated companion as a geometry oracle. */
export function verifyMermaidGeneratedContentScene(name: string, scene: MermaidScene): void {
  require(!scene.diagnostics.length, `Generated content has unexpected diagnostics: ${name} ${scene.diagnostics}`);
  const text = scene.items.filter((item) => item.kind === "text");
  if (
    name === "generated-math-literal" || name === "generated-math-attributes" ||
    name === "generated-math-styled-blocks" || name === "generated-math-inline" ||
    name === "generated-math-alternative" ||
    name === "generated-quotes-styled-math"
  ) {
    require(
      text.length === 3 && text[0]!.y < text[1]!.y && text[1]!.y < text[2]!.y,
      "MathML generated block rows flattened",
    );
  }
  if (name === "generated-html-inline") {
    require(
      text.length && text.every((item) => Math.abs(item.y - text[0]!.y) < 0.5),
      `Inline HTML acquired fake rows: ${JSON.stringify(text)}`,
    );
  }
  if (name === "generated-html-wrapped") {
    require(
      text.length >= 5 && text[0]!.y < text[1]!.y && text[1]!.y < text[2]!.y,
      `Generated wrapped text flattened: ${JSON.stringify(text)}`,
    );
  }
  if (
    name === "generated-math-styled-blocks" || name === "generated-html-styled" ||
    name === "generated-html-alternative-styled" || name === "generated-quotes-styled-math"
  ) {
    require(text[0]?.color === "rgb(255, 0, 0)" && text[0].fontWeight === "700", "Generated prefix style lost");
    require(text.at(-1)?.color === "rgb(0, 0, 255)", "Generated suffix color lost");
    if (name === "generated-math-styled-blocks" || name === "generated-quotes-styled-math") {
      require(text.at(-1)?.height === 24, "Generated suffix font size lost");
    } else require(text.at(-1)?.fontStyle === "italic", "Generated suffix italic style lost");
    const cells = renderMermaidNativeFrame(scene).cells.flat();
    require(
      cells.some((cell) => cell.char === "[" && cell.foreground === "rgb(255, 0, 0)" && cell.bold),
      "Styled prefix not painted natively",
    );
    require(
      cells.some((cell) => cell.char === "]" && cell.foreground === "rgb(0, 0, 255)"),
      "Styled suffix not painted natively",
    );
  }
}

/** Owned capture rollback, selection/focus, reentrancy and explicit unsupported/oversized-input recovery. */
export function verifyMermaidGeneratedContentGuards() {
  const host = document.createElement("div"), input = document.createElement("input");
  document.body.append(host, input);
  input.focus();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "400");
  svg.setAttribute("height", "150");
  host.append(svg);
  const source = (css: string, body = '<div class="generated">inside</div>') => {
    svg.innerHTML =
      `<style>${css}</style><foreignObject width="350" height="120"><div xmlns="http://www.w3.org/1999/xhtml">${body}</div></foreignObject>`;
  };
  const styles = document.head.querySelectorAll("style").length;
  let checks = 0;
  const unchanged = (markup: string) => {
    require(
      svg.outerHTML === markup && document.head.querySelectorAll("style").length === styles,
      "Generated capture leaked DOM/styles",
    );
    require(document.activeElement === input, "Generated capture stole app focus");
    checks++;
  };
  try {
    source('.generated::before{content:"["}.generated::after{content:"]"}');
    let markup = svg.outerHTML;
    const selection = document.getSelection()!, text = svg.querySelector(".generated")!.firstChild!;
    selection.setBaseAndExtent(text, 5, text, 1);
    const capture = extractMermaidScene(svg);
    unchanged(markup);
    require(
      selection.anchorNode === text && selection.anchorOffset === 5 && selection.focusNode === text &&
        selection.focusOffset === 1,
      "Generated capture changed backwards selection",
    );
    const metadata = mermaidSVGAccessibility(svg);
    require(
      JSON.stringify(metadata.content) === JSON.stringify(capture.accessibility?.content),
      "Independent metadata capture omitted generated text",
    );
    unchanged(markup);
    source(
      '.generated::before{content:"["}.generated::after{content:"]"}',
      '<math><ms class="generated">inside</ms></math>',
    );
    markup = svg.outerHTML;
    const mathText = svg.querySelector("ms")!.firstChild!;
    selection.setBaseAndExtent(mathText, 5, mathText, 1);
    require(!extractMermaidScene(svg).diagnostics.length, "Generated MathML baseline capture failed");
    require(
      selection.anchorNode === mathText && selection.anchorOffset === 5 && selection.focusNode === mathText &&
        selection.focusOffset === 1,
      "MathML baseline changed backwards app selection",
    );
    unchanged(markup);
    source('.generated::before{content:"["}.generated::after{content:"]"}');
    markup = svg.outerHTML;
    const diagnostics = new Set<string>();
    withMermaidGeneratedContent(svg, diagnostics, () => {
      const count = svg.querySelectorAll(".generated > span").length;
      withMermaidGeneratedContent(
        svg,
        diagnostics,
        () =>
          require(
            svg.querySelectorAll(".generated > span").length === count,
            "Reentrant capture duplicated generated text",
          ),
      );
    });
    unchanged(markup);
    try {
      withMermaidGeneratedContent(svg, diagnostics, () => {
        throw new Error("owned callback failure");
      });
      throw new Error("Expected callback failure");
    } catch (error) {
      require(
        error instanceof Error && error.message === "owned callback failure",
        "Capture swallowed callback failure",
      );
    }
    unchanged(markup);
    for (
      const css of [
        ".generated::before{content:counter(section,hebrew)}",
        '.generated::before{content:"prefix" counter(section,hebrew)}',
        '.generated::before{content:"shown" / counter(section,hebrew)}',
      ]
    ) {
      source(css);
      markup = svg.outerHTML;
      require(
        extractMermaidScene(svg).diagnostics.some((value) => value.includes("need native expansion")),
        "Unsupported CSS generated content silently omitted",
      );
      unchanged(markup);
    }
    source('.generated::before{content:"shown" / "alternative"}.generated::after{content:"]" / ""}');
    markup = svg.outerHTML;
    const alternateCapture = extractMermaidScene(svg);
    require(!alternateCapture.diagnostics.length, "Literal alternative content not captured");
    require(
      alternateCapture.items.filter((item) => item.kind === "text").map((item) => item.text).join("") ===
          "showninside]" &&
        JSON.stringify(alternateCapture.accessibility!.content).includes('"text":"alternative"') &&
        !JSON.stringify(alternateCapture.accessibility!.content).includes('"text":"shown"'),
      "Generated alternative replaced paint or leaked visual decoration into semantics",
    );
    require(
      JSON.stringify(mermaidSVGAccessibility(svg)) === JSON.stringify(alternateCapture.accessibility),
      "Independent alternative metadata differs",
    );
    withMermaidGeneratedContent(svg, new Set(), () => {
      const generated = svg.querySelector(".generated > span")!;
      const copy = generated.cloneNode(true) as Element;
      copyGeneratedContentAlternative(generated, copy);
      require(generatedContentAlternative(copy) === "alternative", "Local instance clone lost owned alternative");
      const authored = document.createElement("span");
      authored.setAttribute("data-exotui-generated-alternative", "Untrusted alternative");
      require(
        generatedContentAlternative(authored) === undefined,
        "Authored attributes impersonated owned alternatives",
      );
    });
    unchanged(markup);
    for (
      const [css, body] of [
        ['.generated::before{content:"' + "x".repeat(4097) + '"}', '<div class="generated">inside</div>'],
        ['.generated::before{content:"x"}', '<div class="generated">inside</div>'.repeat(1025)],
        ['.generated::before{content:"' + "x".repeat(4096) + '"}', '<div class="generated">inside</div>'.repeat(17)],
        [
          '.generated::before{content:"' + "x".repeat(2048) + '" / "' + "y".repeat(2049) + '"}',
          '<div class="generated">inside</div>',
        ],
        [
          '.generated::before{content:"" / "' + "y".repeat(4096) + '"}',
          '<div class="generated">inside</div>'.repeat(17),
        ],
      ]
    ) {
      source(css, body);
      markup = svg.outerHTML;
      let error: unknown;
      try {
        extractMermaidScene(svg);
      } catch (value) {
        error = value;
      }
      require(error instanceof RangeError, "Generated content quota not enforced");
      unchanged(markup);
      source('.generated::before{content:"["}.generated::after{content:"]"}');
      require(
        extractMermaidScene(svg).items.filter((item) => item.kind === "text").map((item) => item.text).join("") ===
          "[inside]",
        "Capture did not recover after quota failure",
      );
    }
    for (
      const css of [
        '.generated::before{content:"["}svg div.generated span::before{content:url("https://generated-probe.invalid/pseudo.svg")!important}',
        '.generated::before{content:"["}svg div.generated::before{content:"["!important}',
      ]
    ) {
      source(css);
      markup = svg.outerHTML;
      const scene = extractMermaidScene(svg);
      require(
        !scene.diagnostics.length &&
          scene.items.filter((item) => item.kind === "text").map((item) => item.text).join("") === "[inside",
        "First-layer suppression did not retain source text or stop probe-only resources",
      );
      unchanged(markup);
    }
    for (
      const [css, body] of [
        ['.generated::before{content:"["}.generated:has(>span){font-size:30px}', '<div class="generated">inside</div>'],
      ]
    ) {
      source(css, body);
      markup = svg.outerHTML;
      require(
        extractMermaidScene(svg).diagnostics.some((value) => /suppress|changed/.test(value)),
        "Unsafe pseudo/layout changes were not diagnosed",
      );
      unchanged(markup);
    }
    source(
      'svg .baseline span::before{content:url("https://generated-probe.invalid/baseline.svg")!important}',
      '<math><mtext class="baseline">inside</mtext></math>',
    );
    markup = svg.outerHTML;
    const baselineWarnings = new Set<string>();
    generatedMathTextBaseline(svg.querySelector("mtext")!.firstChild as Text, baselineWarnings);
    require(!baselineWarnings.size, "First-layer baseline probe suppression failed");
    unchanged(markup);
    const styleHost = document.createElement("div");
    document.body.append(styleHost);
    let stylesheetChecks = 0;
    try {
      for (const sanitize of [false, true]) {
        const capture = captureMermaidStylesheetText(styleHost, "generated-style-probe");
        try {
          const owner = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          owner.id = "generated-style-probe";
          const style = document.createElement("style");
          style.media = "(width > 1px)";
          style.setAttribute("data-style-probe", '<&"');
          const css = '.unused::before{content:"<script>&</style>"}@media(width < 600px){text{color:red}}';
          style.textContent = css;
          owner.append(style);
          styleHost.append(owner);
          const original = owner.outerHTML;
          const serialized = sanitize ? original.replaceAll("<script>", "sanitized") : original;
          const result = capture.finish(serialized);
          require(owner.outerHTML === original, "Stylesheet capture changed upstream source");
          if (sanitize) require(result === serialized, "Stylesheet recovery bypassed upstream sanitization");
          else {
            const decoded = document.createElement("div");
            decoded.innerHTML = result;
            require(
              decoded.querySelector("style")?.textContent === css &&
                decoded.querySelector("style")?.getAttribute("media") === style.media &&
                decoded.querySelector("style")?.getAttribute("data-style-probe") === '<&"' &&
                !decoded.querySelector("script,img"),
              "Escaped stylesheet text became markup or lost CSS operators/entities",
            );
          }
          stylesheetChecks++;
        } finally {
          capture.dispose();
          styleHost.replaceChildren();
        }
      }
      const bounded = captureMermaidStylesheetText(styleHost, "generated-style-probe");
      try {
        const owner = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        owner.id = "generated-style-probe";
        const style = document.createElement("style");
        style.textContent = "x".repeat(1_048_577);
        owner.append(style);
        styleHost.append(owner);
        let error: unknown;
        try {
          bounded.finish(owner.outerHTML);
        } catch (value) {
          error = value;
        }
        require(error instanceof RangeError, "Stylesheet capture text budget not enforced");
        stylesheetChecks++;
      } finally {
        bounded.dispose();
      }
    } finally {
      styleHost.remove();
    }
    return { checks, stylesheetChecks };
  } finally {
    document.getSelection()?.removeAllRanges();
    host.remove();
    input.remove();
  }
}
