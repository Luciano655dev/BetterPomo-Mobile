import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { Button } from "@/components/ui/Button";
import { dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";
import { api, ApiError, isUpgradeRequired } from "@/lib/api";
import { useProfile } from "@/lib/hooks";
import { useIsOnline } from "@/lib/network";
import { createOfflineSession, loadOfflineSession } from "@/lib/offline-session";
import { useAuth } from "@/providers/AuthProvider";
import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

const SESSION_NAME_PRESETS = [
  "deep work", "morning focus", "study session", "side project",
  "code review", "writing", "design sprint", "research",
  "reading", "planning", "bug hunt", "feature work",
  "learning", "emails", "admin tasks", "brainstorm",
];

type SessionType = "pomodoro" | "stopwatch";

export default function CreateSessionScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const online = useIsOnline();
  const { session } = useAuth();
  const { data: profile } = useProfile();
  // Optimistic until the profile loads; the API enforces the gate regardless.
  const canPrivate = profile?.entitlements?.privateSessions ?? true;
  const [name, setName] = useState("");
  const [sessionType, setSessionType] = useState<SessionType>("pomodoro");
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState("");
  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pastNames, setPastNames] = useState<string[]>([]);

  // No connection means no server session — the offline mode is the only one
  // that can work, so it's forced on rather than letting create fail.
  const offlineMode = isOffline || !online;

  /** This screen is a native `modal`; the session screens are `fullScreenModal`s.
   *  Replacing one native presentation type with another mid-dismissal sometimes
   *  tears the incoming screen down with the outgoing modal (the session page
   *  "flicks" and pops back, leaving the user joined server-side but not in the
   *  UI). Dismiss the modal first, then push from the base stack. */
  function goToSession(path: Href) {
    router.dismiss();
    router.push(path);
  }

  useEffect(() => {
    api
      .get<{ session_name: string }[]>("/api/history?limit=200")
      .then((data) => {
        if (!data) return;
        setPastNames([...new Set(data.map((h) => h.session_name))]);
      })
      .catch(() => null);
  }, []);

  const suggestions = pastNames
    .filter((n) =>
      name.trim()
        ? n.toLowerCase().includes(name.toLowerCase().trim()) &&
          n.toLowerCase() !== name.toLowerCase().trim()
        : true,
    )
    .slice(0, 6);

  function randomName() {
    const unused = SESSION_NAME_PRESETS.filter((n) => !pastNames.includes(n));
    const pool = unused.length > 0 ? unused : SESSION_NAME_PRESETS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  async function handleSubmit() {
    let trimmed = name.trim();
    if (!trimmed) {
      trimmed = randomName();
      setName(trimmed);
    }
    if (trimmed.length > 60) {
      dialog.toast("Session name must be 60 characters or less", "error");
      return;
    }
    setLoading(true);
    if (offlineMode) {
      const userId = session?.user.id;
      if (!userId) {
        setLoading(false);
        return;
      }
      const existing = await loadOfflineSession(userId);
      if (existing) {
        // Only one offline session at a time — resume rather than overwrite.
        const resume = await dialog.confirm({
          title: "Resume offline session?",
          message: `You already have "${existing.name}" in progress on this device.`,
          confirmText: "Resume",
        });
        setLoading(false);
        if (resume) goToSession("/offline-session");
        return;
      }
      await createOfflineSession(userId, trimmed, sessionType);
      goToSession("/offline-session");
      return;
    }
    try {
      const result = await api.post<{ code: string }>("/api/sessions", {
        name: trimmed,
        is_private: isPrivate,
        ...(isPrivate && password ? { password } : {}),
        session_type: sessionType,
      });
      goToSession(`/session/${result.code}`);
    } catch (err) {
      setLoading(false);
      if (isUpgradeRequired(err)) {
        const go = await dialog.confirm({
          title: "Private sessions are a Pro feature",
          message: "Lock your sessions with privacy and an optional password. Try Pro free for 7 days?",
          confirmText: "See Pro",
        });
        if (go) router.push("/upgrade");
        return;
      }
      // One session at a time: offer the way back into the running one instead
      // of a dead-end error.
      if (err instanceof ApiError && err.status === 409) {
        const go = await dialog.confirm({
          title: "You're already in a session",
          message: "Leave your current session to start a new one, or return to it now.",
          confirmText: "Return to session",
        });
        if (go) {
          const active = await api
            .get<{ session: { code: string } } | null>("/api/sessions/mine/active")
            .catch(() => null);
          if (active?.session?.code) {
            goToSession(`/session/${active.session.code}`);
            return;
          }
          dialog.toast("Couldn't find your active session — try again", "error");
        }
        return;
      }
      dialog.toast((err as Error).message || "Failed to create session", "error");
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
              New Session
            </Text>
            <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sans, marginTop: 2 }}>
              Give your session a name to get started
            </Text>
          </View>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="close" size={24} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <Segmented<SessionType>
          options={[
            { value: "pomodoro", label: "Pomodoro" },
            { value: "stopwatch", label: "Running Timer" },
          ]}
          value={sessionType}
          onChange={setSessionType}
        />

        <View style={{ gap: 8 }}>
          <View style={{ position: "relative" }}>
            <Input
              label="Session name"
              placeholder="e.g. javascript, study, work…"
              value={name}
              onChangeText={(t) => setName(t.slice(0, 60))}
              autoCorrect={false}
              autoCapitalize="none"
              maxLength={60}
            />
            <Pressable
              onPress={() => setName(randomName())}
              style={styles.skipBtn}
              hitSlop={8}
            >
              <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sansMedium }}>
                Skip
              </Text>
            </Pressable>
          </View>

          {suggestions.length > 0 && (
            <View style={styles.chips}>
              {suggestions.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setName(s)}
                  style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.card }]}
                >
                  <Text style={{ fontSize: 12, color: colors.foreground, fontFamily: fonts.sans }}>
                    {s}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {pastNames.length > 0 && !name ? (
            <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: fonts.sans }}>
              Pick a past name to group sessions
            </Text>
          ) : null}
        </View>

        <View style={{ gap: 12 }}>
          <View style={styles.privacyRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: fonts.sansMedium, color: colors.foreground }}>
                Offline solo session
              </Text>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sans }}>
                {!online
                  ? "You're offline — it will sync to your history later"
                  : offlineMode
                    ? "Runs on this device only — no one can join"
                    : "Run on this device only, no connection needed"}
              </Text>
            </View>
            <Switch
              value={offlineMode}
              disabled={!online}
              onValueChange={setIsOffline}
              trackColor={{ true: colors.foreground }}
            />
          </View>

          {!offlineMode && (
            <View style={styles.privacyRow}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: fonts.sansMedium, color: colors.foreground }}>
                  Private session{canPrivate ? "" : "  ·  Pro"}
                </Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sans }}>
                  {isPrivate ? "Require a password to join" : "Anyone with the code can join"}
                </Text>
              </View>
              <Switch
                value={isPrivate}
                onValueChange={async (v) => {
                  if (v && !canPrivate) {
                    const go = await dialog.confirm({
                      title: "Private sessions are a Pro feature",
                      message:
                        "Lock your sessions with privacy and an optional password. Try Pro free for 7 days?",
                      confirmText: "See Pro",
                    });
                    if (go) router.push("/upgrade");
                    return;
                  }
                  setIsPrivate(v);
                  setPassword("");
                }}
                trackColor={{ true: colors.foreground }}
              />
            </View>
          )}

          {!offlineMode && isPrivate && (
            <Input
              label="Session password (optional)"
              placeholder="Leave blank for code-only access"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              maxLength={72}
            />
          )}
        </View>

        <Button
          title={
            loading
              ? "Creating…"
              : offlineMode
                ? "Start Offline →"
                : sessionType === "stopwatch"
                  ? "Start Timer →"
                  : "Start Pomo →"
          }
          onPress={handleSubmit}
          loading={loading}
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
  skipBtn: { position: "absolute", right: 12, top: 36 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  privacyRow: { flexDirection: "row", alignItems: "center", gap: 12 },
});
