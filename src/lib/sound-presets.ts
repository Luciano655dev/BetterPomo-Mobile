import AsyncStorage from "@react-native-async-storage/async-storage";

// Saved ambient mixes ("presets") — a named snapshot of which sounds are playing
// and each one's volume, so a mix can be recalled in one tap (imissmycafe.com
// style). Stored locally in AsyncStorage; nothing touches the API. Mirrors the
// web's lib/sound-presets.ts (which uses localStorage).

export interface PresetTrack {
  /** Fully-qualified track id, e.g. "builtin:rain" or "user:1699…". */
  id: string;
  volume: number;
}

export interface SoundPreset {
  id: string;
  name: string;
  tracks: PresetTrack[];
}

const KEY = "bp_sound_presets";

export async function listPresets(): Promise<SoundPreset[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writePresets(list: SoundPreset[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

/** Save a new preset from the given tracks. Returns the created preset. */
export async function savePreset(name: string, tracks: PresetTrack[]): Promise<SoundPreset> {
  const preset: SoundPreset = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || "Preset",
    tracks,
  };
  const list = await listPresets();
  await writePresets([...list, preset]);
  return preset;
}

export async function deletePreset(id: string): Promise<void> {
  const list = await listPresets();
  await writePresets(list.filter((p) => p.id !== id));
}
