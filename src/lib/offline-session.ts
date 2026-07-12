// A solo session that lives entirely on this device: no server row, no
// participants, no chat. Timer semantics mirror the server model (wall-clock
// timestamps + paused_elapsed_seconds) so state survives backgrounding and
// app kills, and the presentational session components work unchanged. On
// finish it becomes a queued POST /api/history upload (see offline-queue.ts).
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

import { writeNotes } from "./notes-storage";
import { isBreakTimer, type Lap, type SessionTimer, type TimerState } from "./session-types";

export interface OfflineSessionState {
  v: 1;
  id: string; // local only — NEVER sent as session_id (it FKs pomodoro_sessions)
  name: string;
  session_type: "pomodoro" | "stopwatch";
  timers: SessionTimer[];
  current_timer_index: number;
  timer_state: TimerState;
  timer_started_at: string | null;
  paused_elapsed_seconds: number | null;
  laps: Lap[]; // stopwatch, local-only — laps aren't part of history
  started_at: string; // drives duration_seconds on finish
  updated_at: string;
}

const key = (userId: string) => `bp_offline_session:${userId}`;

// Same defaults the create_pomo_session RPC seeds for online sessions.
const DEFAULT_TIMERS: Omit<SessionTimer, "id">[] = [
  { name: "Work", duration: 900, order: 0 },
  { name: "Work", duration: 2100, order: 1 },
  { name: "Work", duration: 3300, order: 2 },
  { name: "Break", duration: 300, order: 3 },
  { name: "Break", duration: 600, order: 4 },
  { name: "Break", duration: 900, order: 5 },
];

export async function createOfflineSession(
  userId: string,
  name: string,
  sessionType: "pomodoro" | "stopwatch",
): Promise<OfflineSessionState> {
  const now = new Date().toISOString();
  const state: OfflineSessionState = {
    v: 1,
    id: Crypto.randomUUID(),
    name,
    session_type: sessionType,
    timers: DEFAULT_TIMERS.map((t) => ({ ...t, id: Crypto.randomUUID() })),
    current_timer_index: 0,
    timer_state: "idle",
    timer_started_at: null,
    paused_elapsed_seconds: sessionType === "stopwatch" ? 0 : null,
    laps: [],
    started_at: now,
    updated_at: now,
  };
  await saveOfflineSession(userId, state);
  return state;
}

export async function loadOfflineSession(userId: string): Promise<OfflineSessionState | null> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OfflineSessionState;
    if (parsed?.v !== 1 || !parsed.id || !Array.isArray(parsed.timers)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveOfflineSession(userId: string, state: OfflineSessionState): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId), JSON.stringify(state));
  } catch {
    // storage unavailable — state survives in memory for this run
  }
}

/** Remove the session and its local notes (the session id never recurs). */
export async function clearOfflineSession(userId: string, sessionId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key(userId));
  } catch {
    // best-effort
  }
  await writeNotes(sessionId, userId, { note: "", todos: [] });
}

// ── Pure timer helpers (clamp negative elapsed — device clocks move) ─────────

export function deriveElapsed(state: OfflineSessionState, now = Date.now()): number {
  if (state.timer_state === "running" && state.timer_started_at) {
    return Math.max(0, (now - new Date(state.timer_started_at).getTime()) / 1000);
  }
  return Math.max(0, state.paused_elapsed_seconds ?? 0);
}

export function deriveRemaining(state: OfflineSessionState, now = Date.now()): number {
  const current = state.timers[state.current_timer_index];
  if (!current) return 0;
  return Math.max(0, current.duration - deriveElapsed(state, now));
}

/** Work → first break, break → first work; same policy as handleTimerFinished
 *  in SessionScreen. Returns the fields to merge after a pomodoro timer ends. */
export function advanceAfterFinish(state: OfflineSessionState): Partial<OfflineSessionState> {
  const current = state.timers[state.current_timer_index] ?? null;
  const wasBreak = isBreakTimer(current?.name ?? "");
  let nextIdx = state.current_timer_index;
  if (!wasBreak) {
    const firstBreakIdx = state.timers.findIndex((t) => isBreakTimer(t.name));
    if (firstBreakIdx >= 0) nextIdx = firstBreakIdx;
  } else {
    const firstWorkIdx = state.timers.findIndex((t) => !isBreakTimer(t.name));
    if (firstWorkIdx >= 0) nextIdx = firstWorkIdx;
  }
  return {
    timer_state: "idle",
    timer_started_at: null,
    paused_elapsed_seconds: null,
    current_timer_index: nextIdx,
  };
}
