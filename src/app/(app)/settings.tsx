import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { dialog } from "@/components/ui/dialog";
import { EmojiAvatar } from "@/components/ui/EmojiAvatar";
import { Segmented } from "@/components/ui/Segmented";
import { StackHeader } from "@/components/ui/StackHeader";
import { api } from "@/lib/api";
import { BILLING_ENABLED } from "@/lib/billing-flags";
import { useBilling, useInvalidate, useProfile } from "@/lib/hooks";
import { completeOAuthSession, getOAuthRedirects } from "@/lib/oauth";
import { purchasesAvailable, showManageSubscriptions } from "@/lib/purchases";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { useTheme, type ThemePreference } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

const EMOJI_CHOICES = [
  "🍅", "🤖", "🦊", "🐸", "🐙", "🦉", "🐢", "🦁",
  "🐼", "🐨", "🐯", "🦄", "🐝", "🦋", "🌵", "🌸",
  "🌙", "⭐", "🔥", "⚡", "🌊", "🍀", "🍄", "🎯",
  "🎨", "🎧", "📚", "☕", "🧠", "💪", "🚀", "🏔️",
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "How do sessions work?",
    a: "Create a session and share the 6-character code. Friends join and everyone sees the same timer in real time. Sessions keep running in the background until you explicitly leave.",
  },
  {
    q: "What's the difference between Pomodoro and Running Timer?",
    a: "Pomodoro cycles through work and break timers you configure. Running Timer is a stopwatch that counts up, with laps.",
  },
  {
    q: "Who can see my activity?",
    a: "Public profiles show session history and stats to everyone. Toggle 'Private profile' to hide them — only your friend count stays visible.",
  },
  {
    q: "How long do chat messages last?",
    a: "Direct and group messages disappear after 24 hours. Session chat lives as long as the session.",
  },
  {
    q: "What are the session recaps?",
    a: "When you leave a session, you can save it to history for a shareable recap with your totals and completed tasks, or leave without saving.",
  },
];

export default function SettingsScreen() {
  const { colors, preference, setPreference } = useTheme();
  const { session, signOut } = useAuth();
  const router = useRouter();
  const { data: profile, mutate } = useProfile();
  const { invalidateProfile } = useInvalidate();
  const [editOpen, setEditOpen] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [identityProviders, setIdentityProviders] = useState<Set<string> | null>(() => {
    const identities = session?.user.identities;
    return identities ? new Set(identities.map((identity) => identity.provider)) : null;
  });
  const [connecting, setConnecting] = useState<"apple" | "google" | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUserIdentities().then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setIdentityProviders((current) => current ?? new Set());
        return;
      }
      setIdentityProviders(new Set(data.identities.map((identity) => identity.provider)));
    });

    if (
      Platform.OS === "ios" &&
      Constants.executionEnvironment !== ExecutionEnvironment.StoreClient
    ) {
      AppleAuthentication.isAvailableAsync()
        .then((available) => {
          if (!cancelled) setAppleAvailable(available);
        })
        .catch(() => {
          if (!cancelled) setAppleAvailable(false);
        });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshIdentityProviders() {
    const { data, error } = await supabase.auth.getUserIdentities();
    if (error) throw error;
    const next = new Set(data.identities.map((identity) => identity.provider));
    setIdentityProviders(next);
    return next;
  }

  function identityErrorMessage(error: unknown) {
    const message = error instanceof Error ? error.message : "Could not connect that sign-in method";
    return message.toLowerCase().includes("manual")
      ? "Account linking is not enabled yet. Please try again after it is enabled."
      : message;
  }

  async function connectBrowserIdentity(provider: "apple" | "google") {
    const { returnUrl, redirectTo } = getOAuthRedirects();
    const { data, error } = await supabase.auth.linkIdentity({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data.url) throw error ?? new Error(`Could not start ${provider} connection`);

    const result = await WebBrowser.openAuthSessionAsync(data.url, returnUrl);
    if (result.type !== "success" || !result.url) return false;
    await completeOAuthSession(result.url);
    return true;
  }

  async function connectAppleIdentity() {
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    const credential = await AppleAuthentication.signInAsync({
      nonce: hashedNonce,
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
    if (!credential.identityToken) throw new Error("Apple did not return an identity token");

    const { error } = await supabase.auth.linkIdentity({
      provider: "apple",
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) throw error;
    return true;
  }

  async function connectIdentity(provider: "apple" | "google") {
    setConnecting(provider);
    try {
      const connected =
        provider === "apple" && Platform.OS === "ios"
          ? appleAvailable
            ? await connectAppleIdentity()
            : false
          : await connectBrowserIdentity(provider);
      if (!connected) {
        if (provider === "apple" && Platform.OS === "ios" && !appleAvailable) {
          dialog.toast("Apple connection requires the installed BetterPomo app.", "info");
        }
        return;
      }
      const providers = await refreshIdentityProviders();
      if (!providers.has(provider)) throw new Error(`${provider === "apple" ? "Apple" : "Google"} was not connected`);
      dialog.toast(`${provider === "apple" ? "Apple" : "Google"} connected to your account`, "success");
    } catch (error) {
      if ((error as { code?: string }).code === "ERR_REQUEST_CANCELED") return;
      dialog.toast(identityErrorMessage(error), "error");
    } finally {
      setConnecting(null);
    }
  }

  async function togglePrivacy(next: boolean) {
    try {
      await api.patch("/api/profile", { is_private: next });
      mutate();
      invalidateProfile();
    } catch (e) {
      dialog.toast(e instanceof Error ? e.message : "Failed to update privacy", "error");
    }
  }

  async function managePassword() {
    if (identityProviders === null) return;
    const hasPassword = identityProviders.has("email");
    let current: string | null = null;
    if (hasPassword) {
      current = await dialog.prompt({
        title: "Current password",
        message: "Enter your current password",
        placeholder: "Current password",
        secureTextEntry: true,
        confirmText: "Next",
      });
      if (!current) return;
    }
    const next = await dialog.prompt({
      title: hasPassword ? "New password" : "Set up a password",
      message: "Use at least 8 characters",
      placeholder: hasPassword ? "New password" : "Password",
      secureTextEntry: true,
      confirmText: "Next",
      validate: (value) => (value.length < 8 ? "Password must be at least 8 characters" : null),
    });
    if (!next) return;
    const confirmation = await dialog.prompt({
      title: "Confirm password",
      message: "Enter the new password again",
      placeholder: "Confirm password",
      secureTextEntry: true,
      confirmText: hasPassword ? "Update" : "Set password",
      validate: (value) => (value !== next ? "Passwords don't match" : null),
    });
    if (!confirmation) return;
    try {
      if (hasPassword) {
        await api.post("/api/profile/password", { currentPassword: current, newPassword: next });
        dialog.toast("Password updated", "success");
      } else {
        await api.post("/api/profile/password/set", { newPassword: next });
        setIdentityProviders((providers) => new Set([...(providers ?? []), "email"]));
        dialog.toast("Password set — you can now sign in with email and password", "success");
      }
    } catch (error) {
      dialog.toast(error instanceof Error ? error.message : "Failed to save password", "error");
    }
  }

  async function changeEmail() {
    const newEmail = await dialog.prompt({
      title: "New email",
      message: "You'll need to confirm it from your inbox",
      placeholder: "you@example.com",
      keyboardType: "email-address",
      autoCapitalize: "none",
      confirmText: "Next",
      validate: (v) => (v.includes("@") ? null : "Enter a valid email address"),
    });
    if (!newEmail) return;
    const pw = await dialog.prompt({
      title: "Confirm password",
      message: "Enter your current password to confirm",
      placeholder: "Current password",
      secureTextEntry: true,
      confirmText: "Update email",
    });
    if (!pw) return;
    try {
      await api.post("/api/profile/email", { newEmail: newEmail.trim(), currentPassword: pw });
      dialog.toast("Email updated — check your inbox to confirm", "success");
    } catch (e) {
      dialog.toast(e instanceof Error ? e.message : "Failed to change email", "error");
    }
  }

  async function confirmSignOut() {
    const ok = await dialog.confirm({
      title: "Sign out",
      message: "Are you sure you want to sign out?",
      confirmText: "Sign out",
      destructive: true,
    });
    if (ok) signOut();
  }

  async function confirmDeleteAccount() {
    const ok = await dialog.confirm({
      title: "Delete account",
      message:
        "This permanently deletes your account and all your data — profile, history, sessions, friends, and messages. This can't be undone.",
      confirmText: "Continue",
      destructive: true,
    });
    if (!ok) return;
    const typed = await dialog.prompt({
      title: "Are you sure?",
      message: 'Type DELETE to permanently remove your account.',
      confirmText: "Delete account",
    });
    if (typed?.trim().toUpperCase() !== "DELETE") {
      if (typed !== null) dialog.toast("Account not deleted — confirmation didn't match", "info");
      return;
    }
    try {
      await api.delete("/api/profile");
    } catch (e) {
      dialog.toast(e instanceof Error ? e.message : "Could not delete account", "error");
      return;
    }
    signOut();
  }

  const sectionTitle = (label: string) => (
    <Text style={{ fontSize: 15, fontFamily: fonts.sansSemiBold, color: colors.foreground }}>
      {label}
    </Text>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StackHeader title="Settings" />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Account card */}
        <Card style={styles.accountCard}>
          <EmojiAvatar emoji={profile?.emoji} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.foreground, fontFamily: fonts.sansSemiBold, fontSize: 16 }}>
              {profile?.display_name ?? profile?.username ?? "…"}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: fonts.sans, fontSize: 13 }}>
              {profile ? `@${profile.username} · ${profile.is_private ? "Private" : "Public"}` : "…"}
            </Text>
          </View>
          <Button title="Edit" size="sm" variant="outline" onPress={() => setEditOpen(true)} />
        </Card>

        {/* Plan & billing (hidden until paid plans launch) */}
        {BILLING_ENABLED && <PlanCard sectionTitle={sectionTitle} />}

        {/* Appearance */}
        <Card style={{ gap: 10 }}>
          {sectionTitle("Appearance")}
          <Segmented<ThemePreference>
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "system", label: "System" },
            ]}
            value={preference}
            onChange={setPreference}
          />
        </Card>

        {/* Privacy */}
        <Card style={{ gap: 4 }}>
          {sectionTitle("Privacy")}
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: fonts.sansMedium, color: colors.foreground }}>
                Private profile
              </Text>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sans }}>
                Hide your stats and history from others
              </Text>
            </View>
            <Switch
              value={profile?.is_private ?? false}
              onValueChange={togglePrivacy}
              trackColor={{ true: colors.foreground }}
            />
          </View>
        </Card>

        {/* Connected sign-in methods */}
        <Card style={{ gap: 12 }}>
          {sectionTitle("Connected accounts")}
          <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sans, lineHeight: 18 }}>
            Add another sign-in method to this profile. Connect Apple here while signed in, especially if you use Hide My Email.
          </Text>
          {(
            [
              ["apple", "Apple", "logo-apple"],
              ["google", "Google", "logo-google"],
            ] as const
          ).map(([provider, label, icon]) => {
            const connected = identityProviders?.has(provider) ?? false;
            return (
              <View key={provider} style={styles.securityRow}>
                <Ionicons name={icon} size={18} color={colors.mutedForeground} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: fonts.sansMedium, color: colors.foreground }}>{label}</Text>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sans }}>
                    {identityProviders === null ? "Checking…" : connected ? "Connected" : "Not connected"}
                  </Text>
                </View>
                {!connected && (
                  <Button
                    title={`Connect ${label}`}
                    size="sm"
                    variant="outline"
                    disabled={identityProviders === null || connecting !== null}
                    loading={connecting === provider}
                    onPress={() => connectIdentity(provider)}
                  />
                )}
              </View>
            );
          })}
        </Card>

        {/* Account security */}
        <Card style={{ gap: 12 }}>
          {sectionTitle("Account security")}
          <View style={styles.securityRow}>
            <Ionicons name="mail-outline" size={16} color={colors.mutedForeground} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.linkText, { color: colors.foreground }]}>Email</Text>
              <Text numberOfLines={1} style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sans }}>
                {session?.user.email ?? "—"}
              </Text>
            </View>
            <Button title="Change" size="sm" variant="ghost" onPress={changeEmail} />
          </View>
          <Pressable
            onPress={managePassword}
            disabled={identityProviders === null}
            accessibilityRole="button"
            accessibilityLabel={identityProviders?.has("email") ? "Change password" : "Set password"}
            style={styles.securityRow}
          >
            <Ionicons name="key-outline" size={16} color={colors.mutedForeground} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.linkText, { color: colors.foreground }]}>Password</Text>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sans }}>
                {identityProviders === null
                  ? "Checking…"
                  : identityProviders.has("email")
                    ? "Change the password you use to sign in"
                    : "Set one to also sign in with email"}
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sansMedium }}>
              {identityProviders?.has("email") ? "Change" : "Set password"}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} />
          </Pressable>
        </Card>

        {/* FAQ */}
        <Card style={{ gap: 4 }}>
          {sectionTitle("FAQ")}
          {FAQ.map((item, i) => (
            <View key={i}>
              <Pressable
                onPress={() => setExpandedFaq(expandedFaq === i ? null : i)}
                style={[styles.faqRow, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}
              >
                <Text style={{ flex: 1, fontSize: 13, fontFamily: fonts.sansMedium, color: colors.foreground }}>
                  {item.q}
                </Text>
                <Ionicons
                  name={expandedFaq === i ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={colors.mutedForeground}
                />
              </Pressable>
              {expandedFaq === i && (
                <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sans, lineHeight: 19, paddingBottom: 10 }}>
                  {item.a}
                </Text>
              )}
            </View>
          ))}
        </Card>

        {/* About */}
        <Card style={{ gap: 12 }}>
          {sectionTitle("About")}
          <Pressable onPress={() => router.push("/onboarding")} style={styles.linkRow}>
            <Ionicons name="sparkles-outline" size={16} color={colors.mutedForeground} />
            <Text style={[styles.linkText, { color: colors.foreground }]}>Replay intro tour</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} />
          </Pressable>
          {(
            [
              ["Terms", "https://betterpomo.com/terms"],
              ["Privacy policy", "https://betterpomo.com/privacy"],
              ["License", "https://betterpomo.com/license"],
            ] as const
          ).map(([label, url]) => (
            <Pressable key={label} onPress={() => Linking.openURL(url)} style={styles.linkRow}>
              <Ionicons name="open-outline" size={16} color={colors.mutedForeground} />
              <Text style={[styles.linkText, { color: colors.foreground }]}>{label}</Text>
            </Pressable>
          ))}
        </Card>

        <Button title="Sign out" variant="destructive" onPress={confirmSignOut} />

        <Pressable onPress={confirmDeleteAccount} style={styles.deleteRow}>
          <Text style={[styles.deleteText, { color: colors.destructive }]}>Delete account</Text>
        </Pressable>
      </ScrollView>

      <ProfileEditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        current={{
          username: profile?.username ?? "",
          display_name: profile?.display_name ?? profile?.username ?? "",
          emoji: profile?.emoji ?? "🍅",
          bio: profile?.bio ?? "",
        }}
        onSaved={() => {
          mutate();
          invalidateProfile();
          setEditOpen(false);
        }}
      />
    </View>
  );
}

// ── Profile edit modal ────────────────────────────────────────────────────────

/** Current plan + trial state, with the right management action per provider:
 *  App Store / Play → native subscription management; Stripe → web portal;
 *  free → the in-app upgrade paywall. */
function PlanCard({ sectionTitle }: { sectionTitle: (label: string) => React.ReactNode }) {
  const { colors } = useTheme();
  const router = useRouter();
  const { data: billing } = useBilling();

  if (!billing) return null;

  const isPro = billing.entitlements.isPro;
  const planLabel = billing.plan === "lifetime" ? "Lifetime" : billing.plan === "pro" ? "Pro" : "Free";
  const onTrial = billing.plan_status === "trialing";
  const dateStr = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : null;

  let detail: string;
  if (billing.plan === "lifetime") {
    detail = "Every Pro feature, forever. Thank you for being a Founder.";
  } else if (onTrial && billing.trial_ends_at) {
    detail = `Free trial — your subscription starts on ${dateStr(billing.trial_ends_at)}. Cancel anytime before then.`;
  } else if (billing.plan === "pro" && billing.plan_status === "past_due") {
    detail = "There's a problem with your payment method — update it to keep Pro.";
  } else if (billing.plan === "pro" && billing.cancel_at_period_end && billing.plan_period_end) {
    detail = `Cancels on ${dateStr(billing.plan_period_end)}. You keep Pro until then.`;
  } else if (billing.plan === "pro" && billing.plan_period_end) {
    detail = `Renews on ${dateStr(billing.plan_period_end)}.`;
  } else {
    detail = "Pro unlocks your full history, private sessions, and more.";
  }

  async function manage() {
    if (billing!.plan_provider === "stripe") {
      try {
        const { url } = await api.post<{ url: string }>("/api/billing/portal");
        Linking.openURL(url);
      } catch {
        dialog.toast("Could not open the billing portal", "error");
      }
    } else if (purchasesAvailable) {
      await showManageSubscriptions();
    } else {
      dialog.alert({
        title: "Manage subscription",
        message: "Manage your subscription in the App Store / Google Play settings.",
      });
    }
  }

  return (
    <Card style={{ gap: 8 }}>
      {sectionTitle("Plan")}
      <View style={styles.rowBetween}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontFamily: fonts.sansMedium, color: colors.foreground }}>
            {planLabel} plan{onTrial ? " · trial" : ""}
          </Text>
          <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sans }}>
            {detail}
          </Text>
        </View>
        {billing.plan === "lifetime" ? null : isPro ? (
          <Button title="Manage" size="sm" variant="outline" onPress={manage} />
        ) : (
          <Button
            title={billing.trial_used ? "Upgrade" : "Try Pro free"}
            size="sm"
            onPress={() => router.push("/upgrade")}
          />
        )}
      </View>
    </Card>
  );
}

function ProfileEditModal({
  open,
  onClose,
  current,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  current: { username: string; display_name: string; emoji: string; bio: string };
  onSaved: () => void;
}) {
  const { colors } = useTheme();
  const [username, setUsername] = useState(current.username);
  const [displayName, setDisplayName] = useState(current.display_name);
  const [emoji, setEmoji] = useState(current.emoji);
  const [bio, setBio] = useState(current.bio);
  const [busy, setBusy] = useState(false);

  // Reset the fields to the current values each time the dialog opens, adjusting
  // state during render rather than in an effect.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setUsername(current.username);
      setDisplayName(current.display_name);
      setEmoji(current.emoji);
      setBio(current.bio);
    }
  }

  async function save() {
    const patch: Record<string, unknown> = {};
    if (displayName.trim() && displayName.trim() !== current.display_name) patch.display_name = displayName.trim();
    if (username.trim() && username.trim() !== current.username) patch.username = username.trim();
    if (emoji !== current.emoji) patch.emoji = emoji;
    if (bio.trim() !== current.bio) patch.bio = bio.trim() || null;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await api.patch("/api/profile", patch);
      onSaved();
    } catch (e) {
      dialog.toast(e instanceof Error ? e.message : "Failed to save", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable
          style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={{ fontSize: 16, fontFamily: fonts.sansSemiBold, color: colors.foreground, marginBottom: 14 }}>
            Edit profile
          </Text>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>EMOJI</Text>
          <View style={styles.emojiGrid}>
            {EMOJI_CHOICES.map((e) => (
              <Pressable
                key={e}
                onPress={() => setEmoji(e)}
                style={[
                  styles.emojiCell,
                  emoji === e && { backgroundColor: colors.muted, borderColor: colors.foreground, borderWidth: 1.5 },
                ]}
              >
                <Text style={{ fontSize: 20 }}>{e}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>DISPLAY NAME</Text>
          <TextInput
            value={displayName}
            onChangeText={(t) => setDisplayName(t.slice(0, 50))}
            placeholder="Your display name"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.editInput, { borderColor: colors.border, color: colors.foreground, fontFamily: fonts.sans }]}
          />

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>USERNAME</Text>
          <TextInput
            value={username}
            onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24))}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.editInput, { borderColor: colors.border, color: colors.foreground, fontFamily: fonts.sans }]}
          />

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>BIO</Text>
          <TextInput
            value={bio}
            onChangeText={(t) => setBio(t.slice(0, 160))}
            multiline
            placeholder="Say something about yourself"
            placeholderTextColor={colors.mutedForeground}
            style={[
              styles.editInput,
              { borderColor: colors.border, color: colors.foreground, fontFamily: fonts.sans, height: 70, textAlignVertical: "top", paddingTop: 8 },
            ]}
          />

          <Button title="Save" onPress={save} loading={busy} style={{ marginTop: 16 }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 14, paddingTop: 16, paddingBottom: 40 },
  accountCard: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowBetween: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  securityRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 42 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 2 },
  linkText: { flex: 1, fontSize: 14, fontFamily: "PlusJakartaSans_500Medium" },
  faqRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 },
  deleteRow: { alignItems: "center", paddingVertical: 12 },
  deleteText: { fontSize: 14, fontFamily: "PlusJakartaSans_500Medium" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    alignSelf: "stretch",
    borderWidth: 1,
    borderRadius: radius["2xl"],
    padding: 18,
  },
  fieldLabel: { fontSize: 10, letterSpacing: 2, marginBottom: 6, fontFamily: "PlusJakartaSans_500Medium" },
  emojiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  emojiCell: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  editInput: {
    height: 42,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    fontSize: 14,
  },
});
