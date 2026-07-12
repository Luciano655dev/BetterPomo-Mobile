// Completed sessions waiting to reach the server. Entries are enqueued when a
// session finishes without connectivity (offline sessions, or an online
// session whose history save failed) and drained by offline-sync.ts.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

const STORAGE_KEY = "bp_offline_queue";

/** Exactly what POST /api/history accepts. Offline sessions must omit
 *  `session_id` (they have no pomodoro_sessions row); online sessions whose
 *  save failed include it so the server can dedup against its own
 *  leave-time safety-net save. */
export interface HistoryUploadPayload {
  session_id?: string;
  session_name: string;
  duration_seconds: number;
  timers_used: { name: string; duration: number }[];
  participants: { username: string }[];
  tasks: { text: string; done: boolean }[];
  completed_at: string;
}

export interface PendingUpload {
  client_id: string;
  user_id: string;
  queued_at: string;
  attempts: number;
  last_attempt_at: string | null;
  status: "pending" | "inflight" | "failed";
  last_error: string | null;
  payload: HistoryUploadPayload;
}

// Sync, session-finish, and the SessionScreen save-fallback can all touch the
// queue concurrently; funnel every read-modify-write through one chain.
let chain: Promise<unknown> = Promise.resolve();
function serialized<T>(op: () => Promise<T>): Promise<T> {
  const next = chain.then(op, op);
  chain = next.catch(() => undefined);
  return next;
}

async function read(): Promise<PendingUpload[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const listeners = new Set<() => void>();

/** Fires after every queue write; the pending-sync card uses it to stay live. */
export function subscribeQueue(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

async function write(queue: PendingUpload[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // storage unavailable — the entry survives in memory until next write
  }
  listeners.forEach((cb) => cb());
}

export function getQueue(): Promise<PendingUpload[]> {
  return serialized(read);
}

export function enqueue(userId: string, payload: HistoryUploadPayload): Promise<PendingUpload> {
  return serialized(async () => {
    const entry: PendingUpload = {
      client_id: Crypto.randomUUID(),
      user_id: userId,
      queued_at: new Date().toISOString(),
      attempts: 0,
      last_attempt_at: null,
      status: "pending",
      last_error: null,
      payload,
    };
    const queue = await read();
    queue.push(entry);
    await write(queue);
    return entry;
  });
}

/** Merge a partial update into one entry (matched by client_id). */
export function updateEntry(
  clientId: string,
  patch: Partial<Pick<PendingUpload, "attempts" | "last_attempt_at" | "status" | "last_error">>,
): Promise<void> {
  return serialized(async () => {
    const queue = await read();
    const entry = queue.find((e) => e.client_id === clientId);
    if (!entry) return;
    Object.assign(entry, patch);
    await write(queue);
  });
}

export function removeEntry(clientId: string): Promise<void> {
  return serialized(async () => {
    const queue = await read();
    await write(queue.filter((e) => e.client_id !== clientId));
  });
}
