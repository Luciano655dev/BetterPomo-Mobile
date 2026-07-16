import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SessionScreen } from "@/components/session/SessionScreen";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api, ApiError } from "@/lib/api";
import type {
  ParticipantRole,
  SessionData,
  SessionParticipant,
  SessionTimer,
} from "@/lib/session-types";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/theme/ThemeContext";
import { fonts } from "@/theme/tokens";

interface LoadedState {
  session: SessionData;
  timers: SessionTimer[];
  userId: string;
  userRole: ParticipantRole;
  userJoinedAt: string;
  userProfile: { id: string; username: string; display_name: string; emoji: string };
}

interface JoinedResponse {
  session: SessionData;
  participant: { role: ParticipantRole; joined_at: string };
}

export default function SessionRoute() {
  const { code: rawCode } = useLocalSearchParams<{ code: string }>();
  const code = (rawCode ?? "").toUpperCase();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [state, setState] = useState<LoadedState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState<SessionData | null>(null);
  const [pwInput, setPwInput] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState("");

  const finishLoad = useCallback(
    async (session: SessionData, participant: { role: ParticipantRole; joined_at: string }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const [timers, profile] = await Promise.all([
        api.get<SessionTimer[]>(`/api/sessions/${session.id}/timers`),
        api.get<{ id: string; username: string; display_name: string; emoji: string }>("/api/profile"),
        api.patch(`/api/sessions/${session.id}/participants/me`, { left_at: null }).catch(() => null),
      ]);
      setNeedsPassword(null);
      setState({
        session,
        timers: timers ?? [],
        userId: user.id,
        userRole: participant.role,
        userJoinedAt: participant.joined_at,
        userProfile: {
          id: user.id,
          username: profile?.username ?? "Unknown",
          display_name: profile?.display_name ?? profile?.username ?? "Unknown",
          emoji: profile?.emoji ?? "🍅",
        },
      });
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      let session: SessionData;
      try {
        session = await api.get<SessionData>(`/api/sessions/by-code/${code}`);
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message.includes("404") ? "Session not found." : "Failed to load session.");
        return;
      }
      if (session.status === "ended") {
        if (!cancelled) setError("This session has ended.");
        return;
      }

      // Join first; only join failures should surface as "could not join".
      let participant: { role: ParticipantRole; joined_at: string };
      try {
        const joined = await api.post<JoinedResponse>("/api/sessions/join", { code });
        participant = joined.participant;
      } catch (joinErr) {
        if (cancelled) return;
        const msg = (joinErr as Error).message ?? "";
        if (msg.includes("401") || msg.toLowerCase().includes("password")) {
          setNeedsPassword(session);
          return;
        }
        if (session.is_password_protected) {
          setNeedsPassword(session);
          return;
        }
        // Fallback: maybe already a participant.
        const detail = await api
          .get<{ participants: SessionParticipant[] }>(`/api/sessions/${session.id}`)
          .catch(() => null);
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const me = detail?.participants?.find((p) => p.user_id === user?.id);
        if (!me) {
          // Surface the server's reason when it has one (e.g. "You're already
          // in a session…") instead of a generic dead end.
          setError(
            joinErr instanceof ApiError && joinErr.status === 409 && joinErr.message
              ? joinErr.message
              : "Could not join session.",
          );
          return;
        }
        participant = { role: me.role, joined_at: me.joined_at };
      }

      if (cancelled) return;
      try {
        await finishLoad(session, participant);
      } catch {
        if (!cancelled) setError("Failed to load session.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [code, finishLoad]);

  async function submitPassword() {
    if (!pwInput || !needsPassword) return;
    setPwLoading(true);
    setPwError("");
    try {
      const joined = await api.post<JoinedResponse>("/api/sessions/join", {
        code,
        password: pwInput,
      });
      await finishLoad(needsPassword, joined.participant);
    } catch {
      setPwError("Incorrect password. Try again.");
    } finally {
      setPwLoading(false);
    }
  }

  if (state) {
    return (
      <SessionScreen
        session={state.session}
        timers={state.timers}
        userId={state.userId}
        userRole={state.userRole}
        userJoinedAt={state.userJoinedAt}
        userProfile={state.userProfile}
      />
    );
  }

  if (needsPassword) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.center, { paddingTop: insets.top + 60 }]}
          keyboardShouldPersistTaps="handled"
        >
          <Ionicons name="lock-closed-outline" size={40} color={colors.mutedForeground} />
          <Text style={{ fontSize: 18, fontFamily: fonts.sansSemiBold, color: colors.foreground, marginTop: 12 }}>
            {needsPassword.name}
          </Text>
          <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sans, marginBottom: 24 }}>
            This session is password-protected
          </Text>
          <View style={{ alignSelf: "stretch", gap: 16 }}>
            <Input
              label="Password"
              placeholder="Enter session password"
              value={pwInput}
              onChangeText={(t) => {
                setPwInput(t);
                setPwError("");
              }}
              secureTextEntry
              autoFocus
              error={pwError || null}
              onSubmitEditing={submitPassword}
            />
            <Button
              title={pwLoading ? "Joining…" : "Join Session →"}
              onPress={submitPassword}
              loading={pwLoading}
              disabled={!pwInput}
            />
            <Button title="Back" variant="ghost" onPress={() => router.back()} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: colors.background, justifyContent: "center" }]}>
        <Ionicons name="alert-circle-outline" size={44} color={colors.mutedForeground} />
        <Text style={{ fontSize: 15, fontFamily: fonts.sansSemiBold, color: colors.foreground, marginTop: 10 }}>
          {error}
        </Text>
        <Button title="Back" variant="outline" style={{ marginTop: 20, minWidth: 140 }} onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={[styles.center, { flex: 1, backgroundColor: colors.background, justifyContent: "center" }]}>
      <ActivityIndicator />
      <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sans, marginTop: 12 }}>
        Loading session…
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", paddingHorizontal: 24 },
});
