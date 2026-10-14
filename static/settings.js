// Site settings: view mode, theme, text size, font, motion and sound.
// Loaded in <head> so the saved look is on <html> before the page paints;
// the chooser, panel and music start once the page is ready.
(function () {
    // What a visitor gets if they skip the first-visit chooser
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
    var firstVisit = !saved;
    var s = Object.assign({}, DEFAULTS, reduced ? { motion: "reduced" } : {}, saved || {});

    function apply() {
        root.dataset.mode = s.mode;
        root.dataset.theme = s.theme;
        root.dataset.size = s.size;
        root.dataset.font = s.font;
        root.dataset.motion = s.motion;
    }
    apply();

    function set(changes) {
        Object.assign(s, changes);
        store(KEY, s);
        apply();
        syncPanel();
        syncMusic();
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

    // ---------- Panel ----------
    var panel = null;
    var opener = null;

    function seg(key, options) {
        return '<div class="settings-seg" data-key="' + key + '">' + options.map(function (o) {
            return '<button type="button" data-value="' + o[0] + '">' + o[1] + "</button>";
        }).join("") + "</div>";
    }

    function group(label, key, options, hint) {
        return '<fieldset class="settings-group"><legend>' + label + "</legend>" + seg(key, options) +
            (hint ? '<span class="settings-hint">' + hint + "</span>" : "") + "</fieldset>";
    }

    function buildPanel() {
        panel = document.createElement("aside");
        panel.className = "settings-panel";
        panel.id = "settings-panel";
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-labelledby", "settings-title");
        panel.innerHTML =
            '<h2 id="settings-title">Settings <button type="button" class="settings-close">close</button></h2>' +
            group("View", "mode", [["easy", "Easy to read"], ["mine", "The way I like it"]]) +
            group("Theme", "theme", [["light", "Light"], ["dark", "Dark"]]) +
            group("Text size", "size", [["S", "S"], ["M", "M"], ["L", "L"]]) +
            group("Font", "font", [["sans", "Sans"], ["serif", "Serif"]]) +
            group("Motion", "motion", [["full", "On"], ["reduced", "Reduced"]], "Reduced turns off the hover blur, the loader and the glow.") +
            "<hr>" +
            group("Sound", "sound", [["music", "Music"], ["formal", "Formal"], ["off", "Off"]], "Music is the playful set; formal is quieter.") +
            '<div class="settings-group"><label for="settings-volume">Volume</label>' +
            '<input type="range" id="settings-volume" min="0" max="100" step="5"></div>' +
            group("Click sounds", "clicks", [["true", "On"], ["false", "Off"]]) +
            "<hr>" +
            '<button type="button" class="settings-again">Show the welcome again</button>';
        document.body.appendChild(panel);

        panel.addEventListener("click", function (e) {
            var b = e.target.closest(".settings-seg button");
            if (!b) return;
            var key = b.parentElement.dataset.key;
            var v = b.dataset.value;
            var change = {};
            change[key] = v === "true" ? true : v === "false" ? false : v;
            // Each view brings its own font; the font row can still change it afterwards
            if (key === "mode") change.font = v === "easy" ? "sans" : "serif";
            set(change);
        });
        panel.querySelector("#settings-volume").addEventListener("input", function (e) {
            set({ volume: e.target.value / 100 });
        });
        panel.querySelector(".settings-close").addEventListener("click", function () { openPanel(false); });
        panel.querySelector(".settings-again").addEventListener("click", function () { openPanel(false); showChooser(); });
        syncPanel();
    }

    function syncPanel() {
        if (!panel) return;
        panel.querySelectorAll(".settings-seg").forEach(function (row) {
            row.querySelectorAll("button").forEach(function (b) {
                b.setAttribute("aria-pressed", String(s[row.dataset.key]) === b.dataset.value);
            });
        });
        panel.querySelector("#settings-volume").value = Math.round(s.volume * 100);
    }

    function isOpen() { return panel && panel.classList.contains("is-open"); }

    function openPanel(open) {
        if (!panel) buildPanel();
        if (open === isOpen()) return;
        stopNudge();
        if (open) {
            opener = document.activeElement;
            panel.classList.add("is-open");
            // after the slide starts, so the focus doesn't jump the page
            setTimeout(function () { var b = panel.querySelector('[aria-pressed="true"]'); if (b) b.focus(); }, 50);
        } else {
            panel.classList.remove("is-open");
            if (opener && opener.focus) opener.focus();
        }
        document.querySelectorAll("[data-settings-open]").forEach(function (b) { b.setAttribute("aria-expanded", String(open)); });
    }

    // ---------- First-visit chooser ----------
    function showChooser() {
        var wrap = document.createElement("div");
        wrap.className = "settings-chooser";
        wrap.innerHTML =
            '<div class="settings-chooser-card" role="dialog" aria-modal="true" aria-labelledby="settings-chooser-title">' +
            '<span class="settings-logo">Pirenily</span>' +
            '<h2 id="settings-chooser-title">How would you like to see this?</h2>' +
            '<div class="settings-choices">' +
            '<button type="button" data-choose="easy"><b>Easy to read</b><small>Clear sans-serif, comfortable sizes, light or dark.</small></button>' +
            '<button type="button" data-choose="mine"><b>The way I like it</b><small>Small, serif, dark and a little dreamy. Harder to read, more me.</small></button>' +
            "</div>" +
            '<div class="settings-seg" data-key="sound">Sound&nbsp;' +
            [["music", "Music"], ["formal", "Formal"], ["off", "Off"]].map(function (o) {
                return '<button type="button" data-value="' + o[0] + '" aria-pressed="' + (s.sound === o[0]) + '">' + o[1] + "</button>";
            }).join("") + "</div>" +
            '<button type="button" class="settings-skip" data-choose="skip">Skip, just show me the site</button>' +
            "</div>";
        document.body.appendChild(wrap);
        var sound = s.sound;

        wrap.addEventListener("click", function (e) {
            var snd = e.target.closest(".settings-seg button");
            if (snd) {
                sound = snd.dataset.value;
                wrap.querySelectorAll(".settings-seg button").forEach(function (b) { b.setAttribute("aria-pressed", b === snd); });
                return;
            }
            var pick = e.target.closest("[data-choose]");
            if (!pick) return;
            var choice = pick.dataset.choose;
            if (choice === "easy") set({ mode: "easy", font: "sans", theme: "light", sound: sound });
            else if (choice === "mine") set({ mode: "mine", font: "serif", theme: "dark", sound: sound });
            else set(Object.assign({}, DEFAULTS, { motion: s.motion, sound: sound }));
            wrap.remove();
            startNudge();
        });
        wrap.addEventListener("keydown", function (e) {
            if (e.key === "Escape") wrap.querySelector(".settings-skip").click();
        });
        wrap.querySelector("[data-choose]").focus();
    }

    // ---------- Pointing at the settings after the chooser ----------
    function startNudge() {
        var btn = visibleButton();
        if (!btn) return;
        btn.classList.add("is-lit");
        var note = document.createElement("span");
        note.className = "settings-nudge";
        note.textContent = "Change here if you regret later";
        btn.appendChild(note);
    }

    function stopNudge() {
        document.querySelectorAll(".settings-btn.is-lit").forEach(function (b) { b.classList.remove("is-lit"); });
        document.querySelectorAll(".settings-nudge").forEach(function (n) { n.remove(); });
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

        if (location.hash === "#settings") openPanel(true);
        if (firstVisit) showChooser();
        else maybeTease();
        syncMusic();
    });
})();
