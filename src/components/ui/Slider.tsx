import React, { useRef, useState } from "react";
import {
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useTheme } from "@/theme/ThemeContext";

// Minimal, dependency-free horizontal slider (0..1). Drag or tap the track.
// Uses the View responder props directly (no PanResponder ref) so it plays nice
// with the React Compiler lint rules.
export function Slider({
  value,
  onChange,
  style,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);

  function onLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width;
    widthRef.current = w;
    setWidth(w);
  }

  function update(e: GestureResponderEvent) {
    const w = widthRef.current;
    if (w <= 0) return;
    onChange(Math.min(1, Math.max(0, e.nativeEvent.locationX / w)));
  }

  const pct = Math.min(1, Math.max(0, value));
  const thumbX = pct * width;

  return (
    <View
      style={[styles.wrap, style, disabled && { opacity: 0.4 }]}
      onLayout={onLayout}
      hitSlop={{ top: 10, bottom: 10 }}
      onStartShouldSetResponder={() => !disabled}
      onMoveShouldSetResponder={() => !disabled}
      onResponderGrant={update}
      onResponderMove={update}
    >
      {/* pointerEvents="none" on every child so the touch target is always this
          wrap View — otherwise the finger sliding over the thumb/fill reports a
          locationX relative to THAT child, making the value jump and flicker. */}
      <View pointerEvents="none" style={[styles.track, { backgroundColor: colors.muted }]} />
      <View pointerEvents="none" style={[styles.fill, { width: thumbX, backgroundColor: colors.foreground }]} />
      <View
        pointerEvents="none"
        style={[
          styles.thumb,
          { left: Math.max(0, thumbX - 8), backgroundColor: colors.foreground, borderColor: colors.background },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 26, justifyContent: "center" },
  track: { height: 4, borderRadius: 2 },
  fill: { position: "absolute", height: 4, borderRadius: 2, left: 0 },
  thumb: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    top: 5,
  },
});
