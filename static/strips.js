// Strip cards (Code page, home Projects): a bare image strip that opens into a square of facts.
(() => {
    // Each strip is cut into 12 × 6 square tiles, i.e. two 6 × 6 squares side by side.
    // Hovering a square flips its tiles away, rippling out from the pointer, to show the facts behind it.
    // A card whose facts don't fit in half the strip (long text, narrow screens) flips the whole strip.
    const COLS = 12, ROWS = 6;
    const cards = [...document.querySelectorAll('.strip-card')];
    const hoverable = matchMedia('(hover: hover)');
    const span = (card) => card._full ? COLS : COLS / 2;
    const still = () => document.documentElement.dataset.motion === 'reduced';

    cards.forEach((card) => {
        const strip = card.querySelector('.strip');
        const art = strip.querySelector('.strip-art');
        const tiles = document.createElement('div');
        tiles.className = 'strip-tiles';
        for (let j = 0; j < ROWS; j++) {
            for (let i = 0; i < COLS; i++) {
                const tile = document.createElement('div');
                tile.className = 'strip-tile';
                tile.style.setProperty('--i', i);
                tile.style.setProperty('--j', j);
                const piece = art.cloneNode(true);
                piece.removeAttribute('alt');
                piece.setAttribute('aria-hidden', 'true');
                tile.append(piece);
                tiles.append(tile);
            }
        }
        strip.append(tiles);
        card._tiles = [...tiles.children];
        card._start = null;
    });

    // Measured on every open, since the view switch and the window size change the text's size
    const measure = (card) => {
        const facts = card.querySelector('.strip-facts');
        facts.classList.remove('is-full', 'is-right');
        card._full = facts.scrollHeight > facts.clientHeight + 1;
        facts.classList.toggle('is-full', card._full);
    };

    // The tile under the pointer, and which square (left or right half) it falls in
    const locate = (card, e) => {
        if (!e || e.clientX == null) return { start: 0, origin: [0, 0] };
        const r = card.querySelector('.strip').getBoundingClientRect();
        const col = Math.max(0, Math.min(COLS - 1, Math.floor((e.clientX - r.left) / r.width * COLS)));
        const row = Math.max(0, Math.min(ROWS - 1, Math.floor((e.clientY - r.top) / r.height * ROWS)));
        return { start: Math.floor(col / span(card)) * span(card), origin: [row, col] };
    };

    // Flip the chosen square's tiles away and every other tile back; start = null turns them all back
    const show = (card, start, [row, col]) => {
        card._start = start;
        if (start !== null) card.querySelector('.strip-facts').classList.toggle('is-right', start > 0);
        card._tiles.forEach((tile, k) => {
            const i = k % COLS, j = Math.floor(k / COLS);
            const on = start !== null && i >= start && i < start + span(card);
            if (tile.classList.contains('is-flipped') === on) return;
            tile.style.transitionDelay = still() ? '0s' : Math.hypot(i - col, j - row) * 35 + 'ms';
            tile.classList.toggle('is-flipped', on);
        });
    };

    // The facts rise in again each time a square opens
    const rise = (card) => {
        const facts = card.querySelector('.strip-facts');
        facts.classList.remove('is-in');
        void facts.offsetWidth;
        facts.classList.add('is-in');
    };

    const open = (card, e) => {
        measure(card);
        const { start, origin } = locate(card, e);
        card.classList.add('is-open');
        show(card, start, origin);
        rise(card);
    };

    const follow = (card, e) => {
        if (!card.classList.contains('is-open')) return;
        const { start, origin } = locate(card, e);
        if (start === card._start) return;
        show(card, start, origin);
        rise(card);
    };

    const close = (card, e) => {
        if (!card.classList.contains('is-open')) return;
        card.classList.remove('is-open');
        show(card, null, locate(card, e).origin);
        card.querySelector('.strip-facts').classList.remove('is-in');
    };

    cards.forEach((card) => {
        card.addEventListener('mouseenter', (e) => hoverable.matches && open(card, e));
        card.addEventListener('mousemove', (e) => hoverable.matches && follow(card, e));
        card.addEventListener('mouseleave', (e) => hoverable.matches && close(card, e));
        card.addEventListener('focus', () => card.classList.contains('is-open') || open(card));
        card.addEventListener('blur', () => close(card));
    });

    // No hover on touch: the first tap opens the square under the finger, a second tap follows the link
    document.addEventListener('click', (e) => {
        if (hoverable.matches) return;
        const card = e.target.closest('.strip-card');
        if (!card || card.classList.contains('is-open')) return;
        e.preventDefault();
        cards.forEach((c) => c !== card && close(c));
        open(card, e);
    });
})();
