import * as AppleAuthentication from "expo-apple-authentication";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Crypto from "expo-crypto";
import { Link } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
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
import { supabase } from "@/lib/supabase";
import { api, API_URL } from "@/lib/api";
import { completeOAuthSession, getOAuthRedirects } from "@/lib/oauth";
import { useTheme } from "@/theme/ThemeContext";
import { fonts } from "@/theme/tokens";

WebBrowser.maybeCompleteAuthSession();

type AuthSession = { access_token: string; refresh_token: string };

export default function LoginScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  // Hide the Apple button in Expo Go: its binary doesn't register the native
  // button view (RN renders an "Unimplemented component" placeholder), and the
  // identity token would carry Expo Go's bundle id, which Supabase rejects.
  // isAvailableAsync() alone doesn't cover this — it only checks OS support.
  useEffect(() => {
    if (
      Platform.OS !== "ios" ||
      Constants.executionEnvironment === ExecutionEnvironment.StoreClient
    )
      return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((value) => value - 1), 1_000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  async function finishLogin(session: AuthSession) {
    const { error } = await supabase.auth.setSession(session);
    if (error) throw new Error(error.message);
  }

  async function handleEmailLogin() {
    if (!identifier.trim() || !password) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim().toLowerCase(), password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.code === "email_not_confirmed") {
          setIdentifier((value) => value.trim().toLowerCase());
          setConfirmEmail(true);
          setVerificationCode("");
          setResendCooldown(60);
          dialog.toast(
            json.verification_sent
              ? "We sent a new confirmation code"
              : "Confirm your email to sign in. You can request another code shortly.",
            "info",
          );
          return;
        }
        throw new Error(json.error ?? "Sign in failed");
      }
      const session = json.data?.session as AuthSession | null;
      if (!session) throw new Error("Sign in succeeded, but no session was returned");
      await finishLogin(session);
      // AuthProvider's listener flips session → (auth) layout redirects.
    } catch (error) {
      dialog.toast(error instanceof Error ? error.message : "Sign in failed", "error");
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
        body: JSON.stringify({ identifier, token: verificationCode }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not confirm your email");
      const session = json.data?.session as AuthSession | null;
      if (!session) throw new Error("Email confirmed, but no session was returned");
      dialog.toast("Email confirmed — welcome to BetterPomo!", "success");
      await finishLogin(session);
    } catch (error) {
      dialog.toast(error instanceof Error ? error.message : "Could not confirm your email", "error");
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
        body: JSON.stringify({ identifier }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not resend the code");
      setVerificationCode("");
      setResendCooldown(60);
      dialog.toast("A new confirmation code is on its way", "success");
    } catch (error) {
      dialog.toast(error instanceof Error ? error.message : "Could not resend the code", "error");
    } finally {
      setLoading(false);
    }
  }

  /** Native Sign in with Apple (iOS only). Required by App Store Guideline
   *  4.8 because the app also offers Google login. Uses the id_token flow —
   *  Supabase's Apple provider must list com.betterpomo.app as a client id. */
  async function handleAppleLogin() {
    try {
      // Apple receives the SHA-256 digest while Supabase receives the original
      // nonce, allowing the backend to reject replayed identity tokens.
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );
      const credential = await AppleAuthentication.signInAsync({
        nonce: hashedNonce,
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        dialog.toast("Apple sign-in failed", "error");
        return;
      }
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
        nonce: rawNonce,
      });
      if (error?.message.toLowerCase().includes("unacceptable audience")) {
        await dialog.alert({
          title: "Apple sign-in configuration error",
          message:
            "This iOS app identifier is not registered with BetterPomo authentication yet. Please try again after the authentication configuration is updated.",
        });
      } else if (error) dialog.toast(error.message || "Apple sign-in failed", "error");
      else if (credential.fullName) {
        const providerName = AppleAuthentication.formatFullName(credential.fullName).trim();
        if (providerName) {
          await api.post("/api/profile/initialize-oauth-identity", { provider_name: providerName }).catch(() => null);
        }
      }
      // Success: AuthProvider's listener flips session → (auth) layout redirects.
    } catch (e) {
      // User cancelled the native sheet — not an error worth surfacing.
      if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") return;
      dialog.toast(e instanceof Error ? e.message : "Apple sign-in failed", "error");
    }
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    try {
      const { returnUrl, redirectTo } = getOAuthRedirects();
      // Supabase already allows the web callback. On native, that callback
      // forwards the PKCE code to the app's custom scheme without exchanging it,
      // so the verifier that is stored on this device can finish the session.
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data?.url) {
        dialog.toast(error?.message ?? "Could not start Google sign-in", "error");
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, returnUrl);
      if (result.type === "success" && result.url) {
        await completeOAuthSession(result.url);
      }
    } catch (e) {
      dialog.toast(e instanceof Error ? e.message : "Google sign-in failed", "error");
    } finally {
      setGoogleLoading(false);
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
        <View style={styles.header}>
          <Logo size={64} />
          <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.sansBold }]}>
            BetterPomo
          </Text>
          <Text
            style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: fonts.sans }]}
          >
            {confirmEmail ? `Enter the code sent to the email linked to ${identifier}` : "Sign in to your account"}
          </Text>
        </View>

        <Card style={styles.card}>
          {confirmEmail ? (
            <>
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
              <Button
                title="Confirm email & sign in"
                onPress={handleVerifyEmail}
                loading={loading}
                disabled={verificationCode.length !== 6}
              />
              <View style={styles.codeActions}>
                <Button
                  title="Back to sign in"
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
            </>
          ) : (
            <>
              {/* Apple's HIG requires their own button component, shown with at
                  least equal prominence to other third-party logins — so it sits
                  first. iOS only; Android keeps Google + email. */}
              {appleAvailable && (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={10}
                  style={styles.appleButton}
                  onPress={handleAppleLogin}
                />
              )}
              <Button
                title="Continue with Google"
                variant="outline"
                onPress={handleGoogleLogin}
                loading={googleLoading}
                icon={<Text style={styles.googleG}>G</Text>}
              />

              <View style={styles.dividerRow}>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <Text
                  style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: fonts.sans }}
                >
                  or
                </Text>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              </View>

              <Input
                label="Email or username"
                placeholder="you@example.com or yourname"
                value={identifier}
                onChangeText={setIdentifier}
                autoCapitalize="none"
                autoComplete="username"
              />
              <Input
                label="Password"
                placeholder="••••••••"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
                onSubmitEditing={handleEmailLogin}
              />
              <Link
                href="/forgot-password"
                style={{
                  fontSize: 12,
                  alignSelf: "flex-end",
                  color: colors.mutedForeground,
                  fontFamily: fonts.sansMedium,
                }}
              >
                Forgot password?
              </Link>
              <Button title="Sign in" onPress={handleEmailLogin} loading={loading} />
            </>
          )}
        </Card>

        {!confirmEmail ? (
          <Text style={[styles.footer, { color: colors.mutedForeground, fontFamily: fonts.sans }]}>
            Don&apos;t have an account?{" "}
            <Link href="/register" style={{ color: colors.foreground, fontFamily: fonts.sansSemiBold }}>
              Create one
            </Link>
          </Text>
        ) : null}

        <View style={styles.legalRow}>
          <Pressable onPress={() => Linking.openURL("https://betterpomo.com/terms")} hitSlop={8}>
            <Text style={[styles.legalLink, { color: colors.mutedForeground, fontFamily: fonts.sans }]}>Terms</Text>
          </Pressable>
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>·</Text>
          <Pressable onPress={() => Linking.openURL("https://betterpomo.com/privacy")} hitSlop={8}>
            <Text style={[styles.legalLink, { color: colors.mutedForeground, fontFamily: fonts.sans }]}>Privacy</Text>
          </Pressable>
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>·</Text>
          <Pressable onPress={() => Linking.openURL("https://betterpomo.com/license")} hitSlop={8}>
            <Text style={[styles.legalLink, { color: colors.mutedForeground, fontFamily: fonts.sans }]}>License</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, paddingHorizontal: 24, justifyContent: "center", gap: 24 },
  header: { alignItems: "center", gap: 6 },
  logo: { fontSize: 44 },
  title: { fontSize: 26 },
  subtitle: { fontSize: 14 },
  card: { gap: 16 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  divider: { flex: 1, height: StyleSheet.hairlineWidth },
  googleG: { fontSize: 16, fontWeight: "700", color: "#4285F4" },
  appleButton: { height: 44, width: "100%" },
  codeInput: { fontSize: 28, letterSpacing: 10, textAlign: "center", height: 58 },
  codeActions: { flexDirection: "row", justifyContent: "space-between" },
  footer: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: -8,
  },
  legalLink: { fontSize: 11, textDecorationLine: "underline" },
});
