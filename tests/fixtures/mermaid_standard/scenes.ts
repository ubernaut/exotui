// Copyright 2023 Im-Beast. MIT license.
/** DOM geometry regressions, independent of a diagram family's parser. */
const imageSource = `data:image/svg+xml;base64,${
  btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16" viewBox="0 0 32 16">
<rect width="16" height="8" fill="red"/><rect x="16" width="16" height="8" fill="lime"/>
<rect y="8" width="16" height="8" fill="blue"/><rect x="16" y="8" width="16" height="8" fill="orange" fill-opacity=".5"/>
</svg>`)
}`;

export const MERMAID_SCENE_FIXTURES: readonly { name: string; svg: string }[] = [
  {
    name: "marker-viewports-style-context-and-opacity",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="320" viewBox="0 0 500 320">
      <rect width="500" height="320" fill="white"/>
      <style>defs marker.styled path {fill:rgb(128,20,200)} .destination path {fill:orange!important} marker .context {fill:context-fill}</style>
      <defs>
        <linearGradient id="marker-context"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient>
        <clipPath id="marker-source-clip"><rect x="0" y="0" width="190" height="100"/></clipPath>
        <marker id="viewport" class="styled" viewBox="-10 -5 20 10" preserveAspectRatio="xMaxYMin slice" markerWidth="30" markerHeight="20" refX="0" refY="0" orient="auto" markerUnits="userSpaceOnUse" opacity=".6"><g><path d="M-15 -9 H15 V9 H-15 Z"/><circle cx="-2" cy="0" r="4" fill="lime"/></g></marker>
        <marker id="percentage" viewBox="-10 -5 20 10" markerWidth="30" markerHeight="20" refX="50%" refY="50%" orient="auto" markerUnits="userSpaceOnUse"><path d="M-10 -5 H10 V5 H-10 Z" fill="orange"/></marker>
        <marker id="context" viewBox="-5 -5 10 10" markerWidth="30" markerHeight="30" refX="0" refY="0" orient="auto" markerUnits="userSpaceOnUse" overflow="visible"><path class="context" d="M-5 -5 H5 V5 H-5 Z"/></marker>
        <marker id="scaled" viewBox="0 0 10 10" markerWidth="12" markerHeight="8" refX="5" refY="5" orient="35deg" markerUnits="strokeWidth" fill="rgb(0,100,200)"><path d="M0 0 H10 V10 H0 Z"/></marker>
        <marker id="empty" markerWidth="0" markerHeight="5"><path d="M0 0 H5 V5 H0 Z"/></marker>
        <marker id="empty-box" viewBox="0 0 0 10" markerWidth="20" markerHeight="20" overflow="visible"><path d="M0 0 H10 V10 H0 Z" fill="red"/></marker>
      </defs>
      <g class="destination" opacity=".8" transform="translate(30 30) rotate(12) scale(1.2 .8)"><path d="M20 20 H80 V80 H160" fill-opacity="0" stroke="none" marker-start="url(#viewport)" marker-mid="url(#viewport)" marker-end="url(#viewport)"/></g>
      <g transform="translate(260 35) rotate(-8)" clip-path="url(#marker-source-clip)"><path d="M20 20 H85 V80 H185" fill="url(#marker-context)" fill-opacity="0" stroke="none" marker-start="url(#context)" marker-mid="url(#context)" marker-end="url(#context)"/></g>
      <g transform="translate(30 210) scale(1.5 .75)"><path d="M10 10 H55 V70 H110" fill="none" stroke="none" stroke-width=".8%" style="marker:url(#scaled)"/></g>
      <path d="M300 200 H350 V260" fill="none" stroke="none" style="marker:url(#empty)"/>
      <path d="M400 220 H450" fill="none" stroke="none" stroke-width="0" style="marker:url(#scaled)"/>
      <path d="M300 260 H350" fill="none" stroke="none" style="marker:url(#percentage)"/>
      <path d="M250 220 H300" fill="none" stroke="none" style="marker:url(#empty-box)"/>
    </svg>`,
  },
  {
    name: "marker-vertices-directions-and-subpaths",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="320" viewBox="0 0 420 320">
      <rect width="420" height="320" fill="white"/>
      <style>marker path {marker:url(#middle)!important}</style>
      <defs>
        <marker id="middle" viewBox="-6 -6 12 12" markerWidth="24" markerHeight="24" refX="0" refY="0" orient="auto" markerUnits="userSpaceOnUse" overflow="visible"><path d="M-6 -4 L6 0 L-6 4 Z" fill="red"/></marker>
        <marker id="start" viewBox="-6 -6 12 12" markerWidth="24" markerHeight="24" refX="0" refY="0" orient="auto-start-reverse" markerUnits="userSpaceOnUse" overflow="visible"><path d="M-6 -4 L6 0 L-6 4 Z" fill="blue"/></marker>
        <marker id="end" viewBox="-6 -6 12 12" markerWidth="24" markerHeight="24" refX="0" refY="0" orient="auto" markerUnits="userSpaceOnUse" overflow="visible"><path d="M-6 -4 L6 0 L-6 4 Z" fill="green"/></marker>
      </defs>
      <g fill="none" stroke="none" marker-start="url(#start)" marker-mid="url(#middle)" marker-end="url(#end)">
        <path d="M30 30 H95 V85 H30 Z m125 0 h50 v55 h-50 z m115 0 h50 v55 h-50 z"/>
        <path d="M30 130 C30 130 60 100 95 130 S125 160 155 130 Q180 100 210 130 T265 130 A30 20 35 0 1 325 130 a20 20 0 0110 35"/>
        <path d="M30 220 L70 220 L70 220 L70 260 L110 260 L110 220 L110 220"/>
        <polyline points="160,220 205,220 205,265 250,265 250,220"/>
        <polygon points="300,220 360,220 330,270"/>
        <path d="M360 180"/>
        <path d="M390 180 l0 0"/>
        <path d="M25 295 L70 295 Z L125 295"/>
      </g>
    </svg>`,
  },
  {
    name: "mathml-styles-links-and-hidden",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="180" viewBox="0 0 400 180">
    <a href="https://example.test/math"><foreignObject x="10" y="10" width="350" height="150"><div xmlns="http://www.w3.org/1999/xhtml" style="font-size:20px">
      <math xmlns="http://www.w3.org/1998/Math/MathML" style="color:rgb(20,80,160)"><semantics><mrow><msup style="font-weight:700;opacity:.5"><mi>x</mi><mn>2</mn></msup><mphantom><mtext>HIDDEN</mtext></mphantom><mo>+</mo><mi>y</mi></mrow><annotation encoding="application/x-tex">UNRENDERED</annotation></semantics></math>
    </div></foreignObject></a></svg>`,
  },
  {
    name: "image-svg-without-viewbox",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360" viewBox="0 0 600 360">
      <rect width="600" height="360" fill="white"/>
      <image x="10" y="10" width="80" height="60" href="${
      imageSource.replace(
        imageSource.split(",")[1]!,
        btoa(atob(imageSource.split(",")[1]!).replace(' viewBox="0 0 32 16"', "")),
      )
    }"/>
    </svg>`,
  },
  {
    name: "image-svg-affine-fit-and-compositing",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360" viewBox="0 0 600 360">
      <defs><clipPath id="imageClip"><rect width="50" height="60"/></clipPath>
      <image id="reusableImage" href="${imageSource}" width="80" height="60" preserveAspectRatio="none"/></defs>
      <rect width="600" height="360" fill="white"/>
      <image href="${imageSource}" x="10" y="10" width="80" height="60"/>
      <image href="${imageSource}" x="110" y="10" width="80" height="60" preserveAspectRatio="none"/>
      <image href="${imageSource}" x="210" y="10" width="80" height="60" preserveAspectRatio="xMidYMid slice"/>
      <image href="${imageSource}" x="310" y="10" width="80" height="60" preserveAspectRatio="xMinYMax meet"/>
      <image href="${imageSource}" x="410" y="10" width="80" height="60" preserveAspectRatio="xMaxYMin slice"/>
      <image href="${imageSource}" width="80" height="60" preserveAspectRatio="none" transform="translate(90 110) scale(-1 1)"/>
      <image href="${imageSource}" width="80" height="60" preserveAspectRatio="none" transform="translate(190 110) rotate(90)"/>
      <image href="${imageSource}" width="80" height="60" preserveAspectRatio="none" transform="translate(220 110) skewX(20)"/>
      <g opacity=".5"><image href="${imageSource}" x="350" y="110" width="80" height="60" preserveAspectRatio="none"/></g>
      <image href="${imageSource}" x="450" y="110" width="80" height="60" preserveAspectRatio="none" style="filter:opacity(.5)"/>
      <g transform="translate(10 210)" clip-path="url(#imageClip)"><image href="${imageSource}" width="80" height="60" preserveAspectRatio="none"/></g>
      <a href="https://example.test/image-detail"><use href="#reusableImage" x="110" y="210"/></a>
      <image href="${imageSource}" x="210" y="210" width="80" height="60" preserveAspectRatio="none" style="image-rendering:pixelated"/>
      <image href="${imageSource}" x="310" y="210" width="80" height="60" preserveAspectRatio="none"/>
      <rect x="330" y="230" width="40" height="20" fill="purple"/>
    </svg>`,
  },
  {
    name: "image-html-object-fit",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360" viewBox="0 0 600 360">
      <rect width="600" height="360" fill="white"/>
      <foreignObject x="10" y="10" width="560" height="300"><div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;gap:20px;align-items:start">
        <img src="${imageSource}" style="display:block;width:80px;height:60px;object-fit:contain;object-position:0% 100%"/>
        <img src="${imageSource}" style="display:block;width:80px;height:60px;object-fit:cover;object-position:100% 0%"/>
        <img src="${imageSource}" style="display:block;width:80px;height:60px;object-fit:fill"/>
        <img src="${imageSource}" style="display:block;width:80px;height:60px;object-fit:none;object-position:0% 0%"/>
        <img src="${imageSource}" style="display:block;width:80px;height:60px;object-fit:scale-down"/>
      </div></foreignObject>
      <image href="${imageSource}" x="10" y="110" width="80" height="60" preserveAspectRatio="none"/>
    </svg>`,
  },
  {
    name: "local-use-shape-style-and-paint",
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="600" height="480" viewBox="0 0 600 480">
      <style>
        .original .ancestor {fill:red} .destination .ancestor {fill:yellow}
        .direct {fill:rgb(20,80,160)} .inside .child {fill:rgb(180,40,100)}
        .cssPosition {x:calc(50% - 10px); y:110px}
        .turned {transform:rotate(90deg);transform-origin:50% 50%;transform-box:fill-box}
      </style>
      <defs fill="blue">
        <rect id="plain" width="80" height="60"/>
        <g class="original"><rect id="ancestor" class="ancestor" width="80" height="60"/></g>
        <rect id="direct" class="direct" width="80" height="60"/>
        <rect id="current" width="80" height="60" fill="currentColor"/>
        <g id="pair" opacity=".5"><rect width="60" height="60" fill="red"/><rect x="20" width="60" height="60" fill="blue"/></g>
        <g id="nested"><use href="#plain" x="10" y="10"/><rect x="30" y="30" width="30" height="20" fill="orange"/></g>
        <g id="inside" class="inside"><rect class="child" width="80" height="60"/></g>
        <rect id="escaped name" width="80" height="60" fill="purple"/>
        <g id="hidden"><rect width="80" height="60"/><rect x="20" y="20" width="40" height="20" fill="lime" visibility="visible"/></g>
        <linearGradient id="useGradient"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient>
        <rect id="gradient" width="80" height="60" fill="url(#useGradient)"/>
        <rect id="turned" class="turned" width="80" height="60" fill="orange"/>
        <clipPath id="small"><rect width="40" height="60"/></clipPath>
      </defs>
      <rect width="600" height="480" fill="white"/>
      <use href="#plain" x="10" y="10" fill="green"/>
      <g class="destination"><use href="#ancestor" x="110" y="10" fill="purple"/></g>
      <use href="#direct" x="210" y="10" fill="lime"/>
      <use href="#current" x="310" y="10" color="orange"/>
      <use href="#pair" x="410" y="10" opacity=".5"/>
      <use href="#plain" x="10" y="110" width="5" height="5" fill="teal"/>
      <use href="#nested" x="100" y="100" fill="green"/>
      <use href="#inside" x="210" y="110" fill="lime"/>
      <use class="cssPosition" href="#plain" fill="brown"/>
      <use xlink:href="#escaped%20name" x="410" y="110"/>
      <use href="#hidden" x="10" y="210" visibility="hidden"/>
      <use href="#plain" xlink:href="#direct" x="110" y="210" fill="lime"/>
      <use href="#plain" x="0" y="0" transform="translate(210 210) scale(1.5 1)" fill="pink"/>
      <use href="#gradient" x="350" y="210"/>
      <g clip-path="url(#small)" transform="translate(450 210)"><use href="#plain" fill="red"/></g>
      <use href="#plain" x="10" y="310" fill="red" style="filter:opacity(.5)"/>
      <g opacity=".5"><use href="#plain" x="110" y="310" fill="blue"/></g>
      <use href="#plain" x="210" y="310" fill="red"/>
      <rect x="250" y="310" width="40" height="60" fill="lime"/>
      <use href="#plain" x="350" y="310" fill="red" style="mix-blend-mode:multiply"/>
      <use href="#turned" x="450" y="310"/>
      <symbol id="not-direct" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></symbol>
    </svg>`,
  },
  {
    name: "use-symbol-svg-viewports",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360" viewBox="0 0 600 360">
      <style>symbol.icon {fill:purple} .half {width:20%;height:60px}</style>
      <defs>
        <symbol id="meet" viewBox="0 0 20 10"><rect x="-10" y="-10" width="40" height="30" fill="orange"/><rect width="20" height="10"/></symbol>
        <symbol id="slice" viewBox="0 0 20 10" preserveAspectRatio="xMidYMid slice"><rect width="20" height="10" fill="teal"/></symbol>
        <symbol id="none" viewBox="0 0 20 10" preserveAspectRatio="none"><rect width="10" height="10" fill="lime"/></symbol>
        <symbol id="cssSymbol" class="icon" viewBox="0 0 20 10"><rect width="20" height="10"/></symbol>
        <symbol id="defaults" viewBox="0 0 20 10" width="80" height="60"><rect width="20" height="10" fill="pink"/></symbol>
        <svg id="svg" x="10" y="10" width="80" height="60" viewBox="0 0 20 10"><rect width="20" height="10" fill="blue"/></svg>
        <symbol id="percent" viewBox="0 0 100 60"><rect width="50%" height="100%" fill="red"/></symbol>
        <g id="plainPercent"><rect width="10%" height="60" fill="brown"/></g>
        <symbol id="visible" viewBox="0 0 20 10" overflow="visible"><rect x="-10" y="-10" width="40" height="30" fill="orange"/><rect width="20" height="10" fill="purple"/></symbol>
      </defs>
      <rect width="600" height="360" fill="white"/>
      <use href="#meet" x="10" y="10" width="80" height="60" fill="red"/>
      <use href="#slice" x="110" y="10" width="80" height="60"/>
      <use href="#none" x="210" y="10" width="80" height="60"/>
      <use href="#cssSymbol" x="310" y="10" width="80" height="60" fill="lime"/>
      <use href="#defaults" x="410" y="10"/>
      <use href="#svg" x="0" y="100" width="80" height="60"/>
      <use class="half" href="#none" x="110" y="110"/>
      <use href="#percent" x="260" y="110" width="100" height="60"/>
      <use href="#plainPercent" x="390" y="110" width="120" height="60"/>
      <use href="#visible" x="40" y="240" width="80" height="60"/>
      <use href="#meet" x="110" y="210" width="0" height="60"/>
      <use href="#meet" x="210" y="210" width="80" height="0"/>
      <use href="#none" x="0" y="0" width="80" height="60" transform="translate(310 210) scale(1.5 1)"/>
    </svg>`,
  },
  {
    name: "use-links-text-and-invalid-references",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="120" viewBox="0 0 300 120">
      <defs>
        <g id="label"><rect width="80" height="30"/><text x="5" y="20" fill="white">Reused</text></g>
        <a id="linked" href="https://example.test/inner"><rect width="80" height="30" fill="blue"/></a>
        <g id="cycleA"><use href="#cycleB"/></g><g id="cycleB"><use href="#cycleA"/></g>
        <script id="inert">globalThis.__exotuiUseScript = true;</script>
      </defs>
      <a href="https://example.test/outer"><use href="#label" x="10" y="10" fill="green"/></a>
      <a href="https://example.test/outer"><use href="#linked" x="110" y="10"/></a>
      <use href="#cycleA"/>
      <use href="#inert"/>
      <use href="#absent"/>
      <use href="https://example.test/external.svg#shape"/>
    </svg>`,
  },
  {
    name: "filter-functions-and-primitives",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="480" viewBox="0 0 600 480">
      <defs>
        <filter id="linear"><feColorMatrix type="matrix" values=".5 0 0 0 0 0 .5 0 0 0 0 0 .5 0 0 0 0 0 1 0"/></filter>
        <filter id="identity"><feColorMatrix/></filter>
        <filter id="zeroBlur"><feGaussianBlur stdDeviation="0"/></filter>
        <filter id="singleMerge"><feMerge><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="empty"/>
        <filter id="transfer" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="table" tableValues="1 0"/><feFuncG type="gamma" exponent="2"/><feFuncB type="linear" slope="2"/><feFuncA type="discrete" tableValues=".25 .75"/></feComponentTransfer></filter>
        <filter id="merge" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB"><feFlood flood-color="blue" flood-opacity=".5" result="blue"/><feComposite in="blue" in2="SourceAlpha" operator="in" result="masked"/><feOffset in="masked" dx="10" dy="10" result="moved"/><feMerge><feMergeNode in="moved"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="blend"><feFlood flood-color="#ca4" result="color"/><feBlend in="SourceGraphic" in2="color" mode="multiply"/></filter>
        <filter id="flood" filterUnits="userSpaceOnUse" x="10" y="350" width="120" height="60"><feFlood flood-color="#f80" flood-opacity=".5"/></filter>
        <filter id="objectOffset" primitiveUnits="objectBoundingBox" x="-50%" y="-50%" width="200%" height="200%"><feOffset dx=".25" dy=".5"/></filter>
        <clipPath id="post"><rect x="310" y="350" width="100" height="60"/></clipPath>
        <filter id="postOffset" x="-100%" y="-100%" width="300%" height="300%"><feOffset dx="20" dy="0"/></filter>
      </defs>
      <rect width="600" height="480" fill="rgb(20,40,60)"/>
      ${
      [
        "brightness(.5)",
        "contrast(2)",
        "invert(1)",
        "grayscale(1)",
        "sepia(1)",
        "hue-rotate(90deg)",
        "saturate(2)",
        "opacity(.25)",
      ].map((filter, index) =>
        `<rect x="${index % 4 * 140 + 10}" y="${
          Math.floor(index / 4) * 100 + 10
        }" width="120" height="60" fill="rgb(200,100,50)" style="filter:${filter}"/>`
      ).join("")
    }
      <rect x="10" y="210" width="120" height="60" fill="rgb(200,100,50)" style="filter:brightness(.5) contrast(2)"/>
      <rect x="150" y="210" width="120" height="60" fill="rgb(200,100,50)" style="filter:contrast(2) brightness(.5)"/>
      <g opacity=".5" style="filter:opacity(.5)"><rect x="290" y="210" width="80" height="60" fill="red"/><rect x="330" y="210" width="80" height="60" fill="blue"/></g>
      <rect x="430" y="210" width="120" height="60" fill="rgb(200,100,50)" filter="url(#linear)"/>
      <rect x="10" y="280" width="120" height="60" fill="rgb(200,100,50)" filter="url(#transfer)"/>
      <rect x="150" y="280" width="120" height="60" fill="red" filter="url(#merge)"/>
      <rect x="290" y="280" width="120" height="60" fill="rgb(200,100,50)" filter="url(#blend)"/>
      <rect x="430" y="280" width="80" height="40" fill="red" filter="url(#objectOffset)"/>
      <rect x="10" y="350" width="120" height="60" fill="none" filter="url(#flood)"/>
      <g clip-path="url(#post)" filter="url(#postOffset)"><rect x="270" y="350" width="120" height="60" fill="lime"/></g>
      <rect x="10" y="430" width="120" height="40" fill="rgb(6,6,6)" filter="url(#identity)"/>
      <rect x="150" y="430" width="120" height="40" fill="rgb(6,6,6)" filter="url(#zeroBlur)"/>
      <rect x="290" y="430" width="120" height="40" fill="rgb(6,6,6)" filter="url(#singleMerge)"/>
      <rect x="430" y="430" width="120" height="40" fill="red" filter="url(#empty)"/>
    </svg>`,
  },
  {
    name: "spatial-filter-paint",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240" viewBox="0 0 400 240">
      <defs><filter id="blur" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="10"/></filter><filter id="shadow" x="-100%" y="-100%" width="300%" height="300%"><feDropShadow dx="10" dy="20" stdDeviation="5" flood-color="blue" flood-opacity=".5"/></filter></defs>
      <rect width="400" height="240" fill="white"/>
      <rect x="30" y="30" width="60" height="60" fill="red" style="filter:blur(10px)"/>
      <rect x="150" y="30" width="60" height="60" fill="red" filter="url(#blur)"/>
      <rect x="30" y="150" width="60" height="40" fill="red" style="filter:drop-shadow(10px 20px 5px rgba(0,0,255,.5))"/>
      <rect x="180" y="150" width="60" height="40" fill="red" filter="url(#shadow)"/>
    </svg>`,
  },
  {
    name: "gradient-and-group-paint",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="480" viewBox="0 0 600 480" opacity=".8">
      <defs>
        <linearGradient id="base"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient>
        <linearGradient id="inherited" href="#base" gradientTransform="rotate(20 .5 .5)"/>
        <linearGradient id="repeated" href="#base" x1="20%" x2="40%" spreadMethod="repeat"/>
        <linearGradient id="reflected" href="#base" x1="20%" x2="40%" spreadMethod="reflect"/>
        <linearGradient id="linearRGB" color-interpolation="linearRGB"><stop stop-color="black"/><stop offset="1" stop-color="white"/></linearGradient>
        <linearGradient id="steps"><stop offset="0" stop-color="red"/><stop offset="50%" stop-color="red"/><stop offset="40%" stop-color="lime"/><stop offset=".5" stop-color="blue"/><stop offset="1" stop-color="blue" stop-opacity=".3"/></linearGradient>
        <linearGradient id="user" gradientUnits="userSpaceOnUse" x1="0" x2="120" y1="0" y2="40"><stop stop-color="#f80"/><stop offset="1" stop-color="#08f" stop-opacity=".5"/></linearGradient>
        <radialGradient id="radial" href="#base" fx="25%" fy="40%" r="55%" fr="10%"/>
        <radialGradient id="radialUser" href="#base" gradientUnits="userSpaceOnUse" cx="70" cy="40" r="55" fx="45" fy="30" fr="5" gradientTransform="skewX(12)"/>
        <linearGradient id="colorSpaces"><stop stop-color="color(srgb .8 .2 .4)"/><stop offset="1" stop-color="color(srgb-linear .3 .4 .5)"/></linearGradient>
        <linearGradient id="colorSpacesExplicit" href="#colorSpaces" color-interpolation="sRGB"/>
        <linearGradient id="colorSpacesLinear" href="#colorSpaces" color-interpolation="linearRGB"/>
        <linearGradient id="colorSpacesAlpha"><stop stop-color="color(srgb .8 .2 .4 / .2)"/><stop offset="1" stop-color="color(srgb-linear .3 .4 .5 / .8)"/></linearGradient>
      </defs>
      <rect width="600" height="480" fill="rgb(20,40,60)"/>
      <g opacity=".5"><rect x="10" y="10" width="80" height="70" fill="red"/><rect x="50" y="10" width="80" height="70" fill="blue"/></g>
      <g opacity=".5"><g opacity=".5"><rect x="150" y="10" width="80" height="70" fill="lime"/></g></g>
      <rect x="250" y="10" width="80" height="70" fill="rgba(100,200,50,.5)" fill-opacity=".5" opacity=".5"/>
      <rect x="350" y="10" width="80" height="70" fill="rgb(100,200,50)" style="mix-blend-mode:multiply"/>
      <g style="isolation:isolate"><rect x="450" y="10" width="80" height="70" fill="#8c4"/><rect x="470" y="20" width="40" height="50" fill="#f80" style="mix-blend-mode:screen"/></g>
      <rect x="10" y="100" width="120" height="80" fill="url(#base)"/>
      <rect x="150" y="100" width="120" height="80" fill="url(#inherited)"/>
      <rect x="290" y="100" width="120" height="80" fill="url(#repeated)"/>
      <rect x="430" y="100" width="120" height="80" fill="url(#reflected)"/>
      <rect x="10" y="210" width="120" height="80" fill="url(#linearRGB)"/>
      <rect x="150" y="210" width="120" height="80" fill="url(#steps)" fill-opacity=".8"/>
      <g transform="translate(290 210) scale(1.1 .8)"><rect width="120" height="80" fill="url(#user)"/></g>
      <rect x="430" y="210" width="120" height="80" fill="url(#radial)"/>
      <g transform="translate(10 320)"><rect width="140" height="80" fill="url(#radialUser)"/></g>
      <g opacity=".6"><g opacity=".4"><rect x="190" y="330" width="80" height="60" fill="white"/></g><rect x="230" y="350" width="80" height="60" fill="yellow" fill-opacity=".5"/></g>
      <rect x="350" y="330" width="80" height="60" fill="transparent"/>
      <g color-interpolation="linearRGB" opacity=".5"><rect x="350" y="330" width="80" height="60" fill="white"/></g>
      <rect x="450" y="330" width="80" height="60" fill="red" fill-opacity="0"/>
      <rect x="450" y="330" width="80" height="60" fill="url(#colorSpacesAlpha)"/>
      <rect x="10" y="430" width="120" height="40" fill="color(srgb-linear .3 .4 .5 / .6)"/>
      <rect x="150" y="430" width="120" height="40" fill="color(display-p3 .2 .7 .4)"/>
      <rect x="290" y="430" width="120" height="40" fill="url(#colorSpaces)"/>
      <rect x="430" y="430" width="50" height="40" fill="url(#colorSpacesExplicit)"/>
      <rect x="500" y="430" width="50" height="40" fill="url(#colorSpacesLinear)"/>
    </svg>`,
  },
  {
    name: "css-blend-mode-paint",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="320" viewBox="0 0 400 320">
      <rect width="400" height="320" fill="white"/>
      ${
      [
        "normal",
        "multiply",
        "screen",
        "overlay",
        "darken",
        "lighten",
        "color-dodge",
        "color-burn",
        "hard-light",
        "soft-light",
        "difference",
        "exclusion",
        "hue",
        "saturation",
        "color",
        "luminosity",
      ].map((mode, index) => {
        const x = index % 4 * 100 + 10;
        const y = Math.floor(index / 4) * 80 + 10;
        return `<rect x="${x}" y="${y}" width="80" height="60" fill="rgb(50,180,110)"/><rect x="${x}" y="${y}" width="80" height="60" fill="rgb(210,70,170)" opacity=".65" style="mix-blend-mode:${mode}"/>`;
      }).join("")
    }
    </svg>`,
  },
  {
    name: "unsupported-paint-diagnostics",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80" viewBox="0 0 160 80">
      <style>@keyframes clip-fade {from{stroke-dashoffset:0}to{stroke-dashoffset:10}} .animated {animation:clip-fade 10s linear infinite}</style>
      <defs><filter id="unimplemented"><feTurbulence/></filter></defs>
      <rect x="10" y="10" width="30" height="30" fill="red" fill-opacity=".5"/>
      <rect x="50" y="10" width="30" height="30" fill="blue" style="mix-blend-mode:multiply"/>
      <rect x="90" y="10" width="30" height="30" fill="blue" filter="url(#unimplemented)"/>
      <path class="animated" d="M10 60 H150" fill="none" stroke="black" stroke-dasharray="5 5"/>
    </svg>`,
  },
  {
    name: "svg-clip-coordinate-spaces-and-intersections",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240" viewBox="0 0 360 240">
      <defs>
        <clipPath id="holes"><path d="M0 0 H90 V80 H0 Z M25 25 H65 V55 H25 Z" clip-rule="evenodd"/></clipPath>
        <clipPath id="outer"><rect x="0" y="0" width="80" height="70"/></clipPath>
        <clipPath id="inner"><rect x="30" y="10" width="100" height="50"/></clipPath>
        <clipPath id="bbox" clipPathUnits="objectBoundingBox"><rect x=".25" y=".2" width=".5" height=".6"/></clipPath>
        <clipPath id="bboxPercent" clipPathUnits="objectBoundingBox"><rect x="25%" y="20%" width="50%" height="60%"/></clipPath>
        <clipPath id="union" transform="translate(5 0)"><rect x="10" y="0" width="25" height="60" fill-opacity="0" stroke="red" stroke-width="40"/><rect x="60" y="0" width="25" height="60"/></clipPath>
        <clipPath id="nested" clip-path="url(#inner)"><rect x="0" y="0" width="100" height="80"/></clipPath>
        <clipPath id="empty"/>
        <clipPath id="curve" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".4"/></clipPath>
        <clipPath id="line"><path d="M0 0 H60 V20 H0 Z" style="d:path('M0 0 L10 20')" stroke="red" stroke-width="100"/></clipPath>
      </defs>
      <g transform="translate(10 10)"><rect width="100" height="90" fill="red" clip-path="url(#holes)"/></g>
      <g transform="translate(130 10)" clip-path="url(#outer)"><rect width="100" height="90" fill="green" clip-path="url(#inner)"/></g>
      <rect x="240" y="20" width="100" height="100" fill="blue" clip-path="url(#bbox)"/>
      <g transform="translate(10 130) scale(1.1 1)"><rect width="100" height="70" fill="purple" clip-path="url(#union)"/></g>
      <g transform="translate(140 130)"><rect width="100" height="80" fill="orange" clip-path="url(#nested)"/></g>
      <rect x="270" y="150" width="60" height="60" fill="black" clip-path="url(#empty)"/>
      <svg x="270" y="150" width="60" height="50" viewBox="0 0 10 10" preserveAspectRatio="xMidYMid slice" transform="rotate(-12 300 180)" overflow="hidden"><rect x="-10" y="-10" width="30" height="30" fill="cyan"/></svg>
      <svg x="300" y="210" width="10%" height="5%" viewBox="0 0 10 10" preserveAspectRatio="none" overflow="hidden"><rect x="-10" y="-10" width="30" height="30" fill="magenta"/></svg>
      <rect x="240" y="120" width="30" height="30" fill="lime" clip-path="url(#curve)"/>
      <g transform="translate(10 210)"><rect width="60" height="20" fill="black" clip-path="url(#line)"/></g>
      <rect x="100" y="210" width="60" height="20" fill="black" clip-path="url(#bboxPercent)"/>
    </svg>`,
  },
  {
    name: "svg-dash-distance-and-calibration",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="200" viewBox="0 0 240 200">
      <path d="M10 10 H190" fill="none" stroke="red" stroke-dasharray="0 0 160 20"/>
      <path d="M10 30 H230" fill="none" stroke="red" stroke-dasharray="20 10 5" stroke-dashoffset="-5"/>
      <g transform="translate(10 50) scale(2 1)"><path d="M0 0 H100" fill="none" stroke="red" pathLength="50" stroke-dasharray="10 10" stroke-dashoffset="-5"/></g>
      <path d="M10 90 H230" fill="none" stroke="red" pathLength="110" stroke-dasharray="10% 5%"/>
      <path d="M10 110 H65 M110 110 H165" fill="none" stroke="red" stroke-dasharray="20 10"/>
      <path d="M10 130 H230" fill="none" stroke="red" stroke-width="2" stroke-dasharray="0 20" stroke-linecap="round"/>
      <path d="M10 150 H230" fill="none" stroke="red" stroke-dasharray="0 10"/>
      <path d="M10 170 H230" fill="none" stroke="red" stroke-dasharray="calc(5% + 2px) min(10px, 20px) max(7px, 3px)" stroke-dashoffset="calc(-3px - 2%)"/>
    </svg>`,
  },
  {
    name: "solid-zero-dash-patterns",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80" viewBox="0 0 200 80">
      <path d="M10 10 H190" fill="none" stroke="red" stroke-dasharray="0"/>
      <path d="M10 30 H190" fill="none" stroke="red" stroke-dasharray="0 0"/>
      <path d="M10 50 H190" fill="none" stroke="red" stroke-dasharray="0 3" stroke-linecap="round"/>
    </svg>`,
  },
  {
    name: "disconnected-relative-contours",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="80" viewBox="0 0 140 80">
      <path d="M10 20 H40 m40 0 30 0" fill="none" stroke="red"/>
    </svg>`,
  },
  {
    name: "compound-fill-rules",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100" viewBox="0 0 300 100">
      <path d="M10 10 H90 V90 H10 Z M30 30 H70 V70 H30 Z" fill="red" fill-rule="evenodd"/>
      <path d="M110 10 H190 V90 H110 Z M130 30 H170 V70 H130 Z" fill="green"/>
      <path d="M210 10 H290 V90 H210 Z M230 30 V70 H270 V30 Z" fill="blue"/>
    </svg>`,
  },
  {
    name: "endpoint-marker-coordinates-and-context",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
      <defs><marker id="arrow" viewBox="0 0 10 10" markerWidth="20" markerHeight="20"
        refX="10" refY="5" orient="auto" markerUnits="userSpaceOnUse" overflow="visible">
        <path d="M0 0 L10 5 L0 10 Z" fill="context-stroke"/>
      </marker></defs>
      <path d="M20 50 H150" fill="none" stroke="rgb(10, 20, 30)" stroke-width="2" marker-end="url(#arrow)"/>
    </svg>`,
  },
  {
    name: "wrapped-html-and-hidden-ancestors",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="180" viewBox="0 0 220 180">
      <foreignObject x="10" y="10" width="90" height="140">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font:16px/20px monospace;white-space:normal">Alpha beta gamma delta</div>
      </foreignObject>
      <g style="display:none"><text x="120" y="30">Hidden SVG</text></g>
      <foreignObject x="110" y="10" width="100" height="100"><div xmlns="http://www.w3.org/1999/xhtml" style="opacity:0">Hidden HTML</div></foreignObject>
    </svg>`,
  },
];
