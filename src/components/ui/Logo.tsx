import React from "react";
import { Image } from "react-native";

import { useTheme } from "@/theme/ThemeContext";

/**
 * BetterPomo watch logo (from the website's Logo-transparent.png).
 * The source is black line art on transparency, so tinting with the theme
 * foreground makes it work in both light and dark mode. Pass `tint` to
 * override (e.g. background color when shown on a filled pill).
 */
export function Logo({ size = 24, tint }: { size?: number; tint?: string }) {
  const { colors } = useTheme();
  return (
    <Image
      source={require("../../../assets/images/logo.png")}
      style={{ width: size, height: size, tintColor: tint ?? colors.foreground }}
      resizeMode="contain"
    />
  );
}
