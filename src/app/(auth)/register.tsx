import { Link, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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

type AuthSession = { access_token: string; refresh_token: string };

export default function RegisterScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((value) => value - 1), 1_000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  async function finishSignup(session: AuthSession) {
    const { error } = await supabase.auth.setSession(session);
    if (error) throw new Error(error.message);
    dialog.toast("Email confirmed — welcome to BetterPomo!", "success");
    router.replace("/");
  }

  async function handleRegister() {
    if (!username.trim() || !email.trim() || !password) return;
    if (password.length < 8) {
      dialog.toast("Password must be at least 8 characters", "error");
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
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Request failed: ${res.status}`);

      const session = json.data?.session as AuthSession | null;
      if (session) {
        await finishSignup(session);
      } else {
        setEmail((value) => value.trim().toLowerCase());
        setConfirmEmail(true);
        setResendCooldown(60);
      }
    } catch (e) {
      dialog.toast(e instanceof Error ? e.message : "Sign up failed", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyEmail() {
    if (!/^\d{6}$/.test(verificationCode)) {
      dialog.toast("Enter the 6-digit code from your email", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token: verificationCode }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not confirm your email");
      const session = json.data?.session as AuthSession | null;
      if (!session) throw new Error("Email confirmed, but no session was returned. Please sign in.");
      await finishSignup(session);
    } catch (e) {
      dialog.toast(e instanceof Error ? e.message : "Could not confirm your email", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendCode() {
    if (resendCooldown > 0) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not resend the code");
      setVerificationCode("");
      setResendCooldown(60);
      dialog.toast("A new confirmation code is on its way", "success");
    } catch (e) {
      dialog.toast(e instanceof Error ? e.message : "Could not resend the code", "error");
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
          {confirmEmail ? "Enter your confirmation code" : "Create your account"}
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: fonts.sans }]}>
          {confirmEmail ? `We sent a 6-digit code to ${email}` : "Focus is better, together"}
        </Text>

        {confirmEmail ? (
          <Card style={styles.card}>
            <Input
              label="Confirmation code"
              placeholder="000000"
              value={verificationCode}
              onChangeText={(value) => setVerificationCode(value.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
              autoFocus
              style={styles.codeInput}
              onSubmitEditing={handleVerifyEmail}
            />
            <Text style={[styles.codeHelp, { color: colors.mutedForeground, fontFamily: fonts.sans }]}>
              Enter the code from the email. It expires shortly.
            </Text>
            <Button
              title="Confirm email & continue"
              onPress={handleVerifyEmail}
              loading={loading}
              disabled={verificationCode.length !== 6}
            />
            <View style={styles.codeActions}>
              <Button
                title="Change email"
                variant="ghost"
                size="sm"
                disabled={loading}
                onPress={() => {
                  setConfirmEmail(false);
                  setVerificationCode("");
                }}
              />
              <Button
                title={resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                variant="ghost"
                size="sm"
                disabled={loading || resendCooldown > 0}
                onPress={handleResendCode}
              />
            </View>
          </Card>
        ) : (
          <Card style={styles.card}>
            <Input
              label="Username"
              placeholder="yourname"
              value={username}
              onChangeText={(t) =>
                setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24))
              }
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
              placeholder="At least 8 characters"
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
        )}

        {!confirmEmail ? (
          <Text style={[styles.footer, { color: colors.mutedForeground, fontFamily: fonts.sans }]}>
            Already have an account?{" "}
            <Link href="/login" style={{ color: colors.foreground, fontFamily: fonts.sansSemiBold }}>
              Sign in
            </Link>
          </Text>
        ) : null}
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
  codeInput: { fontSize: 28, letterSpacing: 10, textAlign: "center", height: 58 },
  codeHelp: { fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: -6 },
  codeActions: { flexDirection: "row", justifyContent: "space-between" },
  footer: { fontSize: 13, textAlign: "center", marginTop: 20 },
});
