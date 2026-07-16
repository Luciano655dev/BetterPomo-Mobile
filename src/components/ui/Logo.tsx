import React from "react";
import { Image } from "react-native";

import { useTheme } from "@/theme/ThemeContext";

const logoSources = {
  light: require("../../../assets/images/Logo_light.png"),
  dark: require("../../../assets/images/Logo_dark.png"),
};

/** Theme-aware BetterPomo logo. Pass a variant when rendering into content
 * whose appearance is independent from the app theme, such as an export. */
export function Logo({
  size = 24,
  variant,
}: {
  size?: number;
  variant?: "light" | "dark";
}) {
  const { scheme } = useTheme();
  const resolvedVariant = variant ?? scheme;

  return (
    <Image
      source={logoSources[resolvedVariant]}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}
