import { useLocalSearchParams } from "expo-router";
import React from "react";
import { View } from "react-native";

import { ProfileView } from "@/components/profile/ProfileView";
import { StackHeader } from "@/components/ui/StackHeader";
import { useTheme } from "@/theme/ThemeContext";

export default function UserProfileScreen() {
  const { username: rawUsername } = useLocalSearchParams<{ username: string }>();
  const username = decodeURIComponent(rawUsername ?? "");
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StackHeader title={username} />
      <ProfileView username={username} />
    </View>
  );
}
