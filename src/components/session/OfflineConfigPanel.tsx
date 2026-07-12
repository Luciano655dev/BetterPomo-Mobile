import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useDialog } from "@/components/ui/dialog";
import { parseDur } from "@/lib/format";
import { isBreakTimer, type SessionTimer } from "@/lib/session-types";
import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

/**
 * Timer editing for offline sessions. The online ConfigPanel is not reusable
 * here — every edit there is an API call; these just mutate the local array.
 */
export function OfflineConfigPanel({
  timers,
  onChange,
}: {
  timers: SessionTimer[];
  onChange: (timers: SessionTimer[]) => void;
}) {
  const { colors } = useTheme();
  const dialog = useDialog();

  async function addTimer() {
    const name = await dialog.prompt({
      title: "Timer name",
      message: 'Names with "break", "rest" or "pause" count as break timers.',
      defaultValue: "Work",
    });
    if (!name?.trim()) return;
    const durRaw = await dialog.prompt({
      title: "Duration",
      message: 'e.g. "25" (minutes), "90s", or "1h 30m".',
      defaultValue: "25",
    });
    if (durRaw == null) return;
    const duration = parseDur(durRaw);
    if (!duration || duration <= 0) {
      dialog.toast("Couldn't read that duration", "error");
      return;
    }
    onChange([
      ...timers,
      { id: Crypto.randomUUID(), name: name.trim(), duration, order: timers.length },
    ]);
  }

  async function editTimer(timer: SessionTimer) {
    const name = await dialog.prompt({ title: "Timer name", defaultValue: timer.name });
    if (name == null) return;
    const durRaw = await dialog.prompt({
      title: "Duration",
      message: 'e.g. "25" (minutes), "90s", or "1h 30m".',
      defaultValue: String(Math.round(timer.duration / 60)),
    });
    if (durRaw == null) return;
    const duration = parseDur(durRaw);
    if (!duration || duration <= 0) {
      dialog.toast("Couldn't read that duration", "error");
      return;
    }
    onChange(
      timers.map((t) =>
        t.id === timer.id ? { ...t, name: name.trim() || t.name, duration } : t,
      ),
    );
  }

  async function deleteTimer(timer: SessionTimer) {
    if (timers.length <= 1) {
      dialog.toast("A session needs at least one timer", "error");
      return;
    }
    const ok = await dialog.confirm({
      title: `Delete "${timer.name}"?`,
      confirmText: "Delete",
      destructive: true,
    });
    if (ok) onChange(timers.filter((t) => t.id !== timer.id));
  }

  function fmtDuration(seconds: number) {
    return seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds}s`;
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={{ fontSize: 11, letterSpacing: 2, color: colors.mutedForeground, fontFamily: fonts.sansSemiBold }}>
        TIMERS
      </Text>
      {timers.map((timer) => (
        <View key={timer.id} style={[styles.row, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Pressable style={styles.rowMain} onPress={() => editTimer(timer)}>
            <Text style={{ fontSize: 14, fontFamily: fonts.sansMedium, color: colors.foreground }}>
              {timer.name}
              {isBreakTimer(timer.name) ? "  ☕" : ""}
            </Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sans }}>
              {fmtDuration(timer.duration)} — tap to edit
            </Text>
          </Pressable>
          <Pressable onPress={() => deleteTimer(timer)} hitSlop={8} accessibilityLabel={`Delete ${timer.name}`}>
            <Ionicons name="trash-outline" size={17} color={colors.destructive} />
          </Pressable>
        </View>
      ))}
      <Pressable onPress={addTimer} style={[styles.addRow, { borderColor: colors.border }]}>
        <Ionicons name="add" size={16} color={colors.mutedForeground} />
        <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sansMedium }}>
          Add timer
        </Text>
      </Pressable>
      <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: fonts.sans, lineHeight: 16 }}>
        This session runs only on this device. It will be saved to your account history when it
        ends and you&apos;re back online.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rowMain: { flex: 1, gap: 1 },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: radius.lg,
    paddingVertical: 10,
  },
});
