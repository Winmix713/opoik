#!/usr/bin/env python3
"""Read-only audit of Winmix original season JSON files from GitHub main.

Downloads each file at the exact commit SHA, verifies Git blob SHA and tree size,
then validates match structure and computes ordered-pair / HT-FT frequencies.
Writes an evidence JSON locally; it does not modify the source repository or Supabase.
"""
from __future__ import annotations
import concurrent.futures
import hashlib
import json
import sys
import time
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

REPO = "Winmix713/tertpea"
PREFIX = "08_eredeti/szezonok/"
API = f"https://api.github.com/repos/{REPO}"
OUT = Path(__file__).resolve().parents[1] / "archive-audit-evidence.json"
WORKERS = 4


def get_json(url: str):
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "WinmixReadOnlyArchiveAudit/1.0"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read())


def fetch_blob(commit: str, item: dict) -> tuple[dict, dict]:
    path = item["path"]
    url = f"https://raw.githubusercontent.com/{REPO}/{commit}/{path}"
    req = urllib.request.Request(url, headers={"User-Agent": "WinmixReadOnlyArchiveAudit/1.0"})
    last_error = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                raw = r.read()
            git_sha = hashlib.sha1(f"blob {len(raw)}\0".encode() + raw).hexdigest()
            if len(raw) != item.get("size"):
                raise ValueError(f"size mismatch {len(raw)} != {item.get('size')}")
            if git_sha != item.get("sha"):
                raise ValueError(f"Git blob hash mismatch {git_sha} != {item.get('sha')}")
            obj = json.loads(raw)
            return item, obj
        except Exception as e:
            last_error = e
            if attempt == 2:
                raise
            time.sleep(attempt + 1)
    raise last_error


def is_int(v):
    return isinstance(v, int) and not isinstance(v, bool) and v >= 0


def outcome(home, away):
    return "H" if home > away else "A" if home < away else "D"


def analyze_season(item: dict, obj: dict) -> dict:
    rel = item["path"]
    league = obj.get("league")
    seasons = obj.get("seasonIndex")
    season_id = obj.get("id")
    matches = obj.get("matches")
    if not isinstance(matches, list):
        raise ValueError(f"matches is not a list: {rel}")
    pair_count = Counter()
    pair_ft = defaultdict(Counter)
    pair_htft = defaultdict(Counter)
    pair_exact = defaultdict(Counter)
    position_pairs = defaultdict(Counter)
    date_blocks = defaultdict(list)
    teams = set()
    errors = []
    positions = []
    ht_valid = ht_missing = ft_valid = 0
    for idx, m in enumerate(matches, 1):
        if not isinstance(m, dict):
            errors.append(f"row {idx}: not an object")
            continue
        pos = m.get("match_no")
        if not is_int(pos):
            pos = idx
            errors.append(f"row {idx}: invalid/missing match_no")
        positions.append(pos)
        home = m.get("home_team")
        away = m.get("away_team")
        if not isinstance(home, str) or not home.strip() or not isinstance(away, str) or not away.strip():
            errors.append(f"row {idx}: missing team name")
            continue
        teams.update((home, away))
        pair = (home.strip(), away.strip())
        pair_count[pair] += 1
        position_pairs[pos][pair] += 1
        date = m.get("date")
        date_blocks[str(date)].append(pos)
        hh, ha = m.get("ht_home_score"), m.get("ht_away_score")
        fh, fa = m.get("home_score"), m.get("away_score")
        if is_int(fh) and is_int(fa):
            ft_valid += 1
            pair_ft[pair][f"{outcome(fh, fa)}:{fh}-{fa}"] += 1
        else:
            errors.append(f"row {idx}: invalid FT score")
        if hh is None and ha is None:
            ht_missing += 1
        elif is_int(hh) and is_int(ha):
            ht_valid += 1
            if is_int(fh) and is_int(fa):
                pair_htft[pair][f"{outcome(hh,ha)}>{outcome(fh,fa)}"] += 1
                pair_exact[pair][f"{hh}-{ha}>{fh}-{fa}"] += 1
        else:
            errors.append(f"row {idx}: partial or invalid HT score")
    dups = sorted([p for p,n in Counter(positions).items() if n > 1])
    missing_positions = sorted(set(range(1, 241)) - set(positions))
    extra_positions = sorted(set(positions) - set(range(1, 241)))
    # Round membership follows the user's agreed rule: each successive block of 8 rows.
    round_time_consistent = True
    round_groups = defaultdict(set)
    for m in matches:
        p = m.get("match_no")
        if is_int(p) and 1 <= p <= 240:
            round_groups[(p - 1)//8 + 1].add(str(m.get("date")))
    inconsistent_rounds = sorted(r for r, ts in round_groups.items() if len(ts) != 1)
    if inconsistent_rounds:
        round_time_consistent = False
    # Date value may be repeated in 8-match groups; explicitly report overall 30x8 grouping.
    date_group_lengths = Counter(len(v) for v in date_blocks.values())
    return {
        "path": rel, "file_sha": item["sha"], "file_size": item["size"],
        "league": league, "season_index": seasons, "season_id": season_id,
        "season_name": obj.get("name"), "actual_match_count": obj.get("actualMatchCount"),
        "record_count": len(matches), "ft_valid": ft_valid, "ht_valid": ht_valid, "ht_missing": ht_missing,
        "team_count": len(teams), "teams": sorted(teams),
        "unique_ordered_pairs": len(pair_count), "pair_keys": [[h,a] for h,a in sorted(pair_count)],
        "pair_count": {f"{h}\u241f{a}": n for (h,a),n in pair_count.items()},
        "pair_ft": {f"{h}\u241f{a}": dict(c) for (h,a),c in pair_ft.items()},
        "pair_htft": {f"{h}\u241f{a}": dict(c) for (h,a),c in pair_htft.items()},
        "pair_exact_htft": {f"{h}\u241f{a}": dict(c) for (h,a),c in pair_exact.items()},
        "position_pair_counts": {str(p): {f"{h}\u241f{a}":n for (h,a),n in c.items()} for p,c in position_pairs.items()},
        "positions_unique": len(set(positions)), "position_duplicates": dups,
        "missing_positions": missing_positions, "extra_positions": extra_positions,
        "date_group_lengths": dict(date_group_lengths), "round_time_consistent_by_8": round_time_consistent,
        "inconsistent_rounds": inconsistent_rounds, "round_groups_count": len(round_groups),
        "errors": errors[:50], "error_count": len(errors)
    }


def merge_seasons(seasons):
    overall = {}
    for league in sorted({s["league"] for s in seasons}):
        group = [s for s in seasons if s["league"] == league]
        pair_count = Counter()
        pair_ft = defaultdict(Counter)
        pair_htft = defaultdict(Counter)
        pair_exact = defaultdict(Counter)
        pos_pairs = defaultdict(Counter)
        for s in group:
            for key, n in s["pair_count"].items(): pair_count[key] += n
            for key, d in s["pair_ft"].items(): pair_ft[key].update(d)
            for key, d in s["pair_htft"].items(): pair_htft[key].update(d)
            for key, d in s["pair_exact_htft"].items(): pair_exact[key].update(d)
            for p, d in s["position_pair_counts"].items(): pos_pairs[int(p)].update(d)
        baseline = set(group[0]["pair_count"].keys()) if group else set()
        pair_set_mismatch = []
        for s in group[1:]:
            current=set(s["pair_count"])
            if current != baseline:
                pair_set_mismatch.append({"season":s["season_index"],"missing_vs_first":sorted(baseline-current),"extra_vs_first":sorted(current-baseline)})
        overall[league] = {
            "season_count": len(group), "match_count": sum(s["record_count"] for s in group),
            "ft_valid": sum(s["ft_valid"] for s in group), "ht_valid": sum(s["ht_valid"] for s in group),
            "ht_missing": sum(s["ht_missing"] for s in group),
            "all_seasons_240": all(s["record_count"] == 240 for s in group),
            "all_positions_1_240": all(not s["position_duplicates"] and not s["missing_positions"] and not s["extra_positions"] for s in group),
            "all_have_16_teams": all(s["team_count"] == 16 for s in group),
            "all_have_240_ordered_pairs": all(s["unique_ordered_pairs"] == 240 for s in group),
            "same_pair_set_as_first_season": not pair_set_mismatch,
            "pair_set_mismatch": pair_set_mismatch,
            "all_rounds_have_uniform_date_per_block_of_8": all(s["round_time_consistent_by_8"] for s in group),
            "round_inconsistencies": [{"season":s["season_index"],"rounds":s["inconsistent_rounds"]} for s in group if s["inconsistent_rounds"]],
            "ordered_pairs": [{
                "home_team": key.split("\u241f",1)[0],"away_team": key.split("\u241f",1)[1],
                "match_count": count,
                "ft_score_distribution": dict(pair_ft[key]),
                "htft_1x2_distribution": dict(pair_htft[key]),
                "exact_htft_distribution": dict(pair_exact[key]),
                "top_exact_htft": sorted(pair_exact[key].items(),key=lambda x:(-x[1],x[0]))[:10],
            } for key,count in sorted(pair_count.items())],
            "match_position": [{"match_position":p,"round_no":(p-1)//8+1,"match_in_round":(p-1)%8+1,
                "observations":sum(c.values()),"ordered_pair_counts":dict(c)} for p,c in sorted(pos_pairs.items())]
        }
    return overall


def main():
    commit_obj = get_json(f"{API}/commits/main")
    commit = commit_obj["sha"]
    tree_sha = commit_obj["commit"]["tree"]["sha"]
    tree = get_json(f"{API}/git/trees/{tree_sha}?recursive=1")
    if tree.get("truncated"):
        raise RuntimeError("GitHub recursive tree is truncated; refusing an incomplete audit")
    files = sorted((x for x in tree.get("tree",[]) if x.get("type")=="blob" and x.get("path","").startswith(PREFIX) and x["path"].endswith(".json")),key=lambda x:x["path"])
    if not files:
        raise RuntimeError("No original season JSON files found")
    total_bytes = sum(x["size"] for x in files)
    print(f"source_commit={commit} seasons={len(files)} bytes={total_bytes}",flush=True)
    results=[]
    failures=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures={ex.submit(fetch_blob,commit,item):item for item in files}
        done=0
        for fut in concurrent.futures.as_completed(futures):
            item=futures[fut]
            try:
                meta,obj=fut.result()
                results.append(analyze_season(meta,obj))
            except Exception as e:
                failures.append({"path":item["path"],"error":f"{type(e).__name__}: {e}"})
            done+=1
            print(f"progress={done}/{len(files)} errors={len(failures)} last={item['path']}",flush=True)
    results.sort(key=lambda s:(s["league"] or "",s["season_index"] or 0,s["path"]))
    report={"repository":REPO,"source_commit":commit,"tree_sha":tree_sha,"source_exported_at":"2026-09-15T11:48:56.033Z","schema_version":3,"source_file_count":len(files),"source_file_bytes":total_bytes,"failure_count":len(failures),"failures":failures,"season_audits":results,"league_audits":merge_seasons(results)}
    OUT.write_text(json.dumps(report,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print(f"report={OUT} bytes={OUT.stat().st_size}",flush=True)
    for league,a in report["league_audits"].items():
        print(league, json.dumps({k:v for k,v in a.items() if k!='ordered_pairs' and k!='match_position'},ensure_ascii=False),flush=True)
    if failures:
        sys.exit(2)

if __name__=="__main__":
    main()
