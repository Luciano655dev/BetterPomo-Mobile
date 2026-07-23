import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { dialog } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/hooks";
import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

interface Preview {
  conversation_id: string;
  group: { title: string; emoji: string } | null;
  expires_at: string;
  uses_remaining: number;
  already_member: boolean;
}

export default function GroupInviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { invalidateChat } = useInvalidate();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.get<Preview>(`/api/chat/group-invite-links/${encodeURIComponent(token)}`).then(setPreview).catch((cause) => setError(cause instanceof Error ? cause.message : "This invitation is unavailable"));
  }, [token]);

  async function accept() {
    if (!preview || !token) return;
    if (preview.already_member) { router.replace(`/messages/${preview.conversation_id}`); return; }
    setBusy(true);
    try {
      const result = await api.post<{ conversation_id: string }>(`/api/chat/group-invite-links/${encodeURIComponent(token)}/accept`);
      invalidateChat();
      dialog.toast("You joined the group", "success");
      router.replace(`/messages/${result.conversation_id}`);
    } catch (cause) {
      dialog.toast(cause instanceof Error ? cause.message : "Could not join this group", "error");
      setBusy(false);
    }
  }

  return <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}><View style={styles.nav}><Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={25} color={colors.foreground} /></Pressable><Text style={[styles.navTitle, { color: colors.foreground }]}>Group invitation</Text></View><View style={styles.center}>{error ? <><View style={[styles.icon, { backgroundColor: colors.muted }]}><Ionicons name="link-outline" size={30} color={colors.mutedForeground} /></View><Text style={[styles.title, { color: colors.foreground }]}>Invitation unavailable</Text><Text style={[styles.body, { color: colors.mutedForeground }]}>{error}</Text><Button title="Go to Messages" variant="outline" onPress={() => router.replace("/messages")} /></> : !preview ? <><Ionicons name="hourglass-outline" size={30} color={colors.mutedForeground} /><Text style={[styles.body, { color: colors.mutedForeground }]}>Checking invitation…</Text></> : <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.groupIcon, { backgroundColor: colors.muted }]}><Text style={{ fontSize: 38 }}>{preview.group?.emoji ?? "👥"}</Text></View><Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>GROUP INVITATION</Text><Text style={[styles.title, { color: colors.foreground }]}>{preview.group?.title ?? "BetterPomo group"}</Text><View style={[styles.security, { borderColor: colors.border }]}><Text style={[styles.body, { color: colors.foreground }]}>🛡️ Secure, single-purpose invitation</Text><Text style={[styles.body, { color: colors.mutedForeground }]}>⏱ Expires {new Date(preview.expires_at).toLocaleString()}</Text></View><Button title={preview.already_member ? "Open group" : "Accept and join"} size="lg" loading={busy} onPress={accept} style={{ width: "100%" }} /><Text style={[styles.note, { color: colors.mutedForeground }]}>Joining shares group-visible focus activity according to your privacy settings.</Text></View>}</View></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 }, nav: { height: 52, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16 }, navTitle: { fontSize: 16, fontFamily: fonts.sansSemiBold }, center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 20 }, card: { width: "100%", maxWidth: 440, borderWidth: 1, borderRadius: radius["3xl"], padding: 22, alignItems: "center", gap: 12 }, icon: { width: 68, height: 68, borderRadius: radius["3xl"], alignItems: "center", justifyContent: "center" }, groupIcon: { width: 82, height: 82, borderRadius: radius["3xl"], alignItems: "center", justifyContent: "center" }, eyebrow: { fontSize: 10, letterSpacing: 1.5, fontFamily: fonts.sansSemiBold, marginTop: 3 }, title: { fontSize: 22, fontFamily: fonts.sansBold, textAlign: "center" }, body: { fontSize: 12, lineHeight: 18, fontFamily: fonts.sans, textAlign: "center" }, security: { width: "100%", borderWidth: 1, borderRadius: radius.xl, padding: 13, gap: 7, marginVertical: 4 }, note: { fontSize: 10, lineHeight: 15, fontFamily: fonts.sans, textAlign: "center" },
});
