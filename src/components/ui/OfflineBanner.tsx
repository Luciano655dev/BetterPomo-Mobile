import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useIsOnline } from "@/lib/network";
import { useTheme } from "@/theme/ThemeContext";
import { fonts } from "@/theme/tokens";

/**
 * Thin connectivity strip overlaid at the top of every authenticated screen.
 * Mounted once in (app)/_layout.tsx; renders nothing while online.
 */
export function OfflineBanner() {
  const online = useIsOnline();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  if (online) return null;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.wrap,
        { paddingTop: insets.top, backgroundColor: colors.foreground },
      ]}
    >
      <View style={styles.row}>
        <Ionicons name="cloud-offline-outline" size={13} color={colors.background} />
        <Text style={[styles.text, { color: colors.background, fontFamily: fonts.sansMedium }]}>
          You&apos;re offline — showing saved data
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 5,
  },
  text: { fontSize: 12 },
});
