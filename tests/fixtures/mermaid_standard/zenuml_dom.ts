// Copyright 2026 ExotUI contributors. MIT license.
import { createMermaidStandardRenderer } from "../../../mod.mermaid.ts";

/** Run each mode in a fresh private browser page: SDK module caches are realm-local. */
export async function verifyZenUmlStyleOwnership(borrowedSDK: boolean) {
  const borrowed = document.createElement("style");
  borrowed.textContent = ":root{--zenuml-owner-proof:preserved}";
  document.head.append(borrowed);
  let twin: HTMLStyleElement | undefined;
  let sdk: HTMLStyleElement | undefined;
  let originalSDK = "";
  const observer = new MutationObserver((records) => {
    if (borrowedSDK || twin) return;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLStyleElement) || node.textContent?.length !== 893447) continue;
        // Same byte length, different hash; intentionally not an SDK-owned sheet.
        twin = document.createElement("style");
        twin.media = "not all";
        twin.textContent = node.textContent.slice(0, -1) + " ";
        document.head.append(twin);
        return;
      }
    }
  });
  observer.observe(document.head, { childList: true });
  let renderer: Awaited<ReturnType<typeof createMermaidStandardRenderer>> | undefined;
  try {
    if (borrowedSDK) {
      await import("@zenuml/core");
      sdk = [...document.head.querySelectorAll("style")].find((style) => style.textContent?.length === 893447);
      if (!sdk) throw new Error("Pinned SDK stylesheet was not installed by the explicit host import.");
      originalSDK = sdk.textContent!;
    }
    renderer = await createMermaidStandardRenderer();
    if (await renderer.parse("zenuml\nA->B: Message") !== "zenuml") throw new Error("Wrong extension parser.");
    if (!borrowed.isConnected || borrowed.textContent !== ":root{--zenuml-owner-proof:preserved}") {
      throw new Error("ZenUML loading changed a borrowed host stylesheet.");
    }
    if (borrowedSDK) {
      if (!sdk!.isConnected || sdk!.textContent !== originalSDK) {
        throw new Error("Already-present SDK CSS was removed.");
      }
    } else {
      if (!twin?.isConnected || twin.textContent?.length !== 893447) {
        throw new Error("Same-sized unrelated CSS was removed.");
      }
      if (
        [...document.head.querySelectorAll("style")].some((style) =>
          style !== twin && style.textContent?.length === 893447
        )
      ) throw new Error("Owned legacy SDK CSS remains installed.");
      twin.remove();
      const diagram = await renderer.compile("flowchart LR\nA[Next family]-->B[Still usable]", {
        config: { themeCSS: '.node{counter-reset:step 3}.nodeLabel::before{content:counter(step) " ";}' },
      });
      if (diagram.diagramType !== "flowchart-v2") throw new Error("Extension import poisoned the next family.");
    }
    return {
      borrowedSDK,
      ownerPreserved: true,
      unrelatedPreserved: !borrowedSDK,
      noViewer: !document.querySelector("#headlessui-portal-root, .zenuml"),
    };
  } finally {
    observer.disconnect();
    renderer?.dispose();
    borrowed.remove();
    twin?.remove();
    sdk?.remove();
  }
}
