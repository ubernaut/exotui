/** Copy during a user gesture, including HTTP hosts without the Clipboard API. */
export async function copyBrowserText(text: string): Promise<boolean> {
  if (globalThis.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied: try the browser's gesture-scoped legacy path.
    }
  }
  const focused = document.activeElement as HTMLElement | null;
  const selection = globalThis.getSelection();
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange())
    : [];
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("aria-label", "Copy selected text");
  input.style.cssText = "position:fixed;left:-10000px;top:0;opacity:0;";
  document.body.appendChild(input);
  try {
    input.focus({ preventScroll: true });
    input.select();
    return document.execCommand("copy");
  } finally {
    input.remove();
    focused?.focus({ preventScroll: true });
    if (selection) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
  }
}
