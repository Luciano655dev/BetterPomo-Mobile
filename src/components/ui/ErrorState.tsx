import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

/**
 * Shown when a data request fails (typically a dropped/slow connection) and we
 * have nothing cached to fall back on. Distinct from EmptyState — an empty list
 * means "no data yet", this means "we couldn't load it" and offers a retry.
 */
export function ErrorState({
  title = "Couldn't load this",
  subtitle = "Check your connection and try again.",
  onRetry,
}: {
  title?: string;
  subtitle?: string;
  onRetry?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Ionicons name="cloud-offline-outline" size={40} color={colors.mutedForeground} />
      <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.sansSemiBold }]}>
        {title}
      </Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: fonts.sans }]}>
        {subtitle}
      </Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [
            styles.retry,
            { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name="refresh" size={15} color={colors.foreground} />
          <Text style={{ fontSize: 13, color: colors.foreground, fontFamily: fonts.sansMedium }}>
            Try again
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", padding: 32, gap: 8 },
  title: { fontSize: 16, textAlign: "center" },
  subtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  retry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginTop: 6,
  },
});
