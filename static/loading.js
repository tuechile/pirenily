// Loader GIF between pages. It only appears when a page is slow (over 200ms),
// except on the way to the landing page, where it always plays. Reduced motion (settings) turns it off.
document.addEventListener("DOMContentLoaded", () => {
    const loader = document.querySelector('.loader-container');
    if (!loader || document.documentElement.dataset.motion === 'reduced') return;
    const SLOW = 200;
    const LANDING_HOLD = 400;
    let timer = null;

    function showLoader() {
        loader.classList.remove('hidden');
    }

    function showIfSlow() {
        clearTimeout(timer);
        timer = setTimeout(showLoader, SLOW);
    }

    function hideLoader() {
        clearTimeout(timer);
        loader.classList.add('hidden');
    }

    // Arriving: only show the loader if this page is still loading after 200ms
    if (document.readyState !== 'complete') showIfSlow();
    window.addEventListener('load', hideLoader);

    document.querySelectorAll('a[href]').forEach(link => {
        link.addEventListener('click', (e) => {
            if (link.classList.contains('lightbox')) return;
            // New tab, new window, or a download: this page stays, so no loader
            if (link.target === '_blank' || link.hasAttribute('download') ||
                e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

            const url = new URL(link.href, location.href);
            // External sites and mailto: let the browser handle them as usual
            if (url.origin !== location.origin) return;
            // Jumping within this page
            if (url.pathname === location.pathname && url.hash) return;

            if (url.pathname === '/') {
                // Landing page always gets the loader
                e.preventDefault();
                showLoader();
                setTimeout(() => { location.href = url.href; }, LANDING_HOLD);
            } else {
                showIfSlow();
            }
        });
    });

    // Coming back via the back button restores this page from cache: hide the loader
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) hideLoader();
    });
});
