import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { dialog, type ActionOption } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { isBreakTimer, type SessionParticipant, type SessionTimer } from "@/lib/session-types";
import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

const WORK_NAMES = [
  "Sprint", "Focus", "Flow", "Grind", "Crunch", "Blitz", "Push", "Deep Work",
  "Study", "Code", "Hustle", "Dash", "Burst", "Charge", "Think", "Build", "Hammer", "Zone",
];
const BREAK_NAMES = [
  "Chill", "Recharge", "Breeze", "Unwind", "Rest", "Walk", "Refresh", "Breathe",
  "Pause", "Stretch", "Power Nap", "Snack", "Coffee", "Eyes Off", "Stroll",
];

function timerColor(name: string) {
  const l = name.toLowerCase();
  if (l.includes("long")) return "#3b82f6";
  if (l.includes("break") || l.includes("rest")) return "#22c55e";
  return "#ef4444";
}

function fmtMMSS(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function parseSecs(raw: string): number | null {
  const s = raw.trim();
  const colon = s.match(/^(\d+):(\d{1,2})$/);
  if (colon) return parseInt(colon[1]) * 60 + parseInt(colon[2]);
  const h = s.match(/(\d+)\s*h/i);
  const m = s.match(/(\d+)\s*m(?!s)/i);
  if (h || m) return (h ? parseInt(h[1]) * 3600 : 0) + (m ? parseInt(m[1]) * 60 : 0);
  const n = parseInt(s);
  if (!isNaN(n) && n > 0) return n * 60;
  return null;
}

interface ConfigPanelProps {
  sessionId: string;
  sessionType: "pomodoro" | "stopwatch";
  isPrivate: boolean;
  timers: SessionTimer[];
  participants: SessionParticipant[];
  currentUserId: string;
  currentUserRole: "owner" | "admin" | "member";
  onParticipantsChange: () => void;
  onTimersChange: () => void;
  onSwitchType: (type: "pomodoro" | "stopwatch") => void;
  onPrivacyChange: (isPrivate: boolean) => void;
  onOpenUser?: (username: string) => void;
}

function TimerRow({
  timer,
  canEdit,
  sessionId,
  totalTimers,
  onChanged,
}: {
  timer: SessionTimer;
  canEdit: boolean;
  sessionId: string;
  totalTimers: number;
  onChanged: () => void;
}) {
  const { colors } = useTheme();
  const color = timerColor(timer.name);

  async function rename() {
    if (!canEdit) return;
    const name = await dialog.prompt({
      title: "Rename timer",
      defaultValue: timer.name,
      confirmText: "Rename",
    });
    const trimmed = name?.trim();
    if (!trimmed || trimmed === timer.name) return;
    try {
      await api.patch(`/api/sessions/${sessionId}/timers/${timer.id}`, { name: trimmed });
      onChanged();
    } catch {
      dialog.toast("Failed to rename", "error");
    }
  }

  async function editDuration() {
    if (!canEdit) return;
    const raw = await dialog.prompt({
      title: "Timer duration",
      message: 'Minutes, "mm:ss", or "1h 30m"',
      defaultValue: String(Math.floor(timer.duration / 60)),
      keyboardType: "numbers-and-punctuation",
      confirmText: "Save",
    });
    const secs = raw != null ? parseSecs(raw) : null;
    if (!secs || secs <= 0 || secs === timer.duration) return;
    try {
      await api.patch(`/api/sessions/${sessionId}/timers/${timer.id}`, { duration: secs });
      onChanged();
    } catch {
      dialog.toast("Failed to update duration", "error");
    }
  }

  async function remove() {
    if (totalTimers <= 1) {
      dialog.alert({ title: "Need at least one timer", message: "A session must keep one timer." });
      return;
    }
    const ok = await dialog.confirm({
      title: "Delete timer",
      message: `Remove "${timer.name}"?`,
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/sessions/${sessionId}/timers/${timer.id}`);
      onChanged();
    } catch {
      dialog.toast("Failed to remove", "error");
    }
  }

  return (
    <View style={styles.timerRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Pressable onPress={rename} style={{ flex: 1 }} disabled={!canEdit}>
        <Text numberOfLines={1} style={{ fontSize: 14, color: colors.foreground, fontFamily: fonts.sans }}>
          {timer.name}
        </Text>
      </Pressable>
      <Pressable onPress={editDuration} disabled={!canEdit}>
        <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.mono }}>
          {fmtMMSS(timer.duration)}
        </Text>
      </Pressable>
      {canEdit && (
        <Pressable onPress={remove} hitSlop={8}>
          <Ionicons name="close" size={14} color={colors.mutedForeground} />
        </Pressable>
      )}
    </View>
  );
}

function AddTimerButton({
  sessionId,
  kind,
  existing,
  totalTimers,
  onChanged,
}: {
  sessionId: string;
  kind: "work" | "break";
  existing: SessionTimer[];
  totalTimers: number;
  onChanged: () => void;
}) {
  const { colors } = useTheme();

  async function add() {
    if (totalTimers >= 10) {
      dialog.alert({ title: "Maximum 10 timers", message: "Remove one before adding another." });
      return;
    }
    const names = kind === "break" ? BREAK_NAMES : WORK_NAMES;
    const used = new Set(existing.map((t) => t.name));
    const available = names.filter((n) => !used.has(n));
    const pool = available.length > 0 ? available : names;
    const defaultName = pool[Math.floor(Math.random() * pool.length)];
    const defaultDur = kind === "break" ? "5" : "15";

    const raw = await dialog.prompt({
      title: `New ${kind} timer`,
      message: `Duration in minutes for "${defaultName}"`,
      defaultValue: defaultDur,
      keyboardType: "numbers-and-punctuation",
      confirmText: "Add timer",
    });
    // Cancelled → don't create anything.
    if (raw == null) return;
    const secs = parseSecs(raw) ?? parseInt(defaultDur) * 60;
    try {
      await api.post(`/api/sessions/${sessionId}/timers`, {
        name: kind === "break" && !isBreakTimer(defaultName) ? `${defaultName} Break` : defaultName,
        duration: secs,
      });
      onChanged();
    } catch {
      dialog.toast("Failed to add timer", "error");
    }
  }

  return (
    <Pressable onPress={add} style={styles.addRow}>
      <Ionicons name="add" size={14} color={colors.mutedForeground} />
      <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sans }}>
        Add timer
      </Text>
    </Pressable>
  );
}

export function ConfigPanel({
  sessionId,
  sessionType,
  isPrivate,
  timers,
  participants,
  currentUserId,
  currentUserRole,
  onParticipantsChange,
  onTimersChange,
  onSwitchType,
  onPrivacyChange,
  onOpenUser,
}: ConfigPanelProps) {
  const { colors } = useTheme();
  const [switching, setSwitching] = useState(false);

  const isOwner = currentUserRole === "owner";
  const isAdmin = isOwner || currentUserRole === "admin";
  const active = participants.filter((p) => !p.left_at);
  const workTimers = timers.filter((t) => !isBreakTimer(t.name));
  const breakTimers = timers.filter((t) => isBreakTimer(t.name));

  async function switchType(type: "pomodoro" | "stopwatch") {
    if (type === sessionType || switching || !isAdmin) return;
    setSwitching(true);
    try {
      await api.patch(`/api/sessions/${sessionId}`, { action: "set_type", session_type: type });
      onSwitchType(type);
    } catch {
      dialog.toast("Failed to switch session type", "error");
    }
    setSwitching(false);
  }

  async function togglePrivacy(next: boolean) {
    if (!isAdmin) return;
    try {
      await api.patch(`/api/sessions/${sessionId}`, {
        is_private: next,
        ...(next ? {} : { password: "" }),
      });
      onPrivacyChange(next);
    } catch {
      dialog.toast("Failed to update privacy", "error");
    }
  }

  async function setSessionPassword() {
    const pw = await dialog.prompt({
      title: "Session password",
      message: "Leave blank to keep code-only access",
      placeholder: "New password",
      secureTextEntry: true,
      confirmText: "Save",
    });
    if (pw == null) return;
    try {
      await api.patch(`/api/sessions/${sessionId}`, {
        is_private: true,
        ...(pw ? { password: pw } : {}),
      });
      onPrivacyChange(true);
      dialog.toast("Password updated", "success");
    } catch {
      dialog.toast("Failed to set password", "error");
    }
  }

  async function setRole(participantId: string, role: "admin" | "member") {
    try {
      await api.patch(`/api/sessions/${sessionId}/participants/${participantId}`, { role });
      onParticipantsChange();
    } catch {
      dialog.toast("Failed to update role", "error");
    }
  }

  async function manageParticipant(p: SessionParticipant) {
    const username = p.profiles?.username ?? "Unknown";
    const displayName = p.profiles?.display_name ?? username;
    const isMe = p.user_id === currentUserId;
    const options: ActionOption[] = [];

    if (onOpenUser) options.push({ label: "View profile", value: "view", icon: "person-outline" });
    if (isOwner && !isMe && p.role !== "owner") {
      options.push({
        label: p.role === "admin" ? "Make member" : "Make admin",
        value: "role",
        icon: "shield-outline",
      });
      options.push({ label: "Kick from session", value: "kick", destructive: true, icon: "close-circle-outline" });
    }
    if (options.length === 0) return;

    const choice = await dialog.actions({ title: `${displayName} (@${username})`, options });
    if (choice === "view" && onOpenUser) onOpenUser(username);
    else if (choice === "role") setRole(p.id, p.role === "admin" ? "member" : "admin");
    else if (choice === "kick") {
      try {
        await api.patch(`/api/sessions/${sessionId}/participants/${p.id}`, {
          left_at: new Date().toISOString(),
        });
        onParticipantsChange();
      } catch {
        dialog.toast("Failed to remove participant", "error");
      }
    }
  }

  const sectionTitle = (label: string) => (
    <Text
      style={{
        fontSize: 10,
        letterSpacing: 2,
        color: colors.mutedForeground,
        fontFamily: fonts.sansMedium,
        textTransform: "uppercase",
      }}
    >
      {label}
    </Text>
  );

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
      {/* Session mode is host-only — hide the switcher entirely for members
          rather than showing a control they can't operate. */}
      {isAdmin && (
        <View style={{ gap: 10 }}>
          {sectionTitle("Session mode")}
          <View style={[styles.modeTrack, { backgroundColor: colors.muted }]}>
            {(["pomodoro", "stopwatch"] as const).map((type) => (
              <Pressable
                key={type}
                onPress={() => switchType(type)}
                disabled={switching}
                style={[
                  styles.modeBtn,
                  sessionType === type && { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
                ]}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: fonts.sansMedium,
                    color: sessionType === type ? colors.foreground : colors.mutedForeground,
                  }}
                >
                  {type === "pomodoro" ? "Pomodoro" : "Running Timer"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {sessionType === "pomodoro" && (
        <View style={{ gap: 14 }}>
          {sectionTitle("Work timers")}
          <View>
            {workTimers.map((t) => (
              <TimerRow
                key={t.id}
                timer={t}
                canEdit={isAdmin}
                sessionId={sessionId}
                totalTimers={timers.length}
                onChanged={onTimersChange}
              />
            ))}
            {isAdmin && (
              <AddTimerButton
                sessionId={sessionId}
                kind="work"
                existing={timers}
                totalTimers={timers.length}
                onChanged={onTimersChange}
              />
            )}
          </View>

          {sectionTitle("Break timers")}
          <View>
            {breakTimers.map((t) => (
              <TimerRow
                key={t.id}
                timer={t}
                canEdit={isAdmin}
                sessionId={sessionId}
                totalTimers={timers.length}
                onChanged={onTimersChange}
              />
            ))}
            {isAdmin && (
              <AddTimerButton
                sessionId={sessionId}
                kind="break"
                existing={timers}
                totalTimers={timers.length}
                onChanged={onTimersChange}
              />
            )}
          </View>
        </View>
      )}

      {/* Privacy is host-only. Members can't toggle it, so it isn't shown to
          them at all (they already passed any password gate to get in). */}
      {isAdmin && (
        <View style={{ gap: 10 }}>
          {sectionTitle("Privacy")}
          <View style={styles.privacyRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: fonts.sansMedium, color: colors.foreground }}>
                Private session
              </Text>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sans }}>
                {isPrivate ? "Password required to join" : "Anyone with the code can join"}
              </Text>
            </View>
            <Switch
              value={isPrivate}
              onValueChange={togglePrivacy}
              trackColor={{ true: colors.foreground }}
            />
          </View>
          {isPrivate && (
            <Pressable onPress={setSessionPassword}>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sansMedium, textDecorationLine: "underline" }}>
                Change password
              </Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={{ gap: 6 }}>
        {sectionTitle(`Participants (${active.length})`)}
        {active.map((p) => {
          const username = p.profiles?.username ?? "Unknown";
          const displayName = p.profiles?.display_name ?? username;
          const isMe = p.user_id === currentUserId;
          return (
            <Pressable key={p.id} onPress={() => manageParticipant(p)} style={styles.participantRow}>
              <Text style={{ fontSize: 18 }}>{p.profiles?.emoji ?? "🍅"}</Text>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: colors.foreground, fontFamily: fonts.sans }}>
                {displayName} <Text style={{ color: colors.mutedForeground }}>@{username}</Text>
                {isMe && <Text style={{ color: colors.mutedForeground }}> (you)</Text>}
              </Text>
              <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: fonts.sansMedium }}>
                {p.role}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 24, paddingBottom: 32 },
  modeTrack: { flexDirection: "row", borderRadius: radius.lg, padding: 3, gap: 3 },
  modeBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingLeft: 16,
  },
  privacyRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 7,
  },
});
