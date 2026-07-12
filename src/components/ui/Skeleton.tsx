import React, { useEffect, useState } from "react";
import { Animated, type DimensionValue } from "react-native";
import { useTheme } from "@/theme/ThemeContext";
import { radius } from "@/theme/tokens";

export function Skeleton({
  width = "100%",
  height = 16,
  round = radius.md,
}: {
  width?: DimensionValue;
  height?: number;
  round?: number;
}) {
  const { colors } = useTheme();
  const [opacity] = useState(() => new Animated.Value(0.5));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={{ width, height, borderRadius: round, backgroundColor: colors.muted, opacity }}
    />
  );
}
