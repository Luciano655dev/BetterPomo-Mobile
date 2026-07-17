// Drains the offline upload queue to POST /api/history. Triggered by
// OfflineSyncGate (mount, reconnect, foreground) and directly after a session
// finishes. Single-flight: overlapping triggers collapse into one run.
import { api, ApiError, NetworkError } from "./api";
import * as network from "./network";
import { getQueue, removeEntry, updateEntry } from "./offline-queue";
import { supabase } from "./supabase";

const RETRY_BACKOFF_MS = 30_000;

let syncing = false;

/** Upload every pending entry for the signed-in user. Safe to call anytime.
 *  `onUploaded` runs once if at least one entry reached the server (callers
 *  pass their SWR history invalidator — global mutate can't see the app's
 *  custom cache provider). */
export async function syncPendingUploads(onUploaded?: () => void): Promise<void> {
  if (syncing || !(await network.isOnlineAsync())) return;
  syncing = true;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    // Pre-flight: after a long offline stretch the access token is stale and
    // the auto-refresh timer lags. Refresh before POSTing so uploads don't
    // race a 401; on failure just wait for the next trigger.
    if (session.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
      const { error } = await supabase.auth.refreshSession();
      if (error) return;
    }

    const queue = (await getQueue()).filter((e) => e.user_id === session.user.id);
    if (!queue.length) return;

    let uploaded = false;
    // Recent server history, fetched once and only if needed for dedup.
    let recent:
      | { session_id: string | null; session_name: string; completed_at: string }[]
      | null = null;

    for (const entry of queue) {
      if (entry.status === "failed") continue;
      if (entry.last_attempt_at && Date.now() - Date.parse(entry.last_attempt_at) < RETRY_BACKOFF_MS) {
        continue;
      }

      // The DB has no enforced unique constraint for history rows, so dedup is
      // entirely on us. Check the server before posting when a duplicate is
      // possible: a crashed in-flight attempt (row may exist from the lost
      // response), or a session-linked record (the leave safety-net may have
      // saved it independently).
      if (entry.status === "inflight" || entry.payload.session_id) {
        try {
          recent ??= await api.get<
            { session_id: string | null; session_name: string; completed_at: string }[]
          >("/api/history?limit=50");
          const dup = recent.some(
            (h) =>
              (entry.payload.session_id && h.session_id === entry.payload.session_id) ||
              (h.session_name === entry.payload.session_name &&
                Math.abs(Date.parse(h.completed_at) - Date.parse(entry.payload.completed_at)) < 1000),
          );
          if (dup) {
            await removeEntry(entry.client_id);
            continue;
          }
          if (entry.status === "inflight") {
            await updateEntry(entry.client_id, { status: "pending" });
          }
        } catch {
          break; // can't verify — don't risk a duplicate, stop this run
        }
      }

      await updateEntry(entry.client_id, {
        status: "inflight",
        attempts: entry.attempts + 1,
        last_attempt_at: new Date().toISOString(),
      });
      try {
        // Send the queue's client_id as an idempotency key so a retry after a
        // lost response can't create a duplicate — the server returns the
        // already-saved row instead of inserting again.
        await api.post("/api/history", { ...entry.payload, client_id: entry.client_id });
        await removeEntry(entry.client_id);
        uploaded = true;
      } catch (err) {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 401) {
          // The server rejected this record outright — retrying can't fix it.
          await updateEntry(entry.client_id, { status: "failed", last_error: err.message });
          continue;
        }
        // Offline, 5xx, or auth trouble — keep it queued and stop this run.
        await updateEntry(entry.client_id, {
          status: "pending",
          last_error: err instanceof NetworkError ? null : err instanceof Error ? err.message : String(err),
        });
        break;
      }
    }

    if (uploaded) onUploaded?.();
  } finally {
    syncing = false;
  }
}
