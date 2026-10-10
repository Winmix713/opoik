import type { Frequency, MatchRecord } from "./types";

export interface GoalLineSummary {
  line: string;
  overCount: number;
  overRate: number;
  underCount: number;
  underRate: number;
}

export interface PairAnalysis {
  validFt: number;
  validHt: number;
  validSecondHalf: number;
  averages: {
    ftTotal: number | null;
    ftHome: number | null;
    ftAway: number | null;
    htTotal: number | null;
    htHome: number | null;
    htAway: number | null;
    secondHalfTotal: number | null;
    secondHalfHome: number | null;
    secondHalfAway: number | null;
  };
  ftOutcomes: Frequency[];
  htOutcomes: Frequency[];
  secondHalfOutcomes: Frequency[];
  halfWithMoreGoals: Frequency[];
  ftBtts: Frequency[];
  htBtts: Frequency[];
  secondHalfBtts: Frequency[];
  bttsOver25: Frequency[];
  cleanSheets: Frequency[];
  ftGoals: Frequency[];
  htGoals: Frequency[];
  secondHalfGoals: Frequency[];
  homeGoals: Frequency[];
  awayGoals: Frequency[];
  ftScores: Frequency[];
  htScores: Frequency[];
  htftOutcomes: Frequency[];
  htftScores: Frequency[];
  ftGoalLines: GoalLineSummary[];
  htGoalLines: GoalLineSummary[];
  secondHalfGoalLines: GoalLineSummary[];
}

type Counts = Map<string, number>;

const add = (counts: Counts, key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
const outcome = (home: number, away: number) => home > away ? "H" : home < away ? "A" : "D";
const bucket = (value: number, maxExact: number) => value > maxExact ? `${maxExact + 1}+` : String(value);

function frequencies(counts: Counts, denominator: number, order?: string[]): Frequency[] {
  if (!denominator) return [];
  const orderIndex = order ? new Map(order.map((key, index) => [key, index])) : null;
  return [...counts.entries()]
    .filter(([, count]) => count > 0)
    .sort(([keyA, countA], [keyB, countB]) => orderIndex
      ? (orderIndex.get(keyA) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(keyB) ?? Number.MAX_SAFE_INTEGER)
      : countB - countA || keyA.localeCompare(keyB, "hu"))
    .map(([key, count]) => ({ key, count, rate: count / denominator }));
}

function goalLines(totals: number[]): GoalLineSummary[] {
  return [0.5, 1.5, 2.5, 3.5, 4.5].map((threshold) => {
    const overCount = totals.filter((total) => total > threshold).length;
    const underCount = totals.length - overCount;
    return {
      line: String(threshold).replace(".", ","),
      overCount,
      overRate: totals.length ? overCount / totals.length : 0,
      underCount,
      underRate: totals.length ? underCount / totals.length : 0,
    };
  });
}

function mean(sum: number, count: number): number | null {
  return count ? sum / count : null;
}

export function analyzePairMatches(matches: MatchRecord[]): PairAnalysis {
  const ftOutcomeCounts: Counts = new Map();
  const htOutcomeCounts: Counts = new Map();
  const secondHalfOutcomeCounts: Counts = new Map();
  const halfWithMoreGoalsCounts: Counts = new Map();
  const ftBttsCounts: Counts = new Map();
  const htBttsCounts: Counts = new Map();
  const secondHalfBttsCounts: Counts = new Map();
  const bttsOver25Counts: Counts = new Map();
  const cleanSheetCounts: Counts = new Map();
  const ftGoalCounts: Counts = new Map();
  const htGoalCounts: Counts = new Map();
  const secondHalfGoalCounts: Counts = new Map();
  const homeGoalCounts: Counts = new Map();
  const awayGoalCounts: Counts = new Map();
  const ftScoreCounts: Counts = new Map();
  const htScoreCounts: Counts = new Map();
  const htftOutcomeCounts: Counts = new Map();
  const htftScoreCounts: Counts = new Map();
  const ftTotals: number[] = [];
  const htTotals: number[] = [];
  const secondHalfTotals: number[] = [];
  let ftHomeSum = 0;
  let ftAwaySum = 0;
  let htHomeSum = 0;
  let htAwaySum = 0;
  let secondHalfHomeSum = 0;
  let secondHalfAwaySum = 0;
  let validFt = 0;
  let validHt = 0;
  let validSecondHalf = 0;

  for (const match of matches) {
    if (match.ftHome === null || match.ftAway === null) continue;
    const ftHome = match.ftHome;
    const ftAway = match.ftAway;
    const ftTotal = ftHome + ftAway;
    const ftOutcome = outcome(ftHome, ftAway);
    const btts = ftHome > 0 && ftAway > 0;
    validFt += 1;
    ftTotals.push(ftTotal);
    ftHomeSum += ftHome;
    ftAwaySum += ftAway;
    add(ftOutcomeCounts, ftOutcome);
    add(ftBttsCounts, btts ? "Igen" : "Nem");
    add(ftGoalCounts, bucket(ftTotal, 4));
    add(homeGoalCounts, bucket(ftHome, 3));
    add(awayGoalCounts, bucket(ftAway, 3));
    add(ftScoreCounts, `${ftHome}-${ftAway}`);
    if (ftAway === 0) add(cleanSheetCounts, "Hazai kapott gól nélkül");
    if (ftHome === 0) add(cleanSheetCounts, "Vendég kapott gól nélkül");
    add(bttsOver25Counts, `${btts ? "BTTS igen" : "BTTS nem"} · ${ftTotal > 2.5 ? "Over 2,5" : "Under 2,5"}`);

    if (match.htHome === null || match.htAway === null) continue;
    const htHome = match.htHome;
    const htAway = match.htAway;
    const htTotal = htHome + htAway;
    validHt += 1;
    htTotals.push(htTotal);
    htHomeSum += htHome;
    htAwaySum += htAway;
    add(htOutcomeCounts, outcome(htHome, htAway));
    add(htBttsCounts, htHome > 0 && htAway > 0 ? "Igen" : "Nem");
    add(htGoalCounts, bucket(htTotal, 4));
    add(htScoreCounts, `${htHome}-${htAway}`);
    add(htftOutcomeCounts, `${outcome(htHome, htAway)}>${ftOutcome}`);
    add(htftScoreCounts, `${htHome}-${htAway}>${ftHome}-${ftAway}`);

    // A második félidős mutatókhoz csak olyan HT/FT párokat használunk,
    // amelyeknél a végeredmény mindkét csapatnál legalább a félidei állás.
    if (ftHome < htHome || ftAway < htAway) continue;
    const secondHalfHome = ftHome - htHome;
    const secondHalfAway = ftAway - htAway;
    const secondHalfTotal = secondHalfHome + secondHalfAway;
    validSecondHalf += 1;
    secondHalfTotals.push(secondHalfTotal);
    secondHalfHomeSum += secondHalfHome;
    secondHalfAwaySum += secondHalfAway;
    add(secondHalfOutcomeCounts, outcome(secondHalfHome, secondHalfAway));
    add(secondHalfBttsCounts, secondHalfHome > 0 && secondHalfAway > 0 ? "Igen" : "Nem");
    add(secondHalfGoalCounts, bucket(secondHalfTotal, 4));
    add(halfWithMoreGoalsCounts, htTotal > secondHalfTotal ? "1. félidőben több" : htTotal < secondHalfTotal ? "2. félidőben több" : "Ugyanannyi");
  }

  const totalFtGoals = ftTotals.reduce((sum, value) => sum + value, 0);
  const totalHtGoals = htTotals.reduce((sum, value) => sum + value, 0);
  const totalSecondHalfGoals = secondHalfTotals.reduce((sum, value) => sum + value, 0);
  return {
    validFt,
    validHt,
    validSecondHalf,
    averages: {
      ftTotal: mean(totalFtGoals, validFt),
      ftHome: mean(ftHomeSum, validFt),
      ftAway: mean(ftAwaySum, validFt),
      htTotal: mean(totalHtGoals, validHt),
      htHome: mean(htHomeSum, validHt),
      htAway: mean(htAwaySum, validHt),
      secondHalfTotal: mean(totalSecondHalfGoals, validSecondHalf),
      secondHalfHome: mean(secondHalfHomeSum, validSecondHalf),
      secondHalfAway: mean(secondHalfAwaySum, validSecondHalf),
    },
    ftOutcomes: frequencies(ftOutcomeCounts, validFt, ["H", "D", "A"]),
    htOutcomes: frequencies(htOutcomeCounts, validHt, ["H", "D", "A"]),
    secondHalfOutcomes: frequencies(secondHalfOutcomeCounts, validSecondHalf, ["H", "D", "A"]),
    halfWithMoreGoals: frequencies(halfWithMoreGoalsCounts, validSecondHalf, ["1. félidőben több", "Ugyanannyi", "2. félidőben több"]),
    ftBtts: frequencies(ftBttsCounts, validFt, ["Igen", "Nem"]),
    htBtts: frequencies(htBttsCounts, validHt, ["Igen", "Nem"]),
    secondHalfBtts: frequencies(secondHalfBttsCounts, validSecondHalf, ["Igen", "Nem"]),
    bttsOver25: frequencies(bttsOver25Counts, validFt),
    cleanSheets: frequencies(cleanSheetCounts, validFt),
    ftGoals: frequencies(ftGoalCounts, validFt, ["0", "1", "2", "3", "4", "5+"]),
    htGoals: frequencies(htGoalCounts, validHt, ["0", "1", "2", "3", "4", "5+"]),
    secondHalfGoals: frequencies(secondHalfGoalCounts, validSecondHalf, ["0", "1", "2", "3", "4", "5+"]),
    homeGoals: frequencies(homeGoalCounts, validFt, ["0", "1", "2", "3", "4+"]),
    awayGoals: frequencies(awayGoalCounts, validFt, ["0", "1", "2", "3", "4+"]),
    ftScores: frequencies(ftScoreCounts, validFt),
    htScores: frequencies(htScoreCounts, validHt),
    htftOutcomes: frequencies(htftOutcomeCounts, validHt),
    htftScores: frequencies(htftScoreCounts, validHt),
    ftGoalLines: goalLines(ftTotals),
    htGoalLines: goalLines(htTotals),
    secondHalfGoalLines: goalLines(secondHalfTotals),
  };
}
