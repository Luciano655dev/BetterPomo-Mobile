import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, View } from "react-native";

import { ProfileView } from "@/components/profile/ProfileView";
import { ErrorState } from "@/components/ui/ErrorState";
import { Screen } from "@/components/ui/Screen";
import { Skeleton } from "@/components/ui/Skeleton";
import { useProfile } from "@/lib/hooks";
import { useTheme } from "@/theme/ThemeContext";
import { radius } from "@/theme/tokens";

/** Own-profile tab. Settings moved out of the tab bar and are reached from the
 *  gear in this screen's header. */
export default function ProfileTab() {
  const { colors } = useTheme();
  const router = useRouter();
  const { data: profile, error, mutate } = useProfile();

  return (
    <Screen
      title="Profile"
      right={
        <Pressable
          onPress={() => router.push("/settings")}
          hitSlop={10}
          accessibilityLabel="Settings"
        >
          <Ionicons name="settings-outline" size={22} color={colors.foreground} />
        </Pressable>
      }
    >
      {profile ? (
        <ProfileView username={profile.username} />
      ) : error ? (
        <ErrorState
          title="Couldn't load your profile"
          subtitle="Check your connection and try again."
          onRetry={() => mutate()}
        />
      ) : (
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
      )}
    </Screen>
  );
}
