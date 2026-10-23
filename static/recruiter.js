// Recruiter pages (templates/recruiter/): the shared behaviour of the profile panel and the page around it.
//   data-veil="words"     hover or focus lays the white veil over the middle column with those words
//   data-veil-names       hover runs the home finder's names through the veil
//   data-previews="a|b"   hover pops one of those pictures at a random spot (data-pop-width fixes its width)
//   data-note="WORDS"     the cursor turns into a white square holding those words
// Everything appears and disappears instantly.
(function () {
    var NAMES = ["Pirenily", "Chi Le", "Iron Pig", "Emily", "Chi Bell", "Emily Tiles", "Chi Chi Cha Cha",
                 "Chi Tu Le", "Le Le", "Chi", "Kai", "The Country"];
    var canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ---------- The veil ----------
    var veil = document.querySelector(".rc-veil");
    var veilText = veil && veil.querySelector("span");
    var namesTimer = null;

    function showVeil(words) {
        if (!veil) return;
        veilText.textContent = words;
        veil.hidden = false;
    }

    function hideVeil() {
        clearInterval(namesTimer);
        if (veil) veil.hidden = true;
    }

    // Other pages can say things on the veil too (the home tabs, the Play filters)
    window.rcVeil = { show: showVeil, hide: hideVeil };

    if (canHover) {
        document.querySelectorAll("[data-veil]").forEach(function (el) {
            var say = function () { showVeil(el.dataset.veil); };
            el.addEventListener("mouseenter", say);
            el.addEventListener("focusin", say);
            el.addEventListener("mouseleave", hideVeil);
            el.addEventListener("focusout", hideVeil);
        });
    }

    // ---------- Hover pictures ----------
    var layer = document.querySelector(".rc-pop-layer");
    var lastPop = null;

    function pop(el) {
        var list = (el.dataset.previews || "").split("|").filter(Boolean);
        if (!list.length || !layer) return;
        var i = Math.floor(Math.random() * list.length);
        if (list.length > 1 && list[i] === lastPop) i = (i + 1) % list.length;
        lastPop = list[i];
        var w = Number(el.dataset.popWidth) || Math.round(180 + Math.random() * 140);
        var pic = document.createElement("img");
        pic.className = "rc-pop";
        pic.src = list[i];
        pic.alt = "";
        pic.style.width = w + "px";
        pic.style.left = Math.round(Math.random() * Math.max(0, innerWidth - w)) + "px";
        pic.style.top = Math.round(Math.random() * Math.max(0, innerHeight - w)) + "px";
        layer.innerHTML = "";
        layer.appendChild(pic);
    }

    if (canHover) {
        document.addEventListener("mouseover", function (e) {
            var el = e.target.closest && e.target.closest("[data-previews]");
            if (!el || el.contains(e.relatedTarget)) return;
            pop(el);
        });
        document.addEventListener("mouseout", function (e) {
            var el = e.target.closest && e.target.closest("[data-previews]");
            if (!el || el.contains(e.relatedTarget)) return;
            if (layer) layer.innerHTML = "";
        });
    }

    // ---------- Our own cursor: a small ink square that trails the mouse ----------
    var cursor = document.querySelector(".rc-cursor");
    if (canHover && cursor && !reduced) {
        document.documentElement.classList.add("rc-own-cursor");
        var mouse = null, at = null, raf = 0;

        function frame() {
            if (!mouse) { raf = 0; return; }
            at.x += (mouse.x - at.x) * 0.25;
            at.y += (mouse.y - at.y) * 0.25;
            cursor.style.transform = "translate(" + at.x.toFixed(1) + "px, " + at.y.toFixed(1) + "px) translate(-50%, -50%)";
            raf = requestAnimationFrame(frame);
        }

        document.addEventListener("mousemove", function (e) {
            mouse = { x: e.clientX, y: e.clientY };
            if (!at) at = { x: mouse.x, y: mouse.y };
            cursor.hidden = false;
            if (!raf) raf = requestAnimationFrame(frame);
        });
        document.documentElement.addEventListener("mouseleave", function () {
            mouse = null;
            cursor.hidden = true;
        });
        // Over something with a note, the square becomes the note
        document.addEventListener("mouseover", function (e) {
            var el = e.target.closest && e.target.closest("[data-note]");
            var note = el ? el.dataset.note : "";
            cursor.textContent = note;
            cursor.classList.toggle("has-note", !!note);
        });
    }

    // ---------- The flip card ----------
    var card = document.querySelector(".rc-card");
    if (card) {
        var front = card.querySelector(".rc-card-front");
        var flip = function () {
            var flipped = card.classList.toggle("is-flipped");
            front.setAttribute("aria-pressed", String(flipped));
            if (layer) layer.innerHTML = "";
        };
        front.addEventListener("click", flip);
        card.querySelector(".rc-card-photos").addEventListener("click", flip);
    }

    // ---------- The running name: a new one every 400ms, like the home finder's placeholder ----------
    var heading = document.querySelector(".rc-name");
    var nameBtn = heading && heading.querySelector(".rc-name-btn");
    if (nameBtn) {
        var names = NAMES.slice(), n = 1, typing = false;
        setInterval(function () {
            if (typing) return;
            nameBtn.textContent = names[n % names.length];
            n++;
        }, 400);

        // Hovering the heading runs the names big on the veil too
        if (canHover) {
            heading.addEventListener("mouseenter", function () {
                if (typing) return;
                var i = 0;
                showVeil(names[0]);
                clearInterval(namesTimer);
                namesTimer = setInterval(function () { i = (i + 1) % names.length; veilText.textContent = names[i]; }, 400);
            });
            heading.addEventListener("mouseleave", hideVeil);
        }

        // Click it to give me a new name; Enter adds it for this visit (nothing is saved anywhere)
        nameBtn.addEventListener("click", function () {
            typing = true;
            hideVeil();
            var input = document.createElement("input");
            input.type = "text";
            input.className = "rc-name-input";
            input.maxLength = 40;
            input.placeholder = "a new name?";
            input.setAttribute("aria-label", "A new name for Chi, press Enter to add it");
            nameBtn.hidden = true;
            nameBtn.after(input);
            input.focus();
            var done = function () {
                input.remove();
                nameBtn.hidden = false;
                typing = false;
            };
            input.addEventListener("keydown", function (e) {
                if (e.key === "Escape") { done(); nameBtn.focus(); }
                if (e.key !== "Enter") return;
                var v = input.value.trim();
                if (v) {
                    names.push(v);
                    n = names.length - 1;
                    nameBtn.textContent = v;
                }
                done();
                nameBtn.focus();
            });
            input.addEventListener("blur", function () { if (typing) done(); });
        });
    }
})();
