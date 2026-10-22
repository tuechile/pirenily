// Hover (or tab onto) a card with data-previews="url|url|..." and one of its pictures pops up at a random spot.
// Each new hover shows a different picture. Instant (no fades); it disappears when the mouse leaves.
(function () {
    if (!window.matchMedia("(hover: hover)").matches) return;
    var GRACE = 400;
    var layer = document.createElement("div");
    layer.className = "pop-layer";
    document.body.appendChild(layer);

    function bind(card) {
        if (card.dataset.popBound) return;
        card.dataset.popBound = "1";
        var urls = card.dataset.previews.split("|").filter(Boolean);
        if (!urls.length) return;
        var pics = null, hovering = false, last = -1, shown = null, leftAt = 0;

        function pop() {
            var ready = pics.filter(function (p) { return p.complete && p.naturalWidth; });
            if (!ready.length) return;
            var n = Math.floor(Math.random() * ready.length);
            if (ready.length > 1 && ready[n] === pics[last]) n = (n + 1) % ready.length;
            var src = ready[n];
            last = pics.indexOf(src);

            var w = Math.round(180 + Math.random() * 140);
            var h = Math.round(w * src.naturalHeight / src.naturalWidth);
            var el = document.createElement("img");
            el.className = "pop";
            el.src = src.src;
            el.alt = "";
            el.style.width = w + "px";
            el.style.left = Math.round(Math.random() * Math.max(0, innerWidth - w)) + "px";
            el.style.top = Math.round(Math.random() * Math.max(0, innerHeight - h)) + "px";
            layer.innerHTML = "";
            layer.appendChild(el);
            shown = el;
        }

        function enter() {
            if (!pics) {
                // load on first hover; each picture pops as soon as it arrives
                pics = urls.map(function (u) {
                    var im = new Image();
                    // first hover: show the first picture that finishes loading
                    im.onload = function () { if (hovering && !layer.children.length) pop(); };
                    im.src = u;
                    return im;
                });
            }
            hovering = true;
            // brushing off the edge and straight back isn't a new hover: keep the same picture
            if (shown && Date.now() - leftAt < GRACE) layer.appendChild(shown);
            else pop();
        }

        function leave() {
            hovering = false;
            leftAt = Date.now();
            layer.innerHTML = "";
        }

        card.addEventListener("mouseenter", enter);
        card.addEventListener("mouseleave", leave);
        // Tabbing onto a card pops a picture, the same as hovering it
        card.addEventListener("focus", function () { if (card.matches(":focus-visible")) enter(); });
        card.addEventListener("blur", leave);
    }

    document.querySelectorAll("[data-previews]").forEach(bind);
    // Cards swapped in after an unlock (design_list.html) get theirs too
    window.addEventListener("pirenily:cards", function () {
        document.querySelectorAll("[data-previews]").forEach(bind);
    });
})();
