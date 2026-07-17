import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import React, { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, type TextStyle } from "react-native";
import { captureRef } from "react-native-view-shot";

import { Button } from "@/components/ui/Button";
import { dialog } from "@/components/ui/dialog";
import { Logo } from "@/components/ui/Logo";
import { estimateFocusSec, fmtClock, fmtTotal } from "@/lib/format";
import { useTheme } from "@/theme/ThemeContext";
import { darkTokens, fonts, lightTokens, radius } from "@/theme/tokens";

export interface SummaryEntry {
  session_name: string;
  completed_at: string;
  duration_seconds: number | null;
  focus_seconds?: number | null;
  timers_used: { name: string; duration: number }[] | null;
  participants: { username: string; display_name?: string }[] | null;
  tasks?: { text: string; done: boolean }[] | null;
}

type StickerScheme = "light" | "dark";

/** Solid fill for a ready-to-post card, per sticker scheme. */
const STICKER_FILL: Record<StickerScheme, string> = { light: "#f1f1f1", dark: "#0c0c0e" };

/** Small inline segmented control matching the webapp's recap toggles. */
function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.segment, { borderColor: colors.border }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segmentItem, active && { backgroundColor: colors.primary }]}
          >
            <Text
              style={{
                fontSize: 12,
                fontFamily: fonts.sansMedium,
                color: active ? colors.primaryForeground : colors.mutedForeground,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Strava-style recap card with a real image export: capture the card as a PNG
 * (transparent when Background is off), then Share via the OS sheet or Save
 * straight to Photos. Theme + Background are user choices so the sticker can
 * match a light/dark story or be layered over footage.
 */
export function SessionRecap({ entry }: { entry: SummaryEntry }) {
  const { colors, scheme } = useTheme();
  const shotRef = useRef<View>(null);
  const [stickerScheme, setStickerScheme] = useState<StickerScheme>(scheme === "dark" ? "dark" : "light");
  const [withBg, setWithBg] = useState(true);
  const [busy, setBusy] = useState<"share" | "save" | null>(null);

  // The card renders in the *chosen* scheme, independent of the app theme.
  const sc = stickerScheme === "dark" ? darkTokens : lightTokens;
  const fill = withBg ? STICKER_FILL[stickerScheme] : "transparent";

  // Soft shadow keeps type legible on a transparent (story-overlay) export.
  const shadow: TextStyle = withBg
    ? {}
    : {
        textShadowColor: stickerScheme === "dark" ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.6)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 6,
      };

  const total = entry.duration_seconds ?? 0;
  const focus = entry.focus_seconds ?? estimateFocusSec(entry.duration_seconds, entry.timers_used);
  const tasks = entry.tasks ?? [];
  const done = tasks.filter((t) => t.done);
  const people = entry.participants ?? [];
  const others = people.length > 1
    ? people.map((p) => `${p.display_name ?? p.username} (@${p.username})`)
    : [];

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

  async function capture(): Promise<string> {
    // PNG preserves alpha, so an unfilled card exports fully transparent.
    return captureRef(shotRef, { format: "png", quality: 1, result: "tmpfile" });
  }

  async function handleShare() {
    setBusy("share");
    try {
      const uri = await capture();
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          UTI: "public.png",
          dialogTitle: "My focus session",
        });
      } else {
        dialog.toast("Sharing isn't available on this device.", "error");
      }
    } catch {
      dialog.toast("Couldn't share the image.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleSave() {
    setBusy("save");
    try {
      const uri = await capture();
      // Write-only permission — we never read the user's library.
      const perm = await MediaLibrary.requestPermissionsAsync(true, ["photo"]);
      if (!perm.granted) {
        dialog.toast("Photos permission is needed to save.", "error");
        return;
      }
      await MediaLibrary.Asset.create(uri);
      dialog.toast("Saved to Photos", "success");
    } catch (error) {
      dialog.toast(
        error instanceof Error ? `Couldn't save the image: ${error.message}` : "Couldn't save the image.",
        "error",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      {/* Preview backdrop stands in for the user's story; only the ref'd card is
          captured, so a transparent export drops onto any photo/video. */}
      <View
        style={[
          styles.preview,
          { backgroundColor: stickerScheme === "dark" ? "#1a1a1d" : "#e6e6e6", borderColor: colors.border },
        ]}
      >
        <View ref={shotRef} collapsable={false} style={[styles.card, { backgroundColor: fill }]}>
          <View style={[styles.pill, { backgroundColor: sc.foreground }]}>
            <Logo size={14} variant={stickerScheme === "dark" ? "light" : "dark"} />
            <Text style={{ fontSize: 11, fontFamily: fonts.sansSemiBold, color: sc.background }}>
              BetterPomo
            </Text>
          </View>

          <Text style={[styles.title, shadow, { color: sc.foreground, fontFamily: fonts.sansBold }]}>
            {entry.session_name}
          </Text>
          <Text style={[shadow, { fontSize: 10, letterSpacing: 2, color: sc.mutedForeground, fontFamily: fonts.sans }]}>
            {date.toUpperCase()}
          </Text>

          <Text style={[styles.hero, shadow, { color: sc.foreground, fontFamily: fonts.monoSemiBold }]}>
            {fmtClock(total)}
          </Text>
          <Text style={[shadow, { fontSize: 10, letterSpacing: 3, color: sc.mutedForeground, fontFamily: fonts.sans }]}>
            TOTAL TIME
          </Text>

          <View style={styles.statRow}>
            {stats.map((s, i) => (
              <React.Fragment key={s.label}>
                {i > 0 && <View style={[styles.divider, { backgroundColor: sc.border }]} />}
                <View style={{ alignItems: "center" }}>
                  <Text style={[shadow, { fontSize: 18, fontFamily: fonts.sansBold, color: sc.foreground }]}>
                    {s.value}
                  </Text>
                  <Text style={[shadow, { fontSize: 9, letterSpacing: 1.5, color: sc.mutedForeground, marginTop: 2 }]}>
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
                  style={[shadow, { fontSize: 13, fontFamily: fonts.sansMedium, color: sc.foreground }]}
                >
                  ✓ {t.text}
                </Text>
              ))}
              {done.length > 3 && (
                <Text style={[shadow, { fontSize: 11, color: sc.mutedForeground }]}>+{done.length - 3} more</Text>
              )}
            </View>
          )}

          {others.length > 0 && (
            <Text
              numberOfLines={1}
              style={[shadow, { marginTop: 14, fontSize: 11, color: sc.mutedForeground, fontFamily: fonts.sans }]}
            >
              with {others.join(", ")}
            </Text>
          )}
        </View>
      </View>

      {/* Theme + Background choices */}
      <View style={styles.controls}>
        <View style={styles.control}>
          <Text style={[styles.controlLabel, { color: colors.mutedForeground }]}>Theme</Text>
          <Segmented
            value={stickerScheme}
            onChange={setStickerScheme}
            options={[
              { label: "Light", value: "light" },
              { label: "Dark", value: "dark" },
            ]}
          />
        </View>
        <View style={styles.control}>
          <Text style={[styles.controlLabel, { color: colors.mutedForeground }]}>Background</Text>
          <Segmented
            value={withBg ? "on" : "off"}
            onChange={(v) => setWithBg(v === "on")}
            options={[
              { label: "On", value: "on" },
              { label: "Off", value: "off" },
            ]}
          />
        </View>
      </View>

      <Text style={{ fontSize: 12, textAlign: "center", color: colors.mutedForeground, fontFamily: fonts.sans }}>
        {withBg
          ? "Saved as a ready-to-post image."
          : "Transparent background — layer it over your story."}
      </Text>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button
          title={busy === "share" ? "Preparing…" : "Share"}
          onPress={handleShare}
          disabled={busy !== null}
          loading={busy === "share"}
          style={{ flex: 1 }}
        />
        <Button
          title={busy === "save" ? "Saving…" : "Save image"}
          variant="outline"
          onPress={handleSave}
          disabled={busy !== null}
          loading={busy === "save"}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    borderWidth: 1,
    borderRadius: radius["2xl"],
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: radius["3xl"],
    paddingVertical: 28,
    paddingHorizontal: 24,
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
  controls: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  control: { flexDirection: "row", alignItems: "center", gap: 8 },
  controlLabel: { fontSize: 12, fontFamily: fonts.sans },
  segment: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 2,
  },
  segmentItem: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.md,
  },
});
