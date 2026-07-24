export type TimerState = "idle" | "running" | "paused";
export type ParticipantRole = "owner" | "admin" | "member";

export interface SessionTimer {
  id: string;
  name: string;
  duration: number;
  order: number;
}

export interface SessionData {
  id: string;
  name: string;
  code: string;
  status: string;
  session_type: "pomodoro" | "stopwatch";
  current_timer_index: number;
  timer_state: TimerState;
  timer_started_at: string | null;
  paused_elapsed_seconds: number | null;
  is_private: boolean;
  is_password_protected?: boolean;
  last_activity_at?: string;
}

export interface SessionParticipant {
  id: string;
  user_id: string;
  role: ParticipantRole;
  left_at: string | null;
  joined_at: string;
  profiles: { username: string; display_name: string; emoji: string } | null;
}

export interface Lap {
  id: string;
  lap_number: number;
  name: string;
  duration_seconds: number;
  created_at: string;
}

export interface SessionChatMessage {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles: { username: string; display_name: string; emoji: string } | null;
}

export interface SessionChatNotice extends SessionChatMessage {
  type: "participant_joined";
}

export type SessionChatItem = SessionChatMessage | SessionChatNotice;

export function isBreakTimer(name: string) {
  const l = name.toLowerCase();
  return l.includes("break") || l.includes("rest") || l.includes("pause");
}
