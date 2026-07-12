import { Ionicons } from "@expo/vector-icons";
import { randomUUID } from "expo-crypto";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { readNotes, writeNotes, type StoredNotes } from "@/lib/notes-storage";
import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

export function NotesPanel({ sessionId, userId }: { sessionId: string; userId: string }) {
  const { colors } = useTheme();
  const [notes, setNotes] = useState<StoredNotes>({ note: "", todos: [] });
  const [draft, setDraft] = useState("");
  const loaded = useRef(false);

  useEffect(() => {
    readNotes(sessionId, userId).then((n) => {
      setNotes(n);
      loaded.current = true;
    });
  }, [sessionId, userId]);

  useEffect(() => {
    if (!loaded.current) return;
    writeNotes(sessionId, userId, notes);
  }, [notes, sessionId, userId]);

  function addTodo() {
    const text = draft.trim();
    if (!text) return;
    setNotes((c) => ({ ...c, todos: [...c.todos, { id: randomUUID(), text, done: false }] }));
    setDraft("");
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[styles.heading, { color: colors.mutedForeground, fontFamily: fonts.sansMedium }]}>
        NOTES
      </Text>
      <TextInput
        value={notes.note}
        onChangeText={(t) => setNotes((c) => ({ ...c, note: t }))}
        placeholder="Write notes for this session"
        placeholderTextColor={colors.mutedForeground}
        multiline
        style={[
          styles.noteInput,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            color: colors.foreground,
            fontFamily: fonts.sans,
          },
        ]}
      />

      <Text style={[styles.heading, { color: colors.mutedForeground, fontFamily: fonts.sansMedium }]}>
        TODO
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={addTodo}
          placeholder="Add an item"
          placeholderTextColor={colors.mutedForeground}
          returnKeyType="done"
          style={[
            styles.todoInput,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              color: colors.foreground,
              fontFamily: fonts.sans,
            },
          ]}
        />
        <Pressable
          onPress={addTodo}
          style={[styles.addBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
        >
          <Ionicons name="add" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <View style={{ gap: 2 }}>
        {notes.todos.map((item) => (
          <View key={item.id} style={styles.todoRow}>
            <Pressable
              onPress={() =>
                setNotes((c) => ({
                  ...c,
                  todos: c.todos.map((t) => (t.id === item.id ? { ...t, done: !t.done } : t)),
                }))
              }
              style={[
                styles.checkbox,
                { borderColor: colors.border },
                item.done && { backgroundColor: colors.foreground, borderColor: colors.foreground },
              ]}
            >
              {item.done && <Ionicons name="checkmark" size={13} color={colors.background} />}
            </Pressable>
            <Text
              style={{
                flex: 1,
                fontSize: 14,
                fontFamily: fonts.sans,
                color: item.done ? colors.mutedForeground : colors.foreground,
                textDecorationLine: item.done ? "line-through" : "none",
              }}
            >
              {item.text}
            </Text>
            <Pressable
              onPress={() =>
                setNotes((c) => ({ ...c, todos: c.todos.filter((t) => t.id !== item.id) }))
              }
              hitSlop={8}
            >
              <Ionicons name="trash-outline" size={15} color={colors.mutedForeground} />
            </Pressable>
          </View>
        ))}
        {!notes.todos.length && (
          <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sans, paddingVertical: 8 }}>
            No todos yet — completed tasks show up in your session recap.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  heading: { fontSize: 10, letterSpacing: 2 },
  noteInput: {
    minHeight: 90,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 12,
    fontSize: 14,
    textAlignVertical: "top",
  },
  todoInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  todoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 7,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});
