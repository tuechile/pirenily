// Phone menu: the "=" button opens the full-screen nav list; tap again, pick a link or press Esc to close.
// Home's "=" sits on the Projects filter bar (and the bar can be swapped out when the gate unlocks),
// so clicks are caught on the document and the wipe starts from whichever "=" was tapped.
(function () {
    var root = document.documentElement;

    function setOpen(open, from) {
        if (open && from) {
            var r = from.getBoundingClientRect();
            root.style.setProperty("--wipe-at", (r.left + r.width / 2) + "px " + (r.top + r.height / 2) + "px");
        }
        root.classList.toggle("menu-open", open);
        document.querySelectorAll(".nav-toggle, .view-menu").forEach(function (btn) {
            btn.setAttribute("aria-expanded", String(open));
            btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
        });
    }

    document.addEventListener("click", function (e) {
        var btn = e.target.closest(".nav-toggle, .view-menu");
        if (btn) { setOpen(!root.classList.contains("menu-open"), btn); return; }
        if (e.target.closest(".nav-item-big .nav-item")) setOpen(false);
    });
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") setOpen(false);
    });
    // back on a wider screen the menu is just the normal nav again (home keeps the menu up to 880px)
    ["(max-width: 666px)", "(max-width: 880px)"].forEach(function (q) {
        window.matchMedia(q).addEventListener("change", function () { setOpen(false); });
    });
})();
