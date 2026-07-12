import { Link, useRouter } from "expo-router";
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
import { Input } from "@/components/ui/Input";
import { Logo } from "@/components/ui/Logo";
import { API_URL } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/theme/ThemeContext";
import { fonts } from "@/theme/tokens";

export default function RegisterScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!username.trim() || !email.trim() || !password) return;
    if (password.length < 6) {
      dialog.toast("Password must be at least 6 characters", "error");
      return;
    }
    if (password !== confirmPassword) {
      dialog.toast("Passwords don't match", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          email: email.trim(),
          password,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Request failed: ${res.status}`);

      const session = json.data?.session as
        | { access_token: string; refresh_token: string }
        | null;
      if (session) {
        // Signed up with an immediate session — adopt it; the auth listener
        // flips to the app shell.
        const { error } = await supabase.auth.setSession(session);
        if (error) throw new Error(error.message);
      } else {
        await dialog.alert({
          title: "Confirm your email",
          message: "We sent you a confirmation link. Open it, then sign in.",
        });
        router.back();
      }
    } catch (e) {
      dialog.toast(e instanceof Error ? e.message : "Sign up failed", "error");
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
          Create your account
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: fonts.sans }]}>
          Focus is better, together
        </Text>

        <Card style={styles.card}>
          <Input
            label="Username"
            placeholder="yourname"
            value={username}
            onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24))}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Input
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          <Input
            label="Password"
            placeholder="At least 6 characters"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
          />
          <Input
            label="Confirm password"
            placeholder="Re-enter password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoComplete="new-password"
            onSubmitEditing={handleRegister}
          />
          <Button title="Create account" onPress={handleRegister} loading={loading} />
        </Card>

        <Text style={[styles.footer, { color: colors.mutedForeground, fontFamily: fonts.sans }]}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: colors.foreground, fontFamily: fonts.sansSemiBold }}>
            Sign in
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
