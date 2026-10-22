// Two switches in the nav: the light (on = "Your view", the paper light theme; off = "My view", dark)
// and sound (music and click sounds). Loaded in <head> so the saved look is on <html> before the page paints.
(function () {
    // What every first-time visitor gets
    var DEFAULTS = {
        light: true,
        sound: false
    };

    // The look each light position switches to (see settings.css)
    var VIEWS = {
        on: { mode: "easy", theme: "light", font: "sans" },   // "Your view"
        off: { mode: "mine", theme: "dark", font: "serif" }   // "My view"
    };

    // Sound files. Put them in static/asset/audio/music/ and list the file names here,
    // e.g. tracks: ["night-walk.mp3"], clicks: ["tap-1.wav", "tap-2.wav"].
    // With no click files, fire.js plays its synthesized fire crackle.
    var AUDIO = {
        music: { tracks: [], clicks: [] }
    };
    var SOUND_SET = "music";
    var VOLUME = 0.6;

    // Typing one of these into the home finder flips a switch instead of searching
    var FINDER_WORDS = {
        "light": { light: true }, "light mode": { light: true }, "lights on": { light: true },
        "dark": { light: false }, "dark mode": { light: false }, "lights off": { light: false },
        "sound": { sound: true }, "music": { sound: true }, "mute": { sound: false }, "sound off": { sound: false }
    };

    var KEY = "pirenily-switches";
    var root = document.documentElement;
    var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

    function load(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
    function store(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }

    var s = Object.assign({}, DEFAULTS, load(KEY) || {});

    function apply() {
        var v = VIEWS[s.light ? "on" : "off"];
        root.dataset.mode = v.mode;
        root.dataset.theme = v.theme;
        root.dataset.font = v.font;
        root.dataset.motion = reduced ? "reduced" : "full";
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
        syncButtons();
        syncMusic();
        document.dispatchEvent(new CustomEvent("pirenily:settings", { detail: s }));
    }

    function syncButtons() {
        document.querySelectorAll("[data-switch]").forEach(function (b) {
            b.setAttribute("aria-pressed", String(!!s[b.dataset.switch]));
        });
    }

    // ---------- Music ----------
    var music = null;
    var waitingForGesture = false;

    function tracks() { return s.sound ? AUDIO[SOUND_SET].tracks : []; }

    function syncMusic() {
        var list = tracks();
        if (!list.length) {
            if (music) { music.pause(); music = null; }
            return;
        }
        var resume = null;
        try { resume = JSON.parse(sessionStorage.getItem("pirenily-music")); } catch (e) {}
        if (!music || music.dataset.set !== SOUND_SET) {
            if (music) music.pause();
            var i = resume && resume.set === SOUND_SET ? resume.i % list.length : 0;
            music = new Audio("/static/asset/audio/" + SOUND_SET + "/" + list[i]);
            music.dataset.set = SOUND_SET;
            music.dataset.i = i;
            if (resume && resume.set === SOUND_SET && resume.i === i) music.currentTime = resume.t || 0;
            music.addEventListener("ended", function () {
                var next = (+music.dataset.i + 1) % list.length;
                music.src = "/static/asset/audio/" + SOUND_SET + "/" + list[next];
                music.dataset.i = next;
                music.play().catch(function () {});
            });
        }
        music.volume = VOLUME;
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
        var files = AUDIO[SOUND_SET].clicks;
        if (!files.length) return false;
        var a = new Audio("/static/asset/audio/" + SOUND_SET + "/" + files[Math.floor(Math.random() * files.length)]);
        a.volume = VOLUME;
        a.play().catch(function () {});
        return true;
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
    window.Pirenily = { settings: s, set: set, volume: VOLUME, playClickFile: playClickFile };

    document.addEventListener("DOMContentLoaded", function () {
        document.querySelectorAll("[data-switch]").forEach(function (b) {
            b.addEventListener("click", function () {
                var change = {};
                change[b.dataset.switch] = !s[b.dataset.switch];
                set(change);
            });
        });
        syncButtons();

        // The finder: "light", "dark", "mute" ... flip a switch
        var finder = document.querySelector('input[name="finder"]');
        if (finder) finder.addEventListener("keydown", function (e) {
            if (e.key !== "Enter") return;
            var q = finder.value.trim().toLowerCase().replace(/\s+/g, " ");
            if (!FINDER_WORDS.hasOwnProperty(q)) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            finder.value = "";
            finder.blur();
            set(FINDER_WORDS[q]);
        }, true);

        syncMusic();
    });
})();
