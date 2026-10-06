// Shared sim data + rules: the Singing Reactor expedition (docs/expedition-design.md).
// Same side-effect-script pattern as js/sim/pois.js (sets globalThis.ExpeditionCore):
// a <script> tag before game.js in the browser, await import() on the server.
// NO window/DOM references allowed here.
//
// The hauler is deliberately NOT a POI: POIs become shared landmarks the
// moment anyone charts them, and this site must stay hidden for every pilot
// until THEY follow the song. Its position is a constant here (fork 2a:
// fixed authored spot); the clue is the pulse, not a map marker.
(function () {
    const HAULER = {
        id: 'extraction_hauler_4',
        // Combine designation (Function + Class + Index). Earned naming is the
        // nomenclature slice's job; until then the row keeps its row name.
        name: 'Extraction Hauler 4',
        x: 4600, y: 2900,           // far SE dark: past Lastlight, short of the Choir
        radius: 220                 // the tether ring — wide enough to dogfight in
    };

    const DISPATCH_PORT = 'Frontier Outpost';

    // v1 guesses — every number here is on the NEXT-SESSION watchlist.
    const EXPEDITION_TUNING = {
        reactorUnits: 4,            // hold cost of the reactor
        kitsRequired: 2,            // Repair Kits aboard at accept
        pullSeconds: 60,            // the extraction bar (slice 2)
        pullFuel: 200,              // drained over the bar (slice 2)
        musterAtFrac: 0.40,         // Choir band arrives (slice 2)
        pulsePeriodSec: 20,         // the song's cadence
        pulseLifeSec: 6,            // how long a minimap pip lingers
        jitterFar: 900, jitterFarDist: 3000,
        jitterNear: 30, jitterNearDist: 400,
        coreRadius: 600,            // "outside the settled core" (slice 2)
        hunterPeriodSec: 45,        // carrying (slice 2)
        singingHunterPeriodSec: 180,// installed (slice 3)
        hunterCap: 4,
        reward: { credits: 3000, fame: 12, xp: 150 }
    };

    const T = EXPEDITION_TUNING;

    // Pulse slop: how far from the truth a pip may land, by distance.
    // Linear between the near and far anchors, clamped outside them.
    function pulseJitter(dist) {
        if (dist >= T.jitterFarDist) return T.jitterFar;
        if (dist <= T.jitterNearDist) return T.jitterNear;
        const f = (dist - T.jitterNearDist) / (T.jitterFarDist - T.jitterNearDist);
        return T.jitterNear + f * (T.jitterFar - T.jitterNear);
    }

    // One pulse: a point uniformly inside the jitter disk around the hauler.
    // rand is injectable so tests can pin it.
    function pulseFix(shipX, shipY, rand) {
        const r = rand || Math.random;
        const dx = HAULER.x - shipX, dy = HAULER.y - shipY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const j = pulseJitter(dist);
        const a = r() * Math.PI * 2;
        const m = Math.sqrt(r()) * j;
        return { x: HAULER.x + Math.cos(a) * m, y: HAULER.y + Math.sin(a) * m, jitter: j, dist };
    }

    // The song's loudness as a word — the Now zone reads this, never a number.
    function signalWord(dist) {
        if (dist > 2500) return 'faint';
        if (dist > 1200) return 'clear';
        if (dist > 500) return 'strong';
        return 'loud';
    }

    function distToHauler(x, y) {
        const dx = HAULER.x - x, dy = HAULER.y - y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // Fork 8: on offer whenever the pilot holds no reactor in any form.
    function offerAvailable(missions, cargo, mods) {
        if ((missions || []).some(m => m && m.type === 'expedition')) return false;
        if (((cargo || {}).reactor || 0) > 0) return false;
        if ((mods || []).includes('singing_reactor')) return false;
        return true;
    }

    // The dispatcher's preparation check. Returns { ok, lines } where each
    // line is { label, ok } so the UI can tick them off one by one.
    function prepCheck({ freeHold, kits, logCount, logMax }) {
        const lines = [
            { label: `${T.reactorUnits} free hold units`, ok: freeHold >= T.reactorUnits },
            { label: `${T.kitsRequired} Repair Kits aboard`, ok: kits >= T.kitsRequired },
            { label: 'room in the mission log', ok: logCount < (logMax || 3) }
        ];
        return { ok: lines.every(l => l.ok), lines };
    }

    function makeExpedition(now) {
        return {
            id: `expedition-${now}`,
            type: 'expedition',
            from: DISPATCH_PORT,
            stage: 'outbound',      // outbound → recovering → carrying (slices 2–3)
            found: false,
            reward: T.reward.credits,
            acceptedAt: now
        };
    }

    // Slice 2's return lane reads this: outside every planet's core radius.
    function outsideCore(x, y, planets) {
        const r2 = T.coreRadius * T.coreRadius;
        return (planets || []).every(p => {
            const dx = p.x - x, dy = p.y - y;
            return dx * dx + dy * dy > r2;
        });
    }

    globalThis.ExpeditionCore = {
        HAULER, DISPATCH_PORT, EXPEDITION_TUNING,
        pulseJitter, pulseFix, signalWord, distToHauler,
        offerAvailable, prepCheck, makeExpedition, outsideCore
    };
})();
