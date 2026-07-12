import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { useSyncExternalStore } from "react";

// Module-level singleton ambient-sound mixer for sessions, mirroring the web's
// lib/sound-player.ts. It mixes any number of looping sounds at once — each with
// its own independent volume (imissmycafe.com style). There is no shared master
// volume; every sound is controlled on its own.
// Living outside React means playback survives panel tab switches and remounts.
//
// Built-in loops are bundled MP3s; user sounds play from file URIs in the app's
// document directory (see lib/user-sounds.ts). Nothing is uploaded anywhere.

export interface BuiltInSound {
  id: string;
  name: string;
  module: number; // require() handle
}

// Bundled ambient loops. Kept in sync with betterpomo-webapp/public/sounds/music
// (same ids/names/files) — update both when changing the catalog.
export const BUILT_IN_SOUNDS: BuiltInSound[] = [
  { id: "rain", name: "Rain", module: require("../../assets/sounds/rain.mp3") },
  { id: "ocean", name: "Ocean Waves", module: require("../../assets/sounds/ocean.mp3") },
  { id: "brown-noise", name: "Brown Noise", module: require("../../assets/sounds/brown-noise.mp3") },
  { id: "forest", name: "Forest", module: require("../../assets/sounds/forest.mp3") },
  { id: "fireplace", name: "Fireplace", module: require("../../assets/sounds/fireplace.mp3") },
  { id: "coffee-shop", name: "Coffee Shop", module: require("../../assets/sounds/coffee-shop.mp3") },
  { id: "night-city", name: "Night City", module: require("../../assets/sounds/night-city.mp3") },
  { id: "train", name: "Train", module: require("../../assets/sounds/train.mp3") },
];

export interface TrackState {
  id: string;
  /** Per-sound level, 0..1 — this is the sound's effective output volume. */
  volume: number;
}

export interface PlayerState {
  /** Currently-playing tracks, keyed by id. */
  tracks: Record<string, TrackState>;
  /** Per-id stored volume for every sound, whether or not it's playing, so each
   *  sound's level can be set independently before/while it plays. */
  volumes: Record<string, number>;
  /** Master transport gate: when true, every track in the mix is paused (silent)
   *  but stays in the mix, so resuming restores exactly the same set. */
  paused: boolean;
}

const TRACK_VOL_KEY = "bp_sound_track_vols";
const DEFAULT_TRACK_VOLUME = 0.7;

const players = new Map<string, AudioPlayer>();
let trackVolumes: Record<string, number> = {};
let loaded = false;
let audioConfigured = false;

let state: PlayerState = { tracks: {}, volumes: {}, paused: false };
const listeners = new Set<() => void>();

function emit() {
  // New object identity so useSyncExternalStore re-renders.
  state = { ...state };
  for (const l of listeners) l();
}

function clamp(v: number): number {
  return Math.min(1, Math.max(0, v));
}

async function ensureAudioMode() {
  if (audioConfigured) return;
  audioConfigured = true;
  try {
    // Play through the iOS silent switch, like the timer chime.
    await setAudioModeAsync({ playsInSilentMode: true });
  } catch {
    // best-effort
  }
}

async function loadPersisted() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(TRACK_VOL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") trackVolumes = parsed;
    }
    state = { ...state, volumes: { ...trackVolumes } };
    emit();
  } catch {
    // corrupt/unavailable storage — start from defaults
  }
}

// Dragging a slider fires setTrackVolume many times a second; debounce the write
// so we persist once the user settles instead of hammering AsyncStorage.
let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persistTrackVolumes() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    AsyncStorage.setItem(TRACK_VOL_KEY, JSON.stringify(trackVolumes)).catch(() => {});
  }, 150);
}

function trackVolumeFor(id: string): number {
  return trackVolumes[id] ?? DEFAULT_TRACK_VOLUME;
}

export function subscribeSounds(cb: () => void): () => void {
  listeners.add(cb);
  loadPersisted();
  return () => {
    listeners.delete(cb);
  };
}

export function getSoundSnapshot(): PlayerState {
  return state;
}

/** React hook wrapper. */
export function useSoundMixer(): PlayerState {
  return useSyncExternalStore(subscribeSounds, getSoundSnapshot);
}

/** Start a looping sound and add it to the mix. Other sounds keep playing. */
export async function playAmbient(opts: { id: string; source: number | string }) {
  await ensureAudioMode();
  await loadPersisted();

  let player = players.get(opts.id);
  if (!player) {
    player = createAudioPlayer(opts.source);
    players.set(opts.id, player);
  }
  player.loop = true;
  player.volume = clamp(trackVolumeFor(opts.id));
  try {
    await player.seekTo(0);
  } catch {
    // fine
  }

  // Turning a sound on exits the global-paused state: resume anything that was
  // paused so the whole mix plays coherently, then start the requested sound.
  if (state.paused) {
    for (const [pid, p] of players) {
      if (pid !== opts.id) {
        try {
          p.play();
        } catch {
          // already gone
        }
      }
    }
  }
  player.play();

  const vol = trackVolumeFor(opts.id);
  state = {
    ...state,
    paused: false,
    tracks: { ...state.tracks, [opts.id]: { id: opts.id, volume: vol } },
    volumes: { ...state.volumes, [opts.id]: vol },
  };
  emit();
}

/** Pause the whole mix without dropping anything — resuming restores the exact
 *  same set of sounds. No-op when nothing is playing. */
export function pauseAll() {
  if (Object.keys(state.tracks).length === 0 || state.paused) return;
  for (const p of players.values()) {
    try {
      p.pause();
    } catch {
      // already gone
    }
  }
  state = { ...state, paused: true };
  emit();
}

/** Resume every track paused by pauseAll(). */
export function resumeAll() {
  if (!state.paused) return;
  for (const p of players.values()) {
    try {
      p.play();
    } catch {
      // already gone
    }
  }
  state = { ...state, paused: false };
  emit();
}

/** One-tap master transport: pause everything, or resume what was paused. */
export function togglePauseAll() {
  if (state.paused) resumeAll();
  else pauseAll();
}

/** Stop a single sound and drop it from the mix. */
export function stopAmbient(id: string) {
  const player = players.get(id);
  if (player) {
    try {
      player.pause();
      player.remove();
    } catch {
      // already gone
    }
    players.delete(id);
  }
  if (state.tracks[id]) {
    const next = { ...state.tracks };
    delete next[id];
    // Nothing left to resume — drop the paused gate so the transport button
    // doesn't linger in a "paused" state over an empty mix.
    const paused = Object.keys(next).length > 0 ? state.paused : false;
    state = { ...state, tracks: next, paused };
    emit();
  }
}

/** Stop everything — call when leaving a session. */
export function stopAllAmbient() {
  for (const id of Array.from(players.keys())) stopAmbient(id);
}

/** Set one sound's own level. Remembered per-id and applied live if playing.
 *  Works whether or not the sound is currently on, so users can pre-set levels. */
export function setTrackVolume(id: string, volume: number) {
  const v = clamp(volume);
  trackVolumes = { ...trackVolumes, [id]: v };
  persistTrackVolumes();
  const player = players.get(id);
  if (player) player.volume = clamp(v);
  state = {
    ...state,
    volumes: { ...state.volumes, [id]: v },
    tracks: state.tracks[id] ? { ...state.tracks, [id]: { id, volume: v } } : state.tracks,
  };
  emit();
}
