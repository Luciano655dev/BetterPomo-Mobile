import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Button } from "@/components/ui/Button";
import { dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Segmented } from "@/components/ui/Segmented";
import { StackHeader } from "@/components/ui/StackHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import {
  useFriendRequests,
  useInvalidate,
  useNotifications,
  type AppNotification,
} from "@/lib/hooks";
import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

type Tab = "all" | "requests";

/** Maps a notification row to display text + destination (port of webapp util). */
function describeNotification(n: AppNotification): { emoji: string; text: string; href: Href | null } {
  const who = n.metadata.username ?? "Someone";
  const emoji = n.metadata.emoji ?? "🔔";
  switch (n.type) {
    case "friend_request":
      return { emoji, text: `${who} sent you a friend request`, href: null }; // → requests tab
    case "friend_accept":
      return { emoji, text: `${who} accepted your friend request`, href: `/u/${encodeURIComponent(who)}` as Href };
    case "session_invite":
      return {
        emoji,
        text: `${who} invited you to ${n.metadata.name ?? "a session"}`,
        href: (n.metadata.conversation_id ? `/messages/${n.metadata.conversation_id}` : null) as Href | null,
      };
    case "group_add":
      return {
        emoji,
        text: `${who} added you to ${n.metadata.title || "a group"}`,
        href: (n.entity_id ? `/messages/${n.entity_id}` : null) as Href | null,
      };
    case "trial_ending":
      return {
        emoji: "✨",
        text: "Your Pro trial ends in 2 days — your subscription starts then. Manage it anytime in Settings.",
        href: "/settings" as Href,
      };
    default:
      return { emoji, text: "New notification", href: null };
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>("all");
  const { data: reqs } = useFriendRequests();
  const incomingCount = reqs?.incoming.length ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StackHeader title="Notifications" />
      <View style={{ paddingHorizontal: 20, paddingTop: 12, marginBottom: 4 }}>
        <Segmented<Tab>
          options={[
            { value: "all", label: "All" },
            { value: "requests", label: incomingCount > 0 ? `Requests (${incomingCount})` : "Requests" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {tab === "all" ? <AllList onOpenRequests={() => setTab("requests")} /> : <RequestsList />}
    </View>
  );
}

// ── All notifications ─────────────────────────────────────────────────────────

function AllList({ onOpenRequests }: { onOpenRequests: () => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  const { data, isLoading, error, mutate } = useNotifications();
  const { invalidateNotifications } = useInvalidate();
  const [refreshing, setRefreshing] = useState(false);

  const notifications = data?.notifications ?? [];
  const unread = data?.unread_count ?? 0;

  async function markAllRead() {
    try {
      await api.post("/api/notifications/read");
      invalidateNotifications();
    } catch {
      // best-effort
    }
  }

  async function open(n: AppNotification) {
    if (!n.read_at) {
      api.post(`/api/notifications/${n.id}/read`).then(invalidateNotifications).catch(() => {});
    }
    const { href } = describeNotification(n);
    if (n.type === "friend_request") onOpenRequests();
    else if (href) router.push(href);
  }

  async function dismiss(n: AppNotification) {
    try {
      await api.delete(`/api/notifications/${n.id}`);
      invalidateNotifications();
    } catch {
      dialog.toast("Failed to dismiss", "error");
    }
  }

  if (isLoading && !data) {
    return (
      <View style={{ padding: 20, gap: 10 }}>
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} height={56} round={radius.lg} />
        ))}
      </View>
    );
  }

  if (error && !data) {
    return (
      <ErrorState
        title="Couldn't load notifications"
        subtitle="Check your connection and try again."
        onRetry={() => mutate()}
      />
    );
  }

  return (
    <FlatList
      data={notifications}
      keyExtractor={(n) => n.id}
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
      ListHeaderComponent={
        unread > 0 ? (
          <Pressable onPress={markAllRead} style={{ alignSelf: "flex-end", marginBottom: 2 }} hitSlop={8}>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sansMedium, textDecorationLine: "underline" }}>
              Mark all read
            </Text>
          </Pressable>
        ) : null
      }
      ListEmptyComponent={<EmptyState emoji="🔔" title="You're all caught up" />}
      renderItem={({ item: n }) => {
        const { emoji, text } = describeNotification(n);
        const isUnread = !n.read_at;
        return (
          <Pressable
            onPress={() => open(n)}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: colors.card,
                borderColor: isUnread ? colors.foreground + "33" : colors.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={{ fontSize: 22 }}>{emoji}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: isUnread ? fonts.sansSemiBold : fonts.sans,
                  color: colors.foreground,
                  lineHeight: 18,
                }}
              >
                {text}
              </Text>
              <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: fonts.sans, marginTop: 1 }}>
                {relativeTime(n.created_at)}
              </Text>
            </View>
            {isUnread && <View style={[styles.unreadDot, { backgroundColor: colors.destructive }]} />}
            <Pressable onPress={() => dismiss(n)} hitSlop={8}>
              <Ionicons name="close" size={15} color={colors.mutedForeground} />
            </Pressable>
          </Pressable>
        );
      }}
    />
  );
}

// ── Friend requests ───────────────────────────────────────────────────────────

function RequestsList() {
  const { colors } = useTheme();
  const router = useRouter();
  const { data, isLoading, error, mutate } = useFriendRequests();
  const { invalidateFriends, invalidateNotifications } = useInvalidate();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    try {
      await action();
      invalidateFriends();
      invalidateNotifications();
    } catch (e) {
      dialog.toast(e instanceof Error ? e.message : "Something went wrong", "error");
    } finally {
      setBusyId(null);
    }
  }

  const incoming = data?.incoming ?? [];
  const outgoing = data?.outgoing ?? [];

  if (isLoading && !data) {
    return (
      <View style={{ padding: 20, gap: 10 }}>
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} height={56} round={radius.lg} />
        ))}
      </View>
    );
  }

  if (error && !data) {
    return (
      <ErrorState
        title="Couldn't load requests"
        subtitle="Check your connection and try again."
        onRetry={() => mutate()}
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 40 }}
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
    >
      <View style={{ gap: 8 }}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          INCOMING ({incoming.length})
        </Text>
        {incoming.length === 0 ? (
          <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sans }}>
            No incoming requests.
          </Text>
        ) : (
          incoming.map((r) => (
            <View key={r.id} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Pressable
                onPress={() => router.push(`/u/${encodeURIComponent(r.username)}`)}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}
              >
                <Text style={{ fontSize: 22 }}>{r.emoji}</Text>
                <Text numberOfLines={1} style={{ fontSize: 14, fontFamily: fonts.sansMedium, color: colors.foreground, flexShrink: 1 }}>
                  {r.username}
                </Text>
              </Pressable>
              <Button
                title="Accept"
                size="sm"
                loading={busyId === r.id}
                onPress={() => run(r.id, () => api.post(`/api/friends/requests/${r.id}/accept`))}
              />
              <Button
                title="Decline"
                size="sm"
                variant="outline"
                disabled={busyId === r.id}
                onPress={() => run(r.id, () => api.post(`/api/friends/requests/${r.id}/decline`))}
              />
            </View>
          ))
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          OUTGOING ({outgoing.length})
        </Text>
        {outgoing.length === 0 ? (
          <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sans }}>
            No outgoing requests.
          </Text>
        ) : (
          outgoing.map((r) => (
            <View key={r.id} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Pressable
                onPress={() => router.push(`/u/${encodeURIComponent(r.username)}`)}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}
              >
                <Text style={{ fontSize: 22 }}>{r.emoji}</Text>
                <Text numberOfLines={1} style={{ fontSize: 14, fontFamily: fonts.sansMedium, color: colors.foreground, flexShrink: 1 }}>
                  {r.username}
                </Text>
              </Pressable>
              <Button
                title="Cancel"
                size="sm"
                variant="outline"
                loading={busyId === r.id}
                onPress={() => run(r.id, () => api.delete(`/api/friends/requests/${r.id}`))}
              />
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 2,
    fontFamily: "PlusJakartaSans_500Medium",
  },
});
