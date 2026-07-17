// Single source of truth for connectivity. SWR, the offline sync engine, and
// UI (banner, create/join guards) all read from here so they can't disagree.
import * as Network from "expo-network";
import { useSyncExternalStore } from "react";

// Optimistic until the first snapshot arrives: a false "offline" flash at
// launch would disable actions and pause SWR for users who are online.
let online = true;

const listeners = new Set<(online: boolean) => void>();

function apply(state: Network.NetworkState) {
  // iOS briefly reports these as undefined while the interface settles —
  // treat unknown as online rather than flapping the whole app offline.
  const next = state.isConnected !== false && state.isInternetReachable !== false;
  if (next === online) return;
  online = next;
  listeners.forEach((cb) => cb(online));
}

const initialSnapshot = Network.getNetworkStateAsync()
  .then((state) => {
    apply(state);
    return online;
  })
  .catch(() => online);
Network.addNetworkStateListener(apply);

/** Current connectivity snapshot (synchronous). */
export function isOnline(): boolean {
  return online;
}

/** Wait for Expo's first local connectivity snapshot before starting IO. */
export async function isOnlineAsync(): Promise<boolean> {
  await initialSnapshot;
  return online;
}

/** Subscribe to connectivity changes. Returns an unsubscribe function. */
export function subscribe(cb: (online: boolean) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Reactive connectivity for components. */
export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline);
}
