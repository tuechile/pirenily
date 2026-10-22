"""Count my commits per day for the Pirenily essay's activity grid.

Koyeb deploys without the git history, so the counts are saved to static/asset/data/commits.json
and the /pirenily page reads that. Run it again before pushing to bring the grid up to date:
python3 tools/commit_grid.py
"""
import collections
import json
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "static", "asset", "data", "commits.json")

days = subprocess.run(["git", "log", "--author=Chi", "--format=%ad", "--date=short"],
                      cwd=HERE, capture_output=True, text=True, check=True).stdout.split()
counts = collections.Counter(days)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(dict(sorted(counts.items())), f, indent=0)
print(f"{sum(counts.values())} commits on {len(counts)} days -> {os.path.relpath(OUT)}")
