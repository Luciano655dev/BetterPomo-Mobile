// Time/format helpers ported from the webapp (TimerStatsSection / HistorySection / SessionSummaryCard).

export function isBreak(name: string) {
  const l = name.toLowerCase();
  return l.includes("break") || l.includes("rest") || l.includes("pause");
}

/** "45s" | "12m" | "1h 30m" */
export function fmtTotal(s: number): string {
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** "3m 20s" style used by history rows */
export function fmtDur(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m === 0) return `${s}s`;
  return s > 0 && m < 10 ? `${m}m ${s}s` : `${m}m`;
}

/** "MM:SS" (or "H:MM:SS") clock */
export function fmtClock(totalSec: number): string {
  const clamped = Math.max(0, totalSec);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Parse "1h 30m", "90m", "45s", or plain number (= minutes) → seconds */
export function parseDur(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  const h = s.match(/(\d+(?:\.\d+)?)\s*h/);
  const m = s.match(/(\d+(?:\.\d+)?)\s*m(?!s)/);
  const sec = s.match(/(\d+(?:\.\d+)?)\s*s(?!e)/);
  if (h || m || sec) {
    return Math.round(
      (h ? parseFloat(h[1]) * 3600 : 0) + (m ? parseFloat(m[1]) * 60 : 0) + (sec ? parseFloat(sec[1]) : 0),
    );
  }
  const n = parseFloat(s);
  if (!isNaN(n) && n >= 0) return Math.round(n * 60);
  return null;
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function fmtDateHeading(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function localDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Focus (work-timer) share of the total, estimated from the timer mix. */
export function estimateFocusSec(
  totalSec: number | null,
  timers: { name: string; duration: number }[] | null,
): number | null {
  if (!totalSec || !Array.isArray(timers) || timers.length === 0) return null;
  const work = timers.filter((t) => !isBreak(t.name)).reduce((s, t) => s + t.duration, 0);
  const all = timers.reduce((s, t) => s + t.duration, 0);
  if (all === 0 || work === all) return null;
  return Math.round((totalSec * work) / all);
}

// ── Stats aggregation (TimerStatsSection) ─────────────────────────────────────

export type Period = "week" | "month" | "year";

export function periodRange(p: Period, now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (p === "week") start.setDate(start.getDate() - start.getDay());
  else if (p === "month") start.setDate(1);
  else start.setMonth(0, 1);

  const end = new Date(start);
  if (p === "week") end.setDate(end.getDate() + 7);
  else if (p === "month") end.setMonth(end.getMonth() + 1);
  else end.setFullYear(end.getFullYear() + 1);

  return { start, end };
}

export interface StatHistoryEntry {
  session_name: string;
  duration_seconds: number | null;
  focus_seconds?: number | null;
  timers_used: { name: string; duration: number }[] | null;
  completed_at: string;
}

export type Stat = { name: string; total: number; active: number };

export function computeStats(history: StatHistoryEntry[], period: Period): Stat[] {
  const { start, end } = periodRange(period);
  const totals: Record<string, { total: number; active: number }> = {};

  for (const h of history) {
    if (!h.duration_seconds) continue;
    const at = new Date(h.completed_at);
    if (at < start || at >= end) continue;
    const totalSec = h.duration_seconds;

    // Real measured focus time when the record has it (newer rows); otherwise
    // the legacy proportional estimate from the timer mix.
    let activeSec = totalSec;
    if (h.focus_seconds != null) {
      activeSec = Math.min(h.focus_seconds, totalSec);
    } else {
      const timers = h.timers_used;
      if (timers && timers.length > 0) {
        const workDur = timers.filter((t) => !isBreak(t.name)).reduce((s, t) => s + t.duration, 0);
        const allDur = timers.reduce((s, t) => s + t.duration, 0);
        if (allDur > 0 && workDur < allDur) {
          activeSec = Math.round((totalSec * workDur) / allDur);
        }
      }
    }

    if (!totals[h.session_name]) totals[h.session_name] = { total: 0, active: 0 };
    totals[h.session_name].total += totalSec;
    totals[h.session_name].active += activeSec;
  }

  return Object.entries(totals)
    .sort(([, a], [, b]) => b.total - a.total)
    .map(([name, { total, active }]) => ({ name, total, active }));
}

export function defaultPeriod(history: StatHistoryEntry[]): Period {
  if (computeStats(history, "month").length) return "month";
  if (computeStats(history, "year").length) return "year";
  if (computeStats(history, "week").length) return "week";
  return "month";
}
