import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api";
import { useIsOnline } from "@/lib/network";
import { useTheme } from "@/theme/ThemeContext";
import { fonts } from "@/theme/tokens";

export default function JoinSessionScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const online = useIsOnline();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin() {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) return;
    setLoading(true);
    setError(null);
    try {
      // Resolve first so a bad code errors here; the session screen handles
      // joining (and its password gate if the session is protected).
      await api.get(`/api/sessions/by-code/${trimmed}`);
      // This screen is a native `modal`; the session screen is a
      // `fullScreenModal`. Replacing across native presentation types can tear
      // the incoming screen down with the dismissing modal (see create.tsx) —
      // dismiss first, then push from the base stack.
      router.dismiss();
      router.push(`/session/${trimmed}`);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg.includes("404") ? "No session found with that code." : msg);
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View>
            <Text style={{ fontSize: 24, fontFamily: fonts.sansBold, color: colors.foreground }}>
              Join Session
            </Text>
            <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sans, marginTop: 2 }}>
              Enter the 6-character session code
            </Text>
          </View>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="close" size={24} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <Input
          placeholder="ABC123"
          value={code}
          onChangeText={(t) => {
            setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
            setError(null);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
          error={error}
          style={{
            fontFamily: fonts.monoSemiBold,
            fontSize: 24,
            textAlign: "center",
            letterSpacing: 8,
            height: 60,
          }}
          onSubmitEditing={handleJoin}
        />

        {!online && (
          <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sans, textAlign: "center" }}>
            You&apos;re offline — joining a session needs a connection. You can start an offline solo
            session from New Session instead.
          </Text>
        )}

        <Button
          title={loading ? "Joining…" : "Join Session →"}
          onPress={handleJoin}
          loading={loading}
          disabled={code.trim().length < 4 || !online}
          size="lg"
          haptic
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 24, gap: 24, paddingTop: 28 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
});
