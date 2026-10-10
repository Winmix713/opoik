#!/usr/bin/env python3
"""Build public/archive-manifest.json from the verified GitHub archive tree.

The generated manifest pins every source blob to one immutable commit and includes
Git blob hashes/sizes so the browser worker can verify downloads before analysis.
"""
from __future__ import annotations
import json
import re
import urllib.request
from pathlib import Path

REPO = "Winmix713/tertpea"
PREFIX = "08_eredeti/szezonok/"
API = f"https://api.github.com/repos/{REPO}"
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "archive-manifest.json"


def get_json(url: str):
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "WinmixArchiveManifest/1.0"})
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.loads(response.read())


def main():
    commit_info = get_json(f"{API}/commits/main")
    commit = commit_info["sha"]
    tree_sha = commit_info["commit"]["tree"]["sha"]
    tree = get_json(f"{API}/git/trees/{tree_sha}?recursive=1")
    if tree.get("truncated"):
        raise RuntimeError("GitHub recursive tree was truncated; refusing a partial manifest")
    files = [x for x in tree.get("tree", []) if x.get("type") == "blob" and x.get("path", "").startswith(PREFIX) and x["path"].endswith(".json")]
    if len(files) != 103:
        raise RuntimeError(f"Expected 103 original season JSON files, found {len(files)}")
    audit_path = ROOT / "archive-audit-evidence.json"
    if not audit_path.exists():
        raise RuntimeError("Run the full archive audit first; no verified evidence file found")
    evidence = json.loads(audit_path.read_text(encoding="utf-8"))
    if evidence["source_commit"] != commit:
        raise RuntimeError(f"Repo main advanced since audit ({commit}); rerun the audit before building the manifest")
    audit_by_path = {x["path"]: x for x in evidence["season_audits"]}
    result = []
    for item in sorted(files, key=lambda x: (audit_by_path[x["path"]]["league"], audit_by_path[x["path"]]["season_index"])):
        a = audit_by_path[item["path"]]
        result.append({
            "path": item["path"],
            "url": f"https://raw.githubusercontent.com/{REPO}/{commit}/{item['path']}",
            "sha": item["sha"],
            "size": item["size"],
            "league": a["league"],
            "seasonIndex": a["season_index"],
            "seasonName": a["season_name"],
        })
    manifest = {
        "source": f"https://github.com/{REPO}",
        "commitSha": commit,
        "treeSha": tree_sha,
        "exportedAt": evidence.get("source_exported_at"),
        "schemaVersion": evidence.get("schema_version"),
        "seasonCount": len(result),
        "expectedByteCount": sum(x["size"] for x in result),
        "files": result,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT}: {len(result)} seasons, {manifest['expectedByteCount']:,} bytes, commit {commit}")


if __name__ == "__main__":
    main()
