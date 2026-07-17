import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  AppState,
  FlatList,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
  useNotificationPreferences,
  type AppNotification,
  type NotificationPreferences,
} from "@/lib/hooks";
import {
  getNotificationPermissionStatus,
  registerPushDevice,
  requestNotificationPermission,
  setLocalTimerNotificationsEnabled,
} from "@/lib/notifications";
import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

type Tab = "all" | "requests" | "settings";

/** Maps a notification row to friendly copy + destination. */
function describeNotification(n: AppNotification): { emoji: string; title: string; text: string; href: Href | null } {
  const who = n.metadata.display_name ?? n.metadata.username ?? "Someone";
  const username = n.metadata.username ?? "";
  const identity = username && who !== username ? `${who} (@${username})` : who;
  const actorEmoji = n.metadata.emoji ?? "🍅";
  switch (n.type) {
    case "friend_request":
      return {
        emoji: "🤝",
        title: "New friend request",
        text: `${actorEmoji} ${identity} wants to focus with you`,
        href: null,
      }; // → requests tab
    case "friend_accept":
      return {
        emoji: "🎉",
        title: "You're focus friends!",
        text: `${actorEmoji} ${identity} accepted your friend request`,
        href: username ? `/u/${encodeURIComponent(username)}` as Href : null,
      };
    case "session_invite":
      return {
        emoji: "⏱️",
        title: "Ready to focus?",
        text: `${actorEmoji} ${identity} invited you to ${n.metadata.name ?? "a session"}`,
        href: (n.metadata.conversation_id ? `/messages/${n.metadata.conversation_id}` : null) as Href | null,
      };
    case "group_add":
      return {
        emoji: "💬",
        title: "You're in!",
        text: `${actorEmoji} ${identity} added you to ${n.metadata.title || "a group"}`,
        href: (n.entity_id ? `/messages/${n.entity_id}` : null) as Href | null,
      };
    case "trial_ending":
      return {
        emoji: "✨",
        title: "Your Pro trial ends soon",
        text: "Your subscription starts in 2 days. You can manage it anytime in Settings.",
        href: "/settings" as Href,
      };
    default:
      return { emoji: "🔔", title: "New notification", text: "Something new is waiting for you", href: null };
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
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(
    params.tab === "requests" || params.tab === "settings" ? params.tab : "all",
  );
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
            { value: "settings", label: "Settings" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {tab === "all" ? (
        <AllList onOpenRequests={() => setTab("requests")} />
      ) : tab === "requests" ? (
        <RequestsList />
      ) : (
        <NotificationSettings />
      )}
    </View>
  );
}

function NotificationSettings() {
  const { colors } = useTheme();
  const { data: preferences, mutate } = useNotificationPreferences();
  const [permission, setPermission] = useState("undetermined");

  useEffect(() => {
    const refreshPermission = () => void getNotificationPermissionStatus().then(setPermission);
    refreshPermission();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshPermission();
    });
    return () => subscription.remove();
  }, []);

  async function enableSystemNotifications() {
    if (permission === "denied") {
      await Linking.openSettings();
      return;
    }
    const granted = await requestNotificationPermission();
    setPermission(granted ? "granted" : "denied");
    if (!granted) return;

    const registered = await registerPushDevice();
    dialog.toast(
      registered
        ? "This phone is connected for notifications"
        : "Could not connect this phone. Check your internet and try again.",
      registered ? "success" : "error",
    );
  }

  async function togglePreference(key: keyof NotificationPreferences, enabled: boolean) {
    const previous = preferences ?? {
      timers: true,
      friends: true,
      sessions: true,
      messages: true,
      account: true,
    };
    const next = { ...previous, [key]: enabled };
    await mutate(next, { revalidate: false });
    if (key === "timers") await setLocalTimerNotificationsEnabled(enabled);
    try {
      await api.patch("/api/notifications/preferences", { [key]: enabled });
      await mutate();
    } catch (error) {
      await mutate(previous, { revalidate: false });
      if (key === "timers") await setLocalTimerNotificationsEnabled(previous.timers);
      dialog.toast(error instanceof Error ? error.message : "Failed to update notifications", "error");
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Card style={{ gap: 14 }}>
        <View style={styles.preferenceRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontFamily: fonts.sansSemiBold, color: colors.foreground }}>
              Push notifications
            </Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sans, marginTop: 2 }}>
              {permission === "granted"
                ? `Enabled on this ${Platform.OS === "ios" ? "iPhone" : "device"}`
                : `Disabled on this ${Platform.OS === "ios" ? "iPhone" : "device"}`}
            </Text>
          </View>
          {permission !== "granted" && (
            <Button
              title={permission === "denied" ? "Open Settings" : "Enable"}
              size="sm"
              variant="outline"
              onPress={enableSystemNotifications}
            />
          )}
        </View>
        {(
          [
            ["timers", "Timers", "Pomodoro completion alerts"],
            ["friends", "Friends", "Friend requests and acceptances"],
            ["sessions", "Sessions", "Invitations to focus sessions"],
            ["messages", "Messages", "New messages and group additions"],
            ["account", "Account", "Important plan and account reminders"],
          ] as const
        ).map(([key, label, detail]) => (
          <View key={key} style={styles.preferenceRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: fonts.sansMedium, color: colors.foreground }}>{label}</Text>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sans }}>{detail}</Text>
            </View>
            <Switch
              value={preferences?.[key] ?? true}
              onValueChange={(enabled) => togglePreference(key, enabled)}
              trackColor={{ true: colors.foreground }}
              accessibilityLabel={`${label} notifications`}
            />
          </View>
        ))}
      </Card>
    </ScrollView>
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
          <Pressable
            onPress={markAllRead}
            style={{ alignSelf: "flex-end", marginBottom: 2 }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications as read"
          >
            <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sansMedium, textDecorationLine: "underline" }}>
              Mark all read
            </Text>
          </Pressable>
        ) : null
      }
      ListEmptyComponent={<EmptyState emoji="🔔" title="You're all caught up" />}
      renderItem={({ item: n }) => {
        const { emoji, title, text } = describeNotification(n);
        const isUnread = !n.read_at;
        return (
          <Pressable
            onPress={() => open(n)}
            accessibilityRole="button"
            accessibilityLabel={`${title}. ${text}`}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: colors.card,
                borderColor: isUnread ? colors.foreground + "33" : colors.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <View style={[styles.notificationIcon, { backgroundColor: colors.muted }]}>
              <Text style={{ fontSize: 21 }}>{emoji}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: fonts.sansSemiBold,
                  color: colors.foreground,
                  lineHeight: 18,
                }}
              >
                {title}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: fonts.sans,
                  color: colors.mutedForeground,
                  lineHeight: 17,
                  marginTop: 1,
                }}
              >
                {text}
              </Text>
              <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: fonts.sans, marginTop: 1 }}>
                {relativeTime(n.created_at)}
              </Text>
            </View>
            {isUnread && <View style={[styles.unreadDot, { backgroundColor: colors.destructive }]} />}
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                void dismiss(n);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Dismiss ${title}`}
            >
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
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 14, fontFamily: fonts.sansMedium, color: colors.foreground }}>{r.display_name}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 11, fontFamily: fonts.mono, color: colors.mutedForeground }}>@{r.username}</Text>
                </View>
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
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 14, fontFamily: fonts.sansMedium, color: colors.foreground }}>{r.display_name}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 11, fontFamily: fonts.mono, color: colors.mutedForeground }}>@{r.username}</Text>
                </View>
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
  preferenceRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  notificationIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
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
