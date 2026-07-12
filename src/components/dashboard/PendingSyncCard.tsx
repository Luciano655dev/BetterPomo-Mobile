import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useDialog } from "@/components/ui/dialog";
import { useInvalidate } from "@/lib/hooks";
import { useIsOnline } from "@/lib/network";
import {
  getQueue,
  removeEntry,
  subscribeQueue,
  type PendingUpload,
} from "@/lib/offline-queue";
import { syncPendingUploads } from "@/lib/offline-sync";
import { useAuth } from "@/providers/AuthProvider";
import { useTheme } from "@/theme/ThemeContext";
import { fonts } from "@/theme/tokens";

/**
 * Shown on the dashboard while completed sessions are waiting to reach the
 * server. Queue entries stay out of HistorySection itself — they have no
 * server id yet, so rename/delete/recap would all misbehave there.
 */
export function PendingSyncCard() {
  const { colors } = useTheme();
  const dialog = useDialog();
  const online = useIsOnline();
  const { session } = useAuth();
  const { invalidateHistory } = useInvalidate();
  const userId = session?.user.id;
  const [entries, setEntries] = useState<PendingUpload[]>([]);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => {
    getQueue().then((q) => setEntries(q.filter((e) => e.user_id === userId)));
  }, [userId]);

  useEffect(() => {
    refresh();
    return subscribeQueue(refresh);
  }, [refresh]);

  if (!entries.length) return null;

  const failed = entries.filter((e) => e.status === "failed");
  const waiting = entries.length - failed.length;

  const syncNow = async () => {
    setSyncing(true);
    await syncPendingUploads(invalidateHistory);
    setSyncing(false);
  };

  const discard = async (entry: PendingUpload) => {
    const ok = await dialog.confirm({
      title: "Discard this session?",
      message: `"${entry.payload.session_name}" couldn't be saved to your account and will be lost.`,
      confirmText: "Discard",
      destructive: true,
    });
    if (ok) removeEntry(entry.client_id);
  };

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <Ionicons name="cloud-upload-outline" size={18} color={colors.mutedForeground} />
        <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.sansSemiBold }]}>
          {waiting > 0
            ? `${waiting} session${waiting === 1 ? "" : "s"} waiting to sync`
            : "Sessions that couldn't sync"}
        </Text>
      </View>
      <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: fonts.sans }]}>
        {online
          ? "They'll upload automatically — or sync now."
          : "They'll upload automatically when you're back online."}
      </Text>
      {failed.map((entry) => (
        <View key={entry.client_id} style={[styles.failedRow, { borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.failedName, { color: colors.foreground, fontFamily: fonts.sansMedium }]}>
              {entry.payload.session_name}
            </Text>
            <Text style={[styles.failedError, { color: colors.destructive, fontFamily: fonts.sans }]}>
              {entry.last_error ?? "Rejected by the server"}
            </Text>
          </View>
          <Pressable onPress={() => discard(entry)} hitSlop={8} accessibilityLabel="Discard session">
            <Ionicons name="trash-outline" size={18} color={colors.destructive} />
          </Pressable>
        </View>
      ))}
      {online && waiting > 0 ? (
        <Button title="Sync now" size="sm" variant="outline" loading={syncing} onPress={syncNow} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 14 },
  subtitle: { fontSize: 12, lineHeight: 17 },
  failedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    paddingTop: 8,
    marginTop: 2,
  },
  failedName: { fontSize: 13 },
  failedError: { fontSize: 11, marginTop: 1 },
});
