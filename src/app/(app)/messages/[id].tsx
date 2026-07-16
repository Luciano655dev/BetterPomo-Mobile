import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/Segmented";
import { api } from "@/lib/api";
import {
  useConversations,
  useFriends,
  useInvalidate,
  useProfile,
  useSessions,
  type ChatMessage,
} from "@/lib/hooks";
import { uniqueChannel } from "@/lib/realtime";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

type Msg = ChatMessage & { sender?: { username: string; display_name: string; emoji: string } | null };

export default function ChatThreadScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: profile } = useProfile();
  const { data: conversations } = useConversations();
  const { invalidateChat } = useInvalidate();

  const viewerId = profile?.id ?? null;
  const viewerEmoji = profile?.emoji ?? "🍅";

  const invalidateChatRef = useRef(invalidateChat);
  useEffect(() => {
    invalidateChatRef.current = invalidateChat;
  });

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const convo = conversations?.find((c) => c.id === conversationId);
  const title = convo
    ? convo.is_group
      ? convo.title || convo.members.map((m) => m.display_name ?? m.username).join(", ") || "Group"
      : (convo.members[0]?.display_name ?? convo.members[0]?.username ?? "Chat")
    : "Chat";

  // Initial load + realtime subscription (mirrors webapp ChatThread).
  useEffect(() => {
    if (!conversationId || !viewerId) return;
    let cancelled = false;

    api
      .get<Msg[]>(`/api/chat/conversations/${conversationId}/messages`)
      .then(async (data) => {
        if (cancelled) return;
        const msgs = data ?? [];
        const ids = [...new Set(msgs.filter((m) => m.sender_id !== viewerId).map((m) => m.sender_id))];
        if (ids.length === 0) {
          setMessages(msgs);
          return;
        }
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username, display_name, emoji")
          .in("id", ids);
        if (cancelled) return;
        const byId = new Map<string, { username: string; display_name: string; emoji: string }>(
          (profiles ?? []).map((p) => [
            p.id as string,
            { username: p.username as string, display_name: (p.display_name ?? p.username) as string, emoji: p.emoji as string },
          ]),
        );
        setMessages(msgs.map((m) => ({ ...m, sender: byId.get(m.sender_id) ?? null })));
      })
      .catch(() => {
        // Bad connection on open — don't leave an unhandled rejection or a
        // silently-empty thread; surface it. New messages still arrive live via
        // the realtime channel below, and reopening the chat refetches history.
        if (!cancelled) dialog.toast("Couldn't load messages", "error");
      });
    api
      .post(`/api/chat/conversations/${conversationId}/read`)
      .then(() => invalidateChatRef.current())
      .catch(() => {});

    const channel = uniqueChannel(supabase, `dm:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_messages", filter: `conversation_id=eq.${conversationId}` },
        async (payload) => {
          const m = payload.new as ChatMessage;
          const { data: sender } = await supabase
            .from("profiles")
            .select("username, display_name, emoji")
            .eq("id", m.sender_id)
            .single();
          if (cancelled) return;
          setMessages((prev) =>
            prev.some((x) => x.id === m.id) ? prev : [...prev, { ...m, sender }],
          );
          if (m.sender_id !== viewerId) {
            api
              .post(`/api/chat/conversations/${conversationId}/read`)
              .then(() => invalidateChatRef.current())
              .catch(() => {});
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [conversationId, viewerId]);

  async function sendMessage() {
    const content = input.trim();
    if (!content || sending || !conversationId) return;
    setSending(true);
    setInput("");
    try {
      const saved = await api.post<Msg>(`/api/chat/conversations/${conversationId}/messages`, {
        content,
      });
      setMessages((prev) => (prev.some((m) => m.id === saved.id) ? prev : [...prev, saved]));
      invalidateChat();
    } catch {
      setInput(content);
      dialog.toast("Message failed to send", "error");
    } finally {
      setSending(false);
    }
  }

  async function joinInvite(m: Msg) {
    const sessionId = m.metadata?.session_id;
    const code = m.metadata?.code;
    if (!sessionId || !code) return;
    try {
      await api.post(`/api/sessions/${sessionId}/accept-invite`);
      router.push(`/session/${code}`);
    } catch (e) {
      dialog.toast(e instanceof Error ? e.message : "Could not join session", "error");
    }
  }

  async function confirmLeaveGroup() {
    const ok = await dialog.confirm({
      title: "Leave group",
      message: "You'll stop receiving messages from this group.",
      confirmText: "Leave",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/chat/conversations/${conversationId}/members/me`);
      invalidateChat();
      router.back();
    } catch (e) {
      dialog.toast(e instanceof Error ? e.message : "Could not leave", "error");
    }
  }

  const inverted = [...messages].reverse();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontFamily: fonts.sansSemiBold, color: colors.foreground }}>
          {title}
        </Text>
        <Pressable onPress={() => setInviteOpen(true)} hitSlop={8}>
          <Ionicons name="calendar-outline" size={20} color={colors.mutedForeground} />
        </Pressable>
        {convo?.is_group && (
          <>
            <Pressable onPress={() => setAddOpen(true)} hitSlop={8}>
              <Ionicons name="person-add-outline" size={19} color={colors.mutedForeground} />
            </Pressable>
            <Pressable onPress={confirmLeaveGroup} hitSlop={8}>
              <Ionicons name="log-out-outline" size={20} color={colors.mutedForeground} />
            </Pressable>
          </>
        )}
      </View>

      {/* Messages */}
      <FlatList
        data={inverted}
        inverted
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={{ transform: [{ scaleY: -1 }], alignItems: "center", paddingVertical: 40, gap: 6 }}>
            <Ionicons name="chatbubbles-outline" size={30} color={colors.mutedForeground} />
            <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sans }}>
              No messages yet · messages disappear after 24h
            </Text>
          </View>
        }
        renderItem={({ item: m }) => {
          const isOwn = m.sender_id === viewerId;
          const emoji = isOwn ? viewerEmoji : (m.sender?.emoji ?? "🍅");
          const username = m.sender?.username ?? "Unknown";
          const displayName = m.sender?.display_name ?? username;

          if (m.kind === "session_invite") {
            return (
              <View style={{ alignItems: "center", marginVertical: 6 }}>
                <View style={[styles.inviteCard, { borderColor: colors.border, backgroundColor: colors.muted + "66" }]}>
                  <Ionicons name="calendar-outline" size={22} color={colors.mutedForeground} />
                  <Text style={{ fontSize: 13, color: colors.foreground, fontFamily: fonts.sans, textAlign: "center" }}>
                    <Text style={{ fontFamily: fonts.sansSemiBold }}>{isOwn ? "You" : displayName}</Text>{" "}
                    invited to a {m.metadata?.session_type === "stopwatch" ? "stopwatch" : "pomodoro"} session
                  </Text>
                  <Text style={{ fontSize: 15, fontFamily: fonts.sansSemiBold, color: colors.foreground }}>
                    {m.metadata?.name}
                  </Text>
                  <Button title="Join session" size="sm" onPress={() => joinInvite(m)} />
                </View>
              </View>
            );
          }

          return (
            <View style={[styles.msgRow, isOwn && { flexDirection: "row-reverse" }]}>
              <Text style={{ fontSize: 18 }}>{emoji}</Text>
              <View style={{ maxWidth: "78%", alignItems: isOwn ? "flex-end" : "flex-start" }}>
                {!isOwn && (
                  <Pressable onPress={() => router.push(`/u/${encodeURIComponent(username)}`)}>
                    <Text style={{ fontSize: 10, color: colors.mutedForeground, marginBottom: 2, fontFamily: fonts.sans }}>
                      {displayName} <Text style={{ fontFamily: fonts.mono }}>@{username}</Text>
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
                    {m.content}
                  </Text>
                </View>
              </View>
            </View>
          );
        }}
      />

      {/* Composer */}
      <View
        style={[
          styles.composer,
          { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 10) },
        ]}
      >
        <TextInput
          placeholder="Message…"
          placeholderTextColor={colors.mutedForeground}
          value={input}
          onChangeText={setInput}
          maxLength={2000}
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

      <InviteToSessionModal
        conversationId={conversationId ?? ""}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
      {convo?.is_group && (
        <AddMemberModal
          conversationId={conversationId ?? ""}
          open={addOpen}
          onClose={() => setAddOpen(false)}
          existing={convo.members.map((m) => m.id)}
        />
      )}
    </KeyboardAvoidingView>
  );
}

// ── Invite to session ─────────────────────────────────────────────────────────

function InviteToSessionModal({
  conversationId,
  open,
  onClose,
}: {
  conversationId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const { data: sessions } = useSessions();
  const { invalidateChat, invalidateSessions } = useInvalidate();
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"pomodoro" | "stopwatch">("pomodoro");

  async function invite(sessionId: string) {
    setBusy(true);
    try {
      await api.post(`/api/chat/conversations/${conversationId}/invite`, { session_id: sessionId });
      invalidateChat();
      onClose();
    } catch (e) {
      dialog.toast(e instanceof Error ? e.message : "Could not invite", "error");
    } finally {
      setBusy(false);
    }
  }

  async function createAndInvite() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const { session_id, code } = await api.post<{ session_id: string; code: string }>(
        "/api/sessions",
        { name, session_type: newType },
      );
      await api.post(`/api/chat/conversations/${conversationId}/invite`, { session_id });
      invalidateSessions();
      invalidateChat();
      onClose();
      setNewName("");
      router.push(`/session/${code}`);
    } catch (e) {
      dialog.toast(e instanceof Error ? e.message : "Could not create session", "error");
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
          <Text style={{ fontSize: 16, fontFamily: fonts.sansSemiBold, color: colors.foreground, marginBottom: 14 }}>
            Invite to a session
          </Text>

          <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>NEW SESSION</Text>
          <Segmented<"pomodoro" | "stopwatch">
            options={[
              { value: "pomodoro", label: "Pomodoro" },
              { value: "stopwatch", label: "Timer" },
            ]}
            value={newType}
            onChange={setNewType}
          />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <TextInput
              placeholder="Session name…"
              placeholderTextColor={colors.mutedForeground}
              value={newName}
              onChangeText={setNewName}
              maxLength={60}
              style={[
                styles.inviteInput,
                { borderColor: colors.border, color: colors.foreground, fontFamily: fonts.sans },
              ]}
            />
            <Button title="Create & invite" size="sm" onPress={createAndInvite} loading={busy} disabled={!newName.trim()} />
          </View>

          {sessions && sessions.length > 0 && (
            <>
              <Text style={[styles.modalLabel, { color: colors.mutedForeground, marginTop: 18 }]}>
                OR AN ACTIVE ONE
              </Text>
              <ScrollView style={{ maxHeight: 200 }}>
                {sessions.map((s) => (
                  <Pressable
                    key={s.session_id}
                    disabled={busy}
                    onPress={() => invite(s.pomodoro_sessions.id)}
                    style={[styles.sessionRow, { borderColor: colors.border }]}
                  >
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontFamily: fonts.sansMedium, color: colors.foreground }}>
                      {s.pomodoro_sessions.name}
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.mutedForeground, textTransform: "uppercase", fontFamily: fonts.sans }}>
                      {s.pomodoro_sessions.status}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Add member ────────────────────────────────────────────────────────────────

function AddMemberModal({
  conversationId,
  open,
  onClose,
  existing,
}: {
  conversationId: string;
  open: boolean;
  onClose: () => void;
  existing: string[];
}) {
  const { colors } = useTheme();
  const { data } = useFriends();
  const { invalidateChat } = useInvalidate();
  const [busy, setBusy] = useState(false);
  const candidates = (data?.friends ?? []).filter((f) => !existing.includes(f.id));

  async function add(username: string) {
    setBusy(true);
    try {
      await api.post(`/api/chat/conversations/${conversationId}/members`, { username });
      invalidateChat();
      onClose();
    } catch (e) {
      dialog.toast(e instanceof Error ? e.message : "Could not add", "error");
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
          <Text style={{ fontSize: 16, fontFamily: fonts.sansSemiBold, color: colors.foreground, marginBottom: 12 }}>
            Add a friend
          </Text>
          {candidates.length === 0 ? (
            <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sans, textAlign: "center", paddingVertical: 16 }}>
              No more friends to add.
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 300 }}>
              {candidates.map((f) => (
                <Pressable
                  key={f.id}
                  disabled={busy}
                  onPress={() => add(f.username)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 }}
                >
                  <Text style={{ fontSize: 20 }}>{f.emoji}</Text>
                  <Text style={{ fontSize: 14, fontFamily: fonts.sansMedium, color: colors.foreground }}>
                    {f.display_name} <Text style={{ color: colors.mutedForeground }}>@{f.username}</Text>
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  msgRow: { flexDirection: "row", gap: 8, marginVertical: 4, alignItems: "flex-start" },
  bubble: {
    borderRadius: radius.xl,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  inviteCard: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: 16,
    alignItems: "center",
    gap: 8,
    maxWidth: "88%",
    alignSelf: "center",
  },
  composer: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 10,
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
  modalLabel: {
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 8,
    fontFamily: "PlusJakartaSans_500Medium",
  },
  inviteInput: {
    flex: 1,
    height: 34,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    fontSize: 13,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 12,
    marginTop: 8,
  },
});
