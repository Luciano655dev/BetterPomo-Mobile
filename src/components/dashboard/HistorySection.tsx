import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { dialog } from "@/components/ui/dialog";

import { SessionRecap, type SummaryEntry } from "@/components/dashboard/SessionRecap";
import { ActivityCalendar } from "@/components/dashboard/ActivityCalendar";
import { api } from "@/lib/api";
import {
  estimateFocusSec,
  fmtDateHeading,
  fmtDur,
  fmtTime,
  localDateKey,
  parseDur,
} from "@/lib/format";
import { useInvalidate, type HistoryEntry } from "@/lib/hooks";
import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

interface Props {
  history: HistoryEntry[];
  currentUsername: string;
  readOnly?: boolean;
  showCalendar?: boolean;
  onOpenUser?: (username: string) => void;
}

type Entry = HistoryEntry & {
  timers_used: { name: string; duration: number }[] | null;
  participants: { username: string; display_name?: string }[] | null;
};

export function HistorySection({
  history,
  currentUsername,
  readOnly = false,
  showCalendar = true,
  onOpenUser,
}: Props) {
  const { colors } = useTheme();
  const { invalidateHistory } = useInvalidate();
  const [summaryEntry, setSummaryEntry] = useState<SummaryEntry | null>(null);

  const entries = history as Entry[];

  const dateGroups = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const h of [...entries].sort(
      (a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime(),
    )) {
      const k = localDateKey(new Date(h.completed_at));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(h);
    }
    return Array.from(map.entries());
  }, [entries]);

  async function startRename(h: Entry) {
    const name = await dialog.prompt({
      title: "Rename session",
      defaultValue: h.session_name,
      confirmText: "Rename",
    });
    const trimmed = name?.trim();
    if (!trimmed || trimmed === h.session_name) return;
    try {
      await api.patch(`/api/history/${h.id}`, { session_name: trimmed });
      invalidateHistory();
    } catch {
      dialog.toast("Failed to rename", "error");
    }
  }

  async function startDurEdit(h: Entry) {
    const raw = await dialog.prompt({
      title: "Edit duration",
      message: 'e.g. "1h 30m", "25m", or minutes',
      defaultValue: h.duration_seconds != null ? fmtDur(h.duration_seconds) : "",
      confirmText: "Save",
    });
    const secs = raw != null ? parseDur(raw) : null;
    if (secs === null || secs < 0 || secs === h.duration_seconds) return;
    try {
      await api.patch(`/api/history/${h.id}`, { duration_seconds: secs });
      invalidateHistory();
    } catch {
      dialog.toast("Failed to update duration", "error");
    }
  }

  async function confirmDelete(h: Entry) {
    const ok = await dialog.confirm({
      title: "Delete entry",
      message: `Remove "${h.session_name}" from your history?`,
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/history/${h.id}`);
      invalidateHistory();
    } catch {
      dialog.toast("Failed to delete", "error");
    }
  }

  if (!entries.length) {
    return (
      <View style={[styles.empty, { borderColor: colors.border }]}>
        <Text style={{ fontSize: 14, fontFamily: fonts.sansMedium, color: colors.foreground }}>
          No sessions yet
        </Text>
        <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sans }}>
          Completed sessions will appear here
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 24 }}>
      {showCalendar && <ActivityCalendar history={entries} />}

      {dateGroups.map(([dateKey, group]) => (
        <View key={dateKey}>
          <View style={styles.dateRow}>
            <View style={[styles.dateLine, { backgroundColor: colors.border }]} />
            <Text
              style={{
                fontSize: 11,
                fontFamily: fonts.sansSemiBold,
                color: colors.mutedForeground,
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              {fmtDateHeading(group[0].completed_at)}
            </Text>
            <View style={[styles.dateLine, { backgroundColor: colors.border }]} />
          </View>

          <View style={{ gap: 10 }}>
            {group.map((h) => {
              const others = (h.participants ?? []).filter(
                (p) => p.username !== currentUsername,
              );
              const focusSec = estimateFocusSec(h.duration_seconds, h.timers_used ?? []);
              const doneTasks = h.tasks?.filter((t) => t.done).length ?? 0;

              return (
                <View
                  key={h.id}
                  style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={styles.cardHeader}>
                    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, flex: 1 }}>
                      <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: fonts.mono }}>
                        {fmtTime(h.completed_at)}
                      </Text>
                      <Pressable
                        onPress={readOnly ? undefined : () => startRename(h)}
                        style={{ flexShrink: 1 }}
                      >
                        <Text
                          numberOfLines={1}
                          style={{ fontSize: 13, fontFamily: fonts.sansSemiBold, color: colors.foreground }}
                        >
                          {h.session_name}
                        </Text>
                      </Pressable>
                    </View>
                    <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
                      <Pressable onPress={() => setSummaryEntry(h)} hitSlop={8}>
                        <Ionicons name="stats-chart-outline" size={15} color={colors.mutedForeground} />
                      </Pressable>
                      {!readOnly && (
                        <Pressable onPress={() => confirmDelete(h)} hitSlop={8}>
                          <Ionicons name="close" size={16} color={colors.mutedForeground} />
                        </Pressable>
                      )}
                    </View>
                  </View>

                  <View style={styles.statsRow}>
                    {h.duration_seconds != null && (
                      <Pressable
                        onPress={readOnly ? undefined : () => startDurEdit(h)}
                        style={styles.stat}
                      >
                        <Ionicons name="time-outline" size={12} color={colors.mutedForeground} />
                        <Text style={[styles.statText, { color: colors.mutedForeground }]}>
                          {fmtDur(h.duration_seconds)} in session
                        </Text>
                      </Pressable>
                    )}
                    {focusSec != null && (
                      <View style={styles.stat}>
                        <Ionicons name="locate-outline" size={12} color={colors.mutedForeground} />
                        <Text style={[styles.statText, { color: colors.mutedForeground }]}>
                          {fmtDur(focusSec)} active
                        </Text>
                      </View>
                    )}
                    {(h.tasks?.length ?? 0) > 0 && (
                      <View style={styles.stat}>
                        <Ionicons name="checkbox-outline" size={12} color={colors.mutedForeground} />
                        <Text style={[styles.statText, { color: colors.mutedForeground }]}>
                          {doneTasks}/{h.tasks!.length} tasks
                        </Text>
                      </View>
                    )}
                    {others.length > 0 && (
                      <Pressable
                        style={styles.stat}
                        onPress={onOpenUser ? () => onOpenUser(others[0].username) : undefined}
                      >
                        <Ionicons name="people-outline" size={12} color={colors.mutedForeground} />
                        <Text
                          numberOfLines={1}
                          style={[styles.statText, { color: colors.mutedForeground, maxWidth: 160 }]}
                        >
                          {others
                            .map((person) => `${person.display_name ?? person.username} (@${person.username})`)
                            .join(", ")}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ))}

      <Modal
        visible={!!summaryEntry}
        transparent
        animationType="fade"
        onRequestClose={() => setSummaryEntry(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSummaryEntry(null)}>
          <Pressable style={{ width: "88%" }} onPress={(e) => e.stopPropagation()}>
            {summaryEntry && <SessionRecap entry={summaryEntry} />}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: radius.xl,
    paddingVertical: 36,
    alignItems: "center",
    gap: 4,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  dateLine: { flex: 1, height: StyleSheet.hairlineWidth },
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 6,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 14,
    rowGap: 4,
  },
  stat: { flexDirection: "row", alignItems: "center", gap: 4 },
  statText: { fontSize: 11, fontFamily: "PlusJakartaSans_400Regular" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
});
