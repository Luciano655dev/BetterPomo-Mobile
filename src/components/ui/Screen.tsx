import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Logo } from "@/components/ui/Logo";
import { useTheme } from "@/theme/ThemeContext";
import { fonts } from "@/theme/tokens";

/**
 * Standard tab-screen chrome with exactly one header row (no brand row stacked
 * on top of a page title — big-app style). The header shows, on the left:
 *   • `header` if provided (fully custom, e.g. a search field), else
 *   • the page `title` if provided, else
 *   • the brand (logo + wordmark) — used only by Home.
 * `right` renders an action on the trailing edge (unless `header` is custom).
 */
export function Screen({
  title,
  right,
  header,
  children,
  style,
}: {
  title?: string;
  right?: React.ReactNode;
  header?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 10 }, style]}
    >
      {header ? (
        <View style={styles.headerRow}>{header}</View>
      ) : (
        <View style={styles.headerRow}>
          {title ? (
            <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.sansBold }]}>
              {title}
            </Text>
          ) : (
            <View style={styles.brand}>
              <Logo size={26} />
              <Text style={[styles.wordmark, { color: colors.foreground, fontFamily: fonts.sansBold }]}>
                BetterPomo
              </Text>
            </View>
          )}
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
    minHeight: 40,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  wordmark: { fontSize: 18, letterSpacing: -0.3 },
  title: { fontSize: 24 },
});
