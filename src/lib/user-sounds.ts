import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";

// Local persistence for user-uploaded ambient sounds. Files are copied into the
// app's document directory (survives restarts, never leaves the device) and a
// small metadata index is kept in AsyncStorage. Mirrors the web's
// lib/user-sounds.ts (which uses IndexedDB) — nothing touches the API.

export interface UserSound {
  id: string;
  name: string;
  /** file:// URI of the copied audio in the document directory. */
  uri: string;
}

const INDEX_KEY = "bp_user_sounds";
const DIR_NAME = "user-sounds";

function soundsDir(): Directory {
  return new Directory(Paths.document, DIR_NAME);
}

async function readIndex(): Promise<UserSound[]> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeIndex(list: UserSound[]): Promise<void> {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(list));
}

/** Returns saved sounds, pruning any whose files have gone missing. */
export async function listUserSounds(): Promise<UserSound[]> {
  const list = await readIndex();
  const valid = list.filter((s) => {
    try {
      return new File(s.uri).exists;
    } catch {
      return false;
    }
  });
  if (valid.length !== list.length) await writeIndex(valid);
  return valid;
}

/** Opens the system file picker, copies the chosen audio locally, and saves it.
 *  Returns the new sound, or null if the user cancelled. */
export async function pickAndSaveUserSound(): Promise<UserSound | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "audio/*",
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];

  const dir = soundsDir();
  if (!dir.exists) dir.create({ intermediates: true });

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ext = (asset.name.match(/\.[^.]+$/)?.[0] ?? ".m4a").toLowerCase();
  const dest = new File(dir, `${id}${ext}`);

  const src = new File(asset.uri);
  await src.copy(dest);

  const sound: UserSound = {
    id,
    name: asset.name.replace(/\.[^.]+$/, "") || "Sound",
    uri: dest.uri,
  };
  const list = await readIndex();
  await writeIndex([...list, sound]);
  return sound;
}

export async function deleteUserSound(id: string): Promise<void> {
  const list = await readIndex();
  const target = list.find((s) => s.id === id);
  if (target) {
    try {
      const file = new File(target.uri);
      if (file.exists) file.delete();
    } catch {
      // file already gone
    }
  }
  await writeIndex(list.filter((s) => s.id !== id));
}
