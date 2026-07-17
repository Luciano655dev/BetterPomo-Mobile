import React, { useEffect, useState } from "react";
import { AppState } from "react-native";
import { SWRConfig } from "swr";
import * as network from "@/lib/network";
import { createPersistedCache } from "@/lib/swr-persist";

/**
 * SWR's revalidateOnFocus / refreshIntervals pausing are browser-oriented; in
 * React Native they must be wired to AppState and expo-network. Without this,
 * refreshIntervals keep firing in the background, screens are stale on
 * foreground, and reconnecting doesn't revalidate.
 *
 * The cache Map is hydrated from disk (see swr-persist.ts) so whitelisted data
 * survives restarts and the app is readable offline. Rendering is gated on
 * hydration — it resolves well before the splash screen comes down.
 */
export function SWRProvider({ children }: { children: React.ReactNode }) {
  const [cache, setCache] = useState<Map<string, any> | null>(null);

  useEffect(() => {
    let mounted = true;
    createPersistedCache()
      .then((persistedCache) => {
        if (mounted) setCache(persistedCache);
      })
      .catch(() => {
        if (mounted) setCache(new Map());
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!cache) return null;

  return (
    <SWRConfig
      value={{
        provider: () => cache,
        isVisible: () => AppState.currentState === "active",
        isOnline: network.isOnline,
        initFocus(callback) {
          const sub = AppState.addEventListener("change", (state) => {
            if (state === "active") callback();
          });
          return () => sub.remove();
        },
        initReconnect(callback) {
          return network.subscribe((online) => {
            if (online) callback();
          });
        },
      }}
    >
      {children}
    </SWRConfig>
  );
}
