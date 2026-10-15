// Site settings: view mode, theme, text size, font, motion and sound.
// Loaded in <head> so the saved look is on <html> before the page paints;
// the first-visit hint, panel and music start once the page is ready.
(function () {
    // What every first-time visitor gets ("Your view"); the panel's "My view" is VIEWS.mine below
    var DEFAULTS = {
        mode: "easy",       // "easy" (Easy to read) or "mine" (The way I like it)
        theme: "light",     // "light" or "dark"
        size: "M",          // "S", "M" or "L"
        font: "sans",       // "sans" or "serif"
        motion: "full",     // "full" or "reduced"
        sound: "music",     // "music", "formal" or "off"
        volume: 0.6,        // 0 to 1
        clicks: true        // click sounds on or off
    };

    // Sound files. Put them in static/asset/audio/music/ or static/asset/audio/formal/
    // and list the file names here, e.g. tracks: ["night-walk.mp3"], clicks: ["tap-1.wav", "tap-2.wav"].
    // With no click files, fire.js plays its synthesized sounds (a fire crackle for music, a soft tick for formal).
    var AUDIO = {
        music: { tracks: [], clicks: [] },
        formal: { tracks: [], clicks: [] }
    };

    // Typing one of these into the home finder opens the panel instead of searching
    var FINDER_WORDS = ["settings", "setting", "tune", "theme", "light", "light mode", "dark", "dark mode",
        "sound", "sounds", "music", "volume", "mute", "font", "text size", "accessibility", "accessible", "easy", "mode"];
    var TEASE_AFTER = 4; // easy-mode page views before offering "the way I like it" once

    var KEY = "pirenily-settings";
    var root = document.documentElement;
    var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

    function load(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
    function store(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }

    var saved = load(KEY);
    var s = Object.assign({}, DEFAULTS, reduced ? { motion: "reduced" } : {}, saved || {});

    function apply() {
        root.dataset.mode = s.mode;
        root.dataset.theme = s.theme;
        root.dataset.size = s.size;
        root.dataset.font = s.font;
        root.dataset.motion = s.motion;
    }
    apply();

    var switchTimer = null;

    function set(changes) {
        Object.assign(s, changes);
        store(KEY, s);
        // Swap the look in one go: hover transitions would otherwise fade every color across the switch
        root.classList.add("is-switching");
        apply();
        clearTimeout(switchTimer);
        switchTimer = setTimeout(function () { root.classList.remove("is-switching"); }, 60);
        syncPanel();
        syncMusic();
        document.dispatchEvent(new CustomEvent("pirenily:settings", { detail: s }));
    }

    // ---------- Music ----------
    var music = null;
    var waitingForGesture = false;

    function tracks() { return (AUDIO[s.sound] && AUDIO[s.sound].tracks) || []; }

    function syncMusic() {
        var list = tracks();
        if (!list.length) {
            if (music) { music.pause(); music = null; }
            return;
        }
        var resume = null;
        try { resume = JSON.parse(sessionStorage.getItem("pirenily-music")); } catch (e) {}
        if (!music || music.dataset.set !== s.sound) {
            if (music) music.pause();
            var i = resume && resume.set === s.sound ? resume.i % list.length : 0;
            music = new Audio("/static/asset/audio/" + s.sound + "/" + list[i]);
            music.dataset.set = s.sound;
            music.dataset.i = i;
            if (resume && resume.set === s.sound && resume.i === i) music.currentTime = resume.t || 0;
            music.addEventListener("ended", function () {
                var next = (+music.dataset.i + 1) % list.length;
                music.src = "/static/asset/audio/" + s.sound + "/" + list[next];
                music.dataset.i = next;
                music.play().catch(function () {});
            });
        }
        music.volume = s.volume;
        // Browsers only allow sound after the visitor interacts, so wait for the first click or key if needed
        music.play().catch(function () {
            if (waitingForGesture) return;
            waitingForGesture = true;
            var start = function () {
                waitingForGesture = false;
                document.removeEventListener("pointerdown", start, true);
                document.removeEventListener("keydown", start, true);
                if (music) music.play().catch(function () {});
            };
            document.addEventListener("pointerdown", start, true);
            document.addEventListener("keydown", start, true);
        });
    }

    // Carry the song over to the next page
    window.addEventListener("pagehide", function () {
        if (!music) return;
        try {
            sessionStorage.setItem("pirenily-music", JSON.stringify({ set: music.dataset.set, i: +music.dataset.i, t: music.currentTime }));
        } catch (e) {}
    });

    // fire.js asks this for a recorded click; returns false when it should synthesize one
    function playClickFile() {
        var files = (AUDIO[s.sound] && AUDIO[s.sound].clicks) || [];
        if (!files.length) return false;
        var a = new Audio("/static/asset/audio/" + s.sound + "/" + files[Math.floor(Math.random() * files.length)]);
        a.volume = s.volume;
        a.play().catch(function () {});
        return true;
    }

    window.Pirenily = { settings: s, set: set, open: function () { openPanel(true); }, playClickFile: playClickFile };

    // ---------- Panel: a speech bubble that grows out of the ☾ ♪ button ----------
    var VIEWS = {
        easy: { mode: "easy", theme: "light", size: "M", font: "sans" },  // "Your view"
        mine: { mode: "mine", theme: "dark", size: "M", font: "serif" }   // "My view"
    };
    var panel = null;
    var opener = null;
    var growing = null;

    function seg(key, label, options) {
        return '<div class="settings-seg" data-key="' + key + '" role="group" aria-label="' + label + '">' + options.map(function (o) {
            return '<button type="button" data-value="' + o[0] + '"' + (o[2] ? ' aria-label="' + o[2] + '"' : "") + ">" + o[1] + "</button>";
        }).join("") + "</div>";
    }

    function tile(label, body, cls) {
        return '<div class="settings-tile' + (cls ? " " + cls : "") + '"><span class="settings-tile-label">' + label + "</span>" + body + "</div>";
    }

    function buildPanel() {
        panel = document.createElement("div");
        panel.className = "settings-panel settings-bubble";
        panel.id = "settings-panel";
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", "Settings");
        panel.innerHTML =
            '<div class="settings-body">' +
            '<button type="button" class="settings-close" aria-label="Close settings">&times;</button>' +
            '<div class="settings-views">' +
            '<button type="button" data-view="easy">Your view</button>' +
            '<button type="button" data-view="mine">My view</button>' +
            "</div>" +
            '<button type="button" class="settings-custom-toggle" aria-expanded="false" aria-controls="settings-custom">Custom</button>' +
            '<div class="settings-custom" id="settings-custom" hidden>' +
            '<div class="settings-tiles">' +
            tile("Mode", seg("theme", "Mode", [["light", "☀", "Light"], ["dark", "☾", "Dark"]])) +
            tile("Text", seg("size", "Text size", [["S", "S", "Small text"], ["M", "M", "Medium text"], ["L", "L", "Large text"]])) +
            tile("Font", seg("font", "Font", [["sans", '<span class="settings-aa-sans">Aa</span>', "Sans"], ["serif", '<span class="settings-aa-serif">Aa</span>', "Serif"]])) +
            "</div>" +
            '<div class="settings-tiles settings-tiles-two">' +
            tile("Sound", seg("sound", "Sound", [["music", "♫", "Music"], ["formal", "♩", "Formal"], ["off", "off", "Sound off"]]) +
                '<input type="range" id="settings-volume" min="0" max="100" step="5" aria-label="Volume">' +
                seg("clicks", "Click sounds", [["true", "clicks", "Click sounds on"], ["false", "off", "Click sounds off"]]), "settings-tile-sound") +
            tile("Motion", seg("motion", "Motion", [["full", "on", "Motion on"], ["reduced", "less", "Reduced motion"]]) +
                '<span class="settings-note">Less turns off the blur, the loader and the glow.</span>') +
            "</div>" +
            "</div>" +
            "</div>";
        document.body.appendChild(panel);

        panel.addEventListener("click", function (e) {
            var v = e.target.closest("[data-view]");
            if (v) { set(VIEWS[v.dataset.view]); return; }
            var b = e.target.closest(".settings-seg button");
            if (!b) return;
            var key = b.parentElement.dataset.key;
            var value = b.dataset.value;
            var change = {};
            change[key] = value === "true" ? true : value === "false" ? false : value;
            set(change);
        });
        panel.querySelector("#settings-volume").addEventListener("input", function (e) {
            set({ volume: e.target.value / 100 });
        });
        panel.querySelector(".settings-close").addEventListener("click", function () { openPanel(false); });
        panel.querySelector(".settings-custom-toggle").addEventListener("click", function () {
            var t = this, open = t.getAttribute("aria-expanded") !== "true";
            t.setAttribute("aria-expanded", String(open));
            panel.querySelector(".settings-custom").hidden = !open;
            place(panel);
        });
        syncPanel();
    }

    function syncPanel() {
        if (!panel) return;
        panel.querySelectorAll("[data-view]").forEach(function (b) {
            b.setAttribute("aria-pressed", String(s.mode === b.dataset.view));
        });
        panel.querySelectorAll(".settings-seg").forEach(function (row) {
            row.querySelectorAll("button").forEach(function (b) {
                b.setAttribute("aria-pressed", String(String(s[row.dataset.key]) === b.dataset.value));
            });
        });
        panel.querySelector("#settings-volume").value = Math.round(s.volume * 100);
    }

    function isOpen() { return panel && panel.classList.contains("is-open"); }

    // Sits a bubble under the ☾ ♪ button with its tail pointing at it.
    // Follows the button: fixed when the button is fixed or sticky, otherwise it scrolls with the page.
    function place(el) {
        var btn = visibleButton();
        if (!btn) return;
        var r = btn.getBoundingClientRect();
        var pinned = false;
        for (var n = btn; n && n !== document.body; n = n.parentElement) {
            var pos = getComputedStyle(n).position;
            if (pos === "fixed" || pos === "sticky") { pinned = true; break; }
        }
        var w = el.offsetWidth;
        var gutter = 16;
        var center = r.left + r.width / 2;
        var left = Math.max(gutter, Math.min(center - w + 44, innerWidth - w - gutter));
        var top = r.bottom + 4;
        el.style.position = pinned ? "fixed" : "absolute";
        el.style.left = left + (pinned ? 0 : scrollX) + "px";
        el.style.top = top + (pinned ? 0 : scrollY) + "px";
        el.style.maxHeight = pinned ? innerHeight - top - gutter + "px" : "";
        el.style.setProperty("--tail-x", Math.round(center - left) + "px");
    }

    // The circle-out: a dot at the tail tip swells into a circle, a rounded blob, then the full bubble
    function grow(el, backwards, done) {
        if (s.motion === "reduced" || !el.animate) { if (done) done(); return null; }
        var w = el.offsetWidth, h = el.offsetHeight;
        var x = parseFloat(el.style.getPropertyValue("--tail-x")) || w / 2;
        function blob(bw, bh, round) {
            var l = Math.max(0, Math.min(x - bw / 2, w - bw));
            return "inset(0px " + (w - l - bw) + "px " + (h - bh) + "px " + l + "px round " + round + "px)";
        }
        var frames = [
            { clipPath: blob(8, 8, 4) },
            { clipPath: blob(Math.min(48, w), Math.min(48, h), 24), offset: 0.25 },
            { clipPath: blob(Math.min(w * 0.6, 150), Math.min(h * 0.45, 120), 48), offset: 0.55 },
            { clipPath: blob(w, h, 20) }
        ];
        if (backwards) frames.reverse().forEach(function (f, i, a) { if (f.offset != null) f.offset = 1 - f.offset; });
        el.classList.add("is-growing");
        var a = el.animate(frames, { duration: backwards ? 320 : 640, easing: backwards ? "ease-in" : "cubic-bezier(0.22, 1, 0.36, 1)" });
        a.onfinish = a.oncancel = function () { el.classList.remove("is-growing"); if (done) done(); };
        return a;
    }

    function openPanel(open) {
        if (!panel) buildPanel();
        if (open === isOpen()) return;
        stopHint(true);
        if (growing) growing.cancel();
        if (open) {
            opener = document.activeElement;
            panel.classList.add("is-open");
            place(panel);
            growing = grow(panel, false, function () { growing = null; });
            var first = panel.querySelector('[data-view][aria-pressed="true"]') || panel.querySelector("[data-view]");
            first.focus({ preventScroll: true });
        } else {
            growing = grow(panel, true, function () { growing = null; panel.classList.remove("is-open"); });
            if (!growing) panel.classList.remove("is-open");
            if (opener && opener.focus) opener.focus({ preventScroll: true });
        }
        document.querySelectorAll("[data-settings-open]").forEach(function (b) { b.setAttribute("aria-expanded", String(open)); });
    }

    // ---------- First visit: a magic-trick puff from ☾ ♪, then a bubble pointing at it ----------
    // HINT_KEY is unset on the very first page, "puffed" until the visitor opens settings or closes the bubble, then "done".
    var HINT_KEY = "pirenily-hint";
    var hint = null;

    function puff(btn) {
        if (s.motion === "reduced") return;
        var r = btn.getBoundingClientRect();
        var p = document.createElement("span");
        p.className = "settings-puff";
        p.setAttribute("aria-hidden", "true");
        p.style.left = r.left + r.width / 2 + scrollX + "px";
        p.style.top = r.top + r.height / 2 + scrollY + "px";
        for (var i = 0; i < 9; i++) {
            var c = document.createElement("i");
            var angle = (i / 9) * Math.PI * 2 + Math.random() * 0.5;
            var far = i === 0 ? 0 : 22 + Math.random() * 18;
            c.style.setProperty("--dx", Math.cos(angle) * far + "px");
            c.style.setProperty("--dy", Math.sin(angle) * far * 0.75 + "px");
            c.style.setProperty("--s", i === 0 ? 4.2 : 2 + Math.random() * 1.6);
            c.style.animationDelay = (i === 0 ? 0 : 30 + Math.random() * 90) + "ms";
            p.appendChild(c);
        }
        document.body.appendChild(p);
        setTimeout(function () { p.remove(); }, 1100);
    }

    function showHint(withPuff) {
        var btn = visibleButton();
        if (!btn) return;
        hint = document.createElement("div");
        hint.className = "settings-hint-bubble settings-bubble";
        hint.setAttribute("role", "status");
        hint.innerHTML = '<button type="button" class="settings-hint-open">Curious about what I see?<br>Change the view here!</button>' +
            '<button type="button" class="settings-close" aria-label="Hide this tip">&times;</button>';
        hint.addEventListener("click", function (e) {
            if (e.target.closest(".settings-close")) stopHint(true);
            else openPanel(true);
        });
        if (withPuff) {
            store(HINT_KEY, "puffed");
            puff(btn);
            setTimeout(function () { if (!hint) return; document.body.appendChild(hint); place(hint); grow(hint); }, s.motion === "reduced" ? 0 : 280);
        } else {
            document.body.appendChild(hint);
            place(hint);
        }
    }

    function stopHint(forever) {
        if (forever && load(HINT_KEY) !== "done") store(HINT_KEY, "done");
        if (hint) { hint.remove(); hint = null; }
    }

    function visibleButton() {
        var all = document.querySelectorAll("[data-settings-open]");
        for (var i = 0; i < all.length; i++) if (all[i].offsetParent || getComputedStyle(all[i]).position === "fixed") return all[i];
        return all[0];
    }

    // ---------- Offering the other view once ----------
    function maybeTease() {
        var views = (load("pirenily-views") || 0) + 1;
        store("pirenily-views", views);
        if (s.mode !== "easy" || views < TEASE_AFTER || load("pirenily-teased")) return;
        store("pirenily-teased", true);
        var t = document.createElement("div");
        t.className = "settings-tease";
        t.setAttribute("role", "status");
        t.innerHTML = '<span>Want to see it the way I see it?</span><div class="settings-seg">' +
            '<button type="button" data-v="yes">Show me</button><button type="button" data-v="no">No thanks</button></div>';
        document.body.appendChild(t);
        t.addEventListener("click", function (e) {
            var b = e.target.closest("button");
            if (!b) return;
            if (b.dataset.v === "yes") set({ mode: "mine", font: "serif", theme: "dark" });
            t.remove();
        });
    }

    // ---------- Mail links copy the address instead of opening a mail app ----------
    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text).catch(function () { return copyByHand(text); });
        }
        return copyByHand(text);
    }

    // Older browsers, or when the clipboard API says no
    function copyByHand(text) {
        return new Promise(function (ok, fail) {
            var t = document.createElement("textarea");
            t.value = text;
            t.setAttribute("readonly", "");
            t.style.position = "fixed";
            t.style.opacity = "0";
            document.body.appendChild(t);
            t.select();
            var done = false;
            try { done = document.execCommand("copy"); } catch (e) {}
            t.remove();
            done ? ok() : fail();
        });
    }

    document.addEventListener("click", function (e) {
        var link = e.target.closest('a[href^="mailto:"]');
        if (!link) return;
        e.preventDefault();
        var address = decodeURIComponent(link.getAttribute("href").slice(7).split("?")[0]);
        var r = link.getBoundingClientRect();
        var note = document.createElement("span");
        note.className = "mail-copied";
        note.setAttribute("role", "status");
        note.style.left = r.left + r.width / 2 + scrollX + "px";
        note.style.top = r.top + scrollY + "px";
        copyText(address).then(function () { note.textContent = "Copied " + address; },
            function () { note.textContent = address; });
        document.querySelectorAll(".mail-copied").forEach(function (n) { n.remove(); });
        document.body.appendChild(note);
        setTimeout(function () { note.remove(); }, 1800);
    });

    // ---------- Wiring ----------
    function typing(el) {
        return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    }

    document.addEventListener("DOMContentLoaded", function () {
        document.querySelectorAll("[data-settings-open]").forEach(function (b) {
            b.setAttribute("aria-expanded", "false");
            b.addEventListener("click", function () { openPanel(!isOpen()); });
        });

        // The finder: "settings", "light mode", "music" ... open the panel
        var finder = document.querySelector('input[name="finder"]');
        if (finder) finder.addEventListener("keydown", function (e) {
            if (e.key !== "Enter") return;
            var q = finder.value.trim().toLowerCase().replace(/\s+/g, " ");
            if (FINDER_WORDS.indexOf(q) === -1) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            finder.value = "";
            finder.blur();
            openPanel(true);
        }, true);

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && isOpen()) openPanel(false);
            // "," opens settings from anywhere except while typing
            if (e.key === "," && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target)) openPanel(!isOpen());
        });

        // Clicking outside the open panel closes it
        document.addEventListener("pointerdown", function (e) {
            if (isOpen() && !panel.contains(e.target) && !e.target.closest("[data-settings-open]")) openPanel(false);
        });

        // Keep open bubbles under the button when the window changes size
        window.addEventListener("resize", function () {
            if (isOpen()) place(panel);
            if (hint) place(hint);
        });

        var hintState = load(HINT_KEY);
        if (location.hash === "#settings") openPanel(true);
        else if (hintState !== "done") setTimeout(function () { showHint(!hintState); }, hintState ? 0 : 700);
        else maybeTease();
        syncMusic();
    });
})();
