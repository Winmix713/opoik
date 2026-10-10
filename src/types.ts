export type League = "angol" | "spanyol";
export type LeagueFilter = League | "mindkettő";
export type Outcome = "H" | "D" | "A";

export interface ArchiveSeasonFile {
  path: string;
  url: string;
  sha: string;
  size: number;
  league: League;
  seasonIndex: number;
  seasonName: string;
}

export interface ArchiveManifest {
  source: string;
  commitSha: string;
  treeSha: string;
  exportedAt: string;
  schemaVersion: number;
  seasonCount: number;
  expectedByteCount: number;
  files: ArchiveSeasonFile[];
}

export interface MatchRecord {
  league: League;
  seasonIndex: number;
  seasonName: string;
  seasonKey: string;
  matchPosition: number;
  roundNo: number;
  matchInRound: number;
  virtualTime: string | null;
  homeTeam: string;
  awayTeam: string;
  htHome: number | null;
  htAway: number | null;
  ftHome: number | null;
  ftAway: number | null;
  ftOutcome: Outcome | null;
  htOutcome: Outcome | null;
}

export interface Frequency {
  key: string;
  count: number;
  rate: number;
}

export interface SeasonBreakdown {
  seasonIndex: number;
  seasonName: string;
  matches: number;
  htValid: number;
  htMissing: number;
}

export interface PairSummary {
  league: League;
  homeTeam: string;
  awayTeam: string;
  matches: number;
  htValid: number;
  htMissing: number;
  ftScores: Frequency[];
  htftOutcomes: Frequency[];
  htftScores: Frequency[];
  seasons: SeasonBreakdown[];
}

export interface PositionSummary {
  league: League;
  matchPosition: number;
  roundNo: number;
  matchInRound: number;
  observations: number;
  ftOutcomes: Frequency[];
  htftOutcomes: Frequency[];
  topPairs: Frequency[];
}

export interface SeasonQuality {
  league: League;
  seasonIndex: number;
  seasonName: string;
  filePath: string;
  fileBytes: number;
  fileHashValid: boolean;
  matches: number;
  teams: number;
  orderedPairs: number;
  ftValid: number;
  htValid: number;
  htMissing: number;
  duplicatePositions: number;
  missingPositions: number;
  pairSetMatches: boolean;
  roundBlocksValid: boolean;
  issueCount: number;
  issues: string[];
}

export interface LeagueSummary {
  league: League;
  seasonCount: number;
  matches: number;
  htValid: number;
  htMissing: number;
  pairCount: number;
  eachSeasonHas240: boolean;
  eachSeasonHas16Teams: boolean;
  eachSeasonHas240Pairs: boolean;
  identicalPairSets: boolean;
  roundBlocksValid: boolean;
}

export interface AuditReport {
  completedAt: string;
  source: string;
  commitSha: string;
  treeSha: string;
  exportedAt: string;
  sourceFileCount: number;
  sourceBytes: number;
  matchCount: number;
  ftValid: number;
  htValid: number;
  htMissing: number;
  checksumFailures: number;
  issueCount: number;
  roundBlocksValid: boolean;
  pairSetsIdentical: boolean;
  leagues: Record<League, LeagueSummary>;
  pairs: PairSummary[];
  positions: PositionSummary[];
  seasons: SeasonQuality[];
  matches: MatchRecord[];
}

export interface AuditProgress {
  phase: string;
  percent: number;
  completedFiles: number;
  totalFiles: number;
  completedMatches: number;
  totalMatches: number;
  loadedBytes: number;
  totalBytes: number;
  message: string;
}

export type WorkerMessage =
  | { type: "start" }
  | { type: "cancel" };

export type WorkerEvent =
  | { type: "progress"; progress: AuditProgress }
  | { type: "complete"; report: AuditReport }
  | { type: "error"; message: string; filePath?: string; retryable: boolean }
  | { type: "cancelled" };
