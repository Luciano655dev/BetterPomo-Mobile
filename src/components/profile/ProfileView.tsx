import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { HistorySection } from "@/components/dashboard/HistorySection";
import { TimerStatsSection } from "@/components/dashboard/TimerStatsSection";
import { FriendButton } from "@/components/social/FriendButton";
import { dialog } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import {
  useInvalidate,
  useUserActiveSession,
  useUserFriends,
  useUserHistory,
  useUserProfile,
  type Friend,
} from "@/lib/hooks";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

/**
 * The full profile body (header block, stats, history, friends modal) shared
 * between the Profile tab (own account) and the /u/[username] stack screen.
 * The surrounding screen owns its own top bar.
 */
export function ProfileView({ username }: { username: string }) {
  const { colors } = useTheme();
  const router = useRouter();

  const { data: profile, isLoading, error, mutate } = useUserProfile(username);
  const { data: history, mutate: mutateHistory } = useUserHistory(username);
  const { data: activeSessionData } = useUserActiveSession(username);
  const { data: friendsData } = useUserFriends(username);
  const activeSession = activeSessionData?.session_name ?? null;
  const friendCount = friendsData?.count ?? 0;

  const [viewerId, setViewerId] = useState<string | null>(null);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setViewerId(data.user?.id ?? null));
  }, []);

  const notFound =
    !isLoading && (error?.message?.includes("404") || error?.message?.includes("not found"));
  // A non-404 failure (bad connection, server hiccup) with nothing cached —
  // otherwise the loading skeleton below would spin forever.
  const loadError = !isLoading && !!error && !notFound && !profile;

  const isOwn = viewerId != null && profile != null && viewerId === profile.id;
  const isPrivate = (profile?.is_private ?? false) && !isOwn;

  if (notFound) {
    return (
      <View style={styles.center}>
        <Ionicons name="person-circle-outline" size={44} color={colors.mutedForeground} />
        <Text style={{ fontSize: 16, fontFamily: fonts.sansSemiBold, color: colors.foreground }}>
          User not found
        </Text>
        <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sans }}>
          No account exists with that username.
        </Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Couldn't load profile"
        subtitle="Check your connection and try again."
        onRetry={() => {
          mutate();
          mutateHistory();
        }}
      />
    );
  }

  if (isLoading || !profile) {
    return (
      <View style={{ padding: 20, gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
          <Skeleton width={64} height={64} round={32} />
          <View style={{ gap: 8, flex: 1 }}>
            <Skeleton width={140} height={22} />
            <Skeleton width={90} height={14} />
          </View>
        </View>
        <Skeleton height={90} round={radius.xl} />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await Promise.all([mutate(), mutateHistory()]);
              setRefreshing(false);
            }}
          />
        }
      >
        {/* Profile header */}
        <View style={{ flexDirection: "row", gap: 16 }}>
          <Text style={{ fontSize: 54, lineHeight: 60 }}>{profile.emoji}</Text>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Text style={{ fontSize: 22, fontFamily: fonts.sansBold, color: colors.foreground }}>
                {profile.display_name}
              </Text>
              {activeSession && (
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={{ fontSize: 11, color: "#059669", fontFamily: fonts.sansMedium }}>
                    In a session
                  </Text>
                </View>
              )}
              {profile.is_private && !isOwn && (
                <View style={[styles.privateBadge, { borderColor: colors.border }]}>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: fonts.sans }}>
                    Private
                  </Text>
                </View>
              )}
            </View>

            <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.mono }}>
              @{profile.username}
            </Text>

            <Pressable onPress={() => setFriendsOpen(true)} hitSlop={6}>
              <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sans }}>
                <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.foreground }}>
                  {friendCount}
                </Text>{" "}
                {friendCount === 1 ? "friend" : "friends"}
              </Text>
            </Pressable>

            {!isPrivate && profile.bio ? (
              <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sans, lineHeight: 18 }}>
                {profile.bio}
              </Text>
            ) : null}

            {!isOwn && (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                <FriendButton username={profile.username} targetId={profile.id} />
              </View>
            )}
          </View>
        </View>

        {isPrivate ? (
          <View style={styles.center}>
            <Ionicons name="lock-closed-outline" size={36} color={colors.mutedForeground} />
            <Text style={{ fontSize: 15, fontFamily: fonts.sansMedium, color: colors.foreground, marginTop: 8 }}>
              This account is private
            </Text>
            <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sans }}>
              Only {profile.display_name} can see their activity.
            </Text>
          </View>
        ) : (
          <>
            <TimerStatsSection history={(history ?? []) as never} />
            <View>
              <Text
                style={{
                  fontSize: 11,
                  letterSpacing: 2,
                  color: colors.mutedForeground,
                  fontFamily: fonts.sansSemiBold,
                  marginBottom: 14,
                }}
              >
                SESSION HISTORY
              </Text>
              <HistorySection
                history={history ?? []}
                currentUsername={profile.username}
                readOnly={!isOwn}
                onOpenUser={(u) => router.push(`/u/${encodeURIComponent(u)}`)}
              />
            </View>
          </>
        )}
      </ScrollView>

      <FriendsModal
        open={friendsOpen}
        onClose={() => setFriendsOpen(false)}
        username={profile.username}
        displayName={profile.display_name}
        friends={friendsData?.friends ?? []}
        count={friendCount}
        isOwn={isOwn}
        onOpenUser={(u) => {
          setFriendsOpen(false);
          router.push(`/u/${encodeURIComponent(u)}`);
        }}
      />
    </>
  );
}

// ── Friends list modal ────────────────────────────────────────────────────────

function FriendsModal({
  open,
  onClose,
  username,
  displayName,
  friends,
  count,
  isOwn,
  onOpenUser,
}: {
  open: boolean;
  onClose: () => void;
  username: string;
  displayName: string;
  friends: Friend[];
  count: number;
  isOwn: boolean;
  onOpenUser: (username: string) => void;
}) {
  const { colors } = useTheme();
  const { invalidateFriends } = useInvalidate();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function confirmUnfriend(f: Friend) {
    const ok = await dialog.confirm({
      title: "Unfriend",
      message: `Remove ${f.username} from your friends?`,
      confirmText: "Unfriend",
      destructive: true,
    });
    if (!ok) return;
    setBusyId(f.id);
    try {
      await api.delete(`/api/friends/${f.id}`);
      invalidateFriends();
    } catch (e) {
      dialog.toast(e instanceof Error ? e.message : "Something went wrong", "error");
    } finally {
      setBusyId(null);
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
            {isOwn ? "Your friends" : `${displayName}'s friends`}
          </Text>
          {friends.length === 0 ? (
            <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sans, textAlign: "center", paddingVertical: 24 }}>
              {count > 0 ? "This list is private." : "No friends yet."}
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 380 }}>
              {friends.map((f) => (
                <View key={f.id} style={styles.friendRow}>
                  <Pressable
                    onPress={() => onOpenUser(f.username)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}
                  >
                    <Text style={{ fontSize: 20 }}>{f.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontSize: 14, fontFamily: fonts.sansMedium, color: colors.foreground }}>
                        {f.display_name}
                      </Text>
                      <Text numberOfLines={1} style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: fonts.mono }}>
                        @{f.username}
                      </Text>
                      {f.bio ? (
                        <Text numberOfLines={1} style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: fonts.sans }}>
                          {f.bio}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                  {isOwn && (
                    <Pressable
                      onPress={() => confirmUnfriend(f)}
                      disabled={busyId === f.id}
                      hitSlop={8}
                      style={{ opacity: busyId === f.id ? 0.4 : 1 }}
                    >
                      <Ionicons name="person-remove-outline" size={17} color={colors.mutedForeground} />
                    </Pressable>
                  )}
                </View>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 48, gap: 4 },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(16,185,129,0.1)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.35)",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#10b981" },
  privateBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
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
    paddingVertical: 9,
  },
});
