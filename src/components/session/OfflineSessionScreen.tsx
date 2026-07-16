import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SessionRecap, type SummaryEntry } from "@/components/dashboard/SessionRecap";
import { NotesPanel } from "@/components/session/NotesPanel";
import { OfflineConfigPanel } from "@/components/session/OfflineConfigPanel";
import { SoundPanel } from "@/components/session/SoundPanel";
import { StopwatchView } from "@/components/session/StopwatchView";
import { ControlText, formatTime, TimerSquare } from "@/components/session/TimerBits";
import { Button } from "@/components/ui/Button";
import { dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/Segmented";
import { useInvalidate } from "@/lib/hooks";
import { readTasks } from "@/lib/notes-storage";
import {
  cancelTimerEndNotification,
  scheduleTimerEndNotification,
} from "@/lib/notifications";
import { enqueue } from "@/lib/offline-queue";
import {
  advanceAfterFinish,
  clearOfflineSession,
  deriveElapsed,
  saveOfflineSession,
  type OfflineSessionState,
} from "@/lib/offline-session";
import { syncPendingUploads } from "@/lib/offline-sync";
import { isBreakTimer, type SessionTimer } from "@/lib/session-types";
import { stopAllAmbient } from "@/lib/session-sounds";
import { playTimerEndSound } from "@/lib/sound";
import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

// The offline counterpart of SessionScreen: same timer semantics (wall-clock
// timestamps), no server, no participants, no chat. Every state change is
// written straight to AsyncStorage so a killed app resumes exactly.

interface OfflineSessionScreenProps {
  initialState: OfflineSessionState;
  userId: string;
  username: string | null;
  displayName: string | null;
}

type PanelTab = "notes" | "sounds" | "config";

export function OfflineSessionScreen({ initialState, userId, username, displayName }: OfflineSessionScreenProps) {
  const { colors, scheme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { invalidateHistory } = useInvalidate();

  const [state, setState] = useState(initialState);
  const [tab, setTab] = useState<PanelTab>("notes");
  const [panelOpen, setPanelOpen] = useState(true);
  const [tick, setTick] = useState(0);
  const [wake, setWake] = useState(0);
  const [ended, setEnded] = useState(false);
  const [summary, setSummary] = useState<SummaryEntry | null>(null);
  const [exitMenuOpen, setExitMenuOpen] = useState(false);
  const [endAction, setEndAction] = useState<"save" | "discard" | null>(null);

  const stateRef = useRef(initialState);
  const endedRef = useRef(false);
  const notificationIdRef = useRef<string | null>(null);
  const chimedForRef = useRef<string | null>(null);

  const update = useCallback(
    (fields: Partial<OfflineSessionState>) => {
      const next = { ...stateRef.current, ...fields, updated_at: new Date().toISOString() };
      stateRef.current = next;
      setState(next);
      saveOfflineSession(userId, next);
    },
    [userId],
  );

  const isStopwatch = state.session_type === "stopwatch";
  const ending = endAction !== null;
  const workTimers = state.timers.filter((t) => !isBreakTimer(t.name));
  const breakTimers = state.timers.filter((t) => isBreakTimer(t.name));
  const currentTimer = state.timers[state.current_timer_index] ?? null;
  const isInBreakMode = isBreakTimer(currentTimer?.name ?? "");
  const isIdle = state.timer_state === "idle";
  const isRunning = state.timer_state === "running";
  const isPaused = state.timer_state === "paused";

  let remaining = 0;
  let progress = 0;
  if (currentTimer) {
    const elapsed = deriveElapsed(state);
    remaining = Math.max(0, currentTimer.duration - elapsed);
    if (!isIdle) progress = Math.min(1, elapsed / currentTimer.duration);
  }
  void tick;

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(interval);
  }, [isRunning]);

  useEffect(() => {
    activateKeepAwakeAsync("offline-session").catch(() => {});
    return () => {
      deactivateKeepAwake("offline-session").catch(() => {});
      stopAllAmbient();
    };
  }, []);

  // ── Timer actions (all local) ──────────────────────────────────────────────

  function startTimer(index: number) {
    update({
      current_timer_index: index,
      timer_state: "running",
      timer_started_at: new Date().toISOString(),
      paused_elapsed_seconds: null,
    });
  }

  function handlePause() {
    const s = stateRef.current;
    if (s.timer_state !== "running" || !s.timer_started_at) return;
    update({ timer_state: "paused", paused_elapsed_seconds: deriveElapsed(s) });
  }

  function handleResume() {
    const s = stateRef.current;
    if (s.timer_state !== "paused" || s.paused_elapsed_seconds == null) return;
    update({
      timer_state: "running",
      timer_started_at: new Date(Date.now() - s.paused_elapsed_seconds * 1000).toISOString(),
      paused_elapsed_seconds: null,
    });
  }

  function handleReset() {
    update({ timer_state: "running", timer_started_at: new Date().toISOString(), paused_elapsed_seconds: null });
  }

  function handleStop() {
    const ts = stateRef.current.timers;
    const firstBreakIdx = ts.findIndex((t) => isBreakTimer(t.name));
    const firstWorkIdx = ts.findIndex((t) => !isBreakTimer(t.name));
    const nextIdx = firstBreakIdx >= 0 ? firstBreakIdx : firstWorkIdx >= 0 ? firstWorkIdx : 0;
    update({ timer_state: "idle", timer_started_at: null, paused_elapsed_seconds: null, current_timer_index: nextIdx });
  }

  function selectIndex(nextIdx: number) {
    update({ current_timer_index: nextIdx, timer_state: "idle", timer_started_at: null, paused_elapsed_seconds: null });
  }

  function handleHaveBreak() {
    const firstBreakIdx = stateRef.current.timers.findIndex((t) => isBreakTimer(t.name));
    if (firstBreakIdx < 0) {
      setPanelOpen(true);
      setTab("config");
      dialog.toast("No break timers yet — add one in Config", "info");
      return;
    }
    selectIndex(firstBreakIdx);
  }

  function handleEndBreak() {
    const firstWorkIdx = stateRef.current.timers.findIndex((t) => !isBreakTimer(t.name));
    selectIndex(firstWorkIdx >= 0 ? firstWorkIdx : 0);
  }

  // ── Stopwatch (local laps — they're not part of history) ──────────────────

  function handleSwStart() {
    update({ timer_state: "running", timer_started_at: new Date().toISOString(), paused_elapsed_seconds: null });
  }

  function handleSwReset() {
    update({ timer_state: "idle", timer_started_at: null, paused_elapsed_seconds: 0, laps: [] });
  }

  function handleLap(durationSeconds: number) {
    const laps = stateRef.current.laps;
    update({
      laps: [
        ...laps,
        {
          id: Crypto.randomUUID(),
          lap_number: laps.length + 1,
          name: `Lap ${laps.length + 1}`,
          duration_seconds: durationSeconds,
          created_at: new Date().toISOString(),
        },
      ],
    });
  }

  function handleRenameLap(lapId: string, name: string) {
    update({ laps: stateRef.current.laps.map((l) => (l.id === lapId ? { ...l, name } : l)) });
  }

  function handleDeleteLap(lapId: string) {
    update({ laps: stateRef.current.laps.filter((l) => l.id !== lapId) });
  }

  // ── Pomodoro finish: chime once per run, auto work↔break ──────────────────

  useEffect(() => {
    if (!isRunning || !state.timer_started_at || !currentTimer || isStopwatch) return;
    const startedAt = state.timer_started_at;
    const fire = () => {
      if (chimedForRef.current !== startedAt) {
        chimedForRef.current = startedAt;
        // Silence the ambient mix so the chime is heard and the break is quiet.
        stopAllAmbient();
        playTimerEndSound();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      update(advanceAfterFinish(stateRef.current));
    };
    const rem = currentTimer.duration - deriveElapsed(state);
    if (rem <= 0) {
      fire();
      return;
    }
    const timeout = setTimeout(fire, rem * 1000);
    return () => clearTimeout(timeout);
    // `wake` re-evaluates after foregrounding: JS timers were suspended, so a
    // timer that expired in the background must fire now (without re-chiming —
    // the local notification already alerted the user).
  }, [state.timer_state, state.timer_started_at, state.current_timer_index, currentTimer, isRunning, isStopwatch, wake, update, state]);

  useEffect(() => {
    let disposed = false;
    const sync = async () => {
      await cancelTimerEndNotification(notificationIdRef.current);
      notificationIdRef.current = null;
      const currentState = stateRef.current;
      const current = currentState.timers[currentState.current_timer_index];
      if (!isRunning || !currentState.timer_started_at || !current || isStopwatch) return;
      const seconds = current.duration - deriveElapsed(currentState);
      if (seconds <= 0) return;
      const id = await scheduleTimerEndNotification(current.name, seconds, { offline: true });
      if (disposed) await cancelTimerEndNotification(id);
      else notificationIdRef.current = id;
    };
    void sync();
    return () => {
      disposed = true;
      const id = notificationIdRef.current;
      notificationIdRef.current = null;
      void cancelTimerEndNotification(id);
    };
  }, [
    isRunning,
    isStopwatch,
    state.timer_started_at,
    state.current_timer_index,
    currentTimer?.name,
    currentTimer?.duration,
  ]);

  // ── AppState: foreground reconcile ────────────────────────────────────────

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (appState) => {
      if (appState === "active") {
        setWake((w) => w + 1);
      }
    });
    return () => sub.remove();
  }, []);

  // ── End session → queue history upload ─────────────────────────────────────

  async function handleEnd(saveToHistory: boolean) {
    if (endedRef.current) return;
    endedRef.current = true;
    setEndAction(saveToHistory ? "save" : "discard");
    const s = stateRef.current;
    let record: SummaryEntry | null = null;
    if (saveToHistory) {
      const payload = {
        session_name: s.name,
        duration_seconds: Math.max(0, Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000)),
        timers_used: s.timers.map((t) => ({ name: t.name, duration: t.duration })),
        participants: username ? [{ username, display_name: displayName ?? username }] : [],
        tasks: await readTasks(s.id, userId),
        completed_at: new Date().toISOString(),
      };
      record = { ...payload };
      await enqueue(userId, payload);
    }
    await clearOfflineSession(userId, s.id);
    if (saveToHistory) syncPendingUploads(() => invalidateHistory());
    setSummary(record);
    setExitMenuOpen(false);
    if (saveToHistory) setEnded(true);
    else router.back();
  }

  function goHome() {
    setExitMenuOpen(false);
    router.back();
  }

  // ── Render: ended → recap ──────────────────────────────────────────────────

  if (ended) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={[styles.endedWrap, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}
      >
        <Text style={{ fontSize: 24, fontFamily: fonts.sansBold, color: colors.foreground }}>
          Nice work!
        </Text>
        <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sans, marginBottom: 16 }}>
          It will sync to your history when you&apos;re online.
        </Text>
        {summary && (
          <View style={{ alignSelf: "stretch" }}>
            <SessionRecap entry={summary} />
          </View>
        )}
        <Button
          title="Back to Dashboard"
          size="lg"
          style={{ alignSelf: "stretch", marginTop: 16 }}
          onPress={() => router.back()}
        />
      </ScrollView>
    );
  }

  // ── Render: active ─────────────────────────────────────────────────────────

  const breakTint = "rgba(132, 204, 22, 0.03)";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8, borderBottomColor: colors.border, backgroundColor: colors.background },
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          <Text numberOfLines={1} style={{ fontSize: 15, fontFamily: fonts.sansSemiBold, color: colors.foreground, flexShrink: 1 }}>
            {state.name}
          </Text>
          <View style={[styles.offlineChip, { borderColor: colors.border }]}>
            <Ionicons name="cloud-offline-outline" size={10} color={colors.mutedForeground} />
            <Text style={{ fontSize: 10, fontFamily: fonts.sansSemiBold, letterSpacing: 1, color: colors.mutedForeground }}>
              OFFLINE
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => setExitMenuOpen(true)}
          hitSlop={8}
          style={styles.exitBtn}
          accessibilityLabel="End or minimize session"
        >
          <Ionicons name="exit-outline" size={18} color={colors.destructive} />
          <Text style={{ fontSize: 13, color: colors.destructive, fontFamily: fonts.sansMedium }}>
            Exit
          </Text>
        </Pressable>
      </View>

      {/* Timer area */}
      <View style={[styles.timerArea, !isStopwatch && isInBreakMode && { backgroundColor: breakTint }]}>
        {!isStopwatch && progress > 0 && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: `${Math.round(progress * 100)}%`,
              backgroundColor: scheme === "dark" ? "#2a2a2e" : "#e2e2e2",
            }}
          />
        )}

        {isStopwatch ? (
          <StopwatchView
            sessionName={state.name}
            timerState={state.timer_state}
            timerStartedAt={state.timer_started_at}
            pausedElapsedSeconds={state.paused_elapsed_seconds}
            isAdmin
            laps={state.laps}
            onStart={handleSwStart}
            onPause={handlePause}
            onResume={handleResume}
            onReset={handleSwReset}
            onLap={handleLap}
            onRenameLap={handleRenameLap}
            onDeleteLap={handleDeleteLap}
          />
        ) : isIdle ? (
          <ScrollView contentContainerStyle={styles.idleWrap} showsVerticalScrollIndicator={false}>
            <View style={{ alignItems: "center", gap: 2 }}>
              <Text style={{ fontSize: 10, letterSpacing: 3, color: colors.mutedForeground, fontFamily: fonts.sans }}>
                {isInBreakMode ? "BREAK TIME" : state.name.toUpperCase()}
              </Text>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sans }}>
                {isInBreakMode ? "Select a break timer" : "Select a timer to start"}
              </Text>
            </View>

            <View style={styles.squares}>
              {(isInBreakMode ? breakTimers : workTimers).map((timer: SessionTimer) => (
                <TimerSquare
                  key={timer.id}
                  timer={timer}
                  onPress={() => startTimer(state.timers.indexOf(timer))}
                  disabled={false}
                />
              ))}
            </View>

            <Pressable
              onPress={isInBreakMode ? handleEndBreak : handleHaveBreak}
              style={[styles.breakBtn, { borderColor: colors.border }]}
            >
              <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sansMedium }}>
                {isInBreakMode ? "End break" : "Have a break"}
              </Text>
            </Pressable>
          </ScrollView>
        ) : (
          <View style={styles.runningWrap}>
            <Text style={{ fontSize: 10, letterSpacing: 3, color: colors.mutedForeground, fontFamily: fonts.sans }}>
              {(currentTimer?.name ?? "").toUpperCase()}
              {isPaused ? " — PAUSED" : ""}
            </Text>
            <Text
              style={{
                fontSize: 84,
                fontFamily: fonts.monoSemiBold,
                color: colors.foreground,
                letterSpacing: -2,
                opacity: isPaused ? 0.5 : 1,
              }}
            >
              {formatTime(remaining)}
            </Text>
            {isRunning ? (
              <ControlText label="Pause" onPress={handlePause} />
            ) : (
              <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
                <ControlText label="Resume" onPress={handleResume} primary />
                <Text style={{ color: colors.mutedForeground }}>·</Text>
                <ControlText label="Reset" onPress={handleReset} />
                <Text style={{ color: colors.mutedForeground }}>·</Text>
                <ControlText label="Stop" onPress={handleStop} />
              </View>
            )}
          </View>
        )}
      </View>

      {/* Panel — Notes | Sounds | Config (no chat: nobody else is here) */}
      <View
        style={[
          styles.panel,
          panelOpen ? styles.panelOpen : styles.panelClosed,
          { borderTopColor: colors.border, paddingBottom: panelOpen ? insets.bottom : 0 },
        ]}
      >
        <Pressable onPress={() => setPanelOpen((o) => !o)} style={styles.panelHandle} hitSlop={8}>
          <View style={[styles.grip, { backgroundColor: colors.border }]} />
        </Pressable>

        {panelOpen ? (
          <>
            <View style={styles.panelHeaderRow}>
              <View style={{ flex: 1 }}>
                <Segmented<PanelTab>
                  options={[
                    { value: "notes", label: "Notes" },
                    { value: "sounds", label: "Sounds" },
                    { value: "config", label: "Config" },
                  ]}
                  value={tab}
                  onChange={setTab}
                />
              </View>
              <Pressable onPress={() => setPanelOpen(false)} hitSlop={8} style={styles.minimizeBtn}>
                <Ionicons name="chevron-down" size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={{ flex: 1, minHeight: 0 }}>
              {tab === "notes" && <NotesPanel sessionId={state.id} userId={userId} />}
              {tab === "sounds" && <SoundPanel />}
              {tab === "config" && (
                <OfflineConfigPanel timers={state.timers} onChange={(timers) => update({ timers })} />
              )}
            </View>
          </>
        ) : (
          <Pressable onPress={() => setPanelOpen(true)} style={[styles.collapsedRow, { paddingBottom: insets.bottom + 10 }]}>
            <Ionicons name="document-text-outline" size={16} color={colors.mutedForeground} />
            <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sansMedium }}>
              Notes, sounds &amp; config
            </Text>
            <Ionicons name="chevron-up" size={16} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      {/* Exit menu — local modal so it renders above this pushed screen */}
      <Modal
        transparent
        visible={exitMenuOpen}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => !ending && setExitMenuOpen(false)}
      >
        <Pressable style={styles.exitBackdrop} onPress={() => !ending && setExitMenuOpen(false)}>
          <Pressable
            style={[styles.exitSheet, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.exitHeader}>
              <Text style={{ fontSize: 15, fontFamily: fonts.sansSemiBold, color: colors.foreground }}>
                {state.name}
              </Text>
              <Text style={{ fontSize: 13, lineHeight: 18, color: colors.mutedForeground, fontFamily: fonts.sans }}>
                Go home to keep this offline session running — you can jump back in from the banner.
                When ending, choose whether it should upload to your history.
              </Text>
            </View>

            <Pressable
              onPress={goHome}
              disabled={ending}
              style={({ pressed }) => [styles.exitRow, pressed && { backgroundColor: colors.muted }]}
            >
              <Ionicons name="home-outline" size={18} color={colors.foreground} />
              <Text style={{ fontSize: 15, fontFamily: fonts.sansMedium, color: colors.foreground }}>
                Go to home
              </Text>
            </Pressable>

            <Pressable
              onPress={() => handleEnd(false)}
              disabled={ending}
              accessibilityRole="button"
              accessibilityLabel="End offline session without saving to history"
              style={({ pressed }) => [styles.exitRow, pressed && { backgroundColor: colors.muted }]}
            >
              <Ionicons name="exit-outline" size={18} color={colors.destructive} />
              <Text style={{ fontSize: 15, fontFamily: fonts.sansMedium, color: colors.destructive }}>
                {endAction === "discard" ? "Ending…" : "End without saving"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => handleEnd(true)}
              disabled={ending}
              accessibilityRole="button"
              accessibilityLabel="Save offline session to history and end"
              style={({ pressed }) => [styles.exitRow, pressed && { backgroundColor: colors.muted }]}
            >
              <Ionicons name="save-outline" size={18} color={colors.destructive} />
              <Text style={{ fontSize: 15, fontFamily: fonts.sansMedium, color: colors.destructive }}>
                {endAction === "save" ? "Saving…" : "Save & end"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setExitMenuOpen(false)}
              disabled={ending}
              style={({ pressed }) => [
                styles.exitRow,
                styles.exitCancelRow,
                { borderTopColor: colors.border },
                pressed && { backgroundColor: colors.muted },
              ]}
            >
              <Text style={{ fontSize: 15, fontFamily: fonts.sansMedium, color: colors.mutedForeground }}>
                Cancel
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 2,
  },
  offlineChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  exitBtn: { flexDirection: "row", alignItems: "center", gap: 3 },
  timerArea: { flex: 1, minHeight: 0, overflow: "hidden" },
  idleWrap: { alignItems: "center", gap: 20, padding: 20 },
  squares: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
    maxWidth: 340,
  },
  breakBtn: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: radius.xl,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  runningWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  panel: { borderTopWidth: StyleSheet.hairlineWidth },
  panelOpen: { height: "42%" },
  panelClosed: {},
  panelHandle: { alignItems: "center", paddingTop: 8, paddingBottom: 4 },
  grip: { width: 36, height: 4, borderRadius: 2 },
  panelHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 2,
  },
  minimizeBtn: { padding: 4 },
  collapsedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingTop: 6,
  },
  endedWrap: { alignItems: "center", paddingHorizontal: 24 },
  exitBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  exitSheet: {
    borderWidth: 1,
    borderRadius: radius["2xl"],
    overflow: "hidden",
  },
  exitHeader: { padding: 18, paddingBottom: 12, gap: 6 },
  exitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  exitCancelRow: {
    justifyContent: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
