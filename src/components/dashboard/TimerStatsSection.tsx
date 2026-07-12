import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  computeStats,
  defaultPeriod,
  fmtTotal,
  type Period,
  type StatHistoryEntry,
} from "@/lib/format";
import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

const PERIODS: { key: Period; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

function StatCircle({ name, total, active }: { name: string; total: number; active: number }) {
  const { colors } = useTheme();
  const showActive = active < total && active > 0;
  return (
    <View style={[styles.circle, { borderColor: colors.border, backgroundColor: colors.muted + "33" }]}>
      <Text
        numberOfLines={1}
        style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: fonts.sansMedium, maxWidth: "90%" }}
      >
        {name}
      </Text>
      <Text style={{ fontSize: 18, color: colors.foreground, fontFamily: fonts.sansBold }}>
        {fmtTotal(total)}
      </Text>
      {showActive && (
        <Text style={{ fontSize: 9, color: colors.mutedForeground, fontFamily: fonts.sans }}>
          {fmtTotal(active)} active
        </Text>
      )}
    </View>
  );
}

export function TimerStatsSection({ history }: { history: StatHistoryEntry[] }) {
  const { colors } = useTheme();
  const [period, setPeriod] = useState<Period>(() => defaultPeriod(history));
  const [touched, setTouched] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Re-pick a sensible default period when history first lands (unless the user
  // already chose one), adjusting state during render rather than in an effect.
  const [prevHistory, setPrevHistory] = useState(history);
  if (history !== prevHistory) {
    setPrevHistory(history);
    if (!touched) setPeriod(defaultPeriod(history));
  }

  const stats = useMemo(() => computeStats(history, period), [history, period]);
  const hasAnyHistory = useMemo(() => history.some((h) => !!h.duration_seconds), [history]);

  if (!hasAnyHistory) return null;

  const grandTotal = stats.reduce((s, e) => s + e.total, 0);
  const visibleStats = expanded ? stats : stats.slice(0, 3);
  const periodLabel = period === "week" ? "week" : period === "month" ? "month" : "year";

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={[styles.heading, { color: colors.mutedForeground, fontFamily: fonts.sansSemiBold }]}>
          TIME BY SESSION
        </Text>
        <View style={[styles.periodTrack, { borderColor: colors.border }]}>
          {PERIODS.map(({ key, label }) => (
            <Pressable
              key={key}
              onPress={() => {
                setTouched(true);
                setPeriod(key);
              }}
              style={[
                styles.periodBtn,
                period === key && { backgroundColor: colors.foreground },
              ]}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontFamily: fonts.sansMedium,
                  color: period === key ? colors.background : colors.mutedForeground,
                }}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {visibleStats.length > 0 ? (
        <View style={styles.grid}>
          {visibleStats.map(({ name, total, active }) => (
            <View key={name} style={styles.gridItem}>
              <StatCircle name={name} total={total} active={active} />
            </View>
          ))}
        </View>
      ) : (
        <Text
          style={{
            fontSize: 13,
            color: colors.mutedForeground,
            fontFamily: fonts.sans,
            textAlign: "center",
            paddingVertical: 24,
          }}
        >
          No sessions this {periodLabel} yet.
        </Text>
      )}

      <View style={styles.footerRow}>
        <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: fonts.sans }}>
          {fmtTotal(grandTotal)} total this {periodLabel}
        </Text>
        {stats.length > 3 && (
          <Pressable onPress={() => setExpanded((e) => !e)} hitSlop={8}>
            <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: fonts.sansMedium }}>
              {expanded ? "Show less" : `See all (${stats.length})`}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  heading: { fontSize: 11, letterSpacing: 2 },
  periodTrack: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 2,
    gap: 2,
  },
  periodBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -6,
  },
  gridItem: { width: "33.33%", padding: 6 },
  circle: {
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    padding: 10,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
});
