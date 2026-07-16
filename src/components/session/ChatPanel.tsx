import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { api } from "@/lib/api";
import { uniqueChannel } from "@/lib/realtime";
import type { SessionChatMessage } from "@/lib/session-types";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

interface ChatPanelProps {
  sessionId: string;
  userId: string;
  userEmoji?: string;
  onOpenUser?: (username: string) => void;
}

export function ChatPanel({ sessionId, userId, userEmoji = "🍅", onOpenUser }: ChatPanelProps) {
  const { colors } = useTheme();
  const [messages, setMessages] = useState<SessionChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      api
        .get<SessionChatMessage[]>(`/api/sessions/${sessionId}/messages`)
        .then((data) => {
          if (active) setMessages(data ?? []);
        })
        .catch(() => null);
    load();

    const channel = uniqueChannel(supabase, `chat:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `session_id=eq.${sessionId}` },
        async (payload) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("username, display_name, emoji")
            .eq("id", payload.new.user_id)
            .single();
          if (!active) return;
          setMessages((prev) =>
            prev.some((m) => m.id === payload.new.id)
              ? prev
              : [...prev, { ...(payload.new as SessionChatMessage), profiles: profile }],
          );
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  async function sendMessage() {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setInput("");
    try {
      const saved = await api.post<SessionChatMessage>(`/api/sessions/${sessionId}/messages`, {
        content,
      });
      // Realtime may not echo our own insert before the next fetch — add locally.
      setMessages((prev) => (prev.some((m) => m.id === saved.id) ? prev : [...prev, saved]));
    } catch {
      setInput(content);
    } finally {
      setSending(false);
    }
  }

  // Inverted list: newest at the bottom without manual scroll management.
  const inverted = [...messages].reverse();

  return (
    <View style={styles.root}>
      <FlatList
        ref={listRef}
        data={inverted}
        inverted
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={{ transform: [{ scaleY: -1 }], alignItems: "center", paddingVertical: 24 }}>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sans }}>
              No messages yet
            </Text>
          </View>
        }
        renderItem={({ item: msg }) => {
          const isOwn = msg.user_id === userId;
          const emoji = isOwn ? userEmoji : (msg.profiles?.emoji ?? "🍅");
          const username = msg.profiles?.username ?? "Unknown";
          const displayName = msg.profiles?.display_name ?? username;
          return (
            <View style={[styles.msgRow, isOwn && { flexDirection: "row-reverse" }]}>
              <Text style={{ fontSize: 18 }}>{emoji}</Text>
              <View style={{ maxWidth: "78%", alignItems: isOwn ? "flex-end" : "flex-start" }}>
                {!isOwn && (
                  <Pressable onPress={onOpenUser ? () => onOpenUser(username) : undefined}>
                    <Text style={{ fontSize: 10, color: colors.mutedForeground, marginBottom: 2, fontFamily: fonts.sans }}>
                      {displayName} <Text style={{ color: colors.mutedForeground }}>@{username}</Text>
                    </Text>
                  </Pressable>
                )}
                <View
                  style={[
                    styles.bubble,
                    isOwn
                      ? { backgroundColor: colors.primary, borderTopRightRadius: radius.sm }
                      : { backgroundColor: colors.muted, borderTopLeftRadius: radius.sm },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontFamily: fonts.sans,
                      color: isOwn ? colors.primaryForeground : colors.foreground,
                    }}
                  >
                    {msg.content}
                  </Text>
                </View>
              </View>
            </View>
          );
        }}
      />

      <View style={[styles.composer, { borderTopColor: colors.border }]}>
        <TextInput
          placeholder="Message…"
          placeholderTextColor={colors.mutedForeground}
          value={input}
          onChangeText={setInput}
          maxLength={500}
          style={[
            styles.input,
            { backgroundColor: colors.muted, color: colors.foreground, fontFamily: fonts.sans },
          ]}
          onSubmitEditing={sendMessage}
          returnKeyType="send"
          submitBehavior="submit"
        />
        <Pressable
          onPress={sendMessage}
          disabled={sending || !input.trim()}
          style={[
            styles.sendBtn,
            { backgroundColor: colors.primary, opacity: sending || !input.trim() ? 0.4 : 1 },
          ]}
        >
          <Ionicons name="arrow-up" size={18} color={colors.primaryForeground} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  msgRow: { flexDirection: "row", gap: 8, marginVertical: 4, alignItems: "flex-start" },
  bubble: {
    borderRadius: radius.xl,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  composer: {
    flexDirection: "row",
    gap: 8,
    padding: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
  },
  input: {
    flex: 1,
    height: 38,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
