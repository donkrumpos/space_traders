// Shared HTML escape — THE helper for every innerHTML sink that renders text
// a player could have authored: pilot names, ship names, faction fields,
// journal lines, chronicle text. The server bounds what it relays and what
// it accepts (docs/PROTOCOL.md "Boundary rules"), but sink-side escaping is
// the layer that doesn't depend on anyone remembering that. Escapes quotes
// too, so it's safe inside attribute values, not just text nodes.
function escapeHTML(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
