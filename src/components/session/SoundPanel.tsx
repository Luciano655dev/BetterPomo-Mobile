import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { dialog } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/Slider";
import {
  BUILT_IN_SOUNDS,
  playAmbient,
  setTrackVolume,
  stopAllAmbient,
  stopAmbient,
  togglePauseAll,
  useSoundMixer,
} from "@/lib/session-sounds";
import {
  deletePreset,
  listPresets,
  savePreset,
  type SoundPreset,
} from "@/lib/sound-presets";
import { deleteUserSound, listUserSounds, pickAndSaveUserSound, type UserSound } from "@/lib/user-sounds";
import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

function SoundRow({
  name,
  icon,
  playing,
  volume,
  onToggle,
  onVolume,
  onDelete,
}: {
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  playing: boolean;
  volume: number;
  onToggle: () => void;
  onVolume: (v: number) => void;
  onDelete?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.soundRow}>
      <View style={styles.soundHeader}>
        <Pressable
          onPress={onToggle}
          style={[
            styles.playBtn,
            {
              backgroundColor: playing ? colors.foreground : "transparent",
              borderColor: playing ? colors.foreground : colors.border,
            },
          ]}
          hitSlop={8}
        >
          <Ionicons
            name={playing ? "pause" : "play"}
            size={12}
            color={playing ? colors.background : colors.mutedForeground}
          />
        </Pressable>
        <Ionicons name={icon} size={15} color={colors.mutedForeground} />
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontSize: 14,
            color: colors.foreground,
            fontFamily: playing ? fonts.sansMedium : fonts.sans,
          }}
        >
          {name}
        </Text>
        {onDelete && (
          <Pressable onPress={onDelete} hitSlop={8}>
            <Ionicons name="trash-outline" size={15} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>
      {/* Per-sound volume — always adjustable, dimmed a touch when the sound is
          off so you can pre-set a level before turning it on. */}
      <View style={[styles.volumeRow, !playing && { opacity: 0.55 }]}>
        <Ionicons name="volume-low" size={13} color={colors.mutedForeground} />
        <Slider value={volume} onChange={onVolume} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

export function SoundPanel() {
  const { colors } = useTheme();
  const mixer = useSoundMixer();
  const [userSounds, setUserSounds] = useState<UserSound[]>([]);
  const [presets, setPresets] = useState<SoundPreset[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    listUserSounds().then(setUserSounds).catch(() => {});
    listPresets().then(setPresets).catch(() => {});
  }, []);

  const activeCount = Object.keys(mixer.tracks).length;

  async function saveCurrentPreset() {
    const tracks = Object.values(mixer.tracks).map((t) => ({
      id: t.id,
      volume: mixer.volumes[t.id] ?? t.volume,
    }));
    if (tracks.length === 0) return;
    const name = await dialog.prompt({
      title: "Save preset",
      message: "Name this mix so you can bring it back in one tap.",
      placeholder: "e.g. Rainy café",
      confirmText: "Save",
    });
    if (name === null) return;
    try {
      const preset = await savePreset(name, tracks);
      setPresets((cur) => [...cur, preset]);
      dialog.toast(`Saved "${preset.name}"`, "success");
    } catch {
      dialog.toast("Couldn't save preset", "error");
    }
  }

  async function applyPreset(preset: SoundPreset) {
    // Replace the current mix with the preset's exact sounds + volumes.
    stopAllAmbient();
    for (const t of preset.tracks) {
      setTrackVolume(t.id, t.volume);
      if (t.id.startsWith("builtin:")) {
        const sid = t.id.slice("builtin:".length);
        const b = BUILT_IN_SOUNDS.find((s) => s.id === sid);
        if (b) await playAmbient({ id: t.id, source: b.module }).catch(() => {});
      } else if (t.id.startsWith("user:")) {
        const uid = t.id.slice("user:".length);
        const u = userSounds.find((s) => s.id === uid);
        if (u) await playAmbient({ id: t.id, source: u.uri }).catch(() => {});
      }
    }
  }

  async function removePreset(preset: SoundPreset) {
    const ok = await dialog.confirm({
      title: "Delete preset",
      message: `Delete "${preset.name}"?`,
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deletePreset(preset.id);
      setPresets((cur) => cur.filter((p) => p.id !== preset.id));
    } catch {
      dialog.toast("Couldn't delete preset", "error");
    }
  }

  function toggleBuiltIn(id: string, module: number) {
    // `id` is already the fully-qualified track key (e.g. "builtin:rain").
    if (mixer.tracks[id]) stopAmbient(id);
    else playAmbient({ id, source: module }).catch(() => {});
  }

  function toggleUser(sound: UserSound) {
    const id = `user:${sound.id}`;
    if (mixer.tracks[id]) stopAmbient(id);
    else playAmbient({ id, source: sound.uri }).catch(() => {});
  }

  async function upload() {
    if (uploading) return;
    setUploading(true);
    try {
      const added = await pickAndSaveUserSound();
      if (added) {
        setUserSounds((cur) => [...cur, added]);
        dialog.toast(`Added "${added.name}"`, "success");
      }
    } catch (e) {
      dialog.toast(e instanceof Error ? e.message : "Couldn't add that file", "error");
    } finally {
      setUploading(false);
    }
  }

  async function removeUser(sound: UserSound) {
    const id = `user:${sound.id}`;
    if (mixer.tracks[id]) stopAmbient(id);
    const ok = await dialog.confirm({
      title: "Remove sound",
      message: `Delete "${sound.name}" from this device?`,
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteUserSound(sound.id);
      setUserSounds((cur) => cur.filter((s) => s.id !== sound.id));
    } catch {
      dialog.toast("Couldn't remove sound", "error");
    }
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
      <View style={styles.introRow}>
        <Text style={{ flex: 1, fontSize: 11, color: colors.mutedForeground, fontFamily: fonts.sans }}>
          Mix as many as you like — set each one&apos;s level.
        </Text>
        {activeCount > 0 && (
          <>
            <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: fonts.sans }}>
              {mixer.paused ? "paused" : `${activeCount} playing`}
            </Text>
            <Pressable
              onPress={togglePauseAll}
              style={[styles.transportBtn, { borderColor: colors.border }]}
              hitSlop={8}
            >
              <Ionicons
                name={mixer.paused ? "play" : "pause"}
                size={13}
                color={colors.foreground}
              />
              <Text style={{ fontSize: 12, color: colors.foreground, fontFamily: fonts.sansMedium }}>
                {mixer.paused ? "Resume all" : "Pause all"}
              </Text>
            </Pressable>
          </>
        )}
      </View>

      {(presets.length > 0 || activeCount > 0) && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PRESETS</Text>
          {presets.map((p) => (
            <View key={p.id} style={styles.presetRow}>
              <Pressable onPress={() => applyPreset(p)} style={styles.presetMain} hitSlop={6}>
                <Ionicons name="albums-outline" size={15} color={colors.mutedForeground} />
                <Text
                  numberOfLines={1}
                  style={{ flex: 1, fontSize: 14, color: colors.foreground, fontFamily: fonts.sans }}
                >
                  {p.name}
                </Text>
                <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: fonts.sans }}>
                  {p.tracks.length} {p.tracks.length === 1 ? "sound" : "sounds"}
                </Text>
              </Pressable>
              <Pressable onPress={() => removePreset(p)} hitSlop={8}>
                <Ionicons name="trash-outline" size={15} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ))}
          {activeCount > 0 && (
            <Pressable onPress={saveCurrentPreset} style={[styles.uploadBtn, { borderColor: colors.border }]}>
              <Ionicons name="bookmark-outline" size={15} color={colors.mutedForeground} />
              <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sansMedium }}>
                Save current mix
              </Text>
            </Pressable>
          )}
        </>
      )}

      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>AMBIENT</Text>
      {BUILT_IN_SOUNDS.map((s) => {
        const id = `builtin:${s.id}`;
        return (
          <SoundRow
            key={s.id}
            name={s.name}
            icon="musical-notes-outline"
            playing={!!mixer.tracks[id]}
            volume={mixer.volumes[id] ?? 0.7}
            onToggle={() => toggleBuiltIn(id, s.module)}
            onVolume={(v) => setTrackVolume(id, v)}
          />
        );
      })}

      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>YOUR SOUNDS</Text>
      {userSounds.map((s) => {
        const id = `user:${s.id}`;
        return (
          <SoundRow
            key={s.id}
            name={s.name}
            icon="cloud-upload-outline"
            playing={!!mixer.tracks[id]}
            volume={mixer.volumes[id] ?? 0.7}
            onToggle={() => toggleUser(s)}
            onVolume={(v) => setTrackVolume(id, v)}
            onDelete={() => removeUser(s)}
          />
        );
      })}

      <Pressable
        onPress={upload}
        disabled={uploading}
        style={[styles.uploadBtn, { borderColor: colors.border }]}
      >
        {uploading ? (
          <ActivityIndicator size="small" color={colors.mutedForeground} />
        ) : (
          <Ionicons name="add" size={16} color={colors.mutedForeground} />
        )}
        <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sansMedium }}>
          {uploading ? "Adding…" : "Upload a sound"}
        </Text>
      </Pressable>
      <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: fonts.sans }}>
        Saved on this device only — never uploaded.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  introRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 2,
    marginTop: 6,
    fontFamily: "PlusJakartaSans_500Medium",
  },
  transportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  presetRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  presetMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  soundRow: { gap: 2 },
  soundHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  playBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  volumeRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 32, paddingRight: 4 },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: radius.lg,
    paddingVertical: 12,
    marginTop: 4,
  },
});
