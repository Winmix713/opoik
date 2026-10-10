import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Clock3,
  Database,
  Download,
  ExternalLink,
  FileDown,
  Github,
  ListChecks,
  LoaderCircle,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Trophy,
  X,
} from "lucide-react";
import type {
  ArchiveManifest,
  AuditProgress,
  AuditReport,
  League,
  LeagueFilter,
  Frequency,
  WorkerEvent,
} from "./types";
import { checkSupabaseReadOnly, type SupabaseLiveStatus } from "./supabase";
import { analyzePairMatches, type GoalLineSummary } from "./pair-analysis";

type View = "overview" | "pairs" | "positions" | "quality";

const leagueLabel: Record<League, string> = { angol: "Angol virtuális liga", spanyol: "Spanyol virtuális liga" };
const leagueShort: Record<League, string> = { angol: "Angol", spanyol: "Spanyol" };
const transitionLabel: Record<string, string> = {
  "H>H": "Hazai → hazai",
  "H>D": "Hazai → döntetlen",
  "H>A": "Hazai → vendég",
  "D>H": "Döntetlen → hazai",
  "D>D": "Döntetlen → döntetlen",
  "D>A": "Döntetlen → vendég",
  "A>H": "Vendég → hazai",
  "A>D": "Vendég → döntetlen",
  "A>A": "Vendég → vendég",
};

const formatNumber = (value: number) => new Intl.NumberFormat("hu-HU").format(value);
const formatRate = (value: number) => `${(value * 100).toLocaleString("hu-HU", { maximumFractionDigits: 1 })}%`;
const formatBytes = (value: number) => `${(value / 1_000_000).toLocaleString("hu-HU", { maximumFractionDigits: 1 })} MB`;
const outcomeName = (key: string) => transitionLabel[key] ?? key;
const resultName = (key: string) => ({ H: "Hazai győzelem", D: "Döntetlen", A: "Vendég győzelem" }[key] ?? key);
const secondHalfResultName = (key: string) => ({ H: "Hazai több 2. félidős gól", D: "Azonos 2. félidős gólszám", A: "Vendég több 2. félidős gól" }[key] ?? key);
const goalBucketName = (key: string) => `${key} gól`;
const formatAverage = (value: number | null) => value === null ? "—" : value.toLocaleString("hu-HU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const scoreTransition = (value: string) => value.replace(">", "  →  ").replaceAll("-", "–");

function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `"${(text ?? "").replaceAll('"', '""')}"`;
}

function exportPairsCSV(report: AuditReport) {
  const header = [
    "archive_commit", "league", "home_team", "away_team", "meetings_n", "valid_ft_n", "valid_ht_n", "missing_ht_n", "valid_second_half_n", "averages_json",
    "ft_result_distribution_json", "ht_result_distribution_json", "second_half_result_distribution_json", "btts_ft_json", "btts_ht_json", "btts_second_half_json",
    "btts_over_under_25_json", "clean_sheets_json", "ft_goal_lines_json", "ht_goal_lines_json", "second_half_goal_lines_json",
    "ft_total_goals_json", "ht_total_goals_json", "second_half_total_goals_json", "home_goals_json", "away_goals_json",
    "ft_exact_scores_json", "ht_exact_scores_json", "htft_outcomes_json", "htft_exact_scores_json",
    "top3_ft_scores_json", "top3_ht_scores_json", "top3_htft_outcomes_json", "top3_htft_exact_scores_json", "season_occurrences_json",
  ];
  const matchesByPair = new Map<string, AuditReport["matches"]>();
  for (const match of report.matches) {
    const key = JSON.stringify([match.league, match.homeTeam, match.awayTeam]);
    const matches = matchesByPair.get(key) ?? [];
    matches.push(match);
    matchesByPair.set(key, matches);
  }
  const serialize = (items: Frequency[]) => items.map((item) => ({ key: item.key, count: item.count, rate: item.rate }));
  const rows = report.pairs.map((pair) => {
    const key = JSON.stringify([pair.league, pair.homeTeam, pair.awayTeam]);
    const analysis = analyzePairMatches(matchesByPair.get(key) ?? []);
    return [
      report.commitSha,
      pair.league,
      pair.homeTeam,
      pair.awayTeam,
      pair.matches,
      analysis.validFt,
      analysis.validHt,
      pair.matches - analysis.validHt,
      analysis.validSecondHalf,
      analysis.averages,
      serialize(analysis.ftOutcomes),
      serialize(analysis.htOutcomes),
      serialize(analysis.secondHalfOutcomes),
      serialize(analysis.ftBtts),
      serialize(analysis.htBtts),
      serialize(analysis.secondHalfBtts),
      serialize(analysis.bttsOver25),
      serialize(analysis.cleanSheets),
      analysis.ftGoalLines,
      analysis.htGoalLines,
      analysis.secondHalfGoalLines,
      serialize(analysis.ftGoals),
      serialize(analysis.htGoals),
      serialize(analysis.secondHalfGoals),
      serialize(analysis.homeGoals),
      serialize(analysis.awayGoals),
      serialize(analysis.ftScores),
      serialize(analysis.htScores),
      serialize(analysis.htftOutcomes),
      serialize(analysis.htftScores),
      serialize(analysis.ftScores.slice(0, 3)),
      serialize(analysis.htScores.slice(0, 3)),
      serialize(analysis.htftOutcomes.slice(0, 3)),
      serialize(analysis.htftScores.slice(0, 3)),
      pair.seasons.map((item) => ({ seasonIndex: item.seasonIndex, seasonName: item.seasonName, matches: item.matches, htValid: item.htValid, htMissing: item.htMissing })),
    ];
  });
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  downloadFile("winmix-pairing-audit.csv", `\ufeff${csv}`, "text/csv;charset=utf-8");
}

function exportMatchesCSV(report: AuditReport) {
  const header = [
    "archive_commit", "league", "season_index", "season_name", "match_position", "round_no", "match_in_round",
    "virtual_time_hh_mm", "home_team", "away_team", "ht_home", "ht_away", "ft_home", "ft_away", "ht_outcome", "ft_outcome",
  ];
  const rows = report.matches.map((match) => [
    report.commitSha,
    match.league,
    match.seasonIndex,
    match.seasonName,
    match.matchPosition,
    match.roundNo,
    match.matchInRound,
    match.virtualTime ?? "",
    match.homeTeam,
    match.awayTeam,
    match.htHome ?? "",
    match.htAway ?? "",
    match.ftHome ?? "",
    match.ftAway ?? "",
    match.htOutcome ?? "HT hiányzik",
    match.ftOutcome ?? "FT hiányzik",
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  downloadFile("winmix-historical-matches.csv", `\ufeff${csv}`, "text/csv;charset=utf-8");
}

function StatCard({ label, value, note, icon: Icon, accent = false }: {
  label: string;
  value: string;
  note: string;
  icon: typeof Activity;
  accent?: boolean;
}) {
  return (
    <article className={`stat-card${accent ? " stat-card-accent" : ""}`}>
      <div className="stat-card-top"><span>{label}</span><span className="stat-icon"><Icon size={17} /></span></div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function FrequencyBars({ title, items, denominator, formatKey, emptyText, limit = 6 }: {
  title: string;
  items: { key: string; count: number; rate?: number }[];
  denominator: number;
  formatKey: (key: string) => string;
  emptyText: string;
  limit?: number;
}) {
  const shown = items.slice(0, limit);
  const max = Math.max(1, ...shown.map((item) => item.count));
  return (
    <section className="panel frequency-panel">
      <div className="panel-heading">
        <div><span className="eyebrow">MÚLTBELI GYAKORISÁG</span><h3>{title}</h3></div>
        <span className="denominator-chip">n = {formatNumber(denominator)}</span>
      </div>
      {shown.length ? <div className="frequency-list">
        {shown.map((item, index) => (
          <div className="frequency-row" key={item.key}>
            <div className="frequency-label"><span className={`rank rank-${index + 1}`}>{String(index + 1).padStart(2, "0")}</span><span>{formatKey(item.key)}</span></div>
            <div className="frequency-track"><span style={{ width: `${(item.count / max) * 100}%` }} /></div>
            <div className="frequency-value"><strong>{formatNumber(item.count)}</strong><small>{formatRate(item.rate ?? (denominator ? item.count / denominator : 0))}</small></div>
          </div>
        ))}
      </div> : <div className="empty-state compact"><span>{emptyText}</span></div>}
      <p className="panel-footnote">A százalék az érvényes történeti mintán belüli arány, nem jövőbeli esély.</p>
    </section>
  );
}

function GoalLinePanel({ title, rows, denominator }: { title: string; rows: GoalLineSummary[]; denominator: number }) {
  return (
    <section className="panel goal-lines-panel">
      <div className="panel-heading"><div><span className="eyebrow">GÓLVONALAK · MÚLTBELI MINTA</span><h3>{title}</h3></div><span className="denominator-chip">n = {formatNumber(denominator)}</span></div>
      {denominator ? <div className="goal-line-list">
        <div className="goal-line-row goal-line-heading"><span>Vonal</span><span>Over</span><span>Under</span></div>
        {rows.map((row) => <div className="goal-line-row" key={row.line}>
          <span className="goal-line-name">{row.line}</span>
          <span><b>{formatNumber(row.overCount)}</b><small>{formatRate(row.overRate)}</small></span>
          <span><b>{formatNumber(row.underCount)}</b><small>{formatRate(row.underRate)}</small></span>
        </div>)}
      </div> : <div className="empty-state compact"><span>Nincs érvényes eredmény ebben a mintában.</span></div>}
      <p className="panel-footnote">Over = a megadott félgólnál több; Under = legfeljebb a megadott félgól. Az arány nevezője n={formatNumber(denominator)}.</p>
    </section>
  );
}

function SourceCard({ manifest, liveStatus }: { manifest: ArchiveManifest | null; liveStatus: SupabaseLiveStatus | null }) {
  const stateClass = liveStatus?.state === "connected" ? "source-dot source-dot-ok" : liveStatus?.state === "error" ? "source-dot source-dot-error" : "source-dot";
  return (
    <section className="source-grid">
      <article className="source-card source-card-archive">
        <div className="source-card-heading"><span className="source-logo"><Github size={17} /></span><span className="eyebrow">TÖRTÉNETI ARCHÍVUM</span><span className="source-tag source-tag-ready">READ-ONLY</span></div>
        <strong>Winmix713 / tertpea</strong>
        <p>{manifest ? `${formatNumber(manifest.seasonCount)} eredeti szezonfájl · ${formatBytes(manifest.expectedByteCount)} · schema v${manifest.schemaVersion}` : "A forrásmanifeszt betöltése…"}</p>
        <div className="source-meta"><span><span className="source-dot source-dot-ok" />Commithez rögzített adatforrás</span><a href="https://github.com/Winmix713/tertpea" target="_blank" rel="noreferrer">Repo <ExternalLink size={13} /></a></div>
      </article>
      <article className="source-card">
        <div className="source-card-heading"><span className="source-logo source-logo-db"><Database size={17} /></span><span className="eyebrow">SUPABASE · KÜLÖN FORRÁS</span><span className="source-tag">NEM AUDITBEMENET</span></div>
        <strong>{liveStatus?.state === "connected" ? "Klienskapcsolat ellenőrizve" : liveStatus?.state === "error" ? "Kapcsolat hiba" : "Olvasási állapot"}</strong>
        <p>{liveStatus?.message ?? "RLS-szűrt, publishable kulcsos olvasási próba folyamatban…"}</p>
        <div className="source-meta"><span><span className={stateClass} />{liveStatus?.visibleCurrentVersion ? `Publikus verzió: ${liveStatus.visibleCurrentVersion}` : "Publikus current verzió: nem látható"}</span><span>{liveStatus?.checkedAt ? new Date(liveStatus.checkedAt).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" }) : "—"}</span></div>
      </article>
      <div className="source-note"><ShieldCheck size={15} /><span>A legutóbbi külön, csak olvasási adatbázis-ellenőrzés egy <b>v1.0-draft</b> verziót, <b>2 szezont és 480 mérkőzést</b> talált; ez nem current/publikált adathalmaz. A történeti audit kizárólag a rögzített GitHub archívumot használja.</span></div>
    </section>
  );
}

function ProgressPanel({ progress, onCancel, running, runError, onRetry, hasManifest }: {
  progress: AuditProgress | null;
  onCancel: () => void;
  running: boolean;
  runError: { message: string; filePath?: string } | null;
  onRetry: () => void;
  hasManifest: boolean;
}) {
  if (runError) return (
    <div className="run-state run-state-error">
      <div className="run-state-icon"><CircleAlert size={20} /></div>
      <div className="run-state-copy"><strong>Az audit nem fejeződött be</strong><span>{runError.filePath ? `${runError.filePath} · ` : ""}{runError.message}</span><small>Nem készült végleges statisztika. Ellenőrizd a kapcsolatot, majd indítsd újra.</small></div>
      <button className="button button-outline" onClick={onRetry}><RefreshCw size={15} /> Újrapróbálom</button>
    </div>
  );
  if (!running && !progress) return null;
  return (
    <section className={`run-progress${running ? " is-running" : ""}`} aria-live="polite">
      <div className="run-progress-head">
        <div className="run-progress-title"><span className={`progress-orb${running ? " pulse" : ""}`}>{running ? <LoaderCircle size={18} className="spin" /> : <CircleCheck size={18} />}</span><div><strong>{running ? "Teljes történeti audit fut" : "Audit befejezve"}</strong><small>{progress?.message ?? "Feldolgozás…"}</small></div></div>
        <div className="run-progress-actions"><strong className="progress-percent">{Math.floor(progress?.percent ?? 0)}%</strong>{running && <button className="icon-button" aria-label="Megszakítás" title="Audit megszakítása" onClick={onCancel}><Square size={16} /></button>}</div>
      </div>
      <div className="progress-track"><span style={{ width: `${Math.min(100, progress?.percent ?? 0)}%` }} /></div>
      <div className="progress-meta"><span>{progress?.phase === "download" ? "Letöltés · SHA-1 · rekordfeldolgozás" : progress?.phase === "validation" ? "Szerkezeti ellenőrzés" : progress?.phase === "aggregation" ? "Gyakoriságok összesítése" : "Forrásmanifeszt"}</span><span>{formatNumber(progress?.completedFiles ?? 0)} / {formatNumber(progress?.totalFiles ?? 0)} szezon · {formatNumber(progress?.completedMatches ?? 0)} / {formatNumber(progress?.totalMatches ?? 0)} meccs · {formatBytes(progress?.loadedBytes ?? 0)} / {formatBytes(progress?.totalBytes ?? 0)}</span></div>
      {!hasManifest && <small className="progress-warning">A forrásmanifeszt még nem töltődött be.</small>}
    </section>
  );
}

function Overview({ report, league, setLeague, onOpenPairs }: {
  report: AuditReport | null;
  league: LeagueFilter;
  setLeague: (value: LeagueFilter) => void;
  onOpenPairs: () => void;
}) {
  const leagueKeys: League[] = ["angol", "spanyol"];
  const scoped = report
    ? league === "mindkettő" ? [report.leagues.angol, report.leagues.spanyol] : [report.leagues[league]]
    : [];
  const matches = scoped.reduce((sum, item) => sum + item.matches, 0);
  const seasons = scoped.reduce((sum, item) => sum + item.seasonCount, 0);
  const htValid = scoped.reduce((sum, item) => sum + item.htValid, 0);
  const htMissing = scoped.reduce((sum, item) => sum + item.htMissing, 0);
  const pairsCount = scoped.reduce((sum, item) => sum + item.pairCount, 0);
  const validTransitions = report?.pairs
    .filter((pair) => league === "mindkettő" || pair.league === league)
    .reduce((sum, pair) => sum + pair.htValid, 0) ?? 0;
  const outcomes = report?.pairs
    .filter((pair) => league === "mindkettő" || pair.league === league)
    .reduce((all, pair) => {
      for (const item of pair.htftOutcomes) all.set(item.key, (all.get(item.key) ?? 0) + item.count);
      return all;
    }, new Map<string, number>());
  const globalTransitions = outcomes
    ? [...outcomes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key, count]) => ({ key, count, rate: validTransitions ? count / validTransitions : 0 }))
    : [];
  const scoreRows = report?.pairs
    .filter((pair) => league === "mindkettő" || pair.league === league)
    .reduce((all, pair) => {
      for (const item of pair.htftScores) all.set(item.key, (all.get(item.key) ?? 0) + item.count);
      return all;
    }, new Map<string, number>());
  const globalScoreRows = scoreRows
    ? [...scoreRows].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([key, count]) => ({ key, count, rate: htValid ? count / htValid : 0 }))
    : [];
  const noData = !report;

  return (
    <div className="view-stack">
      <div className="section-heading-row">
        <div><span className="eyebrow">ÁTTEKINTÉS</span><h2>Mi van az adatokban?</h2><p>A történeti találkozók leíró összesítése, nem előrejelzés.</p></div>
        <label className="select-wrap compact-select"><SlidersHorizontal size={15} /><select value={league} onChange={(event) => setLeague(event.target.value as LeagueFilter)}><option value="mindkettő">Mindkét liga</option>{leagueKeys.map((key) => <option value={key} key={key}>{leagueLabel[key]}</option>)}</select><ChevronDown size={14} /></label>
      </div>
      <div className="stats-grid">
        <StatCard label="Szezon az archívumban" value={formatNumber(noData ? 103 : seasons)} note={noData ? "A commit-pinned forrás szerint · 62 angol + 41 spanyol" : `${formatNumber(seasons)} a kiválasztott körben`} icon={Activity} accent />
        <StatCard label="Mérkőzésrekord" value={formatNumber(noData ? 24_720 : matches)} note={noData ? "Várt hatókör · 240 meccs / szezon" : "A teljes idejű eredmény ellenőrzött"} icon={ListChecks} />
        <StatCard label="Irányított párosítás" value={formatNumber(noData ? 480 : pairsCount)} note="240 hazai–vendég pár / liga" icon={ArrowDownRight} />
        <StatCard label="HT-adat hiányzik" value={formatNumber(noData ? 5_520 : htMissing)} note={noData ? "Az angol liga hiányzó HT-eredményei" : `${formatNumber(htValid)} érvényes HT-minta`} icon={CircleAlert} />
      </div>
      {report ? <>
        <div className="success-banner"><span className="success-icon"><Check size={16} /></span><span><b>Az audit teljes.</b> {report.checksumFailures === 0 ? "Minden letöltött szezonfájl egyezett a Git blob SHA-1 ellenőrzéssel." : `${report.checksumFailures} ellenőrzőösszeg-hiba.`} Az eredményeloszlás kizárólag a tényleges HT/FT-meccsadatokon alapul.</span><button className="text-button" onClick={onOpenPairs}>Párosítások megnyitása <ArrowRight size={14} /></button></div>
        <div className="two-column">
          <FrequencyBars title="Félidei → végeredmény kimenet" items={globalTransitions} denominator={validTransitions} formatKey={outcomeName} emptyText="Nincs érvényes félidei mintavétel ebben a körben." />
          <FrequencyBars title="Leggyakoribb pontos HT → FT állás" items={globalScoreRows} denominator={htValid} formatKey={scoreTransition} emptyText="Nincs érvényes HT/FT score-pár." />
        </div>
        <div className="analysis-note"><div className="note-mark">i</div><div><b>Helyes értelmezés</b><p>A százalékok a múltban megfigyelt gyakoriságot mutatják. Nem a következő mérkőzés valószínűségei, és nem jelentenek eredményígéretet. A HT-eloszlás nevezője csak a ténylegesen rendelkezésre álló félidei eredmény.</p></div></div>
      </> : <div className="empty-preview-grid">
        <div className="empty-preview"><span className="empty-icon"><BarChart3 size={20} /></span><div><strong>HT → FT minták</strong><p>A tranzíciós és pontos eredménygyakoriságok az audit lefutása után jelennek meg.</p></div></div>
        <div className="empty-preview"><span className="empty-icon"><Trophy size={20} /></span><div><strong>240 rendezett csapatpár / liga</strong><p>A hazai és vendég szerep külön marad. A H2H nem fordul meg.</p></div></div>
      </div>}
    </div>
  );
}

function PairExplorer({ report, league, setLeague }: {
  report: AuditReport;
  league: LeagueFilter;
  setLeague: (value: LeagueFilter) => void;
}) {
  const [homeSelection, setHomeSelection] = useState("");
  const [awaySelection, setAwaySelection] = useState("");
  const [seasonFilter, setSeasonFilter] = useState("mind");
  const [roundFilter, setRoundFilter] = useState("mind");
  const [tableSearch, setTableSearch] = useState("");

  const teamOptions = useMemo(() => {
    const teams = new Map<string, { league: League; name: string }>();
    for (const match of report.matches) {
      if (league !== "mindkettő" && match.league !== league) continue;
      teams.set(JSON.stringify([match.league, match.homeTeam]), { league: match.league, name: match.homeTeam });
      teams.set(JSON.stringify([match.league, match.awayTeam]), { league: match.league, name: match.awayTeam });
    }
    return [...teams.values()].sort((a, b) => a.name.localeCompare(b.name, "hu") || a.league.localeCompare(b.league, "hu"));
  }, [report.matches, league]);
  const teamValue = (team: { league: League; name: string }) => JSON.stringify([team.league, team.name]);
  const selectedHome = teamOptions.find((team) => teamValue(team) === homeSelection) ?? null;
  const awayOptions = selectedHome
    ? teamOptions.filter((team) => team.league === selectedHome.league && team.name !== selectedHome.name)
    : [];
  const selectedAway = awayOptions.find((team) => teamValue(team) === awaySelection) ?? null;
  const selectedPair = selectedHome && selectedAway
    ? report.pairs.find((pair) => pair.league === selectedHome.league && pair.homeTeam === selectedHome.name && pair.awayTeam === selectedAway.name) ?? null
    : null;
  const pairMatches = useMemo(() => selectedPair ? report.matches
    .filter((match) => match.league === selectedPair.league && match.homeTeam === selectedPair.homeTeam && match.awayTeam === selectedPair.awayTeam) : [], [report.matches, selectedPair]);
  const analysis = useMemo(() => analyzePairMatches(pairMatches), [pairMatches]);
  const occurrences = useMemo(() => pairMatches
    .filter((match) => seasonFilter === "mind" || String(match.seasonIndex) === seasonFilter)
    .filter((match) => roundFilter === "mind" || String(match.roundNo) === roundFilter)
    .filter((match) => !tableSearch || `${match.seasonName} ${match.matchPosition}`.toLocaleLowerCase("hu").includes(tableSearch.toLocaleLowerCase("hu")))
    .sort((a, b) => a.seasonIndex - b.seasonIndex || a.matchPosition - b.matchPosition), [pairMatches, seasonFilter, roundFilter, tableSearch]);
  const seasons = selectedPair?.seasons ?? [];

  return (
    <div className="view-stack">
      <div className="section-heading-row"><div><span className="eyebrow">PÁROSÍTÁS-EXPLORER</span><h2>Válaszd ki a hazai és vendég csapatot</h2><p>A két legördülőből kiválasztott, irányított párosítás múltbeli mérkőzéseit mutatjuk.</p></div>
        <label className="select-wrap compact-select"><SlidersHorizontal size={15} /><select aria-label="Liga kiválasztása" value={league} onChange={(event) => { setLeague(event.target.value as LeagueFilter); setHomeSelection(""); setAwaySelection(""); setSeasonFilter("mind"); setRoundFilter("mind"); setTableSearch(""); }}><option value="mindkettő">Mindkét liga</option><option value="angol">Angol</option><option value="spanyol">Spanyol</option></select><ChevronDown size={14} /></label></div>
      <section className="panel pair-selector-panel">
        <div className="panel-heading"><div><span className="eyebrow">CSAPATVÁLASZTÁS</span><h3>Hazai → vendég párosítás</h3></div><span className="denominator-chip">{selectedPair ? `${formatNumber(selectedPair.matches)} történeti meccs` : "Nincs kiválasztva"}</span></div>
        <div className="pair-selector-grid">
          <label className="pair-selector-field"><span className="eyebrow">HAZAI CSAPAT</span><span className="select-wrap pair-team-select"><select aria-label="Hazai csapat" value={homeSelection} onChange={(event) => { setHomeSelection(event.target.value); setAwaySelection(""); setSeasonFilter("mind"); setRoundFilter("mind"); setTableSearch(""); }}><option value="">Válassz hazai csapatot…</option>{teamOptions.map((team) => <option key={teamValue(team)} value={teamValue(team)}>{league === "mindkettő" ? `${leagueShort[team.league]} · ` : ""}{team.name}</option>)}</select><ChevronDown size={14} /></span></label>
          <label className="pair-selector-field"><span className="eyebrow">VENDÉG CSAPAT</span><span className="select-wrap pair-team-select"><select aria-label="Vendég csapat" value={awaySelection} disabled={!selectedHome} onChange={(event) => { setAwaySelection(event.target.value); setSeasonFilter("mind"); setRoundFilter("mind"); setTableSearch(""); }}><option value="">{selectedHome ? "Válassz vendégcsapatot…" : "Előbb válassz hazai csapatot"}</option>{awayOptions.map((team) => <option key={teamValue(team)} value={teamValue(team)}>{team.name}</option>)}</select><ChevronDown size={14} /></span></label>
        </div>
        <div className={`pair-selection-status${selectedPair ? " is-ready" : ""}`} aria-live="polite">{selectedPair ? <><CircleCheck size={15} /> Csak a {selectedPair.homeTeam} → {selectedPair.awayTeam} párosítás eredményei láthatók.</> : <><ArrowRight size={15} /> Először válaszd ki a hazai, majd a vendég csapatot.</>}</div>
      </section>
      {selectedPair ? <div className="pair-detail-column">
            <section className="pair-detail-hero">
              <div className="pair-detail-top"><span className="league-badge">{leagueLabel[selectedPair.league]}</span><span className="sample-badge">MÚLTBELI MINTA · n={selectedPair.matches}</span></div>
              <h3>{selectedPair.homeTeam}<span>vs</span>{selectedPair.awayTeam}</h3>
              <p>A hazai–vendég irány változatlan az összesített szezonok között.</p>
              <div className="pair-detail-stats"><div><span>Találkozó</span><strong>{formatNumber(selectedPair.matches)}</strong></div><div><span>Érvényes HT</span><strong>{formatNumber(selectedPair.htValid)}</strong></div><div><span>Hiányzó HT</span><strong className={selectedPair.htMissing ? "warn-number" : ""}>{formatNumber(selectedPair.htMissing)}</strong></div></div>
            </section>
            <div className="stats-grid pair-stat-grid">
              <StatCard label="Érvényes FT-minta" value={formatNumber(analysis.validFt)} note={`${formatNumber(analysis.validHt)} érvényes HT · ${formatNumber(analysis.validSecondHalf)} érvényes 2. félidő`} icon={ListChecks} />
              <StatCard label="FT összgólátlag" value={formatAverage(analysis.averages.ftTotal)} note={`Hazai ${formatAverage(analysis.averages.ftHome)} · vendég ${formatAverage(analysis.averages.ftAway)}`} icon={Activity} />
              <StatCard label="HT összgólátlag" value={formatAverage(analysis.averages.htTotal)} note={`Hazai ${formatAverage(analysis.averages.htHome)} · vendég ${formatAverage(analysis.averages.htAway)}`} icon={Clock3} />
              <StatCard label="2. félidő összgólátlag" value={formatAverage(analysis.averages.secondHalfTotal)} note={`Hazai ${formatAverage(analysis.averages.secondHalfHome)} · vendég ${formatAverage(analysis.averages.secondHalfAway)}`} icon={BarChart3} />
            </div>

            <section className="pair-analysis-group">
              <div className="pair-analysis-heading"><span className="eyebrow">EREDMÉNYKIMENETEK</span><h4>Győzelmek és döntetlenek</h4></div>
              <div className="pair-analysis-grid">
                <FrequencyBars title="Végeredmény · hazai / döntetlen / vendég" items={analysis.ftOutcomes} denominator={analysis.validFt} formatKey={resultName} emptyText="Nincs érvényes végeredmény." />
                <FrequencyBars title="Félidei állás · hazai / döntetlen / vendég" items={analysis.htOutcomes} denominator={analysis.validHt} formatKey={resultName} emptyText="Nincs érvényes félidei eredmény." />
                <FrequencyBars title="2. félidő gólkülönbsége" items={analysis.secondHalfOutcomes} denominator={analysis.validSecondHalf} formatKey={secondHalfResultName} emptyText="Nincs összehasonlítható HT/FT minta." />
              </div>
            </section>

            <section className="pair-analysis-group">
              <div className="pair-analysis-heading"><span className="eyebrow">BTTS ÉS GÓLVONALAK</span><h4>Piaci típusú történeti bontások</h4></div>
              <div className="pair-analysis-grid">
                <FrequencyBars title="BTTS · teljes mérkőzés" items={analysis.ftBtts} denominator={analysis.validFt} formatKey={(key) => `BTTS ${key.toLocaleLowerCase("hu")}`} emptyText="Nincs érvényes végeredmény." />
                <FrequencyBars title="BTTS · első félidő" items={analysis.htBtts} denominator={analysis.validHt} formatKey={(key) => `HT BTTS ${key.toLocaleLowerCase("hu")}`} emptyText="Nincs érvényes félidei eredmény." />
                <FrequencyBars title="BTTS · második félidő" items={analysis.secondHalfBtts} denominator={analysis.validSecondHalf} formatKey={(key) => `2. félidős BTTS ${key.toLocaleLowerCase("hu")}`} emptyText="Nincs összehasonlítható HT/FT minta." />
                <FrequencyBars title="BTTS × Over/Under 2,5" items={analysis.bttsOver25} denominator={analysis.validFt} formatKey={(key) => key} emptyText="Nincs érvényes végeredmény." />
                <FrequencyBars title="Kapott gól nélküli mérkőzések" items={analysis.cleanSheets} denominator={analysis.validFt} formatKey={(key) => key} emptyText="Nincs érvényes végeredmény." />
                <GoalLinePanel title="Teljes mérkőzés összgóljai" rows={analysis.ftGoalLines} denominator={analysis.validFt} />
                <GoalLinePanel title="Első félidő összgóljai" rows={analysis.htGoalLines} denominator={analysis.validHt} />
                <GoalLinePanel title="Második félidő összgóljai" rows={analysis.secondHalfGoalLines} denominator={analysis.validSecondHalf} />
              </div>
            </section>

            <section className="pair-analysis-group">
              <div className="pair-analysis-heading"><span className="eyebrow">PONTOS EREDMÉNYEK ÉS GÓLELOSZLÁS</span><h4>A leggyakoribb állások és gólmennyiségek</h4></div>
              <div className="pair-analysis-grid">
                <FrequencyBars title="Top 3 végeredmény" items={analysis.ftScores} denominator={analysis.validFt} formatKey={scoreTransition} emptyText="Nincs érvényes végeredmény." limit={3} />
                <FrequencyBars title="Top 3 félidei eredmény" items={analysis.htScores} denominator={analysis.validHt} formatKey={scoreTransition} emptyText="Nincs érvényes félidei eredmény." limit={3} />
                <FrequencyBars title="Teljes mérkőzés · összgól-eloszlás" items={analysis.ftGoals} denominator={analysis.validFt} formatKey={goalBucketName} emptyText="Nincs érvényes végeredmény." />
                <FrequencyBars title="Első félidő · összgól-eloszlás" items={analysis.htGoals} denominator={analysis.validHt} formatKey={goalBucketName} emptyText="Nincs érvényes félidei eredmény." />
                <FrequencyBars title="Második félidő · összgól-eloszlás" items={analysis.secondHalfGoals} denominator={analysis.validSecondHalf} formatKey={goalBucketName} emptyText="Nincs összehasonlítható HT/FT minta." />
                <FrequencyBars title="Hazai csapat · szerzett gólok" items={analysis.homeGoals} denominator={analysis.validFt} formatKey={goalBucketName} emptyText="Nincs érvényes végeredmény." />
                <FrequencyBars title="Vendég csapat · szerzett gólok" items={analysis.awayGoals} denominator={analysis.validFt} formatKey={goalBucketName} emptyText="Nincs érvényes végeredmény." />
              </div>
            </section>

            <section className="pair-analysis-group">
              <div className="pair-analysis-heading"><span className="eyebrow">FÉLIDŐ → VÉGEREDMÉNY</span><h4>Állásváltozások a mérkőzés során</h4></div>
              <div className="pair-analysis-grid">
                <FrequencyBars title="Top 3 HT → FT kimenetváltás" items={analysis.htftOutcomes} denominator={analysis.validHt} formatKey={outcomeName} emptyText="A félidei eredmény hiányzik." limit={3} />
                <FrequencyBars title="Top 3 pontos HT → FT eredménypár" items={analysis.htftScores} denominator={analysis.validHt} formatKey={scoreTransition} emptyText="Ehhez a párhoz nincs értékelhető félidei eredmény." limit={3} />
              </div>
              <div className="analysis-note pair-analysis-note"><span className="note-mark">i</span><div><b>Minták és korlátok</b><p>Minden százalék a panel saját, érvényes mintáján belüli múltbeli arány. A második félidős mutatók csak ott számolódnak, ahol a félidei és végeredmény mindkét csapatnál összehasonlítható. A forrás nem tartalmaz pontos gólszerzési időt, ezért percre vagy gólsorrendre nem következtetünk; ezek leíró statisztikák, nem előrejelzések.</p></div></div>
            </section>
            <section className="panel occurrence-panel">
              <div className="panel-heading"><div><span className="eyebrow">ELŐFORDULÁSOK</span><h3>Szezononkénti meccsek</h3></div><span className="denominator-chip">{formatNumber(occurrences.length)} találat</span></div>
              <div className="filter-row"><label className="select-wrap"><select value={seasonFilter} onChange={(event) => setSeasonFilter(event.target.value)}><option value="mind">Minden szezon</option>{seasons.map((item) => <option key={item.seasonIndex} value={item.seasonIndex}>{item.seasonName}</option>)}</select><ChevronDown size={13} /></label><label className="select-wrap"><select value={roundFilter} onChange={(event) => setRoundFilter(event.target.value)}><option value="mind">Minden forduló</option>{Array.from({ length: 30 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}. forduló</option>)}</select><ChevronDown size={13} /></label><label className="small-search"><Search size={13} /><input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} placeholder="Szezon…" /></label></div>
              <div className="occurrence-table-wrap"><table className="data-table occurrence-table"><thead><tr><th>Szezon</th><th>Forduló</th><th>Virtuális idő</th><th>HT</th><th>FT</th></tr></thead><tbody>
                {occurrences.map((match) => <tr key={`${match.league}-${match.seasonIndex}-${match.matchPosition}`}><td>{match.seasonName}</td><td><span className="round-tag">{match.roundNo} · meccs {match.matchInRound}</span></td><td>{match.virtualTime ?? "—"}</td><td>{match.htHome === null || match.htAway === null ? <span className="missing-cell">hiányzik</span> : `${match.htHome}–${match.htAway}`}</td><td><b>{match.ftHome === null || match.ftAway === null ? "—" : `${match.ftHome}–${match.ftAway}`}</b></td></tr>)}
                {!occurrences.length && <tr><td colSpan={5} className="table-empty">Nincs találat a szűrőkkel.</td></tr>}
              </tbody></table></div>
              <div className="table-footer"><span>A HH:MM mező virtuális időjelzés, nem naptári dátum.</span><span>{formatNumber(selectedPair.seasons.length)} szezon</span></div>
            </section>
      </div> : <div className="empty-state pair-empty-state"><Search size={25} /><strong>{selectedHome ? "Válassz vendég csapatot" : "Válaszd ki a csapatokat"}</strong><span>Az eredményeloszlás és a mérkőzéslista csak a két csapat kiválasztása után jelenik meg.</span></div>}
    </div>
  );
}

function PositionAnalysis({ report, league, setLeague }: { report: AuditReport; league: LeagueFilter; setLeague: (value: LeagueFilter) => void }) {
  const [round, setRound] = useState("mind");
  const [slot, setSlot] = useState("mind");
  const [search, setSearch] = useState("");
  const positions = report.positions
    .filter((item) => league === "mindkettő" || item.league === league)
    .filter((item) => round === "mind" || String(item.roundNo) === round)
    .filter((item) => slot === "mind" || String(item.matchInRound) === slot)
    .filter((item) => !search || String(item.matchPosition).includes(search) || String(item.topPairs.map((pair) => pair.key).join(" ")).toLocaleLowerCase("hu").includes(search.toLocaleLowerCase("hu")))
    .sort((a, b) => a.league.localeCompare(b.league, "hu") || a.matchPosition - b.matchPosition);
  return (
    <div className="view-stack">
      <div className="section-heading-row"><div><span className="eyebrow">FORDULÓ- ÉS POZÍCIÓAUDIT</span><h2>30 forduló × 8 mérkőzéshely</h2><p>A fordulót a forrássorrend nyolcas blokkjából képezzük; a HH:MM-egyezést minden szezonban ellenőriztük.</p></div>
        <label className="select-wrap compact-select"><SlidersHorizontal size={15} /><select value={league} onChange={(event) => setLeague(event.target.value as LeagueFilter)}><option value="mindkettő">Mindkét liga</option><option value="angol">Angol</option><option value="spanyol">Spanyol</option></select><ChevronDown size={14} /></label></div>
      <div className="validation-strip"><span className="validation-check"><CircleCheck size={18} /></span><div><b>{report.roundBlocksValid ? "A fordulószerkezet ellenőrzése megfelelt" : "Fordulószerkezeti figyelmeztetés"}</b><small>{report.roundBlocksValid ? "Mind a 103 szezonban az egymást követő nyolcas pozícióblokkok egy-egy virtuális HH:MM értékhez tartoznak." : "Legalább egy forrásblokk nem felelt meg a 8 mérkőzéses szabálynak."}</small></div><span className="validation-meta">{formatNumber(report.sourceFileCount * 30)} forduló ellenőrizve</span></div>
      <section className="panel position-panel">
        <div className="panel-heading"><div><span className="eyebrow">MÉRKŐZÉSPOSITIONONKÉNTI MINTA</span><h3>{formatNumber(positions.length)} pozíció</h3></div><span className="denominator-chip">n = szezonok száma</span></div>
        <div className="filter-row"><label className="select-wrap"><select value={round} onChange={(event) => setRound(event.target.value)}><option value="mind">Minden forduló</option>{Array.from({ length: 30 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}. forduló</option>)}</select><ChevronDown size={13} /></label><label className="select-wrap"><select value={slot} onChange={(event) => setSlot(event.target.value)}><option value="mind">Minden meccssorszám</option>{Array.from({ length: 8 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}. mérkőzés</option>)}</select><ChevronDown size={13} /></label><label className="small-search"><Search size={13} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pozíció / párosítás…" /></label></div>
        <div className="wide-table-wrap"><table className="data-table position-table"><thead><tr><th>Liga</th><th>Forduló</th><th>Hely</th><th>Meccspozíció</th><th>Mintaszám</th><th>FT H / D / A</th><th>HT→FT leggyakoribb</th><th>Gyakori párosítás</th></tr></thead><tbody>
          {positions.map((item) => <tr key={`${item.league}-${item.matchPosition}`}><td><span className="league-label">{leagueShort[item.league]}</span></td><td>{item.roundNo}. forduló</td><td>{item.matchInRound}/8</td><td><span className="position-number">{String(item.matchPosition).padStart(3, "0")}</span></td><td><b>{formatNumber(item.observations)}</b></td><td><OutcomeSplit items={item.ftOutcomes} /></td><td>{item.htftOutcomes[0] ? <span className="score-pill">{outcomeName(item.htftOutcomes[0].key)} <i>{formatNumber(item.htftOutcomes[0].count)}</i></span> : <span className="missing-cell">HT nincs</span>}</td><td>{item.topPairs[0] ? <span className="top-pair-position">{item.topPairs[0].key}<small>{formatNumber(item.topPairs[0].count)}×</small></span> : "—"}</td></tr>)}
          {!positions.length && <tr><td colSpan={8} className="table-empty">Nincs megjeleníthető mérkőzéspozíció.</td></tr>}
        </tbody></table></div>
        <div className="table-footer"><span>A forduló = ⌊(match_position − 1) / 8⌋ + 1; a 8-as HH:MM-csoportok validáltak.</span><span>{formatNumber(positions.length)} sor</span></div>
      </section>
    </div>
  );
}

function OutcomeSplit({ items }: { items: Frequency[] }) {
  const byKey = new Map(items.map((item) => [item.key, item.count]));
  return <span className="outcome-split"><span>H {formatNumber(byKey.get("H") ?? 0)}</span><span>D {formatNumber(byKey.get("D") ?? 0)}</span><span>A {formatNumber(byKey.get("A") ?? 0)}</span></span>;
}

function DataQuality({ report, league, setLeague }: { report: AuditReport; league: LeagueFilter; setLeague: (value: LeagueFilter) => void }) {
  const seasons = report.seasons.filter((item) => league === "mindkettő" || item.league === league);
  const clean = seasons.filter((item) => item.issueCount === 0 && item.fileHashValid).length;
  const missingHT = seasons.reduce((sum, item) => sum + item.htMissing, 0);
  return (
    <div className="view-stack">
      <div className="section-heading-row"><div><span className="eyebrow">ADATMINŐSÉG</span><h2>Mit ellenőriztünk?</h2><p>Fájlellenőrzőösszeg, csapatok, 240 pozíció, irányított párok, eredmények és fordulóblokkok.</p></div>
        <label className="select-wrap compact-select"><SlidersHorizontal size={15} /><select value={league} onChange={(event) => setLeague(event.target.value as LeagueFilter)}><option value="mindkettő">Mindkét liga</option><option value="angol">Angol</option><option value="spanyol">Spanyol</option></select><ChevronDown size={14} /></label></div>
      <div className="quality-overview">
        <div className="quality-score"><div className="quality-score-icon"><ShieldCheck size={24} /></div><div><span>HIBAMENTES FORRÁSFÁJLOK</span><strong>{formatNumber(clean)} <small>/ {formatNumber(seasons.length)}</small></strong><p>{clean === seasons.length ? "Minden fájl és szerkezeti ellenőrzés megfelelt." : "Ellenőrizd a figyelmeztetéssel jelölt sorokat."}</p></div></div>
        <div className="quality-metric"><span>HT hiányzó</span><b>{formatNumber(missingHT)}</b><small>nem imputált eredmény</small></div>
        <div className="quality-metric"><span>SHA-1 checksum hiba</span><b className={report.checksumFailures ? "warn-number" : ""}>{formatNumber(report.checksumFailures)}</b><small>commit blob szinten</small></div>
        <div className="quality-metric"><span>FT érvényes</span><b>{formatNumber(report.ftValid)}</b><small>/ {formatNumber(report.matchCount)} meccs</small></div>
      </div>
      <section className="panel quality-table-panel">
        <div className="panel-heading"><div><span className="eyebrow">SZEZONONKÉNTI VALIDÁCIÓ</span><h3>{formatNumber(seasons.length)} szezon</h3></div><span className="denominator-chip">Commit {report.commitSha.slice(0, 9)}</span></div>
        <div className="wide-table-wrap"><table className="data-table quality-table"><thead><tr><th>Forrás</th><th>Liga</th><th>Meccs</th><th>Csapat</th><th>Rendezett pár</th><th>FT</th><th>HT érvényes</th><th>HT hiányzó</th><th>Fordulóblokk</th><th>SHA-1</th><th>Ellenőrzés</th></tr></thead><tbody>
          {seasons.map((season) => <tr key={season.filePath}><td><span className="season-name">{season.seasonName}</span><small className="file-path">{season.filePath.split("/").at(-1)}</small></td><td>{leagueShort[season.league]}</td><td>{season.matches}/240</td><td>{season.teams}/16</td><td>{season.orderedPairs}/240</td><td>{season.ftValid}/{season.matches}</td><td>{formatNumber(season.htValid)}</td><td className={season.htMissing ? "warn-number" : ""}>{formatNumber(season.htMissing)}</td><td>{season.roundBlocksValid ? <span className="status-ok"><Check size={13} />OK</span> : <span className="status-warn">Eltérés</span>}</td><td>{season.fileHashValid ? <span className="status-ok"><Check size={13} />OK</span> : <span className="status-warn">Hiba</span>}</td><td>{season.issueCount === 0 ? <span className="status-ok"><Check size={13} />Megfelelt</span> : <span className="status-warn"><CircleAlert size={13} />{season.issueCount} hiba</span>}</td></tr>)}
        </tbody></table></div>
        <div className="table-footer"><span>A HT-hiányok láthatók maradnak; nincs becslés vagy helyettesítés.</span><span>{formatNumber(seasons.length)} szezon ellenőrizve</span></div>
      </section>
      <div className="analysis-note"><div className="note-mark">i</div><div><b>Forrásértelmezés</b><p>A `date` értékek virtuális HH:MM idők; nem kezeltük őket naptári dátumként. Az előrejelzési, piaci és kalibrációs mezők nem részei a történeti eredmény-gyakoriságnak.</p></div></div>
    </div>
  );
}

const navItems: { id: View; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Áttekintés", icon: BarChart3 },
  { id: "pairs", label: "Párosítások", icon: ArrowDownRight },
  { id: "positions", label: "Fordulók", icon: Clock3 },
  { id: "quality", label: "Adatminőség", icon: ShieldCheck },
];

export default function App() {
  const [manifest, setManifest] = useState<ArchiveManifest | null>(null);
  const [manifestError, setManifestError] = useState("");
  const [liveStatus, setLiveStatus] = useState<SupabaseLiveStatus | null>(null);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<AuditProgress | null>(null);
  const [runError, setRunError] = useState<{ message: string; filePath?: string } | null>(null);
  const [runCancelled, setRunCancelled] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [league, setLeague] = useState<LeagueFilter>("mindkettő");
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/archive-manifest.json", { cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<ArchiveManifest>;
      })
      .then((data) => { if (active) setManifest(data); })
      .catch((error: unknown) => { if (active) setManifestError(error instanceof Error ? error.message : String(error)); });
    checkSupabaseReadOnly().then((status) => { if (active) setLiveStatus(status); });
    return () => { active = false; workerRef.current?.terminate(); };
  }, []);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const startAudit = useCallback(() => {
    if (!manifest || running) return;
    workerRef.current?.terminate();
    setRunError(null);
    setRunCancelled(false);
    setProgress({ phase: "manifest", percent: 0, completedFiles: 0, totalFiles: manifest.seasonCount, completedMatches: 0, totalMatches: manifest.seasonCount * 240, loadedBytes: 0, totalBytes: manifest.expectedByteCount, message: "Audit indítása…" });
    setRunning(true);
    const worker = new Worker(new URL("./audit.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerEvent>) => {
      const payload = event.data;
      if (payload.type === "progress") setProgress(payload.progress);
      if (payload.type === "complete") {
        setReport(payload.report);
        setRunning(false);
        setProgress({ phase: "complete", percent: 100, completedFiles: payload.report.sourceFileCount, totalFiles: payload.report.sourceFileCount, completedMatches: payload.report.matchCount, totalMatches: payload.report.matchCount, loadedBytes: payload.report.sourceBytes, totalBytes: payload.report.sourceBytes, message: "Az audit teljes." });
        setView("overview");
        setLeague("mindkettő");
        worker.terminate();
        workerRef.current = null;
      }
      if (payload.type === "error") {
        setRunError({ message: payload.message, filePath: payload.filePath });
        setRunning(false);
        worker.terminate();
        workerRef.current = null;
      }
      if (payload.type === "cancelled") {
        setRunning(false);
        setRunCancelled(true);
        worker.terminate();
        workerRef.current = null;
      }
    };
    worker.onerror = (event) => {
      setRunError({ message: event.message || "A háttérfeldolgozó váratlan hibával leállt." });
      setRunning(false);
      worker.terminate();
      workerRef.current = null;
    };
    worker.postMessage({ type: "start" });
  }, [manifest, running]);

  const cancelAudit = useCallback(() => workerRef.current?.postMessage({ type: "cancel" }), []);
  const selectedPairCount = useMemo(() => report?.pairs.filter((pair) => league === "mindkettő" || pair.league === league).length ?? 0, [report, league]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand-lockup" href="#top" aria-label="Winmix — kezdőlap">
          <span className="brand-mark"><svg viewBox="0 0 36 36" aria-hidden="true"><path d="M5 25.5 11 10h5l2.1 5.4L20.2 10h4.9l5.9 15.5h-5.2l-3.4-9.2-3.3 8.1h-4.2l-3.1-8.1-3.6 9.2H5Z" fill="currentColor"/><circle cx="29.2" cy="7" r="2.2" fill="currentColor"/></svg></span>
          <span><b>WINMIX</b><small>HISTORICAL LAB</small></span>
        </a>
        <div className="sidebar-section-label">ELEMZŐ</div>
        <nav className="side-nav" aria-label="Fő navigáció">
          {navItems.map((item) => <button key={item.id} className={`nav-item${view === item.id ? " active" : ""}`} onClick={() => setView(item.id)}><item.icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{item.id === "pairs" && report && <small>{formatNumber(selectedPairCount)}</small>}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-status"><span className="status-pulse" /><div><b>{running ? "Audit fut" : report ? "Audit kész" : "Készen áll"}</b><small>{running ? `${Math.floor(progress?.percent ?? 0)}% feldolgozva` : "Archívum olvasási mód"}</small></div></div>
          <div className="sidebar-source"><span className="eyebrow">FORRÁSNAPLÓ</span><p>Repository export<br /><b>schema v{manifest?.schemaVersion ?? 3}</b> · {manifest?.exportedAt?.slice(0, 10) ?? "2026-09-15"}</p></div>
          <div className="sidebar-foot">Winmix · read-only audit<br />Történeti adat, nem előrejelzés</div>
        </div>
      </aside>

      <main className="main-content" id="top">
        <header className="topbar"><div className="breadcrumb"><span>WINMIX</span><i>/</i><b>{navItems.find((item) => item.id === view)?.label}</b></div><div className="topbar-right"><span className="readonly-badge"><ShieldCheck size={13} /> CSAK OLVASÁS</span><span className="live-indicator"><span />{running ? "FELDOLGOZÁS" : report ? "AUDIT ELVÉGEZVE" : "ARCHÍVUM KÉSZ"}</span></div></header>

        <div className="content-wrap">
          <section className="hero-row">
            <div className="hero-copy"><div className="hero-kicker"><span className="hero-kicker-line" /> TÖRTÉNETI MÉRKŐZÉSELEMZÉS <span className="hero-kicker-id">WM / 01</span></div><h1>Az eredmény mögötti<br /><em>mintázat.</em></h1><p>Végigellenőrizzük a virtuális liga összes múltbeli mérkőzését, irányított párosítását és félidei–végeredmény mintáját.</p></div>
            <div className="hero-action-card"><div className="hero-action-top"><span className="hero-action-icon"><Activity size={19} /></span><span className="source-tag source-tag-ready">ARCHÍVUM PINNED</span></div><strong>{report ? "Audit újraindítása" : "Teljes audit indítása"}</strong><p>{manifest ? `${formatNumber(manifest.seasonCount)} szezon · ${formatNumber(manifest.seasonCount * 240)} meccs · ${formatBytes(manifest.expectedByteCount)}` : "Forrás ellenőrzése…"}</p>
              <button className="button button-primary" onClick={startAudit} disabled={!manifest || running}>{running ? <><LoaderCircle size={16} className="spin" /> Audit fut…</> : report ? <><RefreshCw size={15} /> Újrafuttatás</> : <><Play size={15} fill="currentColor" /> Audit indítása</>}</button>
              {!manifest && <small className="hero-error">{manifestError ? `Manifeszt hiba: ${manifestError}` : "A forrásmanifeszt betöltése…"}</small>}
            </div>
          </section>

          <ProgressPanel progress={progress} running={running} runError={runError} onCancel={cancelAudit} onRetry={startAudit} hasManifest={!!manifest} />
          {runCancelled && !running && <div className="cancel-note"><CircleAlert size={15} /> Az auditot megszakítottad. Az elkészült félkész adatok nem kerülnek végleges eredményként megjelenítésre. <button onClick={() => setRunCancelled(false)}><X size={13} /></button></div>}

          <SourceCard manifest={manifest} liveStatus={liveStatus} />

          {report && <div className="result-toolbar"><div className="result-state"><span className="result-check"><CircleCheck size={16} /></span><div><b>Audit kész · {new Date(report.completedAt).toLocaleString("hu-HU", { dateStyle: "medium", timeStyle: "short" })}</b><small>Forrás commit: {report.commitSha.slice(0, 12)} · FT {formatNumber(report.ftValid)}/{formatNumber(report.matchCount)} · HT hiányzó {formatNumber(report.htMissing)}</small></div></div><div className="export-actions"><button className="button button-ghost" onClick={() => exportPairsCSV(report)}><FileDown size={15} /> Párok CSV</button><button className="button button-ghost" onClick={() => exportMatchesCSV(report)}><Download size={15} /> Meccsek CSV</button><button className="button button-ghost" onClick={() => downloadFile("winmix-full-audit.json", JSON.stringify(report), "application/json;charset=utf-8")}><Download size={15} /> Audit JSON</button></div></div>}

          <div className="view-tabs" role="tablist" aria-label="Elemzési nézetek">
            {navItems.map((item) => <button key={item.id} role="tab" aria-selected={view === item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><item.icon size={15} />{item.label}{item.id === "pairs" && report && <span>{formatNumber(selectedPairCount)}</span>}</button>)}
          </div>

          {!report ? <Overview report={null} league={league} setLeague={setLeague} onOpenPairs={() => setView("pairs")} /> : view === "overview" ? <Overview report={report} league={league} setLeague={setLeague} onOpenPairs={() => setView("pairs")} /> : view === "pairs" ? <PairExplorer report={report} league={league} setLeague={setLeague} /> : view === "positions" ? <PositionAnalysis report={report} league={league} setLeague={setLeague} /> : <DataQuality report={report} league={league} setLeague={setLeague} />}

          {!report && <div className="preflight-footer"><div><span className="preflight-icon"><Database size={16} /></span><span><b>Forrásbiztonság</b><small>Nyilvános, commithez rögzített GitHub-adat · nincs adatbázis-írás.</small></span></div><span>{manifest ? `${formatNumber(manifest.files.length)} fájl · ${formatBytes(manifest.expectedByteCount)}` : "Manifeszt ellenőrzése…"}</span></div>}
          {report && <footer className="page-footer"><span>WINMIX HISTORICAL LAB</span><span>Snapshot {report.commitSha.slice(0, 12)} · {formatNumber(report.sourceFileCount)} szezonfájl</span><span>Leíró történeti statisztika</span></footer>}
        </div>
      </main>
    </div>
  );
}
