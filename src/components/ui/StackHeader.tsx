import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/theme/ThemeContext";
import { fonts } from "@/theme/tokens";

/**
 * The single, consistent header for pushed stack screens: a back chevron, a
 * centered title, and an optional right-hand action. One header per page — no
 * brand row stacked on top of a page title.
 */
export function StackHeader({
  title,
  right,
  onBack,
}: {
  title: string;
  right?: React.ReactNode;
  onBack?: () => void;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
      <Pressable
        onPress={onBack ?? (() => router.back())}
        hitSlop={10}
        style={styles.side}
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={24} color={colors.foreground} />
      </Pressable>
      <Text numberOfLines={1} style={[styles.title, { color: colors.foreground, fontFamily: fonts.sansSemiBold }]}>
        {title}
      </Text>
      <View style={[styles.side, styles.rightSide]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  side: { width: 40, justifyContent: "center" },
  rightSide: { alignItems: "flex-end" },
  title: { flex: 1, textAlign: "center", fontSize: 16 },
});
