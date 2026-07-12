import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { dialog } from "@/components/ui/dialog";
import type { Lap, TimerState } from "@/lib/session-types";
import { useTheme } from "@/theme/ThemeContext";
import { fonts } from "@/theme/tokens";

interface StopwatchViewProps {
  sessionName: string;
  timerState: TimerState;
  timerStartedAt: string | null;
  pausedElapsedSeconds: number | null;
  isAdmin: boolean;
  laps: Lap[];
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onLap: (durationSeconds: number) => void;
  onRenameLap: (lapId: string, name: string) => void;
  onDeleteLap: (lapId: string) => void;
}

function getElapsed(
  timerState: string,
  timerStartedAt: string | null,
  pausedElapsedSeconds: number | null,
): number {
  if (timerState === "running" && timerStartedAt) {
    return (Date.now() - new Date(timerStartedAt).getTime()) / 1000;
  }
  return pausedElapsedSeconds ?? 0;
}

function formatStopwatch(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const t = Math.floor((totalSeconds % 1) * 10);
  if (h > 0)
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${t}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${t}`;
}

function formatSplit(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const t = Math.floor((seconds % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${t}`;
}

function ControlText({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={10}>
      <Text
        style={{
          fontSize: 13,
          letterSpacing: 3,
          textTransform: "uppercase",
          fontFamily: fonts.sansMedium,
          color: primary ? colors.foreground : colors.mutedForeground,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function StopwatchView({
  sessionName,
  timerState,
  timerStartedAt,
  pausedElapsedSeconds,
  isAdmin,
  laps,
  onStart,
  onPause,
  onResume,
  onReset,
  onLap,
  onRenameLap,
  onDeleteLap,
}: StopwatchViewProps) {
  const { colors } = useTheme();
  const [elapsed, setElapsed] = useState(() =>
    getElapsed(timerState, timerStartedAt, pausedElapsedSeconds),
  );

  const isIdle = timerState === "idle";
  const isRunning = timerState === "running";
  const hasTime = elapsed > 0.01;

  useEffect(() => {
    const update = () => setElapsed(getElapsed(timerState, timerStartedAt, pausedElapsedSeconds));
    update();
    if (timerState !== "running") return;
    const id = setInterval(update, 100);
    return () => clearInterval(id);
  }, [timerState, timerStartedAt, pausedElapsedSeconds]);

  const lastLapTotal = laps.length > 0 ? laps[laps.length - 1].duration_seconds : 0;
  const currentSplit = Math.max(0, elapsed - lastLapTotal);
  const sortedLaps = [...laps].reverse();

  async function lapActions(lap: Lap) {
    if (!isAdmin) return;
    const choice = await dialog.actions({
      title: lap.name,
      options: [
        { label: "Rename", value: "rename", icon: "pencil-outline" },
        { label: "Delete", value: "delete", destructive: true, icon: "trash-outline" },
      ],
    });
    if (choice === "rename") {
      const name = await dialog.prompt({
        title: "Rename lap",
        defaultValue: lap.name,
        confirmText: "Rename",
      });
      const trimmed = name?.trim();
      if (trimmed && trimmed !== lap.name) onRenameLap(lap.id, trimmed);
    } else if (choice === "delete") {
      onDeleteLap(lap.id);
    }
  }

  return (
    <View style={styles.root}>
      <Text style={[styles.sessionName, { color: colors.mutedForeground, fontFamily: fonts.sans }]}>
        {sessionName.toUpperCase()}
        {timerState === "paused" ? " — PAUSED" : ""}
      </Text>

      <Text
        style={[
          styles.clock,
          {
            color: colors.foreground,
            fontFamily: fonts.monoSemiBold,
            opacity: isIdle ? 0.25 : timerState === "paused" ? 0.5 : 1,
          },
        ]}
      >
        {formatStopwatch(isIdle && !hasTime ? 0 : elapsed)}
      </Text>

      {isAdmin ? (
        <View style={styles.controls}>
          {isIdle && <ControlText label="Start" onPress={onStart} primary />}
          {isRunning && (
            <>
              <ControlText label="Pause" onPress={onPause} />
              <Text style={{ color: colors.mutedForeground }}>·</Text>
              <ControlText label="Lap" onPress={() => onLap(elapsed)} />
            </>
          )}
          {timerState === "paused" && (
            <>
              <ControlText label="Resume" onPress={onResume} primary />
              {hasTime && (
                <>
                  <Text style={{ color: colors.mutedForeground }}>·</Text>
                  <ControlText label="Reset" onPress={onReset} />
                </>
              )}
            </>
          )}
        </View>
      ) : (
        <Text style={{ fontSize: 11, letterSpacing: 2, color: colors.mutedForeground, fontFamily: fonts.sans }}>
          {isIdle ? "WAITING FOR HOST TO START…" : isRunning ? "RUNNING…" : "PAUSED — WAITING FOR HOST…"}
        </Text>
      )}

      {laps.length > 0 && (
        <ScrollView style={styles.lapList} contentContainerStyle={{ paddingBottom: 8 }}>
          <View style={styles.lapHeader}>
            <Text style={[styles.lapHeaderText, { color: colors.mutedForeground }]}>LAPS</Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Text style={[styles.lapHeaderText, { color: colors.mutedForeground, width: 64, textAlign: "right" }]}>
                Split
              </Text>
              <Text style={[styles.lapHeaderText, { color: colors.mutedForeground, width: 64, textAlign: "right" }]}>
                Total
              </Text>
            </View>
          </View>

          {isRunning && (
            <View style={[styles.lapRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.lapNum, { color: colors.mutedForeground }]}>{laps.length + 1}</Text>
              <Text style={{ flex: 1, fontSize: 13, fontStyle: "italic", color: colors.mutedForeground, fontFamily: fonts.sans }}>
                Current
              </Text>
              <Text style={[styles.lapTime, { color: colors.mutedForeground }]}>{formatSplit(currentSplit)}</Text>
              <Text style={[styles.lapTime, { color: colors.foreground }]}>{formatStopwatch(elapsed)}</Text>
            </View>
          )}

          {sortedLaps.map((lap, i) => {
            const prevLapTotal = sortedLaps[i + 1]?.duration_seconds ?? 0;
            const split = lap.duration_seconds - prevLapTotal;
            return (
              <Pressable
                key={lap.id}
                onPress={() => lapActions(lap)}
                style={[styles.lapRow, { borderBottomColor: colors.border }]}
              >
                <Text style={[styles.lapNum, { color: colors.mutedForeground }]}>{lap.lap_number}</Text>
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: colors.foreground, fontFamily: fonts.sans }}>
                  {lap.name}
                </Text>
                <Text style={[styles.lapTime, { color: colors.mutedForeground }]}>{formatSplit(split)}</Text>
                <Text style={[styles.lapTime, { color: colors.foreground }]}>{formatSplit(lap.duration_seconds)}</Text>
                {isAdmin && <Ionicons name="ellipsis-horizontal" size={12} color={colors.mutedForeground} />}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {laps.length === 0 && isRunning && isAdmin && (
        <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: fonts.sans }}>
          Press Lap to record a split
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", gap: 16, paddingTop: 8 },
  sessionName: { fontSize: 10, letterSpacing: 3 },
  clock: { fontSize: 64, letterSpacing: -2 },
  controls: { flexDirection: "row", alignItems: "center", gap: 16 },
  lapList: { alignSelf: "stretch", flex: 1, paddingHorizontal: 20 },
  lapHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
    paddingRight: 18,
  },
  lapHeaderText: { fontSize: 9, letterSpacing: 2 },
  lapRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lapNum: { width: 22, fontSize: 11, fontFamily: "GeistMono_500Medium" },
  lapTime: { width: 64, textAlign: "right", fontSize: 12, fontFamily: "GeistMono_500Medium" },
});
