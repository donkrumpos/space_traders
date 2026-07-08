// Pure market/mission math shared by browser and server (M3, docs/PROTOCOL.md
// "Economy sim extraction"). Side-effect script that sets globalThis.EconomyCore
// — loaded as a <script> tag before game.js in the browser and via await
// import() on the server. Same file, no fork.
//
// Rules: state is passed in — this module NEVER reads game/window globals.
// No DOM. No clock-based scheduling — the caller owns cadence, cooldowns, and
// event lifetimes (timeLeft is data, ticked down by the caller). Internal
// Math.random() and Date.now()-for-ids are fine.
//
// A "meta" is a planet definition (SIM_PLANETS entry or the game's planet
// object — anything with name/produces/demands). A "market" is live prices:
// { buy: {good: price}, sell: {good: price} }.
(() => {
    'use strict';

    // Prices stay within [0.4×, 2×] of the static base
    function clampPrice(value, base) {
        return Math.min(base * 2.0, Math.max(base * 0.4, value));
    }

    // Fresh live market for a planet: prices start at the static base values
    function makeMarket(meta) {
        const market = { buy: {}, sell: {} };
        Object.keys(meta.produces).forEach(g => { market.buy[g] = meta.produces[g]; });
        Object.keys(meta.demands).forEach(g => { market.sell[g] = meta.demands[g]; });
        return market;
    }

    // One wander step for one planet's market — the galaxy trades while you
    // fly. Mutates the market in place (and returns it).
    function drift(market, meta) {
        Object.keys(market.buy).forEach(g => {
            market.buy[g] = clampPrice(market.buy[g] * (0.92 + Math.random() * 0.16), meta.produces[g]);
        });
        Object.keys(market.sell).forEach(g => {
            market.sell[g] = clampPrice(market.sell[g] * (0.92 + Math.random() * 0.16), meta.demands[g]);
        });
        return market;
    }

    // A trade moves the market: buying drives the price up, flooding drives
    // it down. Mutates the market in place (and returns it).
    function tradeImpact(market, meta, good, side, qty) {
        if (side === 'buy') {
            market.buy[good] = clampPrice(market.buy[good] * (1 + 0.02 * qty), meta.produces[good]);
        } else {
            market.sell[good] = clampPrice(market.sell[good] * (1 - 0.02 * qty), meta.demands[good]);
        }
        return market;
    }

    // Active market event's price multiplier for this planet/good/side (1 = none)
    function eventMultiplier(marketEvent, planetName, good, side) {
        if (marketEvent && marketEvent.planetName === planetName &&
            marketEvent.goodType === good && marketEvent.side === side) {
            return marketEvent.multiplier;
        }
        return 1;
    }

    // --- Market events (shortages and gluts) ---

    const MARKET_EVENT_FLAVORS = {
        sell: { food: 'Famine', technology: 'Tech crisis', materials: 'Mining strike', luxury: 'Luxury craze' },
        buy: { food: 'Bumper harvest', technology: 'Factory overrun', materials: 'Ore glut', luxury: 'Warehouse overstock' }
    };

    // Roll a fresh market event, or null when the picked planet had nothing
    // to disrupt (the caller decides the retry cadence).
    function rollMarketEvent(planetMetas) {
        const meta = planetMetas[Math.floor(Math.random() * planetMetas.length)];
        const side = Math.random() < 0.65 ? 'sell' : 'buy'; // shortages are more fun than gluts
        const pool = Object.keys(side === 'sell' ? meta.demands : meta.produces);
        if (pool.length === 0) return null;
        const goodType = pool[Math.floor(Math.random() * pool.length)];
        const multiplier = side === 'sell' ? 2 + Math.random() : 0.4 + Math.random() * 0.2;
        const label = `${MARKET_EVENT_FLAVORS[side][goodType]} at ${meta.name}`;
        return { planetName: meta.name, goodType, side, multiplier, timeLeft: 180, label };
    }

    // --- Mission boards (delivery contracts + wanted posters) ---

    function averageDemandPrice(allMetas, goodType) {
        const prices = allMetas.filter(p => p.demands[goodType] !== undefined).map(p => p.demands[goodType]);
        if (prices.length === 0) return 100;
        return prices.reduce((a, b) => a + b, 0) / prices.length;
    }

    // The legal good universe falls out of the planet roster itself
    function legalGoodTypes(allMetas) {
        const set = new Set();
        allMetas.forEach(p => {
            Object.keys(p.produces).forEach(g => set.add(g));
            Object.keys(p.demands).forEach(g => set.add(g));
        });
        set.delete('contraband');
        return [...set];
    }

    const BOUNTY_FIRST_NAMES = ['Crimson', 'Void', 'Iron', 'Silent', 'Black', 'Rust', 'Grim', 'Howling'];
    const BOUNTY_LAST_NAMES = ['Vex', 'Harrow', 'Kane', 'Sable', 'Talon', 'Mordant', 'Grin', 'Locke'];

    // One board roll for one planet: { offers: [delivery...], bountyOffer|null }.
    // Escort offers are NOT rolled here — they stay client-local in M3 (they
    // touch game.traders — M4 territory). Player-state gates (mission log
    // full, already hunting one bounty) belong to the caller.
    function generateMissionOffers(meta, allMetas) {
        const offers = [];
        // No station posts contraband runs on its public board
        const produced = Object.keys(meta.produces).filter(g => g !== 'contraband');
        const legalGoods = legalGoodTypes(allMetas);
        const count = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++) {
            // Mostly ship what this station produces (buy here, haul there)
            const goodType = produced.length > 0 && Math.random() < 0.7
                ? produced[Math.floor(Math.random() * produced.length)]
                : legalGoods[Math.floor(Math.random() * legalGoods.length)];
            const destinations = allMetas.filter(p => p.name !== meta.name && p.demands[goodType] !== undefined);
            if (destinations.length === 0) continue;
            const dest = destinations[Math.floor(Math.random() * destinations.length)];
            const qty = 4 + Math.floor(Math.random() * 8);
            // Pays a premium over the average open-market sell price — the price of a fixed route
            const reward = Math.round(qty * averageDemandPrice(allMetas, goodType) * 1.25 / 10) * 10;
            offers.push({ id: `${meta.name}-${Date.now()}-${i}`, from: meta.name, dest: dest.name, goodType, qty, reward });
        }

        // Wanted poster — posters only show up sometimes (40%)
        let bountyOffer = null;
        if (Math.random() <= 0.4) {
            const target = allMetas[Math.floor(Math.random() * allMetas.length)];
            const name = BOUNTY_FIRST_NAMES[Math.floor(Math.random() * BOUNTY_FIRST_NAMES.length)] + ' ' +
                         BOUNTY_LAST_NAMES[Math.floor(Math.random() * BOUNTY_LAST_NAMES.length)];
            bountyOffer = {
                id: `bounty-${Date.now()}`,
                type: 'bounty',
                name,
                nearPlanet: target.name,
                reward: 1500 + Math.round(Math.random() * 150) * 10
            };
        }

        return { offers, bountyOffer };
    }

    globalThis.EconomyCore = {
        clampPrice, makeMarket, drift, tradeImpact,
        eventMultiplier, rollMarketEvent, generateMissionOffers
    };
})();
