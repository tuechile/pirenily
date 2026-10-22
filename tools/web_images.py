"""Make web-sized copies of the big photos (macOS, uses sips).

Pages show static/asset/images/_web/<path> instead of the original when a copy exists and the
manifest still matches the original's size (app.py, img()); the gallery lightbox keeps the original.
Run it again after adding or replacing a big photo:  python3 tools/web_images.py
"""
import json
import os
import subprocess

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "static", "asset", "images")
WEB = os.path.join(ROOT, "_web")
LONG_EDGE = 2000
MIN_BYTES = 700 * 1024
EXTENSIONS = {".jpg", ".jpeg", ".png"}


def dimensions(path):
    out = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", path],
                         capture_output=True, text=True).stdout
    values = [int(line.split()[-1]) for line in out.splitlines() if "pixel" in line]
    return max(values) if values else 0


def main():
    manifest = {}
    for folder, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if not d.startswith("_")]
        for name in sorted(files):
            src = os.path.join(folder, name)
            rel = os.path.relpath(src, ROOT)
            if os.path.splitext(name)[1].lower() not in EXTENSIONS or os.path.getsize(src) < MIN_BYTES:
                continue
            if dimensions(src) <= LONG_EDGE:
                continue
            dst = os.path.join(WEB, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            args = ["sips", "-Z", str(LONG_EDGE), src, "--out", dst]
            if name.lower().endswith((".jpg", ".jpeg")):
                args[1:1] = ["-s", "formatOptions", "82"]
            subprocess.run(args, capture_output=True, check=True)
            # Not worth a second file unless it's clearly lighter
            if os.path.getsize(dst) > 0.75 * os.path.getsize(src):
                os.remove(dst)
                continue
            manifest[rel] = os.path.getsize(src)
            print(f"{rel}: {os.path.getsize(src) // 1024}KB -> {os.path.getsize(dst) // 1024}KB")
    with open(os.path.join(WEB, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1, sort_keys=True)


if __name__ == "__main__":
    main()
