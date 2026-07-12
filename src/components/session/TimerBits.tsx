// Small presentational pieces shared by the online SessionScreen and the
// OfflineSessionScreen (extracted from SessionScreen so neither forks them).
import * as Haptics from "expo-haptics";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import type { SessionTimer } from "@/lib/session-types";
import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

export function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatMinutes(seconds: number) {
  return String(Math.round(seconds / 60));
}

export function TimerSquare({
  timer,
  onPress,
  disabled,
}: {
  timer: SessionTimer;
  onPress: () => void;
  disabled: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        squareStyles.square,
        {
          borderColor: colors.border,
          backgroundColor: colors.card,
          opacity: disabled ? 0.6 : 1,
          transform: [{ scale: pressed ? 0.95 : 1 }],
        },
      ]}
    >
      <Text style={{ fontSize: 30, fontFamily: fonts.sansBold, color: colors.foreground }}>
        {formatMinutes(timer.duration)}
      </Text>
      <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: fonts.sansMedium }}>
        min
      </Text>
      <Text numberOfLines={1} style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: fonts.sans, maxWidth: "100%" }}>
        {timer.name}
      </Text>
    </Pressable>
  );
}

export function ControlText({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      hitSlop={10}
    >
      <Text
        style={{
          fontSize: 13,
          letterSpacing: 3,
          textTransform: "uppercase",
          fontFamily: fonts.sansMedium,
          color: primary ? colors.foreground : colors.mutedForeground,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export const squareStyles = StyleSheet.create({
  square: {
    width: 96,
    height: 96,
    borderWidth: 2,
    borderRadius: radius["2xl"],
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    padding: 8,
  },
  squareDashed: { borderStyle: "dashed" },
});
