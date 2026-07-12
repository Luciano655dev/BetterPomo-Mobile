import React from "react";
import { Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeContext";

export function EmojiAvatar({ emoji, size = 40 }: { emoji?: string | null; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.muted,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: size * 0.5 }}>{emoji || "🍅"}</Text>
    </View>
  );
}
