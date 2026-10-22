// Strip cards on touch screens: no hover to wake a card, so the one crossing the middle of the screen
// counts as reached for (.is-centered), the same as hovering it on a computer.
(function () {
    if (window.matchMedia("(hover: hover)").matches || !("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { e.target.classList.toggle("is-centered", e.isIntersecting); });
    }, { rootMargin: "-48% 0px -48% 0px" }); // a band thinner than the gap between cards, so one wakes at a time
    function watch() {
        io.disconnect();
        document.querySelectorAll(".strip-card").forEach(function (card) { io.observe(card); });
    }
    watch();
    // the home gate swaps in fresh cards after the password
    window.addEventListener("pirenily:cards", watch);
})();
