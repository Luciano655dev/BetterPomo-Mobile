import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { Segmented } from "@/components/ui/Segmented";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { useConversations, useFriends, useGroupInvitations, useInvalidate, type Conversation, type PendingGroupInvitation } from "@/lib/hooks";
import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

const GROUP_EMOJIS = ["👥", "🎯", "🚀", "💻", "📚", "🧠", "🌱", "🔥", "⚡", "🎨", "🎵", "🌍"];

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
  const { invalidateChat } = useInvalidate();
  const { data: conversations, isLoading, error, mutate } = useConversations();
  const { data: invitations, isLoading: invitationsLoading, mutate: mutateInvitations } = useGroupInvitations();
  const [refreshing, setRefreshing] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [tab, setTab] = useState<"chats" | "invites">("chats");
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);

  async function respond(invitationId: string, accept: boolean) {
    setInviteBusy(invitationId);
    try {
      const result = await api.post<{ conversation_id: string }>(
        `/api/chat/group-invitations/${invitationId}/${accept ? "accept" : "decline"}`,
      );
      await mutateInvitations();
      invalidateChat();
      if (accept) router.push(`/messages/${result.conversation_id}`);
      else dialog.toast("Invitation declined", "success");
    } catch (cause) {
      dialog.toast(cause instanceof Error ? cause.message : "Could not update the invitation", "error");
    } finally {
      setInviteBusy(null);
    }
  }

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
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <Segmented
          options={[
            { value: "chats", label: "Chats" },
            { value: "invites", label: `Invites${invitations?.length ? ` · ${invitations.length}` : ""}` },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {tab === "invites" ? (
        invitationsLoading && !invitations ? (
          <View style={{ padding: 20, gap: 10 }}>{[0, 1, 2].map((value) => <Skeleton key={value} height={78} round={radius.xl} />)}</View>
        ) : (
          <FlatList
            data={invitations ?? []}
            keyExtractor={(invitation) => invitation.id}
            contentContainerStyle={{ padding: 20, gap: 10, paddingBottom: 40 }}
            ListEmptyComponent={<EmptyState emoji="✉️" title="No group invitations" subtitle="Invitations from teams and study groups will appear here." />}
            renderItem={({ item }) => <GroupInvitationRow invitation={item} busy={inviteBusy !== null} onRespond={respond} />}
          />
        )
      ) : isLoading && !conversations ? (
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

function GroupInvitationRow({ invitation, busy, onRespond }: { invitation: PendingGroupInvitation; busy: boolean; onRespond: (id: string, accept: boolean) => void }) {
  const { colors } = useTheme();
  return <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}><EmojiAvatar emoji={invitation.group?.emoji ?? "👥"} size={46} /><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: colors.foreground, fontFamily: fonts.sansSemiBold, fontSize: 14 }}>{invitation.group?.title ?? "Group invitation"}</Text><Text numberOfLines={2} style={{ color: colors.mutedForeground, fontFamily: fonts.sans, fontSize: 11, marginTop: 2 }}>{invitation.inviter ? `${invitation.inviter.display_name} (@${invitation.inviter.username}) invited you` : "You were invited"}</Text></View><View style={{ flexDirection: "row", gap: 6 }}><Pressable disabled={busy} onPress={() => onRespond(invitation.id, false)} style={[styles.inviteAction, { borderColor: colors.border }]}><Ionicons name="close" size={18} color={colors.foreground} /></Pressable><Pressable disabled={busy} onPress={() => onRespond(invitation.id, true)} style={[styles.inviteAction, { backgroundColor: colors.primary, borderColor: colors.primary }]}><Ionicons name="checkmark" size={18} color={colors.primaryForeground} /></Pressable></View></View>;
}

function ConversationRow({ convo, onPress }: { convo: Conversation; onPress: () => void }) {
  const { colors } = useTheme();
  const title = convo.is_group
    ? convo.title || convo.members.map((m) => m.display_name ?? m.username).join(", ") || "Group"
    : (convo.members[0]?.display_name ?? convo.members[0]?.username ?? "Chat");
  const emoji = convo.is_group ? (convo.emoji ?? "👥") : (convo.members[0]?.emoji ?? "🍅");
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
  const [mode, setMode] = useState<"direct" | "group">("direct");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("👥");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; username: string; display_name: string; emoji: string }[]
  >([]);
  const [busy, setBusy] = useState(false);

  const friends = data?.friends ?? [];

  useEffect(() => {
    if (!open || mode !== "group" || query.trim().length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api.get<{ results: { id: string; username: string; display_name: string; emoji: string }[] }>(
        `/api/users/search?q=${encodeURIComponent(query.trim())}&page=1&limit=12`,
      )
        .then((payload) => {
          if (!cancelled) setResults(payload.results ?? []);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mode, open, query]);

  function changeMode(next: "direct" | "group") {
    setMode(next);
    setSelected(new Set());
    setQuery("");
    setResults([]);
  }

  function toggle(username: string) {
    setSelected((prev) => {
      if (mode === "direct") return new Set([username]);
      const next = new Set(prev);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      return next;
    });
  }

  async function start() {
    const names = [...selected];
    if (busy || (mode === "direct" && names.length !== 1) || (mode === "group" && !title.trim())) return;
    setBusy(true);
    try {
      let id: string;
      if (mode === "direct") {
        ({ id } = await api.post<{ id: string }>("/api/chat/conversations/direct", {
          username: names[0],
        }));
      } else {
        ({ id } = await api.post<{ id: string }>("/api/chat/conversations/group", {
          usernames: names,
          title: title.trim(),
          emoji,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        }));
      }
      invalidateChat();
      setSelected(new Set());
      setTitle("");
      setEmoji("👥");
      setQuery("");
      setResults([]);
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
            New conversation
          </Text>
          <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sans, marginBottom: 12 }}>
            Start a private chat or create a governed group.
          </Text>

          <Segmented
            options={[{ value: "direct", label: "Direct" }, { value: "group", label: "Group" }]}
            value={mode}
            onChange={changeMode}
          />

          {mode === "direct" && friends.length === 0 ? (
            <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sans, textAlign: "center", paddingVertical: 20 }}>
              Add a friend first to start a direct message.
            </Text>
          ) : mode === "direct" ? (
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
          ) : (
            <View style={{ gap: 10, marginTop: 12 }}>
              <TextInput
                placeholder="Group name"
                placeholderTextColor={colors.mutedForeground}
                value={title}
                onChangeText={setTitle}
                maxLength={80}
                style={[styles.titleInput, { borderColor: colors.border, color: colors.foreground, fontFamily: fonts.sans }]}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
                {GROUP_EMOJIS.map((option) => (
                  <Pressable key={option} accessibilityRole="button" accessibilityLabel={`Use ${option} as group emoji`} accessibilityState={{ selected: emoji === option }} onPress={() => setEmoji(option)} style={[styles.groupEmoji, { borderColor: emoji === option ? colors.foreground : colors.border, backgroundColor: emoji === option ? colors.muted : "transparent" }]}>
                    <Text style={{ fontSize: 20 }}>{option}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <TextInput
                placeholder="Search any BetterPomo user to invite"
                placeholderTextColor={colors.mutedForeground}
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                style={[styles.titleInput, { borderColor: colors.border, color: colors.foreground, fontFamily: fonts.sans }]}
              />
              <Text style={{ color: colors.mutedForeground, fontFamily: fonts.sans, fontSize: 11 }}>
                Invitations require acceptance. You can also invite people later.
              </Text>
              <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
                {(query.trim().length >= 2 ? results : []).map((person) => {
                  const isSelected = selected.has(person.username);
                  return (
                    <Pressable key={person.id} onPress={() => toggle(person.username)} style={styles.friendRow}>
                      <Text style={{ fontSize: 20 }}>{person.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontFamily: fonts.sansMedium, color: colors.foreground }}>{person.display_name}</Text>
                        <Text style={{ fontSize: 11, fontFamily: fonts.mono, color: colors.mutedForeground }}>@{person.username}</Text>
                      </View>
                      <Ionicons name={isSelected ? "checkmark-circle" : "ellipse-outline"} size={20} color={isSelected ? colors.foreground : colors.mutedForeground} />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <Button
            title={mode === "group" ? (selected.size ? `Create & invite ${selected.size}` : "Create group") : "Start chat"}
            onPress={start}
            loading={busy}
            disabled={mode === "direct" ? selected.size !== 1 : !title.trim()}
            style={{ marginTop: 12 }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  inviteAction: { width: 34, height: 34, borderWidth: 1, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
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
  groupEmoji: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
});
