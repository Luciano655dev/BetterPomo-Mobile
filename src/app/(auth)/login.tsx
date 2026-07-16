import * as AppleAuthentication from "expo-apple-authentication";
import * as AuthSession from "expo-auth-session";
import Constants, { ExecutionEnvironment } from "expo-constants";
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
import { api } from "@/lib/api";
import { useTheme } from "@/theme/ThemeContext";
import { fonts } from "@/theme/tokens";

WebBrowser.maybeCompleteAuthSession();

const NATIVE_OAUTH_RETURN_URL = "betterpomo://auth/callback";
const MOBILE_OAUTH_BRIDGE_URL = "https://app.betterpomo.com/auth/callback?mobile=1";

function getOAuthReturnUrl() {
  if (Platform.OS === "web") {
    return AuthSession.makeRedirectUri({ path: "auth/callback" });
  }

  // Keep this deterministic in development and production builds so Expo's
  // auth browser can recognize the deep link, close, and return control here.
  return AuthSession.makeRedirectUri({ native: NATIVE_OAUTH_RETURN_URL });
}

async function completeOAuthSession(callbackUrl: string) {
  const url = new URL(callbackUrl);
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
  const getParam = (name: string) => url.searchParams.get(name) ?? fragment.get(name);

  const errorDescription = getParam("error_description") ?? getParam("error");
  if (errorDescription) throw new Error(errorDescription);

  const code = getParam("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return;
  }

  // Supabase's PKCE flow returns a code, but accepting token callbacks keeps
  // older installed builds and provider-specific responses compatible.
  const accessToken = getParam("access_token");
  const refreshToken = getParam("refresh_token");
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return;
  }

  throw new Error("The sign-in provider did not return a session.");
}

export default function LoginScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

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

  async function handleEmailLogin() {
    if (!email.trim() || !password) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) dialog.toast(error.message || "Sign in failed", "error");
    // Success: AuthProvider's listener flips session → (auth) layout redirects.
  }

  /** Native Sign in with Apple (iOS only). Required by App Store Guideline
   *  4.8 because the app also offers Google login. Uses the id_token flow —
   *  Supabase's Apple provider must list com.betterpomo.app as a client id. */
  async function handleAppleLogin() {
    try {
      const credential = await AppleAuthentication.signInAsync({
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
      });
      if (error) dialog.toast(error.message || "Apple sign-in failed", "error");
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
      const returnUrl = getOAuthReturnUrl();
      // Supabase already allows the web callback. On native, that callback
      // forwards the PKCE code to the app's custom scheme without exchanging it,
      // so the verifier that is stored on this device can finish the session.
      const redirectTo = Platform.OS === "web" ? returnUrl : MOBILE_OAUTH_BRIDGE_URL;

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
            Sign in to your account
          </Text>
        </View>

        <Card style={styles.card}>
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
        </Card>

        <Text style={[styles.footer, { color: colors.mutedForeground, fontFamily: fonts.sans }]}>
          Don&apos;t have an account?{" "}
          <Link href="/register" style={{ color: colors.foreground, fontFamily: fonts.sansSemiBold }}>
            Create one
          </Link>
        </Text>

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
