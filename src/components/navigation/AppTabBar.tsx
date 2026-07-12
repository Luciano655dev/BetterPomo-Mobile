import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import type { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { dialog } from "@/components/ui/dialog";
import { useConversations } from "@/lib/hooks";
import { useTheme } from "@/theme/ThemeContext";
import { fonts } from "@/theme/tokens";

// Instagram-style bottom bar: Home · Search · [ + ] · Messages · Profile.
// The center is a raised button that opens a Create/Join action sheet (reusing
// the app's custom dialog), not a real tab.

const ICONS: Record<string, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap; label: string }> = {
  index: { on: "home", off: "home-outline", label: "Home" },
  search: { on: "search", off: "search-outline", label: "Search" },
  messages: { on: "chatbubble", off: "chatbubble-outline", label: "Messages" },
  profile: { on: "person-circle", off: "person-circle-outline", label: "Profile" },
};

// Which routes sit left vs. right of the center button, in order.
const LEFT = ["index", "search"];
const RIGHT = ["messages", "profile"];

export function AppTabBar({ state, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: conversations } = useConversations();
  const unreadMessages = (conversations ?? []).reduce((n, c) => n + (c.unread_count ?? 0), 0);

  const routeByName = Object.fromEntries(state.routes.map((r) => [r.name, r]));
  const activeName = state.routes[state.index]?.name;

  function go(routeName: string) {
    const route = routeByName[routeName];
    if (!route) return;
    const isFocused = activeName === routeName;
    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
  }

  async function openCreateJoin() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const choice = await dialog.actions({
      title: "Start focusing",
      options: [
        { label: "New session", value: "create", icon: "add-circle-outline" },
        { label: "Join with a code", value: "join", icon: "enter-outline" },
      ],
    });
    if (choice === "create") router.push("/create");
    else if (choice === "join") router.push("/join");
  }

  function Tab({ name }: { name: string }) {
    const meta = ICONS[name];
    if (!meta) return <View style={styles.tab} />;
    const focused = activeName === name;
    const badge = name === "messages" ? unreadMessages : 0;
    return (
      <Pressable style={styles.tab} onPress={() => go(name)} accessibilityLabel={meta.label}>
        <View>
          <Ionicons
            name={focused ? meta.on : meta.off}
            size={24}
            color={focused ? colors.foreground : colors.mutedForeground}
          />
          {badge > 0 && (
            <View style={[styles.badge, { backgroundColor: colors.destructive, borderColor: colors.card }]}>
              <Text style={styles.badgeText}>{badge > 99 ? "99+" : badge}</Text>
            </View>
          )}
        </View>
        <Text
          style={{
            fontSize: 10,
            marginTop: 2,
            fontFamily: focused ? fonts.sansMedium : fonts.sans,
            color: focused ? colors.foreground : colors.mutedForeground,
          }}
        >
          {meta.label}
        </Text>
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom },
      ]}
    >
      {LEFT.map((n) => (
        <Tab key={n} name={n} />
      ))}

      {/* Raised center action */}
      <View style={styles.centerSlot}>
        <Pressable
          onPress={openCreateJoin}
          accessibilityLabel="Create or join a session"
          style={({ pressed }) => [
            styles.centerBtn,
            { backgroundColor: colors.foreground, opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <Ionicons name="add" size={28} color={colors.background} />
        </Pressable>
      </View>

      {RIGHT.map((n) => (
        <Tab key={n} name={n} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "flex-start", gap: 0 },
  centerSlot: { flex: 1, alignItems: "center" },
  centerBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -18,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  badge: {
    position: "absolute",
    top: -5,
    right: -9,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 9, fontFamily: "PlusJakartaSans_600SemiBold" },
});
