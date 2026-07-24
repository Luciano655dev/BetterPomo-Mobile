import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { requireOptionalNativeModule } from "expo-modules-core";
import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";

import { dialog } from "@/components/ui/dialog";
import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

type AppIconName = "Light" | "Dark";

type AlternateAppIconsModule = {
  supportsAlternateIcons: boolean;
  getAppIconName: () => string | null;
  setAlternateAppIcon: (name: string | null) => Promise<string | null>;
};

const alternateIcons =
  Platform.OS === "web"
    ? null
    : requireOptionalNativeModule<AlternateAppIconsModule>("ExpoAlternateAppIcons");

const APP_ICONS: { name: AppIconName; label: string; source: number }[] = [
  {
    name: "Light",
    label: "Light",
    source: require("../../../assets/images/Icon_light.png"),
  },
  {
    name: "Dark",
    label: "Dark",
    source: require("../../../assets/images/Icon_dark.png"),
  },
];

export function AppIconPicker() {
  const { colors } = useTheme();
  const systemScheme = useColorScheme();
  const [activeIcon, setActiveIcon] = useState<AppIconName | null>(() => {
    if (alternateIcons?.supportsAlternateIcons !== true) return null;
    const current = alternateIcons.getAppIconName();
    return current === "Dark" || current === "Light" ? current : null;
  });
  const [changing, setChanging] = useState<AppIconName | null>(null);
  const supported = alternateIcons?.supportsAlternateIcons === true;
  const selected = activeIcon ?? (systemScheme === "dark" ? "Dark" : "Light");

  async function chooseIcon(name: AppIconName) {
    if (!alternateIcons || !supported || changing !== null || activeIcon === name) return;
    setChanging(name);
    try {
      await alternateIcons.setAlternateAppIcon(name);
      setActiveIcon(name);
      dialog.toast(`${name} app icon selected`, "success");
    } catch (error) {
      dialog.toast(
        error instanceof Error ? error.message : "Could not change the app icon",
        "error",
      );
    } finally {
      setChanging(null);
    }
  }

  return (
    <View style={{ gap: 9 }}>
      <Text style={[styles.label, { color: colors.foreground }]}>App icon</Text>
      <View style={styles.options}>
        {APP_ICONS.map((icon) => {
          const active = selected === icon.name;
          const busy = changing === icon.name;
          return (
            <Pressable
              key={icon.name}
              accessibilityRole="radio"
              accessibilityState={{ checked: active, disabled: !supported || changing !== null }}
              accessibilityLabel={`${icon.label} app icon`}
              disabled={!supported || changing !== null}
              onPress={() => chooseIcon(icon.name)}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: active ? colors.muted : colors.card,
                  borderColor: active ? colors.foreground : colors.border,
                  opacity: !supported ? 0.55 : pressed ? 0.8 : 1,
                },
              ]}
            >
              <Image source={icon.source} style={styles.preview} contentFit="cover" />
              <Text style={[styles.optionText, { color: colors.foreground }]}>{icon.label}</Text>
              <View
                style={[
                  styles.check,
                  {
                    backgroundColor: active ? colors.foreground : "transparent",
                    borderColor: active ? colors.foreground : colors.border,
                  },
                ]}
              >
                {(active || busy) && (
                  <Ionicons
                    name={busy ? "ellipsis-horizontal" : "checkmark"}
                    size={12}
                    color={colors.background}
                  />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.help, { color: colors.mutedForeground }]}>
        {supported
          ? "Choose how BetterPomo looks on your Home Screen."
          : "App icon selection is available in the installed app after the next native build."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontFamily: fonts.sansMedium,
  },
  options: {
    flexDirection: "row",
    gap: 10,
  },
  option: {
    flex: 1,
    minHeight: 72,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  preview: {
    width: 42,
    height: 42,
    borderRadius: 10,
  },
  optionText: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.sansMedium,
  },
  check: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  help: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: fonts.sans,
  },
});
