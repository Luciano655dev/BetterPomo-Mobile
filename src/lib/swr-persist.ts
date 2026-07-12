// Disk-backed SWR cache so the app has something to show offline after a
// restart. Only durable, personal data is persisted — realtime feeds (chat,
// notifications, active sessions) must never be served stale from disk.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { supabase } from "./supabase";

const STORAGE_KEY = "bp_swr_cache:v1";
const FLUSH_DELAY_MS = 2000;

function shouldPersist(key: string): boolean {
  return key === "/api/profile" || key.startsWith("/api/history") || key === "/api/friends";
}

// SWR v2 cache values carry { data, error, isValidating, ... }. Only the data
// slice survives serialization — errors and in-flight promises must not.
type SWRCacheValue = { data?: unknown; isLoading?: boolean; isValidating?: boolean };

let cache: Map<string, SWRCacheValue> | null = null;
// Last data-bearing snapshot per key. Flushing merges into this rather than
// rewriting from the live map, so a key whose current value is transiently
// data-less (e.g. a failed revalidation) keeps its last good data on disk.
let persisted = new Map<string, SWRCacheValue>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  if (!cache) return;
  for (const [key, value] of cache) {
    if (shouldPersist(key) && value && value.data !== undefined) {
      persisted.set(key, { data: value.data });
    }
  }
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...persisted]));
  } catch {
    // storage full/unavailable — the cache is best-effort
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_DELAY_MS);
}

/** Loads the persisted cache and returns the live Map for SWR's provider.
 *  Call once at startup; writes flow back to disk automatically. */
export async function createPersistedCache(): Promise<Map<string, SWRCacheValue>> {
  const map = new Map<string, SWRCacheValue>();
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      for (const [key, value] of JSON.parse(raw) as [string, SWRCacheValue][]) {
        // The explicit false flags matter: SWR treats an entry with undefined
        // isLoading as "validating on mount", which would render skeletons
        // instead of the hydrated data.
        if (shouldPersist(key) && value && value.data !== undefined) {
          map.set(key, { data: value.data, isLoading: false, isValidating: false });
          persisted.set(key, { data: value.data });
        }
      }
    }
  } catch {
    // corrupt/unreadable cache — start empty
  }

  const originalSet = map.set.bind(map);
  map.set = (key, value) => {
    const result = originalSet(key, value);
    if (shouldPersist(key)) scheduleFlush();
    return result;
  };

  AppState.addEventListener("change", (state) => {
    if (state !== "active") flush();
  });

  cache = map;
  return map;
}

/** Wipe disk + memory so a later sign-in can't see the previous account. */
async function clearPersistedCache() {
  cache?.clear();
  persisted.clear();
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // best-effort
  }
}

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") clearPersistedCache();
});
