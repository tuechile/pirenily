// Loader (templates/partials/loader.html), on every page including the landing.
// Leaving: the wait is the server building the next page, and only this page can show anything
// meanwhile, so the GIF covers it if the next one hasn't arrived after 150ms.
// Arriving: the page shows as soon as its text is ready; a thin bar tracks the pictures still coming in.
// Reduced motion (settings) keeps the bar but drops the GIF.
(function () {
    const SLOW = 150;
    const GIVE_UP = 15000; // a click that never leaves (a download, a stopped load) shouldn't leave the GIF up
    const loader = document.querySelector('.loader-container');
    const bar = document.querySelector('.load-bar');
    const reduced = () => document.documentElement.dataset.motion === 'reduced';
    let timer = null;
    let giveUp = null;

    function hideLoader() {
        clearTimeout(timer);
        clearTimeout(giveUp);
        if (loader) loader.classList.add('hidden');
    }

    function leaving() {
        if (!loader || reduced()) return;
        clearTimeout(timer);
        timer = setTimeout(() => loader.classList.remove('hidden'), SLOW);
        giveUp = setTimeout(hideLoader, GIVE_UP);
    }

    document.addEventListener('click', (e) => {
        const link = e.target.closest('a[href]');
        if (!link || e.defaultPrevented || link.classList.contains('lightbox')) return;
        // New tab, new window, or a download: this page stays
        if (link.target === '_blank' || link.hasAttribute('download') ||
            e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        const url = new URL(link.href, location.href);
        // Other sites and mailto: the browser shows its own progress
        if (url.origin !== location.origin) return;
        // Jumping within this page
        if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
        leaving();
    });

    // The finder and the password forms load a new page too (the home gate unlocks in place and cancels its submit)
    document.addEventListener('submit', (e) => {
        if (!e.defaultPrevented) leaving();
    });

    // Back/forward restores pages from cache with the GIF still up
    window.addEventListener('pageshow', hideLoader);

    function trackPictures() {
        if (!bar) return;
        const fill = bar.firstElementChild;
        // Pictures this load is waiting on: eager ones, and lazy ones already on screen
        const pending = [...document.images].filter((im) => !im.complete && (im.loading !== 'lazy' ||
            im.getBoundingClientRect().top < innerHeight));
        if (!pending.length) return;
        let done = 0;
        if (reduced()) fill.style.transition = 'none';
        fill.style.width = '8%';
        bar.classList.remove('hidden');
        const finish = () => bar.classList.add('hidden');
        const step = () => {
            done += 1;
            fill.style.width = Math.max(8, (done / pending.length) * 100) + '%';
            if (done === pending.length) setTimeout(finish, 250);
        };
        pending.forEach((im) => {
            im.addEventListener('load', step, { once: true });
            im.addEventListener('error', step, { once: true });
        });
        window.addEventListener('load', () => setTimeout(finish, 250), { once: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', trackPictures);
    else trackPictures();
})();
