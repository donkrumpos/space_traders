// Goods glyph sprite — the start of the drawn visual language (UI
// visual-language milestone, Slice A; mockups/dock-visual-language.html).
// One SVG symbol per trade good, same drawing rules as the ship schematic:
// dark fill of the good's own color, ~1.5px colored stroke.
//
// The drawings are PLACEHOLDER ART by design: call sites only ever reference
// a symbol id (#g-<type>) through goodIcon(), so when the lore system firms
// up, redrawing a glyph is an edit to this one table — zero call-site
// changes. The learnability rule the language depends on: glyph and color
// always travel together, and the text name lives one layer down (tooltips /
// detail cards), so every glance drills the pairing.

const GOODS_GLYPHS = {
    // Glowgrain: a luminous grain stalk
    food: '<path d="M12 21 V7" stroke="#ffff00" stroke-width="1.5" fill="none"/>' +
        '<path d="M12 9 C9 8 8 6 8 4 C10 4 12 6 12 9 Z" fill="#332f00" stroke="#ffff00" stroke-width="1.2"/>' +
        '<path d="M12 9 C15 8 16 6 16 4 C14 4 12 6 12 9 Z" fill="#332f00" stroke="#ffff00" stroke-width="1.2"/>' +
        '<path d="M12 14 C9 13 8 11 8 9 C10 9 12 11 12 14 Z" fill="#332f00" stroke="#ffff00" stroke-width="1.2"/>' +
        '<path d="M12 14 C15 13 16 11 16 9 C14 9 12 11 12 14 Z" fill="#332f00" stroke="#ffff00" stroke-width="1.2"/>' +
        '<circle cx="12" cy="5" r="1.4" fill="#ffff00"/>',
    // Cognition Cores: a shipmind lattice cube
    technology: '<rect x="5.5" y="5.5" width="13" height="13" rx="1.5" fill="#00292d" stroke="#00ffff" stroke-width="1.5"/>' +
        '<path d="M9.5 5.5 V18.5 M14.5 5.5 V18.5 M5.5 9.5 H18.5 M5.5 14.5 H18.5" stroke="#00ffff" stroke-width="0.8" opacity="0.7"/>' +
        '<circle cx="12" cy="12" r="1.6" fill="#00ffff"/>',
    // Ferrovolt Ore: a charge-bearing chunk
    materials: '<path d="M6 15 L8.5 6.5 L15.5 7.5 L19 13.5 L14.5 19 L7.5 17.5 Z" fill="#2d1a00" stroke="#ff8800" stroke-width="1.5"/>' +
        '<path d="M12.5 9 L10.5 13 L13 12.7 L11.2 16" stroke="#ffcc66" stroke-width="1.2" fill="none"/>',
    // Nebula Silk: gas-woven strands
    luxury: '<path d="M4 8 C9 5 13 11 20 7" stroke="#ff00ff" stroke-width="1.5" fill="none"/>' +
        '<path d="M4 13 C9 10 13 16 20 12" stroke="#ff00ff" stroke-width="1.5" fill="none" opacity="0.75"/>' +
        '<path d="M4 18 C9 15 13 21 20 17" stroke="#ff00ff" stroke-width="1.5" fill="none" opacity="0.5"/>',
    // Panacea Vials: reef-lab cure-all
    medicine: '<rect x="10" y="3.5" width="4" height="3" fill="#0f3320" stroke="#66ff99" stroke-width="1.2"/>' +
        '<path d="M9 7 H15 V17 A3 3 0 0 1 9 17 Z" fill="#0f3320" stroke="#66ff99" stroke-width="1.5"/>' +
        '<path d="M9 12.5 H15 V17 A3 3 0 0 1 9 17 Z" fill="#66ff99" opacity="0.55"/>',
    // Precursor Relics: a cracked hex shard of the vanished builders
    relics: '<path d="M12 3.5 L19 7.5 V16.5 L12 20.5 L5 16.5 V7.5 Z" fill="#241d33" stroke="#cc99ff" stroke-width="1.5"/>' +
        '<path d="M12 3.5 L10.5 10 L13.5 13 L11 20.5" stroke="#cc99ff" stroke-width="1" fill="none" opacity="0.8"/>',
    // Voidbloom: the illegal flower
    contraband: '<g stroke="#ff44cc" stroke-width="1.2" fill="#33112a">' +
        '<ellipse cx="12" cy="6.5" rx="2.4" ry="4"/><ellipse cx="12" cy="17.5" rx="2.4" ry="4"/>' +
        '<ellipse cx="6.5" cy="12" rx="4" ry="2.4"/><ellipse cx="17.5" cy="12" rx="4" ry="2.4"/></g>' +
        '<circle cx="12" cy="12" r="2.2" fill="#ff44cc"/>',
    // Repair Kits: sealed spares crate
    parts: '<rect x="4.5" y="7.5" width="15" height="11" rx="1" fill="#0b2a26" stroke="#88ffee" stroke-width="1.5"/>' +
        '<path d="M4.5 11 H19.5" stroke="#88ffee" stroke-width="1"/>' +
        '<path d="M12 12.5 V17 M9.8 14.8 H14.2" stroke="#88ffee" stroke-width="1.6"/>'
};

// Inject the sprite once, at load (scripts sit at the end of <body>, so the
// body exists). Symbols weigh nothing until <use>d.
(function injectGlyphSprite() {
    if (document.getElementById('glyphSprite')) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'glyphSprite';
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.innerHTML = Object.keys(GOODS_GLYPHS)
        .map(type => `<symbol id="g-${type}" viewBox="0 0 24 24">${GOODS_GLYPHS[type]}</symbol>`)
        .join('');
    document.body.appendChild(svg);
})();

// The one way call sites render a good's glyph. The <title> is the
// under-the-hood name (browser tooltip on hover — the learning layer).
// Unknown types fall back to the old colored square so a future good added
// to `goods` without a drawing degrades gracefully instead of vanishing.
function goodIcon(type) {
    if (!GOODS_GLYPHS[type]) {
        const g = (typeof goods !== 'undefined') && goods[type];
        return g ? `<span style="color:${g.color}">■</span>` : '';
    }
    const name = (typeof goods !== 'undefined' && goods[type]) ? goods[type].name : type;
    return `<svg class="gicon" aria-hidden="true"><title>${name}</title><use href="#g-${type}"/></svg>`;
}
