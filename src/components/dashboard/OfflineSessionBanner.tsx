import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fmtClock } from "@/lib/format";
import { deriveElapsed, loadOfflineSession, type OfflineSessionState } from "@/lib/offline-session";
import { useAuth } from "@/providers/AuthProvider";
import { useTheme } from "@/theme/ThemeContext";
import { fonts } from "@/theme/tokens";

/**
 * Dashboard pill for an offline session in progress (mirrors
 * ActiveSessionBanner, but reads AsyncStorage instead of the server). The
 * clock derives from the persisted wall-clock timestamps, ticking locally.
 */
export function OfflineSessionBanner() {
  const { colors } = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [offline, setOffline] = useState<OfflineSessionState | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // The screen regains focus after leaving /offline-session — re-read state.
  useFocusEffect(
    useCallback(() => {
      if (userId) loadOfflineSession(userId).then(setOffline);
    }, [userId]),
  );

  const running = offline?.timer_state === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  if (!offline) return null;

  const isStopwatch = offline.session_type === "stopwatch";
  const current = offline.timers[offline.current_timer_index] ?? null;

  let clock: string | null = null;
  if (offline.timer_state !== "idle") {
    const elapsed = deriveElapsed(offline, now);
    clock = isStopwatch ? fmtClock(elapsed) : fmtClock(Math.max(0, (current?.duration ?? 0) - elapsed));
  } else if (!isStopwatch && current) {
    clock = fmtClock(current.duration);
  }

  const stateLabel =
    offline.timer_state === "running"
      ? current && !isStopwatch
        ? current.name
        : "Running"
      : offline.timer_state === "paused"
        ? "Paused"
        : "Waiting";

  return (
    <Pressable
      onPress={() => router.push("/offline-session")}
      style={[styles.pill, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="cloud-offline-outline" size={15} color="#f59e0b" />
        {running && <View style={styles.dot} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 13, fontFamily: fonts.sansMedium, color: colors.foreground }}>
          {clock ? (
            <>
              <Text style={{ fontFamily: fonts.mono }}>{clock}</Text>
              <Text style={{ color: colors.mutedForeground }}> · {offline.name}</Text>
            </>
          ) : (
            offline.name
          )}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: fonts.sans }}>
          Offline session · {stateLabel} · tap to return
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(245,158,11,0.13)",
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#f59e0b",
  },
});
