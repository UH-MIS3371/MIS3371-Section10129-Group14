// Original flat illustrations for the five challenges, drawn in each challenge's own colour (currentColor).
// Each is 400 x 150 and sits at the top of its card under a two-line caption.
const CHALLENGE_ART = {
  "crisis-2008": `<svg viewBox="0 0 400 150" preserveAspectRatio="xMidYMid meet" role="img" aria-label="A bank building beside a falling line">
    <g fill="currentColor">
      <polygon points="64,60 130,30 196,60" opacity=".95"/><rect x="72" y="64" width="116" height="8" opacity=".95"/>
      <rect x="82" y="76" width="13" height="46" opacity=".7"/><rect x="104" y="76" width="13" height="46" opacity=".7"/>
      <rect x="126" y="76" width="13" height="46" opacity=".7"/><rect x="148" y="76" width="13" height="46" opacity=".7"/><rect x="170" y="76" width="13" height="46" opacity=".7"/>
      <rect x="66" y="124" width="128" height="10" opacity=".95"/>
    </g>
    <polyline points="222,38 252,50 272,46 300,78 326,88 352,126" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
    <polygon points="364,134 338,128 356,112" fill="currentColor"/>
  </svg>`,
  "dotcom-2000": `<svg viewBox="0 0 400 150" preserveAspectRatio="xMidYMid meet" role="img" aria-label="A browser window next to soap bubbles">
    <rect x="40" y="30" width="160" height="96" rx="8" fill="currentColor" opacity=".16" stroke="currentColor" stroke-width="3"/>
    <line x1="40" y1="52" x2="200" y2="52" stroke="currentColor" stroke-width="3"/>
    <circle cx="54" cy="41" r="4" fill="currentColor"/><circle cx="68" cy="41" r="4" fill="currentColor"/><circle cx="82" cy="41" r="4" fill="currentColor"/>
    <text x="120" y="102" text-anchor="middle" font-family="Public Sans, sans-serif" font-weight="800" font-size="38" fill="currentColor">.com</text>
    <g fill="currentColor" stroke="currentColor" stroke-width="3">
      <circle cx="268" cy="86" r="42" fill-opacity=".2"/><circle cx="334" cy="54" r="24" fill-opacity=".2"/><circle cx="352" cy="112" r="15" fill-opacity=".2"/>
    </g>
    <path d="M244 72 A28 28 0 0 1 262 54" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
  </svg>`,
  "covid-2020": `<svg viewBox="0 0 400 150" preserveAspectRatio="xMidYMid meet" role="img" aria-label="A paper plane and a house">
    <path d="M40 122 Q120 14 232 48" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="3 9" stroke-linecap="round"/>
    <g fill="currentColor"><polygon points="196,34 250,50 214,78" opacity=".95"/><polygon points="196,34 214,78 200,68" opacity=".6"/></g>
    <g fill="currentColor">
      <polygon points="272,82 316,46 360,82"/><rect x="282" y="82" width="68" height="44" opacity=".7"/>
      <rect x="298" y="94" width="36" height="22" rx="2" fill="#fff" opacity=".85"/><rect x="304" y="100" width="24" height="10" fill="currentColor" opacity=".5"/>
    </g>
  </svg>`,
  "meme-2021": `<svg viewBox="0 0 400 150" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Candlesticks climbing beside a diamond">
    <g fill="currentColor" stroke="currentColor" stroke-width="3">
      <line x1="52" y1="82" x2="52" y2="124"/><rect x="44" y="92" width="16" height="22" opacity=".6"/>
      <line x1="84" y1="72" x2="84" y2="118"/><rect x="76" y="84" width="16" height="24" opacity=".6"/>
      <line x1="116" y1="70" x2="116" y2="108"/><rect x="108" y="76" width="16" height="22"/>
      <line x1="148" y1="56" x2="148" y2="96"/><rect x="140" y="62" width="16" height="26"/>
      <line x1="180" y1="30" x2="180" y2="76"/><rect x="172" y="36" width="16" height="34"/>
      <line x1="212" y1="8" x2="212" y2="54"/><rect x="204" y="14" width="16" height="34"/>
    </g>
    <g stroke="currentColor" stroke-width="3" stroke-linejoin="round">
      <polygon points="296,52 344,52 364,76 320,128 276,76" fill="currentColor" fill-opacity=".3"/>
      <polyline points="276,76 364,76 320,52 296,76 320,128 344,76" fill="none"/>
    </g>
    <g stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="372" y1="36" x2="384" y2="24"/><line x1="272" y1="40" x2="262" y2="30"/><line x1="378" y1="62" x2="392" y2="62"/></g>
  </svg>`,
  "rates-2022": `<svg viewBox="0 0 400 150" preserveAspectRatio="xMidYMid meet" role="img" aria-label="A thermometer and rising steps">
    <rect x="70" y="20" width="26" height="92" rx="13" fill="none" stroke="currentColor" stroke-width="4"/>
    <circle cx="83" cy="118" r="20" fill="currentColor"/>
    <rect x="78" y="46" width="10" height="72" fill="currentColor"/>
    <g stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="104" y1="34" x2="116" y2="34"/><line x1="104" y1="56" x2="112" y2="56"/><line x1="104" y1="78" x2="116" y2="78"/><line x1="104" y1="100" x2="112" y2="100"/></g>
    <g fill="currentColor"><rect x="160" y="104" width="34" height="26" opacity=".5"/><rect x="200" y="86" width="34" height="44" opacity=".65"/><rect x="240" y="66" width="34" height="64" opacity=".8"/><rect x="280" y="44" width="34" height="86"/></g>
    <text x="348" y="86" text-anchor="middle" font-family="Public Sans, sans-serif" font-weight="800" font-size="52" fill="currentColor">%</text>
    <polygon points="348,22 364,44 332,44" fill="currentColor"/>
  </svg>`
};
