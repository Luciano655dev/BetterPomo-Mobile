// Port of betterpomo-webapp/lib/backend-api.ts for React Native.
import { dialog } from "@/components/ui/dialog";
import * as network from "./network";
import { supabase } from "./supabase";

// Require the backend URL in release builds. Falling back to localhost in a
// shipped app would make every request fail silently; fail loudly instead so a
// misconfigured build is caught before submission. Dev keeps the localhost default.
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? "http://localhost:4000" : "");
if (!API_URL) {
  throw new Error("EXPO_PUBLIC_API_URL must be set for production builds");
}

async function getToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

// Several SWR hooks can 401 simultaneously; only sign out once.
let signingOut = false;

/** Thrown when the request never reached the server (offline, DNS, aborted).
 *  Distinct from HTTP errors so the sync engine can retry these safely. */
export class NetworkError extends Error {
  constructor() {
    super("You're offline. Check your connection and try again.");
    this.name = "NetworkError";
  }
}

/** An HTTP error response. `status` lets callers tell a permanent rejection
 *  (4xx — don't retry) from a transient server failure (5xx — retry later).
 *  `payload` carries the parsed body for machine-readable errors like
 *  `upgrade_required` (see isUpgradeRequired). */
export class ApiError extends Error {
  status: number;
  payload: { error?: string; feature?: string; plan_needed?: string };
  constructor(message: string, status: number, payload: ApiError["payload"] = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

/** True when the API said the action needs a paid plan (403 upgrade_required). */
export function isUpgradeRequired(err: unknown): err is ApiError {
  return err instanceof ApiError && err.payload.error === "upgrade_required";
}

async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
  isRetry = false,
): Promise<T> {
  // Avoid auth token refreshes and fetches that can sit pending while the
  // device is known to be offline. SWR retains its last persisted data.
  if (!(await network.isOnlineAsync())) throw new NetworkError();
  const token = await getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { ...headers, ...((options.headers as Record<string, string>) ?? {}) },
    });
  } catch {
    throw new NetworkError();
  }

  // Parse defensively: a flaky connection or upstream proxy can return an empty
  // body or an HTML error page. Don't let a JSON parse failure mask the real
  // HTTP status (which our error UIs key off of).
  const raw = await res.text();
  let json: { data?: unknown; error?: string } = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    // non-JSON response — fall through to the status-based error below
  }
  if (!res.ok) {
    if (res.status === 401 && token && !signingOut) {
      // The token can be stale without the session being dead: after an
      // offline stretch the auto-refresh timer lags, and a revalidation fired
      // on reconnect races the refresh with an expired access token. Refresh
      // once and retry before concluding the user must sign in again.
      if (!isRetry) {
        const { data, error } = await supabase.auth.refreshSession();
        if (!error && data.session?.access_token) {
          return apiFetch<T>(path, options, true);
        }
        if (error?.name === "AuthRetryableFetchError") {
          // Refresh couldn't reach Supabase — connectivity blip, not a dead
          // session. Surface the 401 and let the caller retry later.
          throw new ApiError(json.error ?? `Request failed: ${res.status}`, res.status);
        }
      }
      // Refresh failed or the retried request still 401s — the session is
      // genuinely dead. Tell the user, then sign out. The auth listener
      // redirects to login; the dialog is hosted at the root so it survives
      // that navigation and lands on top of the login screen.
      signingOut = true;
      dialog.alert({
        title: "Session expired",
        message: "You've been signed out. Please sign in again to continue.",
      });
      supabase.auth.signOut().finally(() => {
        signingOut = false;
      });
    }
    throw new ApiError(
      json.error ?? `Request failed: ${res.status}`,
      res.status,
      json as ApiError["payload"],
    );
  }
  return json.data as T;
}

export const api = {
  get: <T = unknown>(path: string) => apiFetch<T>(path),
  // Default to "{}" (not "null") for body-less mutations: Express's strict JSON
  // parser rejects a top-level `null`, which 400s before the route runs.
  post: <T = unknown>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T = unknown>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  delete: <T = unknown>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
