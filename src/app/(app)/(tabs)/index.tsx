import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { ActiveSessionBanner } from "@/components/dashboard/ActiveSessionBanner";
import { HistorySection } from "@/components/dashboard/HistorySection";
import { OfflineSessionBanner } from "@/components/dashboard/OfflineSessionBanner";
import { PendingSyncCard } from "@/components/dashboard/PendingSyncCard";
import { TimerStatsSection } from "@/components/dashboard/TimerStatsSection";
import { ErrorState } from "@/components/ui/ErrorState";
import { Screen } from "@/components/ui/Screen";
import { Skeleton } from "@/components/ui/Skeleton";
import { useHistory, useHistoryAnalytics, useInvalidate, useNotifications, useProfile } from "@/lib/hooks";
import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

function BigActionButton({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.bigButton,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      <View style={[styles.bigButtonIcon, { backgroundColor: colors.foreground + "14" }]}>
        <Ionicons name={icon} size={24} color={colors.foreground} />
      </View>
      <View style={{ alignItems: "center" }}>
        <Text style={{ fontSize: 16, fontFamily: fonts.sansSemiBold, color: colors.foreground }}>
          {title}
        </Text>
        <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: fonts.sans, marginTop: 2 }}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

export default function DashboardScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { data: profile, isLoading: profileLoading, error: profileError, mutate: mutateProfile } = useProfile();
  const { data: history, isLoading: historyLoading, error: historyError, mutate: mutateHistory } = useHistory();
  const {
    data: analyticsHistory,
    isLoading: analyticsLoading,
    error: analyticsError,
    mutate: mutateAnalytics,
  } = useHistoryAnalytics();
  const { invalidateHistory } = useInvalidate();

  // Tabs stay mounted in expo-router, so returning to Home doesn't remount and
  // SWR (revalidateOnFocus off) can show a stale "time by session". Revalidate
  // whenever this tab regains focus.
  useFocusEffect(
    useCallback(() => {
      invalidateHistory();
    }, [invalidateHistory])
  );
  const { data: notif } = useNotifications();
  const unread = notif?.unread_count ?? 0;
  const [refreshing, setRefreshing] = useState(false);

  // First-run tour: the dashboard is the post-login landing screen. The local
  // flag covers the window where the tour just finished but the profile cache
  // hasn't revalidated yet (mirrors the webapp's localStorage bridge).
  React.useEffect(() => {
    if (!profile || profile.onboarding_completed !== false) return;
    AsyncStorage.getItem("bp_onboarded").then((seen) => {
      if (seen !== "1") router.push("/onboarding");
    });
  }, [profile, router]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([mutateProfile(), mutateHistory(), mutateAnalytics()]);
    setRefreshing(false);
  }, [mutateProfile, mutateHistory, mutateAnalytics]);

  const loading = profileLoading || historyLoading || analyticsLoading;
  // A failed load with nothing cached — show a retry instead of a misleading
  // "no history yet" empty state.
  const showError = (profileError || historyError || analyticsError) && !profile && !history && !analyticsHistory;

  return (
    <Screen
      right={
        <Pressable
          onPress={() => router.push("/notifications")}
          hitSlop={8}
          accessibilityLabel="Notifications"
        >
          <View>
            <Ionicons name="notifications-outline" size={24} color={colors.foreground} />
            {unread > 0 && (
              <View style={[styles.bellBadge, { backgroundColor: colors.destructive, borderColor: colors.background }]}>
                <Text style={styles.bellBadgeText}>{unread > 99 ? "99+" : unread}</Text>
              </View>
            )}
          </View>
        </Pressable>
      }
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <ActiveSessionBanner />
        <OfflineSessionBanner />

        <View style={styles.actionsRow}>
          <BigActionButton
            icon="add"
            title="New Session"
            subtitle="Create a Pomo or timer"
            onPress={() => router.push("/create")}
          />
          <BigActionButton
            icon="keypad-outline"
            title="Join Session"
            subtitle="Enter a code to join"
            onPress={() => router.push("/join")}
          />
        </View>

        <PendingSyncCard />

        {showError ? (
          <ErrorState onRetry={onRefresh} />
        ) : loading ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={110} round={radius.xl} />
            <Skeleton height={56} round={radius.lg} />
            <Skeleton height={56} round={radius.lg} />
            <Skeleton height={56} round={radius.lg} />
          </View>
        ) : (
          <>
            <TimerStatsSection history={analyticsHistory ?? []} />

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
                HISTORY
              </Text>
              <HistorySection
                history={history ?? []}
                currentUsername={profile?.username ?? ""}
                onOpenUser={(username) => router.push(`/u/${encodeURIComponent(username)}`)}
              />
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 24, paddingBottom: 40 },
  bellBadge: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  bellBadgeText: { color: "#fff", fontSize: 8, fontFamily: "PlusJakartaSans_600SemiBold" },
  actionsRow: { flexDirection: "row", gap: 14 },
  bigButton: {
    flex: 1,
    alignItems: "center",
    gap: 12,
    borderWidth: 2,
    borderRadius: radius["2xl"],
    paddingVertical: 28,
    paddingHorizontal: 12,
  },
  bigButtonIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
