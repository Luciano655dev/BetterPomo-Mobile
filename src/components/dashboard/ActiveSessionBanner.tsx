import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fmtClock } from "@/lib/format";
import { useMyActiveSession } from "@/lib/hooks";
import { useTheme } from "@/theme/ThemeContext";
import { fonts } from "@/theme/tokens";

/**
 * Floating pill shown on the dashboard while the user has a session running in
 * the background. Clock derived from authoritative DB timestamps, ticking locally.
 */
export function ActiveSessionBanner() {
  const { colors } = useTheme();
  const router = useRouter();
  const { data } = useMyActiveSession();

  const running = data?.session.timer_state === "running";
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  if (!data) return null;
  const { session, current_timer } = data;

  const isStopwatch = session.session_type === "stopwatch";
  const duration = current_timer?.duration ?? 0;

  let elapsed: number | null = null;
  if (session.timer_state === "running" && session.timer_started_at) {
    elapsed = (now - new Date(session.timer_started_at).getTime()) / 1000;
  } else if (session.timer_state === "paused" && session.paused_elapsed_seconds != null) {
    elapsed = session.paused_elapsed_seconds;
  }

  let clock: string | null = null;
  if (elapsed !== null) {
    clock = isStopwatch ? fmtClock(elapsed) : fmtClock(duration - elapsed);
  } else if (session.timer_state === "idle" && !isStopwatch && duration > 0) {
    clock = fmtClock(duration);
  }

  const stateLabel =
    session.timer_state === "running"
      ? current_timer && !isStopwatch
        ? current_timer.name
        : "Running"
      : session.timer_state === "paused"
        ? "Paused"
        : "Waiting";

  return (
    <Pressable
      onPress={() => router.push(`/session/${session.code}`)}
      style={[styles.pill, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="timer-outline" size={16} color="#10b981" />
        {running && <View style={styles.dot} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 13, fontFamily: fonts.sansMedium, color: colors.foreground }}>
          {clock ? (
            <>
              <Text style={{ fontFamily: fonts.mono }}>{clock}</Text>
              <Text style={{ color: colors.mutedForeground }}> · {session.name}</Text>
            </>
          ) : (
            session.name
          )}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: fonts.sans }}>
          {stateLabel} · tap to return
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
    backgroundColor: "rgba(16,185,129,0.13)",
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
    backgroundColor: "#10b981",
  },
});
