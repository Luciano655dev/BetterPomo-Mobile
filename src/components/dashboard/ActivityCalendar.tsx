import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { localDateKey } from "@/lib/format";
import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

const CELL = 13;
const GAP = 3;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_HEADERS = ["S", "M", "T", "W", "T", "F", "S"];

type CalendarView = "month" | "year";
const VIEW_KEY = "bp_activity_view";

interface Entry {
  completed_at: string;
}

export function ActivityCalendar({ history }: { history: Entry[] }) {
  const { colors, scheme } = useTheme();
  const currentYear = new Date().getFullYear();

  // View option: single month (default, fills the screen width) or the
  // GitHub-style full-year heatmap. Persisted across launches.
  const [view, setView] = useState<CalendarView>("month");
  useEffect(() => {
    AsyncStorage.getItem(VIEW_KEY)
      .then((v) => {
        if (v === "year" || v === "month") setView(v);
      })
      .catch(() => {});
  }, []);
  function changeView(v: CalendarView) {
    setView(v);
    AsyncStorage.setItem(VIEW_KEY, v).catch(() => {});
  }

  const [monthAnchor, setMonthAnchor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const now = new Date();
  const atCurrentMonth =
    monthAnchor.getFullYear() === now.getFullYear() && monthAnchor.getMonth() === now.getMonth();
  const shiftMonth = (delta: number) =>
    setMonthAnchor((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  const availableYears = useMemo(() => {
    const years = new Set<number>([currentYear]);
    for (const h of history) years.add(new Date(h.completed_at).getFullYear());
    return [...years].sort((a, b) => b - a);
  }, [history, currentYear]);

  const [selectedYear, setSelectedYear] = useState(currentYear);

  // GitHub-style intensity scale, matching the webapp's zinc ramp per scheme.
  const ramp =
    scheme === "dark"
      ? ["#3f3f46", "#71717a", "#a1a1aa", "#d4d4d8", "#f4f4f5"]
      : ["#e4e4e7", "#a1a1aa", "#71717a", "#52525b", "#27272a"];

  function cellColor(count: number) {
    if (count < 0) return "transparent";
    return ramp[Math.min(count, 4)];
  }

  /** Readable day-number color on each intensity step. */
  function cellTextColor(count: number) {
    if (count <= 0) return colors.mutedForeground;
    if (scheme === "dark") return count === 1 ? "#fafafa" : "#18181b";
    return "#fafafa";
  }

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const h of history) {
      const k = localDateKey(new Date(h.completed_at));
      map[k] = (map[k] ?? 0) + 1;
    }
    return map;
  }, [history]);

  // ── Month grid ──────────────────────────────────────────────────────────

  const monthCells = useMemo(() => {
    const year = monthAnchor.getFullYear();
    const month = monthAnchor.getMonth();
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const cells: ({ day: number; count: number } | null)[] = [];
    for (let i = 0; i < first.getDay(); i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      cells.push({
        day: d,
        count: date > today ? -1 : (counts[localDateKey(date)] ?? 0),
      });
    }
    while (cells.length % 7 !== 0) cells.push(null);

    const rows: (typeof cells)[] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [counts, monthAnchor]);

  const monthTotal = useMemo(
    () =>
      monthCells.flat().reduce((sum, c) => sum + (c && c.count > 0 ? c.count : 0), 0),
    [monthCells],
  );

  // ── Year heatmap ────────────────────────────────────────────────────────

  const { weeks, monthCols } = useMemo(() => {
    const today = new Date();

    const yearStart = new Date(selectedYear, 0, 1);
    const gridStart = new Date(yearStart);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());

    const yearEnd = new Date(selectedYear, 11, 31);
    const gridEnd = new Date(yearEnd);
    gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

    const numWeeks =
      Math.round((gridEnd.getTime() - gridStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;

    const weeks: { count: number; key: string }[][] = [];
    const cur = new Date(gridStart);
    const monthCols: { label: string; w: number }[] = [];
    for (let w = 0; w < numWeeks; w++) {
      const col: { count: number; key: string }[] = [];
      for (let d = 0; d < 7; d++) {
        const key = localDateKey(cur);
        const outsideYear = cur.getFullYear() !== selectedYear;
        const future = cur > today;
        if (cur.getDate() === 1 && !outsideYear) {
          monthCols.push({
            label: cur.toLocaleDateString(undefined, { month: "short" }),
            w,
          });
        }
        col.push({ count: outsideYear || future ? -1 : (counts[key] ?? 0), key });
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(col);
    }

    return { weeks, monthCols };
  }, [counts, selectedYear]);

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={{ fontSize: 10, letterSpacing: 2, color: colors.mutedForeground, fontFamily: fonts.sansMedium }}>
          ACTIVITY
        </Text>

        {/* View option — Month / Year */}
        <View style={[styles.toggle, { borderColor: colors.border }]}>
          {(["month", "year"] as const).map((v) => (
            <Pressable
              key={v}
              onPress={() => changeView(v)}
              style={[
                styles.toggleItem,
                view === v && { backgroundColor: colors.foreground },
              ]}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontFamily: fonts.sansMedium,
                  color: view === v ? colors.background : colors.mutedForeground,
                }}
              >
                {v === "month" ? "Month" : "Year"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {view === "month" ? (
        <View>
          {/* Month navigation */}
          <View style={styles.monthNav}>
            <Pressable onPress={() => shiftMonth(-1)} hitSlop={8} style={styles.navBtn}>
              <Ionicons name="chevron-back" size={16} color={colors.mutedForeground} />
            </Pressable>
            <Text style={{ fontSize: 14, fontFamily: fonts.sansSemiBold, color: colors.foreground }}>
              {monthAnchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </Text>
            <Pressable
              onPress={() => shiftMonth(1)}
              hitSlop={8}
              disabled={atCurrentMonth}
              style={[styles.navBtn, atCurrentMonth && { opacity: 0.25 }]}
            >
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {/* Weekday header */}
          <View style={styles.weekRow}>
            {WEEKDAY_HEADERS.map((d, i) => (
              <View key={i} style={styles.monthCellWrap}>
                <Text
                  style={{
                    fontSize: 10,
                    textAlign: "center",
                    color: colors.mutedForeground,
                    fontFamily: fonts.sansMedium,
                    marginBottom: 4,
                  }}
                >
                  {d}
                </Text>
              </View>
            ))}
          </View>

          {/* Day grid — cells flex to fill the screen width */}
          <View style={{ gap: 5 }}>
            {monthCells.map((row, r) => (
              <View key={r} style={styles.weekRow}>
                {row.map((cell, c) => (
                  <View key={c} style={styles.monthCellWrap}>
                    {cell ? (
                      <View
                        style={[
                          styles.monthCell,
                          cell.count < 0
                            ? { borderWidth: 1, borderStyle: "dashed", borderColor: colors.border }
                            : { backgroundColor: cellColor(cell.count) },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontFamily: fonts.sansMedium,
                            color: cell.count < 0 ? colors.mutedForeground : cellTextColor(cell.count),
                            opacity: cell.count < 0 ? 0.5 : 1,
                          }}
                        >
                          {cell.day}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            ))}
          </View>

          <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: fonts.sans, marginTop: 8 }}>
            {monthTotal} session{monthTotal === 1 ? "" : "s"} this month
          </Text>
        </View>
      ) : (
        <View>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginBottom: 8 }}>
            {availableYears.slice(0, 4).map((y) => (
              <Pressable key={y} onPress={() => setSelectedYear(y)} hitSlop={6}>
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: y === selectedYear ? fonts.sansSemiBold : fonts.sans,
                    color: y === selectedYear ? colors.foreground : colors.mutedForeground,
                  }}
                >
                  {y}
                </Text>
              </Pressable>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={{ marginLeft: 32, height: 12, width: weeks.length * (CELL + GAP) }}>
                {monthCols.map((m) => (
                  <Text
                    key={`${m.label}-${m.w}`}
                    style={{
                      position: "absolute",
                      left: m.w * (CELL + GAP),
                      fontSize: 8,
                      color: colors.mutedForeground,
                    }}
                  >
                    {m.label}
                  </Text>
                ))}
              </View>

              <View style={{ flexDirection: "row", gap: GAP, marginTop: 4 }}>
                <View style={{ gap: GAP, width: 28 }}>
                  {DAY_LABELS.map((d, i) => (
                    <Text
                      key={d}
                      style={{
                        height: CELL,
                        fontSize: 8,
                        lineHeight: CELL,
                        textAlign: "right",
                        paddingRight: 3,
                        color: colors.mutedForeground,
                        opacity: i % 2 !== 0 ? 1 : 0,
                      }}
                    >
                      {d}
                    </Text>
                  ))}
                </View>

                {weeks.map((week, w) => (
                  <View key={w} style={{ gap: GAP }}>
                    {week.map((day) => (
                      <View
                        key={day.key}
                        style={{ width: CELL, height: CELL, borderRadius: 3, backgroundColor: cellColor(day.count) }}
                      />
                    ))}
                  </View>
                ))}
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8, marginLeft: 32 }}>
                <Text style={{ fontSize: 8, color: colors.mutedForeground, marginRight: 2 }}>Less</Text>
                {[0, 1, 2, 3, 4].map((n) => (
                  <View
                    key={n}
                    style={{ width: CELL, height: CELL, borderRadius: 3, backgroundColor: cellColor(n) }}
                  />
                ))}
                <Text style={{ fontSize: 8, color: colors.mutedForeground, marginLeft: 2 }}>More</Text>
              </View>
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  toggle: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 2,
    gap: 2,
  },
  toggleItem: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.md,
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  navBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  weekRow: { flexDirection: "row", gap: 5, marginBottom: 0 },
  monthCellWrap: { flex: 1, alignItems: "stretch" },
  monthCell: {
    aspectRatio: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
