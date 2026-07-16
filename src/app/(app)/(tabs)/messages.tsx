import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmojiAvatar } from "@/components/ui/EmojiAvatar";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { useConversations, useFriends, useInvalidate, type Conversation } from "@/lib/hooks";
import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

function fmtWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function MessagesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { data: conversations, isLoading, error, mutate } = useConversations();
  const [refreshing, setRefreshing] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  return (
    <Screen
      title="Messages"
      right={
        <Pressable
          onPress={() => setNewOpen(true)}
          hitSlop={8}
          style={[styles.newBtn, { backgroundColor: colors.primary }]}
        >
          <Ionicons name="create-outline" size={17} color={colors.primaryForeground} />
        </Pressable>
      }
    >
      {isLoading && !conversations ? (
        <View style={{ padding: 20, gap: 10 }}>
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} height={64} round={radius.lg} />
          ))}
        </View>
      ) : error && !conversations ? (
        <ErrorState
          title="Couldn't load messages"
          subtitle="Check your connection and try again."
          onRetry={() => mutate()}
        />
      ) : (
        <FlatList
          data={conversations ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 20, gap: 10, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await mutate();
                setRefreshing(false);
              }}
            />
          }
          ListEmptyComponent={
            <EmptyState
              emoji="💬"
              title="No conversations yet"
              subtitle="Message a friend — messages disappear after 24 hours."
            />
          }
          renderItem={({ item }) => (
            <ConversationRow convo={item} onPress={() => router.push(`/messages/${item.id}`)} />
          )}
        />
      )}

      <NewConversationModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(id) => {
          setNewOpen(false);
          router.push(`/messages/${id}`);
        }}
      />
    </Screen>
  );
}

function ConversationRow({ convo, onPress }: { convo: Conversation; onPress: () => void }) {
  const { colors } = useTheme();
  const title = convo.is_group
    ? convo.title || convo.members.map((m) => m.display_name ?? m.username).join(", ") || "Group"
    : (convo.members[0]?.display_name ?? convo.members[0]?.username ?? "Chat");
  const emoji = convo.is_group ? "👥" : (convo.members[0]?.emoji ?? "🍅");
  const preview =
    convo.last_message_kind === "session_invite"
      ? "📅 Session invite"
      : (convo.last_message_preview ?? "No messages yet");

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <EmojiAvatar emoji={emoji} size={42} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 14,
              fontFamily: convo.unread_count > 0 ? fonts.sansBold : fonts.sansSemiBold,
              color: colors.foreground,
              flexShrink: 1,
            }}
          >
            {title}
          </Text>
          <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: fonts.sans }}>
            {convo.last_message_at ? fmtWhen(convo.last_message_at) : ""}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: 12,
              color: colors.mutedForeground,
              fontFamily: convo.unread_count > 0 ? fonts.sansSemiBold : fonts.sans,
            }}
          >
            {preview}
          </Text>
          {convo.unread_count > 0 && (
            <View style={[styles.unreadBadge, { backgroundColor: colors.destructive }]}>
              <Text style={{ fontSize: 10, color: "#fff", fontFamily: fonts.sansBold }}>
                {convo.unread_count > 99 ? "99+" : convo.unread_count}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

// ── New conversation modal ────────────────────────────────────────────────────

function NewConversationModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}) {
  const { colors } = useTheme();
  const { data } = useFriends();
  const { invalidateChat } = useInvalidate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const friends = data?.friends ?? [];

  function toggle(username: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      return next;
    });
  }

  async function start() {
    const names = [...selected];
    if (names.length === 0 || busy) return;
    setBusy(true);
    try {
      let id: string;
      if (names.length === 1) {
        ({ id } = await api.post<{ id: string }>("/api/chat/conversations/direct", {
          username: names[0],
        }));
      } else {
        ({ id } = await api.post<{ id: string }>("/api/chat/conversations/group", {
          usernames: names,
          ...(title.trim() ? { title: title.trim() } : {}),
        }));
      }
      invalidateChat();
      setSelected(new Set());
      setTitle("");
      onCreated(id);
    } catch (e) {
      dialog.toast(e instanceof Error ? e.message : "Could not start conversation", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable
          style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={{ fontSize: 16, fontFamily: fonts.sansSemiBold, color: colors.foreground, marginBottom: 4 }}>
            New message
          </Text>
          <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sans, marginBottom: 12 }}>
            Pick one friend for a DM, or several for a group.
          </Text>

          {friends.length === 0 ? (
            <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sans, textAlign: "center", paddingVertical: 20 }}>
              Add some friends first — you can only message friends.
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 300 }}>
              {friends.map((f) => {
                const isSelected = selected.has(f.username);
                return (
                  <Pressable key={f.id} onPress={() => toggle(f.username)} style={styles.friendRow}>
                    <Text style={{ fontSize: 20 }}>{f.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontFamily: fonts.sansMedium, color: colors.foreground }}>{f.display_name}</Text>
                      <Text style={{ fontSize: 11, fontFamily: fonts.mono, color: colors.mutedForeground }}>@{f.username}</Text>
                    </View>
                    <Ionicons
                      name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                      size={20}
                      color={isSelected ? colors.foreground : colors.mutedForeground}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {selected.size > 1 && (
            <TextInput
              placeholder="Group name (optional)"
              placeholderTextColor={colors.mutedForeground}
              value={title}
              onChangeText={setTitle}
              style={[
                styles.titleInput,
                { borderColor: colors.border, color: colors.foreground, fontFamily: fonts.sans },
              ]}
            />
          )}

          <Button
            title={selected.size > 1 ? "Start group" : "Start chat"}
            onPress={start}
            loading={busy}
            disabled={selected.size === 0}
            style={{ marginTop: 12 }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  newBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  unreadBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    alignSelf: "stretch",
    borderWidth: 1,
    borderRadius: radius["2xl"],
    padding: 18,
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  titleInput: {
    height: 42,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    fontSize: 14,
    marginTop: 10,
  },
});
