from flask import Flask, Response, abort, render_template, request, redirect, url_for
from werkzeug.security import check_password_hash
import difflib
import hashlib
import hmac
import json
import os
import random
import re
import subprocess
import time
import unicodedata
import urllib.error
import urllib.request
from datetime import datetime

app = Flask(__name__)
app.secret_key = "change-this-to-a-long-random-string"  # required for sessions

# Maps a stable logical name (used in templates) to the actual on-disk folder
# under static/asset/images/. Rename or move a folder on disk, update it here
# once, and every template that references it via img()/gallery_images()
# keeps working.
IMAGE_FOLDERS = {
    "about": "about",
    "afvs": "afvs",
    "design": "design",
    "art_direction": "art direction",
    "client": "client",
    "fish": "fish",
    "illustration": "illustration",
    "olympics": "client/olympics",
    "other": "other",
    "portal": "portal",
    "processing": "processing",
    "recit": "recit",
    "self": "self",
    "street": "street",
    "ux": "ux",
}

# Cache-busting version appended to local CSS/JS URLs (?v=...).
# Bump on every change so browsers fetch fresh assets.
ASSET_VERSION = "205"

GALLERY_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}

# Masonry photo galleries, all rendered by templates/gallery.html.
# folder: IMAGE_FOLDERS key; section: page title suffix; sort: gallery_images()
# sort mode, or a list of filenames for a hand-picked order (anything unlisted
# follows, newest first); natural_height: show images at their own aspect ratio, uncropped.
ILLUSTRATION_ORDER = [
    "10.3.22.jpg", "30.10.23.jpg", "28.8.21.jpg", "26.8.22.jpg", "16.7.21.jpg",
    "10.7.21.jpg", "9.7.20.jpg", "illustration-19.webp", "illustration-18.webp",
    "illustration-04.webp", "illustration-02.webp", "illustration-06.webp",
    "illustration-17.webp", "illustration-07.webp", "illustration-12.webp",
    "22.5.20.jpg", "illustration-10.webp", "illustration-05.webp",
    "illustration-08.webp", "15.4.20.jpg", "illustration-16.webp",
    "illustration-13.png", "illustration-09.webp", "illustration-14.webp",
    "illustration-20.webp", "illustration-03.webp", "illustration-01.webp",
    "illustration-11.webp", "illustration-15.webp",
]

GALLERIES = {
    "illustration": {"folder": "illustration", "section": "Personal", "sort": ILLUSTRATION_ORDER},
    "portal": {"folder": "portal", "section": "Personal"},
    "street": {"folder": "street", "section": "Personal"},
    "superface": {"folder": "self", "section": "Personal"},
    "olympics": {"folder": "olympics", "section": "Design", "natural_height": True},
}

# Templates that live under templates/Projects/ instead of at the templates
# root, keyed by the short "finder" name used elsewhere in this file.
PROJECT_TEMPLATES = {
    "cs171": "Projects/cs171.html",
    "t4sg": "Projects/2ft.html",
    "commonspirit": "Projects/commonspirit.html",
}


def render_gallery(name):
    config = {"sort": "name", "natural_height": False, **GALLERIES[name]}
    return render_template("gallery.html", **config)


def render_sub_page(name, folder):
    if name in GALLERIES:
        return render_gallery(name)
    return render_template(f"{folder}/{name}.html")


def _date_sort_key(filename):
    # illustration/ files are named D.M.YY(YY).ext; sort newest first.
    # Undated files (e.g. illustration-01.webp) come first, in name order.
    stem = os.path.splitext(filename)[0]
    try:
        day, month, year = (int(p) for p in stem.split("."))
    except ValueError:
        return (0, 0, stem)
    if year < 100:
        year += 2000
    return (1, -datetime(year, month, day).toordinal(), stem)


# Which top-nav item a page belongs to, so the nav can mark "you are here".
NAV_SECTIONS = {
    "about": ["about"],
    "code": ["code"],
    "play": ["play", "afvs", "gifafvs", "essays", "fysemr", "illustration", "portal", "street", "superface"],
    "projects": ["hackharvard", "merch", "involvement", "olympics", "recit", "highlander", "t4sg", "commonspirit", "cs1710"],
}


def _last_updated():
    """'Oct 2026': date of the last commit, or of the newest file if git isn't around (e.g. on deploy)."""
    try:
        out = subprocess.run(["git", "log", "-1", "--format=%ct"], cwd=app.root_path,
                             capture_output=True, text=True, timeout=2).stdout.strip()
        stamp = int(out)
    except (OSError, ValueError, subprocess.SubprocessError):
        stamp = max(os.path.getmtime(os.path.join(d, f))
                    for root in (app.template_folder, app.static_folder)
                    for d, _, files in os.walk(os.path.join(app.root_path, root)) for f in files)
    return datetime.fromtimestamp(stamp).strftime("%b %Y")


LAST_UPDATED = _last_updated()

# Case studies in reading order; each one's footer links to the previous and next (wrapping around).
CASE_STUDIES = [
    ("hackharvard", "HackHarvard 2026: Hack to the Moon"),
    ("merch", "Merch"),
    ("commonspirit", "T4SG × CommonSpirit Health"),
    ("cs171", "Chi x Rain: An Essay on Unicode"),
    ("t4sg", "T4SG × 2ft Prosthetics"),
]


@app.context_processor
def inject_site_info():
    endpoints = [e for e, _ in CASE_STUDIES]
    next_case = prev_case = None
    if request.endpoint in endpoints:
        i = endpoints.index(request.endpoint)
        prev_case, next_case = ({"url": url_for(e), "title": t}
                                for e, t in (CASE_STUDIES[i - 1], CASE_STUDIES[(i + 1) % len(CASE_STUDIES)]))
    return dict(last_updated=LAST_UPDATED, next_case=next_case, prev_case=prev_case)


@app.context_processor
def inject_nav_section():
    page = request.path.strip("/").split("/")[0]
    section = next((name for name, pages in NAV_SECTIONS.items() if page in pages), None)
    return dict(nav_section=section)


# Short fingerprint per static file, so an image's URL changes only when the image does.
# Size plus the first 64KB: reading whole photos and videos made first visits wait on the hashing.
_file_hashes = {}


def _file_hash(path):
    if path not in _file_hashes:
        with open(path, "rb") as f:
            digest = hashlib.md5(str(os.path.getsize(path)).encode())
            digest.update(f.read(64 * 1024))
            _file_hashes[path] = digest.hexdigest()[:8]
    return _file_hashes[path]


# Photos that have a web-sized copy, with the original's size when the copy was made
try:
    with open(os.path.join(app.static_folder, "asset", "images", "_web", "manifest.json")) as f:
        WEB_IMAGES = json.load(f)
except (OSError, ValueError):
    WEB_IMAGES = {}


@app.after_request
def cache_static(response):
    # Versioned URLs (?v= on CSS/JS, the content hash on images) never change, so they keep for a year.
    # Anything else (images named in CSS) keeps for a day.
    if request.endpoint == "static" and response.status_code in (200, 206, 304):
        response.cache_control.no_cache = None
        response.cache_control.public = True
        if "v" in request.args:
            response.cache_control.max_age = 60 * 60 * 24 * 365
            response.cache_control.immutable = True
        else:
            response.cache_control.max_age = 60 * 60 * 24
    return response


@app.context_processor
def inject_image_helper():
    def img(folder, filename="", original=False):
        real_folder = IMAGE_FOLDERS.get(folder, folder)
        rel = f"{real_folder}/{filename}"
        path = f"asset/images/{rel}".rstrip("/")
        full = os.path.join(app.static_folder, path)
        if not filename or not os.path.isfile(full):
            return url_for("static", filename=path)
        # Big photos have a web-sized copy (tools/web_images.py); a replaced original skips its stale copy
        if not original and WEB_IMAGES.get(rel) == os.path.getsize(full):
            path = f"asset/images/_web/{rel}"
            full = os.path.join(app.static_folder, path)
        return url_for("static", filename=path, v=_file_hash(full))

    def gallery_images(folder, sort="name"):
        real_folder = IMAGE_FOLDERS.get(folder, folder)
        dir_path = os.path.join(app.static_folder, "asset", "images", real_folder)
        if not os.path.isdir(dir_path):
            return []
        files = [
            f for f in os.listdir(dir_path)
            if os.path.splitext(f)[1].lower() in GALLERY_IMAGE_EXTENSIONS
        ]
        if isinstance(sort, list):
            listed = [f for f in sort if f in files]
            return listed + sorted(set(files) - set(listed), key=_date_sort_key)
        if sort == "date_desc":
            return sorted(files, key=_date_sort_key)
        return sorted(files)

    def previews(folder, files=None, limit=8):
        """'|'-joined image URLs for a card's hover pop-ups (static/popups.js).
        Without files, takes a random handful from the folder's gallery."""
        if files is None:
            files = gallery_images(folder)
            files = random.sample(files, min(limit, len(files)))
        return "|".join(img(folder, f) for f in files)

    return dict(img=img, gallery_images=gallery_images, previews=previews, asset_v=ASSET_VERSION)

# Landing-page finder: every page and the words people might type to reach it.
# Matching is case-, accent- and punctuation-insensitive, so "Recít" == "recit".
SEARCH_INDEX = [
    ("/about", ["about", "about me", "chi", "chi le", "le tue chi", "tue", "chi tue le", "pirenily", "me",
                "myself", "emily", "iron pig", "chi bell", "artist", "bio", "contact", "email", "instagram",
                "linkedin", "github", "self photography"]),
    ("/#portfolio", ["projects", "project", "portfolio", "ux", "ui", "uiux", "ui ux", "case study", "case studies",
                     "work", "design", "graphic design", "collab", "collaboration", "collaborations",
                     "collaborative work", "commission", "commissions", "commissioned work", "client", "client work",
                     "clubs", "club", "art direction", "art director", "director", "direction", "member", "logo",
                     "logos", "poster", "posters", "branding", "brand"]),
    ("/play", ["play", "personal", "personal work", "self", "mine", "free", "journey", "person", "fun"]),
    ("/code", ["code", "coding", "coding projects", "programming", "cinenode", "cine node", "aerotone",
               "aero tone", "arduino", "neural reconstruction", "handwritten curves", "handwriting",
               "machine learning", "ascii avatar", "ascii", "avatar", "my superface", "ukuraoke", "ukulele",
               "karaoke", "backtiming"]),
    ("/hackharvard", ["hackharvard", "hack harvard", "hackharvard 2026", "hack to the moon", "hackathon",
                      "harvard hackathon", "hhuh", "director of design"]),
    ("/involvement", ["involvement", "campus involvement", "campus", "marketing", "office for the arts", "ofa",
                      "harvard office for the arts", "content creator", "harvard project for international relations",
                      "internal relations", "extracurriculars", "organizations"]),
    ("/merch", ["merch", "merchandise", "hpair", "hconf", "aconf", "hudc", "the game", "harvard yale", "tote", "tote bag", "crest", "notebook",
                "stickers", "sticker", "pin", "t shirt", "shirt"]),
    ("/olympics", ["olympics", "cnn olympics", "olympic", "hoi thao", "cnn hoi thao", "team logos"]),
    ("/recit", ["recit", "recit film studio", "film studio", "hanoi"]),
    ("/highlander", ["highlander", "cnn english club", "english club", "cec", "cec oscar", "oscar", "short film",
                     "film", "matcha"]),
    ("https://www.facebook.com/official.ivmun", ["ivmun", "model un", "model united nations", "mun",
                                                 "vietnam model united nations", "conference"]),
    ("/afvs", ["afvs", "afvs 97", "coding and interactivity", "interactivity", "interactive", "pig",
               "a pigs death", "a pigs funeral", "pigs death", "pigs funeral", "sculpture", "projection", "360"]),
    ("/gifafvs", ["gifafvs", "what brings you here", "gif", "gifs", "p5", "p5js", "sketch",
                  "mind others business", "processing"]),
    ("/essays", ["essays", "essay", "video essays", "video essay", "video"]),
    ("/fysemr", ["fysemr", "fysemr 65r", "tea garden", "land of rivers", "the land of rivers", "rivers",
                 "clip studio", "indesign"]),
    ("/superface", ["superface", "super face", "self portrait", "self portraits", "portrait", "portraits",
                    "makeup", "persona"]),
    ("/illustration", ["illustration", "illustrations", "drawing", "drawings", "cartoon", "cartoons", "art"]),
    ("/portal", ["portal", "the portal", "poems", "poem", "poetry", "short stories", "stories", "writing"]),
    ("/street", ["street", "street photography", "photography", "photos", "photo", "nikon", "camera"]),
    ("/t4sg", ["t4sg", "2ft", "2feet", "2 ft", "2 feet", "2ft prosthetics", "prosthetics", "t4sg x 2ft",
               "tech 4 social good", "tech for social good", "inventory"]),
    ("/commonspirit", ["commonspirit", "common spirit", "commonspirit health", "t4sg x commonspirit", "chna",
                       "health", "dashboard"]),
    ("/cs1710", ["cs171", "cs1710", "cs 171", "unicode", "chi x rain", "rain", "typos", "the typos",
                 "data visualization", "data vis", "dataviz", "visualization"]),
]


def _norm(text):
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    text = text.replace("×", " x ").replace("'", "")
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


_ALIASES = [(_norm(alias), url) for url, aliases in SEARCH_INDEX for alias in aliases]


def find_page(query):
    """Best page for a finder query, or None. Tried in order, most to least certain."""
    q = _norm(query)
    if not q:
        return None
    compact = q.replace(" ", "")

    # 1. Exact name, also ignoring spaces ("hack harvard" == "hackharvard")
    for alias, url in _ALIASES:
        if q == alias or compact == alias.replace(" ", ""):
            return url

    # 2. A known name inside a longer query ("show me street photography") — longest name wins
    hits = [(len(alias), url) for alias, url in _ALIASES
            if len(alias) >= 3 and re.search(rf"\b{re.escape(alias)}\b", q)]
    if hits:
        return max(hits)[1]

    # 3. Still typing: the query is the start of a name ("illus", "commonsp")
    if len(q) >= 3:
        hits = [(len(alias), url) for alias, url in _ALIASES
                if alias.startswith(q) or alias.replace(" ", "").startswith(compact)]
        if hits:
            return min(hits)[1]

    # 4. Typos: closest whole name, then closest single word
    names = {alias: url for alias, url in _ALIASES}
    close = difflib.get_close_matches(q, names, n=1, cutoff=0.78)
    if close:
        return names[close[0]]
    words = {}
    for alias, url in _ALIASES:
        for word in alias.split():
            if len(word) >= 4:
                words.setdefault(word, url)
    for token in sorted(q.split(), key=len, reverse=True):
        if len(token) >= 4:
            close = difflib.get_close_matches(token, words, n=1, cutoff=0.8)
            if close:
                return words[close[0]]
    return None


# Every project page is password-gated.
# The repo is public, so no password, hash or link lives in it. They come from the environment:
# locally from .env (gitignored, read below), on Koyeb from its environment variables.
#   PROJECTS_PASSWORD_HASH       the full password: projects and the CV tab
#   PROJECTS_ONLY_PASSWORD_HASH  the projects-only password
#   RECRUITER_LINK               pirenily.com/<this> opens the full level with no password
# Make a hash with:
#   python3 -c "from werkzeug.security import generate_password_hash as g; print(g('the password', method='pbkdf2:sha256:260000'))"
# The cookie keeps what the visitor typed (or the link) and is re-checked on every visit, so it
# can't be forged from the (public) secret_key, and changing a value retires old visits.
def _load_env_file(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")):
    try:
        with open(path) as f:
            lines = f.read().splitlines()
    except FileNotFoundError:
        return
    for line in lines:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            name, value = line.split("=", 1)
            os.environ.setdefault(name.strip(), value.strip())


_load_env_file()
PROJECTS_PASSWORD_HASH = os.environ.get("PROJECTS_PASSWORD_HASH", "")
PROJECTS_ONLY_PASSWORD_HASH = os.environ.get("PROJECTS_ONLY_PASSWORD_HASH", "")
RECRUITER_LINK = os.environ.get("RECRUITER_LINK", "")
PROJECTS_COOKIE = "projects_key"
GATED_PROJECTS = {"hackharvard", "merch", "involvement", "olympics", "recit", "highlander", "t4sg",
                  "commonspirit", "cs171"}

# Paste the Google Drive share link of the CV here (Share → anyone with the link → Viewer).
# Empty shows a "coming soon" note in the CV tab instead of the embed.
CV_DRIVE_URL = "https://drive.google.com/file/d/1BkICDklLMM8e01PxCu9phby2AGNnapS_/view?usp=sharing"


def access_level(key=None):
    """'cv' for the full password, 'projects' for the projects-only one, else None."""
    key = request.cookies.get(PROJECTS_COOKIE, "") if key is None else key
    if not key:
        return None
    if (RECRUITER_LINK and hmac.compare_digest(key, RECRUITER_LINK)) or \
            (PROJECTS_PASSWORD_HASH and check_password_hash(PROJECTS_PASSWORD_HASH, key)):
        return "cv"
    if PROJECTS_ONLY_PASSWORD_HASH and check_password_hash(PROJECTS_ONLY_PASSWORD_HASH, key):
        return "projects"
    return None


def projects_unlocked():
    return access_level() is not None


@app.context_processor
def inject_projects_unlocked():
    level = access_level()
    cv = None
    if level == "cv":
        cv = {"url": CV_DRIVE_URL or None, "page": cv_file_id() is not None}
    return dict(projects_unlocked=level is not None, cv=cv)


def cv_file_id():
    match = re.search(r"/d/([\w-]+)", CV_DRIVE_URL)
    return match.group(1) if match else None


# The CV tab draws the PDF itself (design_list.html) instead of embedding Drive's viewer, which brings
# its own gray backdrop and toolbar. The file is kept here for an hour so a new upload shows up soon.
_cv_pdf = {"data": None, "at": 0}

@app.route("/cv.pdf")
def cv_pdf():
    if access_level() != "cv":
        abort(404)
    file_id = cv_file_id() or abort(404)
    if not _cv_pdf["data"] or time.time() - _cv_pdf["at"] > 3600:
        url = f"https://drive.usercontent.google.com/download?id={file_id}&export=download&confirm=t"
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                _cv_pdf.update(data=r.read(), at=time.time())
        except (urllib.error.URLError, TimeoutError):
            if not _cv_pdf["data"]:
                abort(502)
    return Response(_cv_pdf["data"], mimetype="application/pdf", headers={"Cache-Control": "private, max-age=3600"})


@app.before_request
def gate_projects():
    if request.endpoint in GATED_PROJECTS and not projects_unlocked():
        return render_template("projects_gate.html", next=request.path), 401


@app.route("/unlock", methods=["POST"])
def unlock():
    target = request.form.get("next", "")
    if not target.startswith("/") or target.startswith("//"):
        target = "/#portfolio"
    key = request.form.get("password", "")
    if access_level(key) is None:
        if target.startswith("/#"):
            return render_template("index.html", wrong=True), 401
        return render_template("projects_gate.html", next=target, wrong=True), 401
    response = redirect(target)
    response.set_cookie(PROJECTS_COOKIE, key, max_age=60 * 60 * 24 * 30,
                        httponly=True, secure=request.is_secure, samesite="Lax")
    return response


def recruiter_link():
    response = redirect("/#portfolio")
    response.set_cookie(PROJECTS_COOKIE, RECRUITER_LINK, max_age=60 * 60 * 24 * 30,
                        httponly=True, secure=request.is_secure, samesite="Lax")
    return response


# Only when it's set: an empty link would take over the home page
if RECRUITER_LINK:
    app.add_url_rule("/" + RECRUITER_LINK, "recruiter_link", recruiter_link)


@app.route("/", methods=["GET", "POST"])
def home():
    if request.method == "GET":
        return render_template("index.html")

    url = find_page(request.form.get("finder", ""))
    if url is None:
        # Nothing matched: keep the old surprise and open a random page
        url = random.choice([u for u, _ in SEARCH_INDEX if u.startswith("/") and u != "/#portfolio"])
    return redirect(url)


@app.route("/t4sg")
def t4sg():
    return render_template(PROJECT_TEMPLATES["t4sg"])


@app.route("/commonspirit")
def commonspirit():
    return render_template(PROJECT_TEMPLATES["commonspirit"])


# ---- your existing routes ----
@app.route("/about")
def about():
    return render_template("about.html")

# Old addresses still work: /design, /collab and /client -> home Projects, /personal -> /play
@app.route("/design")
@app.route("/collab")
@app.route("/client")
def collab():
    return redirect("/#portfolio", code=301)

@app.route("/personal")
def personal():
    return redirect(url_for("play"), code=301)

@app.route("/code")
def code():
    return render_template("code.html")

@app.route("/play")
def play():
    return render_template("personal.html")

@app.route("/illustration")
def illustration():
    return render_gallery("illustration")

@app.route("/portal")
def portal():
    return render_gallery("portal")

@app.route("/street")
def street():
    return render_gallery("street")

@app.route("/superface")
def superface():
    return render_gallery("superface")

@app.route("/afvs")
def afvs():
    return render_template("personal websites/afvs.html")

@app.route("/gifafvs")
def gifafvs():
    return render_template("personal websites/gifafvs.html")

# Clips that live in Google Drive. Drive refuses <video> requests from other
# sites, so they're streamed through here (Range passed along so seeking works).
DRIVE_VIDEOS = {
    "out": "13U7IrbJN1qK0IKDt2Yx1TfBlLNDJU5xp",
}

@app.route("/drive-video/<name>.mp4")
def drive_video(name):
    file_id = DRIVE_VIDEOS.get(name) or abort(404)
    url = f"https://drive.usercontent.google.com/download?id={file_id}&export=download&confirm=t"
    headers = {"Range": request.headers["Range"]} if "Range" in request.headers else {}
    try:
        upstream = urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=20)
    except urllib.error.HTTPError as e:
        abort(e.code if e.code == 416 else 502)

    def chunks():
        with upstream:
            while chunk := upstream.read(256 * 1024):
                yield chunk

    passed = {k: upstream.headers[k] for k in ("Content-Length", "Content-Range") if upstream.headers.get(k)}
    passed.update({"Accept-Ranges": "bytes", "Cache-Control": "public, max-age=86400"})
    return Response(chunks(), status=upstream.status, mimetype="video/mp4", headers=passed)

@app.route("/fysemr")
def fysemr():
    return render_template("personal websites/fysemr.html")

@app.route("/essays")
def essays():
    return render_template("personal websites/essays.html")

@app.route("/highlander")
def highlander():
    return render_template("collab websites/highlander.html")

@app.route("/recit")
def recit():
    return render_template("collab websites/recit.html")

@app.route("/olympics")
def olympics():
    return render_gallery("olympics")

@app.route("/hackharvard")
def hackharvard():
    return render_template("collab websites/hackharvard.html")

@app.route("/merch")
def merch():
    return render_template("collab websites/merch.html")

@app.route("/involvement")
def involvement():
    return render_template("involvement.html")

@app.route("/cs1710")
def cs171():
    return render_template(PROJECT_TEMPLATES["cs171"])

if __name__ == "__main__":
    app.run(debug=True)
