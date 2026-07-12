// Personal per-session notes/todos, stored locally (mirrors the webapp's
// localStorage PersonalNotesPanel). Snapshotted into the history record on leave.
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

export interface StoredNotes {
  note: string;
  todos: TodoItem[];
}

const key = (sessionId: string, userId: string) =>
  `betterpomo:session-notes:${sessionId}:${userId}`;

export async function readNotes(sessionId: string, userId: string): Promise<StoredNotes> {
  try {
    const raw = await AsyncStorage.getItem(key(sessionId, userId));
    if (!raw) return { note: "", todos: [] };
    const parsed = JSON.parse(raw) as Partial<StoredNotes>;
    return {
      note: typeof parsed.note === "string" ? parsed.note : "",
      todos: Array.isArray(parsed.todos) ? parsed.todos.filter((t) => t.text) : [],
    };
  } catch {
    return { note: "", todos: [] };
  }
}

export async function writeNotes(sessionId: string, userId: string, notes: StoredNotes) {
  try {
    await AsyncStorage.setItem(key(sessionId, userId), JSON.stringify(notes));
  } catch {
    // storage full/unavailable — notes are best-effort
  }
}

/** Tasks snapshot for the history record (text + done only). */
export async function readTasks(
  sessionId: string,
  userId: string,
): Promise<{ text: string; done: boolean }[]> {
  const { todos } = await readNotes(sessionId, userId);
  return todos
    .filter((t) => typeof t.text === "string" && !!t.text.trim())
    .map((t) => ({ text: t.text, done: t.done === true }));
}
