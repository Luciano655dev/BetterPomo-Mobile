import React from "react";
import { Share, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { estimateFocusSec, fmtClock, fmtTotal } from "@/lib/format";
import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

export interface SummaryEntry {
  session_name: string;
  completed_at: string;
  duration_seconds: number | null;
  timers_used: { name: string; duration: number }[] | null;
  participants: { username: string }[] | null;
  tasks?: { text: string; done: boolean }[] | null;
}

/** Strava-style recap card + native share sheet (text summary). */
export function SessionRecap({ entry }: { entry: SummaryEntry }) {
  const { colors, scheme } = useTheme();
  const total = entry.duration_seconds ?? 0;
  const focus = estimateFocusSec(entry.duration_seconds, entry.timers_used);
  const tasks = entry.tasks ?? [];
  const done = tasks.filter((t) => t.done);
  const people = entry.participants ?? [];
  const others = people.length > 1 ? people.map((p) => p.username) : [];

  const date = new Date(entry.completed_at).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const stats = [
    { label: "FOCUS", value: fmtTotal(focus ?? total) },
    { label: "TASKS", value: `${done.length}/${tasks.length}` },
    { label: "PEOPLE", value: String(Math.max(people.length, 1)) },
  ];

  async function handleShare() {
    const lines = [
      `🍅 ${entry.session_name} — BetterPomo`,
      `⏱ ${fmtClock(total)} total${focus ? ` · ${fmtTotal(focus)} focused` : ""}`,
    ];
    if (tasks.length > 0) lines.push(`✅ ${done.length}/${tasks.length} tasks done`);
    if (others.length > 0) lines.push(`👥 with ${others.join(", ")}`);
    try {
      await Share.share({ message: lines.join("\n") });
    } catch {
      // user dismissed the sheet
    }
  }

  const bg = scheme === "dark" ? "#0c0c0e" : "#f1f1f1";

  return (
    <View style={{ gap: 12 }}>
      <View style={[styles.card, { backgroundColor: bg, borderColor: colors.border }]}>
        <View style={[styles.pill, { backgroundColor: colors.foreground }]}>
          <Logo size={14} tint={colors.background} />
          <Text style={{ fontSize: 11, fontFamily: fonts.sansSemiBold, color: colors.background }}>
            BetterPomo
          </Text>
        </View>

        <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.sansBold }]}>
          {entry.session_name}
        </Text>
        <Text style={{ fontSize: 10, letterSpacing: 2, color: colors.mutedForeground, fontFamily: fonts.sans }}>
          {date.toUpperCase()}
        </Text>

        <Text style={[styles.hero, { color: colors.foreground, fontFamily: fonts.monoSemiBold }]}>
          {fmtClock(total)}
        </Text>
        <Text style={{ fontSize: 10, letterSpacing: 3, color: colors.mutedForeground, fontFamily: fonts.sans }}>
          TOTAL TIME
        </Text>

        <View style={styles.statRow}>
          {stats.map((s, i) => (
            <React.Fragment key={s.label}>
              {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 18, fontFamily: fonts.sansBold, color: colors.foreground }}>
                  {s.value}
                </Text>
                <Text style={{ fontSize: 9, letterSpacing: 1.5, color: colors.mutedForeground, marginTop: 2 }}>
                  {s.label}
                </Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {done.length > 0 && (
          <View style={{ marginTop: 16, gap: 3, alignItems: "center" }}>
            {done.slice(0, 3).map((t, i) => (
              <Text
                key={i}
                numberOfLines={1}
                style={{ fontSize: 13, fontFamily: fonts.sansMedium, color: colors.foreground }}
              >
                ✓ {t.text}
              </Text>
            ))}
            {done.length > 3 && (
              <Text style={{ fontSize: 11, color: colors.mutedForeground }}>+{done.length - 3} more</Text>
            )}
          </View>
        )}

        {others.length > 0 && (
          <Text
            numberOfLines={1}
            style={{ marginTop: 14, fontSize: 11, color: colors.mutedForeground, fontFamily: fonts.sans }}
          >
            with {others.join(", ")}
          </Text>
        )}
      </View>

      <Button title="Share" onPress={handleShare} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius["2xl"],
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 14,
  },
  title: { fontSize: 20, textAlign: "center", marginBottom: 4 },
  hero: { fontSize: 56, marginTop: 18, letterSpacing: -1 },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    marginTop: 20,
  },
  divider: { width: 1, height: 30 },
});
