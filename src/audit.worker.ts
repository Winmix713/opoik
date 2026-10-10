import type {
  ArchiveManifest,
  ArchiveSeasonFile,
  AuditReport,
  Frequency,
  League,
  LeagueSummary,
  MatchRecord,
  Outcome,
  PairSummary,
  PositionSummary,
  SeasonBreakdown,
  SeasonQuality,
  WorkerEvent,
  WorkerMessage,
} from "./types";

interface WorkerScope {
  postMessage: (event: WorkerEvent) => void;
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null;
}

const scope = self as unknown as WorkerScope;
const encoder = new TextEncoder();
let cancelled = false;
let activeControllers: AbortController[] = [];

interface RawMatch {
  match_no?: unknown;
  date?: unknown;
  home_team?: unknown;
  away_team?: unknown;
  ht_home_score?: unknown;
  ht_away_score?: unknown;
  home_score?: unknown;
  away_score?: unknown;
}

interface RawSeason {
  id?: unknown;
  league?: unknown;
  seasonIndex?: unknown;
  name?: unknown;
  actualMatchCount?: unknown;
  matches?: unknown;
}

interface MutablePair {
  league: League;
  homeTeam: string;
  awayTeam: string;
  matches: number;
  htValid: number;
  htMissing: number;
  ftScores: Map<string, number>;
  htftOutcomes: Map<string, number>;
  htftScores: Map<string, number>;
  seasons: Map<number, SeasonBreakdown>;
}

interface MutablePosition {
  league: League;
  matchPosition: number;
  roundNo: number;
  matchInRound: number;
  observations: number;
  ftOutcomes: Map<string, number>;
  htftOutcomes: Map<string, number>;
  topPairs: Map<string, number>;
}

const isIntegerScore = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const toOutcome = (home: number, away: number): Outcome =>
  home > away ? "H" : home < away ? "A" : "D";

const increment = (map: Map<string, number>, key: string, amount = 1) => {
  map.set(key, (map.get(key) ?? 0) + amount);
};

const pairId = (league: League, home: string, away: string) =>
  `${league}\u241f${home}\u241f${away}`;

const mapToFrequencies = (map: Map<string, number>, denominator: number): Frequency[] =>
  [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "hu"))
    .map(([key, count]) => ({ key, count, rate: denominator ? count / denominator : 0 }));

const gitBlobSha1 = async (bytes: Uint8Array): Promise<string> => {
  const header = encoder.encode(`blob ${bytes.byteLength}\0`);
  const payload = new Uint8Array(header.byteLength + bytes.byteLength);
  payload.set(header, 0);
  payload.set(bytes, header.byteLength);
  const digest = await crypto.subtle.digest("SHA-1", payload);
  return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join("");
};

const emit = (event: WorkerEvent) => scope.postMessage(event);

let manifest: ArchiveManifest | null = null;
let seasonBytesLoaded: number[] = [];
let completedFiles = 0;
let completedMatches = 0;
let lastProgressSentAt = 0;

const reportProgress = (phase: string, message: string, force = false) => {
  if (!manifest) return;
  const now = performance.now();
  if (!force && now - lastProgressSentAt < 90) return;
  lastProgressSentAt = now;
  const loadedBytes = Math.min(
    manifest.expectedByteCount,
    seasonBytesLoaded.reduce((sum, value) => sum + value, 0),
  );
  const transferProgress = manifest.expectedByteCount
    ? loadedBytes / manifest.expectedByteCount
    : 0;
  const percent = phase === "download"
    ? 5 + transferProgress * 70
    : phase === "validation"
      ? 76 + (completedFiles / manifest.files.length) * 14
      : phase === "aggregation"
        ? 91 + Math.min(1, completedFiles / manifest.files.length) * 8
        : 3;
  emit({
    type: "progress",
    progress: {
      phase,
      percent: Math.min(99, Math.max(0, percent)),
      completedFiles,
      totalFiles: manifest.files.length,
      completedMatches,
      totalMatches: manifest.files.length * 240,
      loadedBytes,
      totalBytes: manifest.expectedByteCount,
      message,
    },
  });
};

const downloadSeason = async (
  file: ArchiveSeasonFile,
  index: number,
  onChunk: (index: number, bytes: number) => void,
): Promise<Uint8Array> => {
  const controller = new AbortController();
  activeControllers.push(controller);
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (cancelled) throw new DOMException("Audit cancelled", "AbortError");
    try {
      const response = await fetch(file.url, {
        mode: "cors",
        cache: "force-cache",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
      if (!response.body) throw new Error("A böngésző nem adott olvasható adatfolyamot.");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        if (part.value) {
          chunks.push(part.value);
          length += part.value.byteLength;
          onChunk(index, length);
        }
      }
      if (length !== file.size) {
        throw new Error(`Méreteltérés: ${length} bájt érkezett, ${file.size} bájt volt a manifesztben.`);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const actualSha = await gitBlobSha1(bytes);
      if (actualSha !== file.sha) {
        throw new Error(`Git-blob SHA-1 eltérés: ${actualSha}`);
      }
      return bytes;
    } catch (error) {
      lastError = error;
      if (cancelled || (error instanceof DOMException && error.name === "AbortError")) throw error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

const newPair = (league: League, homeTeam: string, awayTeam: string): MutablePair => ({
  league,
  homeTeam,
  awayTeam,
  matches: 0,
  htValid: 0,
  htMissing: 0,
  ftScores: new Map(),
  htftOutcomes: new Map(),
  htftScores: new Map(),
  seasons: new Map(),
});

const newPosition = (league: League, matchPosition: number): MutablePosition => ({
  league,
  matchPosition,
  roundNo: Math.floor((matchPosition - 1) / 8) + 1,
  matchInRound: ((matchPosition - 1) % 8) + 1,
  observations: 0,
  ftOutcomes: new Map(),
  htftOutcomes: new Map(),
  topPairs: new Map(),
});

const analyzeOneSeason = (
  file: ArchiveSeasonFile,
  season: RawSeason,
  bytes: number,
  actualHash: string,
  pairMap: Map<string, MutablePair>,
  positionMap: Map<string, MutablePosition>,
  matchesOut: MatchRecord[],
): { quality: SeasonQuality; pairSet: Set<string>; htValid: number; htMissing: number; ftValid: number; matchCount: number } => {
  const issues: string[] = [];
  const rawMatches = Array.isArray(season.matches) ? season.matches as RawMatch[] : [];
  const teams = new Set<string>();
  const positions = new Set<number>();
  const pairSet = new Set<string>();
  const roundTimes = new Map<number, Set<string>>();
  let ftValid = 0;
  let htValid = 0;
  let htMissing = 0;
  let duplicatePositions = 0;
  let invalidFt = 0;
  let invalidHt = 0;

  if (season.league !== file.league) issues.push(`A ligamező (${String(season.league)}) eltér a manifesztben szereplő ligától.`);
  if (season.seasonIndex !== file.seasonIndex) issues.push(`A szezonindex (${String(season.seasonIndex)}) eltér a manifeszttől.`);
  if (rawMatches.length !== 240) issues.push(`A várt 240 helyett ${rawMatches.length} mérkőzéssor található.`);
  if (season.actualMatchCount !== 240) issues.push(`Az actualMatchCount értéke ${String(season.actualMatchCount)}, nem 240.`);

  for (const raw of rawMatches) {
    const pos = raw.match_no;
    const position = typeof pos === "number" && Number.isInteger(pos) ? pos : -1;
    if (position < 1 || position > 240) {
      issues.push(`Érvénytelen mérkőzéspozíció: ${String(raw.match_no)}.`);
    } else if (positions.has(position)) {
      duplicatePositions += 1;
      issues.push(`Duplikált mérkőzéspozíció: ${position}.`);
    } else {
      positions.add(position);
    }

    const home = typeof raw.home_team === "string" ? raw.home_team.trim() : "";
    const away = typeof raw.away_team === "string" ? raw.away_team.trim() : "";
    if (!home || !away) {
      issues.push(`Hiányzó hazai vagy vendégcsapat a ${position > 0 ? position : "ismeretlen"}. pozíción.`);
      continue;
    }
    teams.add(home);
    teams.add(away);
    const id = pairId(file.league, home, away);
    pairSet.add(id);

    const roundNo = position > 0 ? Math.floor((position - 1) / 8) + 1 : 0;
    if (roundNo > 0) {
      const times = roundTimes.get(roundNo) ?? new Set<string>();
      times.add(typeof raw.date === "string" ? raw.date : "");
      roundTimes.set(roundNo, times);
    }
    const htHome = isIntegerScore(raw.ht_home_score) ? raw.ht_home_score : null;
    const htAway = isIntegerScore(raw.ht_away_score) ? raw.ht_away_score : null;
    const ftHome = isIntegerScore(raw.home_score) ? raw.home_score : null;
    const ftAway = isIntegerScore(raw.away_score) ? raw.away_score : null;
    const ftOutcome = ftHome !== null && ftAway !== null ? toOutcome(ftHome, ftAway) : null;
    const htOutcome = htHome !== null && htAway !== null ? toOutcome(htHome, htAway) : null;
    const record: MatchRecord = {
      league: file.league,
      seasonIndex: file.seasonIndex,
      seasonName: file.seasonName,
      seasonKey: typeof season.id === "string" ? season.id : file.path,
      matchPosition: position,
      roundNo,
      matchInRound: position > 0 ? ((position - 1) % 8) + 1 : 0,
      virtualTime: typeof raw.date === "string" ? raw.date : null,
      homeTeam: home,
      awayTeam: away,
      htHome,
      htAway,
      ftHome,
      ftAway,
      ftOutcome,
      htOutcome,
    };
    matchesOut.push(record);

    const pair = pairMap.get(id) ?? newPair(file.league, home, away);
    pair.matches += 1;
    const seasonPart = pair.seasons.get(file.seasonIndex) ?? {
      seasonIndex: file.seasonIndex,
      seasonName: file.seasonName,
      matches: 0,
      htValid: 0,
      htMissing: 0,
    };
    seasonPart.matches += 1;
    const positionKey = `${file.league}\u241f${position}`;
    const positionPart = positionMap.get(positionKey) ?? newPosition(file.league, position);
    positionPart.observations += 1;
    increment(positionPart.topPairs, `${home} · ${away}`);

    if (ftOutcome !== null && ftHome !== null && ftAway !== null) {
      ftValid += 1;
      increment(pair.ftScores, `${ftHome}-${ftAway}`);
      increment(positionPart.ftOutcomes, ftOutcome);
    } else {
      invalidFt += 1;
    }

    if (htHome === null && htAway === null) {
      htMissing += 1;
      pair.htMissing += 1;
      seasonPart.htMissing += 1;
    } else if (htHome !== null && htAway !== null && ftOutcome !== null) {
      htValid += 1;
      pair.htValid += 1;
      seasonPart.htValid += 1;
      const transition = `${htOutcome}>${ftOutcome}`;
      increment(pair.htftOutcomes, transition);
      increment(pair.htftScores, `${htHome}-${htAway}>${ftHome}-${ftAway}`);
      increment(positionPart.htftOutcomes, transition);
    } else {
      invalidHt += 1;
    }

    pair.seasons.set(file.seasonIndex, seasonPart);
    pairMap.set(id, pair);
    positionMap.set(positionKey, positionPart);
  }

  const missingPositions = Math.max(0, 240 - positions.size);
  if (missingPositions) issues.push(`${missingPositions} mérkőzéspozíció hiányzik az 1–240 tartományból.`);
  if (teams.size !== 16) issues.push(`A várt 16 helyett ${teams.size} egyedi csapatnév szerepel.`);
  if (pairSet.size !== 240) issues.push(`A várt 240 helyett ${pairSet.size} egyedi rendezett hazai–vendég párosítás található.`);
  if (invalidFt) issues.push(`${invalidFt} mérkőzésnél hiányos vagy érvénytelen a teljes idejű eredmény.`);
  if (invalidHt) issues.push(`${invalidHt} mérkőzésnél csak részleges vagy érvénytelen a félidei eredmény.`);
  if (roundTimes.size !== 30) issues.push(`A forrássorrendből csak ${roundTimes.size}/30 fordulócsoport állítható össze.`);
  for (let round = 1; round <= 30; round += 1) {
    const times = roundTimes.get(round);
    if (!times || times.size !== 1 || times.has("")) {
      issues.push(`A ${round}. forduló 8-as blokkja nem egyetlen, nem üres virtuális időértéket tartalmaz.`);
    }
  }

  return {
    quality: {
      league: file.league,
      seasonIndex: file.seasonIndex,
      seasonName: file.seasonName,
      filePath: file.path,
      fileBytes: bytes,
      fileHashValid: actualHash === file.sha,
      matches: rawMatches.length,
      teams: teams.size,
      orderedPairs: pairSet.size,
      ftValid,
      htValid,
      htMissing,
      duplicatePositions,
      missingPositions,
      pairSetMatches: true,
      roundBlocksValid: roundTimes.size === 30 && Array.from({ length: 30 }, (_, i) => roundTimes.get(i + 1)).every((times) => !!times && times.size === 1 && !times.has("")),
      issueCount: issues.length,
      issues,
    },
    pairSet,
    htValid,
    htMissing,
    ftValid,
    matchCount: rawMatches.length,
  };
};

const runAudit = async () => {
  cancelled = false;
  activeControllers = [];
  completedFiles = 0;
  completedMatches = 0;
  lastProgressSentAt = 0;
  seasonBytesLoaded = [];

  reportProgress("manifest", "A rögzített archívummanifeszt betöltése…", true);
  const manifestResponse = await fetch("/archive-manifest.json", { cache: "no-cache" });
  if (!manifestResponse.ok) throw new Error(`Az archívummanifeszt nem érhető el (HTTP ${manifestResponse.status}).`);
  manifest = await manifestResponse.json() as ArchiveManifest;
  if (!manifest.files?.length || manifest.files.length !== manifest.seasonCount) {
    throw new Error("A manifeszt hibás vagy hiányos: a fájllista és szezonösszeg nem egyezik.");
  }
  seasonBytesLoaded = Array.from({ length: manifest.files.length }, () => 0);
  const pairMap = new Map<string, MutablePair>();
  const positionMap = new Map<string, MutablePosition>();
  const matchesOut: MatchRecord[] = [];
  const seasonQuality: SeasonQuality[] = [];
  const baselinePairSets = new Map<League, Set<string>>();
  let allHtValid = 0;
  let allHtMissing = 0;
  let allFtValid = 0;
  let checksumFailures = 0;
  let nextIndex = 0;
  const errorState: { current: { message: string; filePath?: string } | null } = { current: null };

  emit({
    type: "progress",
    progress: {
      phase: "download",
      percent: 5,
      completedFiles: 0,
      totalFiles: manifest.files.length,
      completedMatches: 0,
      totalMatches: manifest.files.length * 240,
      loadedBytes: 0,
      totalBytes: manifest.expectedByteCount,
      message: `Az archívumhoz ${manifest.files.length} szezonfájl rögzítve. SHA-ellenőrzés indul.`,
    },
  });

  const processNext = async () => {
    while (!cancelled && !errorState.current) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= manifest!.files.length) return;
      const file = manifest!.files[index];
      try {
        const bytes = await downloadSeason(file, index, (slot, size) => {
          seasonBytesLoaded[slot] = size;
          reportProgress("download", `Letöltés és feldolgozás: ${file.league} · ${file.seasonName}`);
        });
        seasonBytesLoaded[index] = file.size;
        const actualHash = await gitBlobSha1(bytes);
        if (actualHash !== file.sha) checksumFailures += 1;
        const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as RawSeason;
        const audit = analyzeOneSeason(file, parsed, bytes.byteLength, actualHash, pairMap, positionMap, matchesOut);
        const baseline = baselinePairSets.get(file.league);
        if (!baseline) baselinePairSets.set(file.league, new Set(audit.pairSet));
        else if (baseline.size !== audit.pairSet.size || [...baseline].some((key) => !audit.pairSet.has(key))) {
          audit.quality.pairSetMatches = false;
          audit.quality.issues.push("A rendezett hazai–vendég párosításkészlet eltér a liga első szezonjától.");
          audit.quality.issueCount += 1;
        }
        seasonQuality.push(audit.quality);
        allHtValid += audit.htValid;
        allHtMissing += audit.htMissing;
        allFtValid += audit.ftValid;
        completedMatches += audit.matchCount;
        completedFiles += 1;
        reportProgress("download", `Feldolgozva: ${file.league} · ${file.seasonName}`, true);
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        errorState.current = {
          message: error instanceof Error ? error.message : String(error),
          filePath: file.path,
        };
        activeControllers.forEach((controller) => controller.abort());
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(4, manifest.files.length) }, () => processNext()));
  if (cancelled) {
    emit({ type: "cancelled" });
    return;
  }
  const failure = errorState.current;
  if (failure) {
    emit({
      type: "error",
      message: failure.message,
      filePath: failure.filePath,
      retryable: true,
    });
    return;
  }

  reportProgress("validation", "Szezon-, csapat-, pozíció-, párosítás- és fordulóblokkok ellenőrzése…", true);
  seasonQuality.sort((a, b) => a.league.localeCompare(b.league, "hu") || a.seasonIndex - b.seasonIndex);
  matchesOut.sort((a, b) => a.league.localeCompare(b.league, "hu") || a.seasonIndex - b.seasonIndex || a.matchPosition - b.matchPosition);
  const leagues = {} as Record<League, LeagueSummary>;
  const leagueNames: League[] = ["angol", "spanyol"];
  let pairSetsIdentical = true;
  for (const league of leagueNames) {
    const seasons = seasonQuality.filter((item) => item.league === league);
    const pairs = [...pairMap.values()].filter((item) => item.league === league);
    const mismatches = seasons.some((item) => !item.pairSetMatches);
    if (mismatches) pairSetsIdentical = false;
    leagues[league] = {
      league,
      seasonCount: seasons.length,
      matches: seasons.reduce((sum, item) => sum + item.matches, 0),
      htValid: seasons.reduce((sum, item) => sum + item.htValid, 0),
      htMissing: seasons.reduce((sum, item) => sum + item.htMissing, 0),
      pairCount: pairs.length,
      eachSeasonHas240: seasons.every((item) => item.matches === 240),
      eachSeasonHas16Teams: seasons.every((item) => item.teams === 16),
      eachSeasonHas240Pairs: seasons.every((item) => item.orderedPairs === 240),
      identicalPairSets: !mismatches,
      roundBlocksValid: seasons.every((item) => item.roundBlocksValid),
    };
  }

  reportProgress("aggregation", "A rendezett párok, eredményeloszlások és fordulópozíciók rangsorolása…", true);
  const pairs: PairSummary[] = [...pairMap.values()]
    .sort((a, b) => a.league.localeCompare(b.league, "hu") || a.homeTeam.localeCompare(b.homeTeam, "hu") || a.awayTeam.localeCompare(b.awayTeam, "hu"))
    .map((pair) => ({
      league: pair.league,
      homeTeam: pair.homeTeam,
      awayTeam: pair.awayTeam,
      matches: pair.matches,
      htValid: pair.htValid,
      htMissing: pair.htMissing,
      ftScores: mapToFrequencies(pair.ftScores, pair.matches),
      htftOutcomes: mapToFrequencies(pair.htftOutcomes, pair.htValid),
      htftScores: mapToFrequencies(pair.htftScores, pair.htValid),
      seasons: [...pair.seasons.values()].sort((a, b) => a.seasonIndex - b.seasonIndex),
    }));
  const positions: PositionSummary[] = [];
  for (const league of leagueNames) {
    for (let position = 1; position <= 240; position += 1) {
      const item = positionMap.get(`${league}\u241f${position}`) ?? newPosition(league, position);
      positions.push({
        league,
        matchPosition: position,
        roundNo: item.roundNo,
        matchInRound: item.matchInRound,
        observations: item.observations,
        ftOutcomes: mapToFrequencies(item.ftOutcomes, item.observations),
        htftOutcomes: mapToFrequencies(item.htftOutcomes, item.htftOutcomes.size ? [...item.htftOutcomes.values()].reduce((a, b) => a + b, 0) : 0),
        topPairs: mapToFrequencies(item.topPairs, item.observations).slice(0, 3),
      });
    }
  }
  const issueCount = seasonQuality.reduce((sum, item) => sum + item.issueCount, 0) + checksumFailures;
  const report: AuditReport = {
    completedAt: new Date().toISOString(),
    source: manifest.source,
    commitSha: manifest.commitSha,
    treeSha: manifest.treeSha,
    exportedAt: manifest.exportedAt,
    sourceFileCount: manifest.files.length,
    sourceBytes: manifest.expectedByteCount,
    matchCount: completedMatches,
    ftValid: allFtValid,
    htValid: allHtValid,
    htMissing: allHtMissing,
    checksumFailures,
    issueCount,
    roundBlocksValid: seasonQuality.every((item) => item.roundBlocksValid),
    pairSetsIdentical,
    leagues,
    pairs,
    positions,
    seasons: seasonQuality,
    matches: matchesOut,
  };
  emit({
    type: "progress",
    progress: {
      phase: "complete",
      percent: 100,
      completedFiles,
      totalFiles: manifest.files.length,
      completedMatches,
      totalMatches: manifest.files.length * 240,
      loadedBytes: manifest.expectedByteCount,
      totalBytes: manifest.expectedByteCount,
      message: "Az ellenőrzés és az összesítés befejeződött.",
    },
  });
  emit({ type: "complete", report });
};

scope.onmessage = (event) => {
  if (event.data.type === "cancel") {
    cancelled = true;
    activeControllers.forEach((controller) => controller.abort());
    return;
  }
  if (event.data.type === "start") {
    void runAudit().catch((error: unknown) => {
      if (cancelled) {
        emit({ type: "cancelled" });
        return;
      }
      emit({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
        retryable: true,
      });
    });
  }
};
