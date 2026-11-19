// Copyright 2026 ubernaut. MIT license.
//
// A retro loading bar for a page that hosts the web desktop.
//
// The desktop arrives as one large module, and until it runs the page has nothing to show. This module produces the
// HTML a page shell puts in its body instead of the module's own `<script>` tag: a character-cell progress bar, and a
// small inline loader that downloads the module, counts its bytes into the bar, and only then starts it. Nothing here
// is part of the desktop bundle — the bar must be on screen before that bundle exists.
//
// Tradeoff, stated: the loader downloads the module with XMLHttpRequest to see its progress, then starts it with a
// module script, which asks for the same URL again. A server that sends validators or a lifetime (GitHub Pages, any
// ordinary static host) answers that second request from the cache or with "not modified". A server that forbids
// storing the response makes the browser download the module twice.

/** What a page shell tells the loader. */
export interface BootProgressOptions {
  /** The module to load and start, as the page would write it in a `src` attribute. */
  readonly src: string;
  /** That module's size in bytes, used when the server reports no usable total (a compressed response, for one). */
  readonly bytes?: number;
  /** The name in the panel's title. */
  readonly name?: string;
  /**
   * When the bar goes away. `"canvas"` (the default) waits for the desktop's canvas and a few painted frames, which
   * suits a page that draws as soon as its module runs. `"manual"` waits for the page to call `done()`.
   */
  readonly ready?: "canvas" | "manual";
  /** Trusted HTML shown under the bar, such as a link to a version of the page that needs no desktop. */
  readonly fallbackHtml?: string;
}

/** What the running page can tell the bar. Every call is safe when the page has no bar. */
export interface BootProgress {
  /** Names what the page is doing after its module started; `fraction` is how far through that work it is, 0 to 1. */
  stage(label: string, fraction: number): void;
  /** The page is on screen: fill the bar and take it away. */
  done(): void;
  /** The page cannot start: leave the panel up with this message. */
  fail(message: string): void;
}

/** The share of the bar that the module's download fills; the page's own stages fill the rest. */
export const BOOT_DOWNLOAD_SHARE = 0.8;

const escapeAttribute = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

// The stylesheet and the loader are built when a page shell asks for them, not when this module loads. A host bundle
// that imports only `bootProgress` then carries none of the shell's text: a bundler drops a function nobody calls, but
// keeps a call made at the top of a module.

/**
 * The stylesheet. A finished bar stops taking the pointer at once, so its fade never swallows a click meant for the
 * desktop, and a narrow page wraps the fallback instead of clipping it.
 */
const style = (): string =>
  `
.exotui-boot{position:fixed;inset:0;z-index:10;display:grid;place-content:center;overflow:hidden;
background:var(--exotui-boot-ground,#0a0c14);color:var(--exotui-boot-ink,#7adbd2);
font:16px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;text-shadow:0 0 6px currentColor}
.exotui-boot::after{content:"";position:absolute;inset:0;pointer-events:none;
background:repeating-linear-gradient(to bottom,transparent 0 2px,rgba(0,0,0,.3) 2px 3px)}
.exotui-boot__panel{box-sizing:border-box;max-width:calc(100vw - 24px);padding:1.5ch 2.5ch;border:1px solid currentColor;
box-shadow:0 0 14px -4px currentColor,inset 0 0 14px -8px currentColor;white-space:nowrap}
.exotui-boot__title{letter-spacing:.3em;margin-bottom:1.5em}
.exotui-boot__percent{display:inline-block;min-width:5ch;text-align:right}
.exotui-boot__dim{opacity:.6}
.exotui-boot__more{margin-top:1.5em;white-space:normal}
.exotui-boot__cursor{animation:exotui-boot-blink 1s steps(1) infinite}
.exotui-boot a{color:inherit}
.exotui-boot[data-state=done]{opacity:0;pointer-events:none;transition:opacity .24s steps(4)}
.exotui-boot[data-state=failed]{color:var(--exotui-boot-alarm,#ff7a7a)}
.exotui-boot[data-state=failed] .exotui-boot__dim{opacity:1;white-space:normal}
@keyframes exotui-boot-blink{50%{opacity:0}}
@media (max-width:480px){.exotui-boot{font-size:13px}}
@media (prefers-reduced-motion:reduce){.exotui-boot__cursor{animation:none}.exotui-boot[data-state=done]{transition:none}}
`.trim().replaceAll("\n", "");

/**
 * The inline loader. It is plain ES5-style script on purpose: it runs before anything else on the page, in whatever
 * browser arrives, and it must never be the reason a page fails to start — every path ends by starting the module.
 */
const loader = (): string =>
  `(function(){
var root=document.getElementById("exotui-boot");
if(!root)return;
function part(name){return root.querySelector("[data-"+name+"]")}
var meter=part("meter"),bar=part("bar"),percent=part("percent"),heading=part("heading"),status=part("status"),note=part("note");
var src=root.getAttribute("data-src"),hint=+root.getAttribute("data-bytes")||0,share=${BOOT_DOWNLOAD_SHARE};
var still=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
var finished=false,started=false,level=0;
function repeat(text,count){var out="";while(count-->0)out+=text;return out}
function kilobytes(bytes){return Math.round(bytes/1024)+"K"}
function paint(fraction,label){
level=Math.max(level,Math.min(1,fraction));
var cells=Math.max(10,Math.min(32,Math.floor((window.innerWidth||640)/14)-8));
var filled=Math.round(level*cells),shown=Math.round(level*100);
bar.textContent=repeat("\\u2588",filled)+repeat("\\u2591",cells-filled);
percent.textContent=shown+"%";
if(label)note.textContent=label;
meter.setAttribute("aria-valuenow",String(shown));
meter.setAttribute("aria-valuetext",shown+"%, "+note.textContent)}
var api={
stage:function(label,fraction){if(!finished)paint(share+(1-share)*Math.max(0,Math.min(1,+fraction||0)),label)},
done:function(){if(finished)return;finished=true;paint(1,"ready");root.setAttribute("data-state","done");
setTimeout(function(){if(root.parentNode)root.parentNode.removeChild(root)},still?0:260)},
fail:function(message){if(finished)return;finished=true;root.setAttribute("data-state","failed");
heading.textContent="ERROR";status.setAttribute("role","alert");status.removeAttribute("aria-hidden");
note.textContent=message;meter.setAttribute("aria-valuetext",message)}};
window.__exotuiBoot=api;
function start(){if(started)return;started=true;paint(share,"starting");
var script=document.createElement("script");script.type="module";script.src=src;
script.onerror=function(){api.fail("could not load "+src)};
document.body.appendChild(script)}
paint(0,"loading");
try{
var request=new XMLHttpRequest();
request.open("GET",src);
request.responseType="blob";
request.onprogress=function(event){
var total=event.lengthComputable&&event.total>0?event.total:hint;
if(total>0)paint(share*Math.min(1,event.loaded/total),kilobytes(event.loaded)+" of "+kilobytes(Math.max(total,event.loaded)))};
request.onloadend=start;
request.send();
}catch(error){start()}
if(root.getAttribute("data-ready")!=="manual"&&window.MutationObserver){
var frames=0;
var settle=function(){if(++frames<4)window.requestAnimationFrame(settle);else api.done()};
var seen=function(){if(!document.querySelector("canvas"))return false;window.requestAnimationFrame(settle);return true};
var observer=new MutationObserver(function(){if(seen())observer.disconnect()});
if(!seen())observer.observe(document.documentElement,{childList:true,subtree:true});
}
})();`.replaceAll("\n", "");

/**
 * The page-shell HTML: styles, the panel, and the inline loader that downloads `options.src`, shows its progress and
 * then starts it. Put it in the body in place of the module's own `<script>` tag. Colours follow the custom properties
 * `--exotui-boot-ground`, `--exotui-boot-ink` and `--exotui-boot-alarm` when the page sets them.
 */
export function bootProgressHtml(options: BootProgressOptions): string {
  const name = escapeAttribute(options.name ?? "exowebtui");
  const bytes = Number.isFinite(options.bytes) && options.bytes! > 0 ? Math.round(options.bytes!) : 0;
  // Spacing is all in the stylesheet: a page shell may be reformatted, and the bar must not depend on whitespace.
  // A screen reader is given the bar's name and value, the fallback, and a failure when there is one. The drawn
  // glyphs are hidden from it, and so is the status line while that only repeats what the bar reports.
  const hidden = `aria-hidden="true"`;
  return [
    `<style>${style()}</style>`,
    `<div id="exotui-boot" class="exotui-boot" data-src="${escapeAttribute(options.src)}" data-bytes="${bytes}"`,
    ` data-ready="${options.ready === "manual" ? "manual" : "canvas"}">`,
    `<div class="exotui-boot__panel">`,
    `<div class="exotui-boot__title" ${hidden}>⏻ ${name}</div>`,
    `<div ${hidden} data-heading>LOADING</div>`,
    // The role is on the bar's own row, not on the panel, so the fallback below is not inside a progress bar.
    `<div role="progressbar" aria-label="Loading ${name}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"`,
    ` data-meter><span ${hidden}>[<span data-bar></span>]`,
    `<span class="exotui-boot__percent" data-percent>0%</span></span></div>`,
    `<div class="exotui-boot__dim" ${hidden} data-status><span ${hidden}>&gt; </span><span data-note>loading</span>`,
    `<span class="exotui-boot__cursor" ${hidden}>█</span></div>`,
    options.fallbackHtml ? `<div class="exotui-boot__more">${options.fallbackHtml}</div>` : "",
    `</div></div>`,
    `<script>${loader()}</script>`,
  ].join("");
}

const SILENT: BootProgress = { stage() {}, done() {}, fail() {} };

/** The page's bar, for a host that reports its own stages or decides when it is ready; silent where there is none. */
export function bootProgress(): BootProgress {
  return (globalThis as { __exotuiBoot?: BootProgress }).__exotuiBoot ?? SILENT;
}
