import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  AppState,
  Linking,
  Modal,
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
import { useBilling, useInvalidate, useNotificationPreferences, useProfile, type NotificationPreferences } from "@/lib/hooks";
import {
  getNotificationPermissionStatus,
  registerPushDevice,
  requestNotificationPermission,
  setLocalTimerNotificationsEnabled,
} from "@/lib/notifications";
import { purchasesAvailable, showManageSubscriptions } from "@/lib/purchases";
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
  const { signOut } = useAuth();
  const router = useRouter();
  const { data: profile, mutate } = useProfile();
  const { data: notificationPreferences, mutate: mutateNotificationPreferences } = useNotificationPreferences();
  const { invalidateProfile } = useInvalidate();
  const [editOpen, setEditOpen] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<string>("undetermined");

  useEffect(() => {
    const refreshPermission = () => void getNotificationPermissionStatus().then(setNotificationPermission);
    refreshPermission();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshPermission();
    });
    return () => subscription.remove();
  }, []);

  async function enableSystemNotifications() {
    if (notificationPermission === "denied") {
      await Linking.openSettings();
      return;
    }
    const granted = await requestNotificationPermission();
    setNotificationPermission(granted ? "granted" : "denied");
    if (granted) await registerPushDevice();
  }

  async function toggleNotification(key: keyof NotificationPreferences, enabled: boolean) {
    const previous = notificationPreferences ?? {
      timers: true, friends: true, sessions: true, messages: true, account: true,
    };
    const next = { ...previous, [key]: enabled };
    await mutateNotificationPreferences(next, { revalidate: false });
    if (key === "timers") await setLocalTimerNotificationsEnabled(enabled);
    try {
      await api.patch("/api/notifications/preferences", { [key]: enabled });
      await mutateNotificationPreferences();
    } catch (e) {
      await mutateNotificationPreferences(previous, { revalidate: false });
      if (key === "timers") await setLocalTimerNotificationsEnabled(previous.timers);
      dialog.toast(e instanceof Error ? e.message : "Failed to update notifications", "error");
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

  async function changePassword() {
    const current = await dialog.prompt({
      title: "Current password",
      message: "Enter your current password",
      placeholder: "Current password",
      secureTextEntry: true,
      confirmText: "Next",
    });
    if (!current) return;
    const next = await dialog.prompt({
      title: "New password",
      message: "At least 6 characters",
      placeholder: "New password",
      secureTextEntry: true,
      confirmText: "Update",
      validate: (v) => (v.length < 6 ? "Password must be at least 6 characters" : null),
    });
    if (!next) return;
    try {
      await api.post("/api/profile/password", { currentPassword: current, newPassword: next });
      dialog.toast("Password updated", "success");
    } catch (e) {
      dialog.toast(e instanceof Error ? e.message : "Failed to change password", "error");
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

        {/* Notification permission + category controls */}
        <Card style={{ gap: 12 }}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              {sectionTitle("Notifications")}
              <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sans, marginTop: 2 }}>
                {notificationPermission === "granted" ? "Enabled in iOS" : "Disabled in iOS"}
              </Text>
            </View>
            {notificationPermission !== "granted" && (
              <Button
                title={notificationPermission === "denied" ? "Open Settings" : "Enable"}
                size="sm"
                variant="outline"
                onPress={enableSystemNotifications}
              />
            )}
          </View>
          {(
            [
              ["timers", "Timers", "Pomodoro completion alerts"],
              ["friends", "Friends", "Friend requests and acceptances"],
              ["sessions", "Sessions", "Invitations to focus sessions"],
              ["messages", "Messages", "New messages and group additions"],
              ["account", "Account", "Important plan and account reminders"],
            ] as const
          ).map(([key, label, detail]) => (
            <View key={key} style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: fonts.sansMedium, color: colors.foreground }}>{label}</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sans }}>{detail}</Text>
              </View>
              <Switch
                value={notificationPreferences?.[key] ?? true}
                onValueChange={(enabled) => toggleNotification(key, enabled)}
                trackColor={{ true: colors.foreground }}
              />
            </View>
          ))}
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

        {/* Account security */}
        <Card style={{ gap: 12 }}>
          {sectionTitle("Account security")}
          <Pressable onPress={changePassword} style={styles.linkRow}>
            <Ionicons name="key-outline" size={16} color={colors.mutedForeground} />
            <Text style={[styles.linkText, { color: colors.foreground }]}>Change password</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} />
          </Pressable>
          <Pressable onPress={changeEmail} style={styles.linkRow}>
            <Ionicons name="mail-outline" size={16} color={colors.mutedForeground} />
            <Text style={[styles.linkText, { color: colors.foreground }]}>Change email</Text>
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
