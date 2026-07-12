import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { useInvalidate } from "@/lib/hooks";
import * as network from "@/lib/network";
import { syncPendingUploads } from "@/lib/offline-sync";

/**
 * Renders nothing; drains the offline upload queue whenever the app has a
 * chance of reaching the server: on mount, on reconnect, and on foreground.
 * Mounted once in (app)/_layout.tsx.
 */
export function OfflineSyncGate() {
  const { invalidateHistory } = useInvalidate();
  // Keep the latest invalidator in a ref (useInvalidate returns a fresh closure
  // each render). Assign in an effect rather than during render.
  const invalidateRef = useRef<typeof invalidateHistory | null>(null);
  useEffect(() => {
    invalidateRef.current = invalidateHistory;
  });

  useEffect(() => {
    const run = () => syncPendingUploads(() => invalidateRef.current?.());
    run();
    const unsubscribe = network.subscribe((online) => {
      if (online) run();
    });
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") run();
    });
    return () => {
      unsubscribe();
      sub.remove();
    };
  }, []);

  return null;
}
