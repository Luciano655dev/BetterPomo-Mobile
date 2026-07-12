import { Link } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { dialog } from "@/components/ui/dialog";
import { Logo } from "@/components/ui/Logo";
import { Input } from "@/components/ui/Input";
import { API_URL } from "@/lib/api";
import { useTheme } from "@/theme/ThemeContext";
import { fonts } from "@/theme/tokens";

export default function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Request failed: ${res.status}`);
      setSent(true);
    } catch (e) {
      dialog.toast(e instanceof Error ? e.message : "Couldn't send reset link", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logo}>
          <Logo size={56} />
        </View>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.sansBold }]}>
          Reset your password
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: fonts.sans }]}>
          {sent
            ? "Check your inbox"
            : "Enter your email and we'll send you a reset link"}
        </Text>

        <Card style={styles.card}>
          {sent ? (
            <Text style={{ fontSize: 14, lineHeight: 20, color: colors.mutedForeground, fontFamily: fonts.sans, textAlign: "center" }}>
              If an account exists for {email.trim()}, a reset link is on its way. Open it to
              choose a new password, then come back and sign in.
            </Text>
          ) : (
            <>
              <Input
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                onSubmitEditing={handleSend}
              />
              <Button title="Send reset link" onPress={handleSend} loading={loading} />
            </>
          )}
        </Card>

        <Text style={[styles.footer, { color: colors.mutedForeground, fontFamily: fonts.sans }]}>
          Remembered it?{" "}
          <Link href="/login" style={{ color: colors.foreground, fontFamily: fonts.sansSemiBold }}>
            Back to sign in
          </Link>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, paddingHorizontal: 24, justifyContent: "center", gap: 6 },
  logo: { alignSelf: "center" },
  title: { fontSize: 24, textAlign: "center", marginTop: 8 },
  subtitle: { fontSize: 14, textAlign: "center", marginBottom: 16 },
  card: { gap: 14 },
  footer: { fontSize: 13, textAlign: "center", marginTop: 20 },
});
