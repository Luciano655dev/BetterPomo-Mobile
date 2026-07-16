import { Ionicons } from "@expo/vector-icons";
import type { RealtimeChannel } from "@supabase/supabase-js";
import * as Clipboard from "expo-clipboard";
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
import { ChatPanel } from "@/components/session/ChatPanel";
import { ConfigPanel } from "@/components/session/ConfigPanel";
import { NotesPanel } from "@/components/session/NotesPanel";
import { SoundPanel } from "@/components/session/SoundPanel";
import { StopwatchView } from "@/components/session/StopwatchView";
import { ControlText, formatTime, squareStyles, TimerSquare } from "@/components/session/TimerBits";
import { Button } from "@/components/ui/Button";
import { dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/Segmented";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/hooks";
import { readTasks } from "@/lib/notes-storage";
import {
  cancelTimerEndNotification,
  scheduleTimerEndNotification,
} from "@/lib/notifications";
import { enqueue } from "@/lib/offline-queue";
import { syncPendingUploads } from "@/lib/offline-sync";
import { uniqueChannel } from "@/lib/realtime";
import {
  isBreakTimer,
  type Lap,
  type ParticipantRole,
  type SessionData,
  type SessionParticipant,
  type SessionTimer,
} from "@/lib/session-types";
import { stopAllAmbient } from "@/lib/session-sounds";
import { playTimerEndSound } from "@/lib/sound";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

// Sessions run in the background: leaving the screen or backgrounding the app
// does NOT leave the session. Timer state lives in DB timestamps, so it keeps
// ticking server-side; membership (left_at) only changes on explicit Leave.

interface SessionScreenProps {
  session: SessionData;
  timers: SessionTimer[];
  userId: string;
  userRole: ParticipantRole;
  userJoinedAt: string;
  userProfile: { id: string; username: string; display_name: string; emoji: string };
}

type PanelTab = "chat" | "notes" | "sounds" | "config";

// ── Component ─────────────────────────────────────────────────────────────────

export function SessionScreen({
  session: initialSession,
  timers: initialTimers,
  userId,
  userRole,
  userJoinedAt,
  userProfile,
}: SessionScreenProps) {
  const { colors, scheme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { invalidateHistory, invalidateSessions } = useInvalidate();

  const [session, setSession] = useState(initialSession);
  const [timers, setTimers] = useState(initialTimers);
  const [userRoleState, setUserRoleState] = useState(userRole);
  const [participants, setParticipants] = useState<SessionParticipant[]>([]);
  const [viewerIds, setViewerIds] = useState<Set<string>>(new Set());
  const [laps, setLaps] = useState<Lap[]>([]);
  const [tab, setTab] = useState<PanelTab>("chat");
  const [panelOpen, setPanelOpen] = useState(true);
  const [tick, setTick] = useState(0);
  const [sessionEnded, setSessionEnded] = useState(initialSession.status === "ended");
  const [summary, setSummary] = useState<SummaryEntry | null>(null);
  const [exitMenuOpen, setExitMenuOpen] = useState(false);
  const [leaveAction, setLeaveAction] = useState<"save" | "discard" | null>(null);

  const sessionRef = useRef(initialSession);
  const timersRef = useRef(initialTimers);
  const sessionEndedRef = useRef(false);
  const lastActionAtRef = useRef(0);
  const syncChannelRef = useRef<RealtimeChannel | null>(null);
  const participantChRef = useRef<RealtimeChannel | null>(null);
  const notificationIdRef = useRef<string | null>(null);
  const chimedForRef = useRef<string | null>(null);

  const isAdmin = userRoleState === "owner" || userRoleState === "admin";
  const isStopwatch = session.session_type === "stopwatch";
  const leaving = leaveAction !== null;

  const workTimers = timers.filter((t) => !isBreakTimer(t.name));
  const breakTimers = timers.filter((t) => isBreakTimer(t.name));
  const currentTimer = timers[session.current_timer_index] ?? null;
  const isInBreakMode = isBreakTimer(currentTimer?.name ?? "");
  const isIdle = session.timer_state === "idle";
  const isRunning = session.timer_state === "running";
  const isPaused = session.timer_state === "paused";

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    timersRef.current = timers;
  }, [timers]);

  // ── Remaining time (derived from server timestamps) ───────────────────────

  let remaining = 0;
  let progress = 0;
  if (currentTimer) {
    const dur = currentTimer.duration;
    if (isRunning && session.timer_started_at) {
      // Live countdown: re-derived every `tick` (500ms) from the wall clock.
      // eslint-disable-next-line react-hooks/purity -- intentional clock read for the running timer
      const elapsed = (Date.now() - new Date(session.timer_started_at).getTime()) / 1000;
      remaining = Math.max(0, dur - elapsed);
      progress = Math.min(1, elapsed / dur);
    } else if (isPaused && session.paused_elapsed_seconds != null) {
      remaining = Math.max(0, dur - session.paused_elapsed_seconds);
      progress = Math.min(1, session.paused_elapsed_seconds / dur);
    } else {
      remaining = dur;
    }
  }
  void tick; // ticking re-renders re-derive `remaining`

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(interval);
  }, [isRunning]);

  // ── Keep-awake ─────────────────────────────────────────────────────────────

  useEffect(() => {
    activateKeepAwakeAsync("session").catch(() => {});
    return () => {
      deactivateKeepAwake("session").catch(() => {});
      // Leaving the session screen stops the ambient mix.
      stopAllAmbient();
    };
  }, []);

  // ── Sync own role from participants ────────────────────────────────────────

  const [prevParticipants, setPrevParticipants] = useState(participants);
  if (participants !== prevParticipants) {
    setPrevParticipants(participants);
    const me = participants.find((p) => p.user_id === userId);
    if (me) setUserRoleState(me.role);
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  const applySessionUpdate = useCallback((fields: Partial<SessionData>) => {
    lastActionAtRef.current = Date.now();
    const next = { ...sessionRef.current, ...fields };
    sessionRef.current = next;
    setSession(next);
    syncChannelRef.current?.send({
      type: "broadcast",
      event: "session_update",
      payload: { session: next },
    });
  }, []);

  async function doAction(optimistic: Partial<SessionData>, body: Record<string, unknown>) {
    applySessionUpdate(optimistic);
    try {
      await api.patch(`/api/sessions/${sessionRef.current.id}`, body);
    } catch (e) {
      dialog.toast((e as Error).message || "Action failed", "error");
    }
  }

  function startTimer(index: number) {
    if (!isAdmin) return;
    doAction(
      {
        current_timer_index: index,
        timer_state: "running",
        timer_started_at: new Date().toISOString(),
        paused_elapsed_seconds: null,
        status: "active",
      },
      { action: "start", index },
    );
  }

  function handlePause() {
    if (!isAdmin || sessionRef.current.timer_state !== "running" || !sessionRef.current.timer_started_at) return;
    // eslint-disable-next-line react-hooks/purity -- clock read inside an event handler
    const elapsed = (Date.now() - new Date(sessionRef.current.timer_started_at).getTime()) / 1000;
    doAction({ timer_state: "paused", paused_elapsed_seconds: elapsed }, { action: "pause" });
  }

  function handleResume() {
    const s = sessionRef.current;
    if (!isAdmin || s.timer_state !== "paused" || s.paused_elapsed_seconds == null) return;
    doAction(
      {
        timer_state: "running",
        // eslint-disable-next-line react-hooks/purity -- clock read inside an event handler
        timer_started_at: new Date(Date.now() - s.paused_elapsed_seconds * 1000).toISOString(),
        paused_elapsed_seconds: null,
      },
      { action: "resume" },
    );
  }

  function handleReset() {
    if (!isAdmin) return;
    doAction(
      { timer_state: "running", timer_started_at: new Date().toISOString(), paused_elapsed_seconds: null },
      { action: "reset" },
    );
  }

  function handleStop() {
    if (!isAdmin) return;
    const ts = timersRef.current;
    const firstBreakIdx = ts.findIndex((t) => isBreakTimer(t.name));
    const firstWorkIdx = ts.findIndex((t) => !isBreakTimer(t.name));
    const nextIdx = firstBreakIdx >= 0 ? firstBreakIdx : firstWorkIdx >= 0 ? firstWorkIdx : 0;
    doAction(
      { timer_state: "idle", timer_started_at: null, paused_elapsed_seconds: null, current_timer_index: nextIdx },
      { action: "stop", index: nextIdx },
    );
  }

  function selectIndex(nextIdx: number) {
    doAction(
      { current_timer_index: nextIdx, timer_state: "idle", timer_started_at: null, paused_elapsed_seconds: null },
      { action: "select", index: nextIdx },
    );
  }

  function handleHaveBreak() {
    if (!isAdmin) return;
    const firstBreakIdx = timersRef.current.findIndex((t) => isBreakTimer(t.name));
    if (firstBreakIdx < 0) {
      setPanelOpen(true);
      setTab("config");
      dialog.toast("No break timers yet — add one in Config", "info");
      return;
    }
    selectIndex(firstBreakIdx);
  }

  function handleEndBreak() {
    if (!isAdmin) return;
    const firstWorkIdx = timersRef.current.findIndex((t) => !isBreakTimer(t.name));
    selectIndex(firstWorkIdx >= 0 ? firstWorkIdx : 0);
  }

  // ── Stopwatch actions ──────────────────────────────────────────────────────

  function handleSwStart() {
    if (!isAdmin) return;
    doAction(
      {
        timer_state: "running",
        timer_started_at: new Date().toISOString(),
        paused_elapsed_seconds: null,
        status: "active",
      },
      { action: "start" },
    );
  }

  function handleSwReset() {
    if (!isAdmin) return;
    setLaps([]);
    doAction({ timer_state: "idle", timer_started_at: null, paused_elapsed_seconds: 0 }, { action: "sw_reset" });
  }

  async function handleLap(durationSeconds: number) {
    if (!isAdmin) return;
    try {
      const saved = await api.post<Lap>(`/api/sessions/${session.id}/laps`, {
        duration_seconds: durationSeconds,
      });
      setLaps((prev) => (prev.some((l) => l.id === saved.id) ? prev : [...prev, saved]));
    } catch (e) {
      dialog.toast((e as Error).message || "Failed to add lap", "error");
    }
  }

  async function handleRenameLap(lapId: string, name: string) {
    setLaps((prev) => prev.map((l) => (l.id === lapId ? { ...l, name } : l)));
    try {
      await api.patch(`/api/sessions/${session.id}/laps/${lapId}`, { name });
    } catch {
      dialog.toast("Failed to rename lap", "error");
    }
  }

  async function handleDeleteLap(lapId: string) {
    setLaps((prev) => prev.filter((l) => l.id !== lapId));
    try {
      await api.delete(`/api/sessions/${session.id}/laps/${lapId}`);
    } catch {
      dialog.toast("Failed to delete lap", "error");
    }
  }

  // ── Timer finish (advance is admin-only, mirrors webapp guards) ───────────

  const handleTimerFinished = useCallback(async () => {
    if (!isAdmin) return;
    const s = sessionRef.current;
    const ts = timersRef.current;
    const current = ts[s.current_timer_index] ?? null;
    const wasBreak = isBreakTimer(current?.name ?? "");
    let nextIdx = s.current_timer_index;
    if (!wasBreak) {
      const firstBreakIdx = ts.findIndex((t) => isBreakTimer(t.name));
      if (firstBreakIdx >= 0) nextIdx = firstBreakIdx;
    } else {
      const firstWorkIdx = ts.findIndex((t) => !isBreakTimer(t.name));
      if (firstWorkIdx >= 0) nextIdx = firstWorkIdx;
    }
    applySessionUpdate({
      timer_state: "idle",
      timer_started_at: null,
      paused_elapsed_seconds: null,
      current_timer_index: nextIdx,
    });
    try {
      await api.patch(`/api/sessions/${s.id}`, { action: "select", index: nextIdx });
    } catch {
      // next poll converges
    }
  }, [isAdmin, applySessionUpdate]);

  useEffect(() => {
    if (!isRunning || !session.timer_started_at || !currentTimer || isStopwatch) return;
    const elapsed = (Date.now() - new Date(session.timer_started_at).getTime()) / 1000;
    const rem = currentTimer.duration - elapsed;

    const startedAt = session.timer_started_at;
    const fire = () => {
      // Chime once per timer run, for every participant.
      if (chimedForRef.current !== startedAt) {
        chimedForRef.current = startedAt;
        // Silence the ambient mix so the chime is heard and the break is quiet.
        stopAllAmbient();
        playTimerEndSound();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      if (isAdmin) handleTimerFinished();
    };

    if (rem <= 0) {
      fire();
      return;
    }
    const timeout = setTimeout(fire, rem * 1000);
    return () => clearTimeout(timeout);
  }, [
    session.timer_state,
    session.timer_started_at,
    session.current_timer_index,
    currentTimer,
    isAdmin,
    isRunning,
    isStopwatch,
    handleTimerFinished,
  ]);

  // Keep one native iOS alert aligned with the current run. Scheduling while
  // foregrounded means the OS retains it if BetterPomo is later terminated.
  useEffect(() => {
    let disposed = false;
    const sync = async () => {
      await cancelTimerEndNotification(notificationIdRef.current);
      notificationIdRef.current = null;
      const timer = timersRef.current[session.current_timer_index];
      if (!isRunning || !session.timer_started_at || !timer || isStopwatch) return;
      const elapsed = (Date.now() - new Date(session.timer_started_at).getTime()) / 1000;
      const seconds = timer.duration - elapsed;
      if (seconds <= 0) return;
      const id = await scheduleTimerEndNotification(timer.name, seconds, {
        session_code: session.code,
      });
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
    session.timer_started_at,
    session.current_timer_index,
    session.code,
    currentTimer?.id,
    currentTimer?.name,
    currentTimer?.duration,
  ]);

  // ── Data fetchers ──────────────────────────────────────────────────────────

  const onSessionEnded = useCallback((wasDeleted = false) => {
    if (sessionEndedRef.current) return;
    sessionEndedRef.current = true;
    const finish = async () => {
      if (wasDeleted) {
        try {
          const archived = await api.get<SummaryEntry>(
            `/api/history/session/${sessionRef.current.id}`,
          );
          setSummary(archived);
          invalidateHistory();
          invalidateSessions();
          dialog.toast("Session closed after 24 hours of inactivity and was saved", "info");
          setSessionEnded(true);
          return;
        } catch {
          // A non-expiry deletion falls through to the normal idempotent save.
        }
      }
      await doSaveHistoryRef.current();
      setSessionEnded(true);
    };
    void finish();
  }, [invalidateHistory, invalidateSessions]);

  const fetchSession = useCallback(async () => {
    if (Date.now() - lastActionAtRef.current < 2000) return;
    try {
      const { session: updated } = await api.get<{ session: SessionData }>(
        `/api/sessions/${sessionRef.current.id}`,
      );
      sessionRef.current = updated;
      setSession(updated);
      if (updated.status === "ended") onSessionEnded();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("404") || message.toLowerCase().includes("not found")) {
        onSessionEnded(true);
      } else if (message.includes("410") || message.toLowerCase().includes("session has ended")) {
        onSessionEnded();
      }
    }
  }, [onSessionEnded]);

  const fetchTimers = useCallback(async () => {
    try {
      const data = await api.get<SessionTimer[]>(`/api/sessions/${sessionRef.current.id}/timers`);
      if (data) setTimers(data);
    } catch {
      // transient
    }
  }, []);

  const loadParticipants = useCallback(async () => {
    try {
      const data = await api.get<SessionParticipant[]>(
        `/api/sessions/${sessionRef.current.id}/participants`,
      );
      if (!data) return;
      setParticipants(data);
      const me = data.find((p) => p.user_id === userId);
      if (me?.left_at && !sessionEndedRef.current) {
        sessionEndedRef.current = true;
        dialog.toast("You were removed from the session", "info");
        router.back();
      }
    } catch {
      // transient
    }
  }, [userId, router]);

  const fetchLaps = useCallback(async () => {
    try {
      const data = await api.get<Lap[]>(`/api/sessions/${sessionRef.current.id}/laps`);
      if (data) setLaps(data);
    } catch {
      // transient
    }
  }, []);

  // ── History save + leave ───────────────────────────────────────────────────

  const doSaveHistory = useCallback(async () => {
    const durationSeconds = Math.floor((Date.now() - new Date(userJoinedAt).getTime()) / 1000);
    const s = sessionRef.current;
    const allParticipants = await api
      .get<SessionParticipant[]>(`/api/sessions/${s.id}/participants`)
      .catch(() => [] as SessionParticipant[]);
    const record: SummaryEntry & { session_id: string } = {
      session_id: s.id,
      session_name: s.name,
      timers_used: timersRef.current.map((t) => ({ name: t.name, duration: t.duration })),
      participants: (allParticipants ?? []).map((p) => ({
        username: p.profiles?.username ?? "Unknown",
        display_name: p.profiles?.display_name ?? p.profiles?.username ?? "Unknown",
      })),
      duration_seconds: durationSeconds,
      tasks: await readTasks(s.id, userId),
      completed_at: new Date().toISOString(),
    };
    try {
      const saved = await api.post<SummaryEntry>("/api/history", record);
      setSummary(saved);
    } catch {
      // Couldn't reach the server at leave time — queue the record so it
      // syncs later instead of silently losing the session.
      enqueue(userId, {
        session_id: record.session_id,
        session_name: record.session_name,
        duration_seconds: durationSeconds,
        timers_used: record.timers_used ?? [],
        participants: record.participants ?? [],
        tasks: record.tasks ?? [],
        completed_at: record.completed_at,
      }).then(() => syncPendingUploads());
      setSummary(record);
    }
    invalidateHistory();
  }, [userJoinedAt, userId, invalidateHistory]);

  // Canonical "latest ref" pattern: doSaveHistory closes over changing state, so
  // we keep the freshest version in a ref for the leave/ended callbacks below.
  const doSaveHistoryRef = useRef(doSaveHistory);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- intentional latest-ref update
    doSaveHistoryRef.current = doSaveHistory;
  }, [doSaveHistory]);

  function goHome() {
    setExitMenuOpen(false);
    router.back();
  }

  async function handleLeave(saveToHistory: boolean) {
    if (sessionEndedRef.current) {
      router.back();
      return;
    }
    setLeaveAction(saveToHistory ? "save" : "discard");
    sessionEndedRef.current = true;
    if (saveToHistory) await doSaveHistoryRef.current();
    try {
      await api.patch(`/api/sessions/${session.id}/participants/me`, {
        left_at: new Date().toISOString(),
        save_history: saveToHistory,
      });
    } catch {
      sessionEndedRef.current = false;
      setLeaveAction(null);
      dialog.toast("Couldn't leave the session. Please try again.", "error");
      return;
    }
    participantChRef.current?.send({ type: "broadcast", event: "participant_update", payload: {} });
    invalidateSessions();
    setExitMenuOpen(false);
    if (saveToHistory) setSessionEnded(true);
    else router.back();
  }

  // ── Realtime: session sync channel (deterministic topic, shared with web) ──

  useEffect(() => {
    const ch = supabase
      .channel(`session:${session.id}`)
      .on("broadcast", { event: "session_update" }, ({ payload }) => {
        if (!payload?.session) return;
        if (Date.now() - lastActionAtRef.current < 2000) return;
        const updated = payload.session as SessionData;
        sessionRef.current = updated;
        setSession(updated);
        if (updated.status === "ended") onSessionEnded();
      })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pomodoro_sessions", filter: `id=eq.${session.id}` },
        (payload) => {
          if (Date.now() - lastActionAtRef.current < 2000) return;
          const updated = payload.new as SessionData;
          sessionRef.current = updated;
          setSession(updated);
          if (updated.status === "ended") onSessionEnded();
        },
      )
      .subscribe();
    syncChannelRef.current = ch;

    const poll = setInterval(() => {
      if (AppState.currentState === "active") fetchSession();
    }, 3000);

    return () => {
      supabase.removeChannel(ch);
      syncChannelRef.current = null;
      clearInterval(poll);
    };
  }, [session.id, fetchSession, onSessionEnded]);

  // ── Realtime: participants + presence ─────────────────────────────────────

  useEffect(() => {
    loadParticipants();
    const ch = supabase
      .channel(`participant-updates:${session.id}`, { config: { presence: { key: userId } } })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "session_participants", filter: `session_id=eq.${session.id}` },
        () => loadParticipants(),
      )
      .on("broadcast", { event: "participant_update" }, () => loadParticipants())
      .on("presence", { event: "sync" }, () => {
        setViewerIds(new Set(Object.keys(ch.presenceState())));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && AppState.currentState === "active") {
          ch.track({ online_at: new Date().toISOString() }).catch(() => {});
        }
      });
    participantChRef.current = ch;

    const poll = setInterval(() => {
      if (AppState.currentState === "active") loadParticipants();
    }, 10_000);

    return () => {
      clearInterval(poll);
      supabase.removeChannel(ch);
      participantChRef.current = null;
    };
  }, [session.id, userId, loadParticipants]);

  // ── Realtime: timers ───────────────────────────────────────────────────────

  useEffect(() => {
    const ch = uniqueChannel(supabase, `timers:${session.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "timers", filter: `session_id=eq.${session.id}` },
        () => fetchTimers(),
      )
      .subscribe();
    const poll = setInterval(() => {
      if (AppState.currentState === "active") fetchTimers();
    }, 5000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(poll);
    };
  }, [session.id, fetchTimers]);

  // ── Realtime: laps (stopwatch) ─────────────────────────────────────────────

  useEffect(() => {
    if (!isStopwatch) return;
    fetchLaps();
    const ch = uniqueChannel(supabase, `laps-db:${session.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stopwatch_laps", filter: `session_id=eq.${session.id}` },
        () => fetchLaps(),
      )
      .subscribe();
    const poll = setInterval(() => {
      if (AppState.currentState === "active") fetchLaps();
    }, 3000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(poll);
    };
  }, [session.id, isStopwatch, fetchLaps]);

  // ── AppState: presence + foreground reconciliation ───────────────────────

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      const ch = participantChRef.current;
      if (state === "active") {
        // The socket was suspended while backgrounded, so reconcile missed state.
        fetchSession();
        fetchTimers();
        loadParticipants();
        if (isStopwatch) fetchLaps();
        ch?.track({ online_at: new Date().toISOString() }).catch(() => {});
      } else if (state === "background") {
        ch?.untrack().catch(() => {});
      }
    });
    return () => sub.remove();
  }, [fetchSession, fetchTimers, loadParticipants, fetchLaps, isStopwatch]);

  // ── Assert membership on mount ─────────────────────────────────────────────

  useEffect(() => {
    api
      .patch(`/api/sessions/${session.id}/participants/me`, { left_at: null })
      .then(() => {
        loadParticipants();
        participantChRef.current?.send({ type: "broadcast", event: "participant_update", payload: {} });
      })
      .catch(() => null);
  }, [session.id, loadParticipants]);

  // ── Render: ended → recap ──────────────────────────────────────────────────

  if (sessionEnded) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={[styles.endedWrap, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}
      >
        <Text style={{ fontSize: 24, fontFamily: fonts.sansBold, color: colors.foreground }}>
          Nice work!
        </Text>
        <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sans, marginBottom: 16 }}>
          Saved to your history.
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

  // ── Render: active session ─────────────────────────────────────────────────

  const activeParticipants = participants.filter((p) => !p.left_at);
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
            {session.name}
          </Text>
          <Pressable
            onPress={async () => {
              await Clipboard.setStringAsync(session.code);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            }}
            style={[styles.codeChip, { borderColor: colors.border }]}
          >
            <Text style={{ fontSize: 11, fontFamily: fonts.mono, color: colors.mutedForeground }}>
              {session.code}
            </Text>
            <Ionicons name="copy-outline" size={10} color={colors.mutedForeground} />
          </Pressable>
        </View>
        <Pressable
          onPress={() => setExitMenuOpen(true)}
          hitSlop={8}
          style={styles.exitBtn}
          accessibilityLabel="Leave or minimize session"
        >
          <Ionicons name="exit-outline" size={18} color={colors.destructive} />
          <Text style={{ fontSize: 13, color: colors.destructive, fontFamily: fonts.sansMedium }}>
            Exit
          </Text>
        </Pressable>
      </View>

      {/* Timer area */}
      <View
        style={[
          styles.timerArea,
          !isStopwatch && isInBreakMode && { backgroundColor: breakTint },
        ]}
      >
        {/* progress fill (pomodoro) */}
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
            sessionName={session.name}
            timerState={session.timer_state}
            timerStartedAt={session.timer_started_at}
            pausedElapsedSeconds={session.paused_elapsed_seconds}
            isAdmin={isAdmin}
            laps={laps}
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
                {isInBreakMode ? "BREAK TIME" : session.name.toUpperCase()}
              </Text>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.sans }}>
                {isAdmin
                  ? isInBreakMode
                    ? "Select a break timer"
                    : "Select a timer to start"
                  : "Waiting for host to start…"}
              </Text>
            </View>

            <View style={styles.squares}>
              {(isInBreakMode ? breakTimers : workTimers).map((timer) => (
                <TimerSquare
                  key={timer.id}
                  timer={timer}
                  onPress={() => startTimer(timers.indexOf(timer))}
                  disabled={!isAdmin}
                />
              ))}
              {isAdmin && (
                <Pressable
                  onPress={() => setTab("config")}
                  style={[squareStyles.square, squareStyles.squareDashed, { borderColor: colors.border }]}
                >
                  <Ionicons name="add" size={22} color={colors.mutedForeground} />
                  <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: fonts.sans }}>
                    Create new
                  </Text>
                </Pressable>
              )}
            </View>

            {isAdmin && (
              <Pressable
                onPress={isInBreakMode ? handleEndBreak : handleHaveBreak}
                style={[styles.breakBtn, { borderColor: colors.border }]}
              >
                <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sansMedium }}>
                  {isInBreakMode ? "End break" : "Have a break"}
                </Text>
              </Pressable>
            )}
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
            {isAdmin ? (
              isRunning ? (
                <ControlText label="Pause" onPress={handlePause} />
              ) : (
                <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
                  <ControlText label="Resume" onPress={handleResume} primary />
                  <Text style={{ color: colors.mutedForeground }}>·</Text>
                  <ControlText label="Reset" onPress={handleReset} />
                  <Text style={{ color: colors.mutedForeground }}>·</Text>
                  <ControlText label="Stop" onPress={handleStop} />
                </View>
              )
            ) : (
              <Text style={{ fontSize: 11, letterSpacing: 2, color: colors.mutedForeground, fontFamily: fonts.sans }}>
                {isRunning ? "RUNNING…" : "PAUSED — WAITING FOR HOST…"}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Participants strip */}
      <View style={[styles.participantStrip, { borderTopColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16, alignItems: "center" }}>
          {activeParticipants.map((p) => {
            const viewing = viewerIds.has(p.user_id);
            return (
              <View key={p.id} style={{ alignItems: "center", opacity: viewing ? 1 : 0.45 }}>
                <View>
                  <Text style={{ fontSize: 20 }}>{p.profiles?.emoji ?? "🍅"}</Text>
                  <View
                    style={[
                      styles.presenceDot,
                      { borderColor: colors.background, backgroundColor: viewing ? colors.brand : colors.mutedForeground },
                    ]}
                  />
                </View>
                <Text numberOfLines={1} style={{ fontSize: 9, color: colors.mutedForeground, maxWidth: 52, fontFamily: fonts.sans }}>
                  {p.profiles?.display_name ?? p.profiles?.username ?? "?"}
                  {p.user_id === userId ? " (you)" : ""}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* Panel tabs — collapsible so the timer can take the whole screen */}
      <View
        style={[
          styles.panel,
          panelOpen ? styles.panelOpen : styles.panelClosed,
          { borderTopColor: colors.border, paddingBottom: panelOpen ? insets.bottom : 0 },
        ]}
      >
        {/* Grab handle / toggle */}
        <Pressable
          onPress={() => setPanelOpen((o) => !o)}
          style={styles.panelHandle}
          hitSlop={8}
        >
          <View style={[styles.grip, { backgroundColor: colors.border }]} />
        </Pressable>

        {panelOpen ? (
          <>
            <View style={styles.panelHeaderRow}>
              <View style={{ flex: 1 }}>
                <Segmented<PanelTab>
                  options={[
                    { value: "chat", label: "Chat" },
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
              {tab === "chat" && (
            <ChatPanel
              sessionId={session.id}
              userId={userId}
              userEmoji={userProfile.emoji}
              onOpenUser={(u) => router.push(`/u/${encodeURIComponent(u)}`)}
            />
          )}
          {tab === "notes" && <NotesPanel sessionId={session.id} userId={userId} />}
          {tab === "sounds" && <SoundPanel />}
          {tab === "config" && (
            <ConfigPanel
              sessionId={session.id}
              sessionType={session.session_type}
              isPrivate={session.is_private}
              timers={timers}
              participants={participants}
              currentUserId={userId}
              currentUserRole={userRoleState}
              onParticipantsChange={loadParticipants}
              onTimersChange={fetchTimers}
              onSwitchType={(type) => {
                const update: Partial<SessionData> = { session_type: type };
                const s = sessionRef.current;
                if (s.timer_state === "running" && s.timer_started_at) {
                  update.timer_state = "paused";
                  update.paused_elapsed_seconds =
                    (Date.now() - new Date(s.timer_started_at).getTime()) / 1000;
                  update.timer_started_at = null;
                }
                applySessionUpdate(update);
              }}
              onPrivacyChange={(v) => applySessionUpdate({ is_private: v })}
              onOpenUser={(u) => router.push(`/u/${encodeURIComponent(u)}`)}
            />
          )}
            </View>
          </>
        ) : (
          <Pressable
            onPress={() => setPanelOpen(true)}
            style={[styles.collapsedRow, { paddingBottom: insets.bottom + 10 }]}
          >
            <Ionicons name="chatbubbles-outline" size={16} color={colors.mutedForeground} />
            <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.sansMedium }}>
              Chat, notes &amp; config
            </Text>
            <Ionicons name="chevron-up" size={16} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      {/* Exit menu — a local modal (not the root dialog singleton) so it always
          renders on top of this pushed session screen. */}
      <Modal
        transparent
        visible={exitMenuOpen}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => !leaving && setExitMenuOpen(false)}
      >
        <Pressable
          style={styles.exitBackdrop}
          onPress={() => !leaving && setExitMenuOpen(false)}
        >
          <Pressable
            style={[styles.exitSheet, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.exitHeader}>
              <Text style={{ fontSize: 15, fontFamily: fonts.sansSemiBold, color: colors.foreground }}>
                {session.name}
              </Text>
              <Text style={{ fontSize: 13, lineHeight: 18, color: colors.mutedForeground, fontFamily: fonts.sans }}>
                Go home to keep the session running in the background — you can jump back in from the
                banner. When leaving, choose whether to save your time to history.
              </Text>
            </View>

            <Pressable
              onPress={goHome}
              disabled={leaving}
              style={({ pressed }) => [styles.exitRow, pressed && { backgroundColor: colors.muted }]}
            >
              <Ionicons name="home-outline" size={18} color={colors.foreground} />
              <Text style={{ fontSize: 15, fontFamily: fonts.sansMedium, color: colors.foreground }}>
                Go to home
              </Text>
            </Pressable>

            <Pressable
              onPress={() => handleLeave(false)}
              disabled={leaving}
              accessibilityRole="button"
              accessibilityLabel="Leave session without saving to history"
              style={({ pressed }) => [styles.exitRow, pressed && { backgroundColor: colors.muted }]}
            >
              <Ionicons name="exit-outline" size={18} color={colors.destructive} />
              <Text style={{ fontSize: 15, fontFamily: fonts.sansMedium, color: colors.destructive }}>
                {leaveAction === "discard" ? "Leaving…" : "Leave without saving"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => handleLeave(true)}
              disabled={leaving}
              accessibilityRole="button"
              accessibilityLabel="Save session to history and leave"
              style={({ pressed }) => [styles.exitRow, pressed && { backgroundColor: colors.muted }]}
            >
              <Ionicons name="save-outline" size={18} color={colors.destructive} />
              <Text style={{ fontSize: 15, fontFamily: fonts.sansMedium, color: colors.destructive }}>
                {leaveAction === "save" ? "Saving…" : "Save & leave"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setExitMenuOpen(false)}
              disabled={leaving}
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
  codeChip: {
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
  participantStrip: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
  },
  presenceDot: {
    position: "absolute",
    bottom: -1,
    right: -3,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
  },
  panel: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
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
    paddingTop: 10,
  },
  endedWrap: { alignItems: "center", paddingHorizontal: 24 },
  exitBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  exitSheet: {
    alignSelf: "stretch",
    maxWidth: 420,
    width: "100%",
    borderRadius: radius["2xl"],
    borderWidth: 1,
    overflow: "hidden",
    paddingVertical: 6,
  },
  exitHeader: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8, gap: 4 },
  exitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  exitCancelRow: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 2 },
});
