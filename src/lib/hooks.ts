// Port of betterpomo-webapp/lib/hooks.ts — same keys, types, and intervals.
import useSWR, { useSWRConfig } from "swr";
import { api } from "./api";

 
const fetcher = (url: string) => api.get<any>(url);

// ── Data hooks ────────────────────────────────────────────────────────────────

export type Plan = "free" | "pro" | "lifetime";
export type PlanStatus = "none" | "trialing" | "active" | "past_due" | "canceled";
export type PlanBadge = "pro" | "lifetime" | null;

/** Computed server-side from the plan columns — mirror of the API's
 *  lib/plans.ts. Gate UI off these, never off raw plan fields. */
export interface Entitlements {
  isPro: boolean;
  badge: PlanBadge;
  maxTimers: number;
  maxParticipants: number;
  maxGroupMembers: number;
  maxTasks: number;
  historyDays: number | null;
  privateSessions: boolean;
  customSounds: boolean;
  templates: boolean;
  analytics: boolean;
}

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  emoji: string;
  bio: string | null;
  is_private: boolean;
  onboarding_completed: boolean;
  focus_category?: "study" | "work" | "build" | "read" | "other" | null;
  focus_style?: "solo" | "friends" | "team" | null;
  focus_peak?: "morning" | "afternoon" | "evening" | "night" | null;
  created_at?: string;
  plan?: Plan;
  plan_status?: PlanStatus;
  plan_provider?: "stripe" | "apple" | "google" | null;
  plan_period_end?: string | null;
  cancel_at_period_end?: boolean;
  trial_ends_at?: string | null;
  trial_used?: boolean;
  entitlements?: Entitlements;
}

export interface Billing {
  plan: Plan;
  plan_status: PlanStatus;
  plan_provider: "stripe" | "apple" | "google" | null;
  plan_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_ends_at: string | null;
  trial_used: boolean;
  entitlements: Entitlements;
}

export interface HistorySummary {
  total_count: number;
  visible_count: number;
  locked_count: number;
  window_days: number | null;
}

export interface Session {
  session_id: string;
  role: string;
  pomodoro_sessions: { id: string; name: string; code: string; status: string; created_at: string };
}

export interface HistoryEntry {
  id: string;
  session_name: string;
  timers_used: unknown;
  participants: unknown;
  duration_seconds: number | null;
  focus_seconds?: number | null;
  completed_at: string;
  tasks?: { text: string; done: boolean }[] | null;
}

export interface AnalyticsHistoryEntry {
  session_name: string;
  timers_used: { name: string; duration: number }[] | null;
  duration_seconds: number | null;
  focus_seconds?: number | null;
  completed_at: string;
}

/** GET /api/sessions/mine/active — the caller's running background session. */
export interface MyActiveSession {
  joined_at: string;
  session: {
    id: string;
    name: string;
    code: string;
    status: "waiting" | "active";
    session_type: "pomodoro" | "stopwatch";
    timer_state: "idle" | "running" | "paused";
    timer_started_at: string | null;
    paused_elapsed_seconds: number | null;
    current_timer_index: number;
  };
  current_timer: { name: string; duration: number } | null;
}

export interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  emoji: string;
  bio: string | null;
  is_private: boolean;
}

export interface ActiveSession {
  id: string;
  name: string;
  code: string;
  status: "waiting" | "active";
  is_private: boolean;
  is_password_protected: boolean;
  session_type: "pomodoro" | "stopwatch";
  participant_count: number;
  created_at: string;
}

export function useProfile() {
  return useSWR<Profile>("/api/profile", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
}

// GET /api/billing — current plan + entitlements (drives the paywall + settings)
export function useBilling() {
  return useSWR<Billing>("/api/billing", fetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
  });
}

// GET /api/history/summary — locked-entry count for the free-plan history block
export function useHistorySummary() {
  return useSWR<HistorySummary>("/api/history/summary", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });
}

export function useSessions() {
  return useSWR<Session[]>("/api/sessions", fetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
  });
}

/** The user's running background session, if any — drives the ActiveSessionBanner. */
export function useMyActiveSession() {
  return useSWR<MyActiveSession | null>("/api/sessions/mine/active", fetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
    refreshInterval: 15_000,
  });
}

export function useHistory(limit = 50, offset = 0) {
  return useSWR<HistoryEntry[]>(`/api/history?limit=${limit}&offset=${offset}`, fetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
    refreshInterval: 60_000,
  });
}

export function useHistoryAnalytics() {
  return useSWR<AnalyticsHistoryEntry[]>("/api/history/analytics", fetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
    refreshInterval: 60_000,
  });
}

export function useUserProfile(username: string | null) {
  return useSWR<UserProfile>(
    username ? `/api/users/${encodeURIComponent(username)}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );
}

export function useUserHistory(username: string | null) {
  return useSWR<HistoryEntry[]>(
    username ? `/api/users/${encodeURIComponent(username)}/history` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );
}

export function useUserActiveSession(username: string | null) {
  return useSWR<{ in_session: boolean; session_name: string | null } | null>(
    username ? `/api/users/${encodeURIComponent(username)}/active-session` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30_000, refreshInterval: 60_000 },
  );
}

export interface Friend {
  id: string;
  username: string;
  display_name: string;
  emoji: string;
  bio: string | null;
  is_private: boolean;
  friends_since: string;
}

export interface FriendRequest {
  direction: "incoming" | "outgoing";
  id: string;
  username: string;
  display_name: string;
  emoji: string;
  requested_at: string;
}

export type FriendshipStatus =
  | "self"
  | "none"
  | "pending_outgoing"
  | "pending_incoming"
  | "friends";

export function useFriends() {
  return useSWR<{ friends: Friend[]; count: number }>("/api/friends", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });
}

export function useFriendRequests() {
  return useSWR<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>(
    "/api/friends/requests",
    fetcher,
    { revalidateOnFocus: true, dedupingInterval: 10_000, refreshInterval: 30_000 },
  );
}

export function useFriendshipStatus(username: string | null) {
  return useSWR<{ status: FriendshipStatus; target_id: string }>(
    username ? `/api/friends/status/${encodeURIComponent(username)}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 15_000 },
  );
}

export function useUserFriends(username: string | null) {
  return useSWR<{ count: number; friends: Friend[] }>(
    username ? `/api/users/${encodeURIComponent(username)}/friends` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );
}

export interface ConversationMember {
  id: string;
  username: string;
  display_name: string;
  emoji: string;
}

export type GroupRole = "owner" | "admin" | "member";

export interface GroupInvitation {
  id: string;
  invited_user: string;
  invited_by: string;
  status: "pending" | "accepted" | "declined" | "revoked" | "expired";
  created_at: string;
  expires_at: string;
  profile: { id: string; username: string; display_name: string; emoji: string } | null;
}

export interface PendingGroupInvitation {
  id: string;
  conversation_id: string;
  invited_by: string;
  created_at: string;
  expires_at: string;
  group: { id: string; title: string; emoji: string } | null;
  inviter: { id: string; username: string; display_name: string; emoji: string } | null;
}

export interface GroupInviteLink {
  id: string;
  conversation_id: string;
  created_at: string;
  expires_at: string;
  max_uses: number;
  use_count: number;
  revoked_at?: string | null;
}

export interface GroupMemberActivity {
  in_session: boolean;
  total_seconds?: number | null;
  focus_seconds?: number | null;
  measured_at?: string;
  is_focus_running?: boolean;
  session?: { id: string; name: string; code: string; session_type: "pomodoro" | "stopwatch"; is_password_protected: boolean } | null;
}

export interface GroupMemberDetail extends ConversationMember {
  role: GroupRole;
  joined_at: string;
  activity_sharing_started_at: string | null;
  activity: GroupMemberActivity;
}

export interface GroupDetails {
  id: string;
  title: string;
  emoji: string;
  timezone: string;
  my_role: GroupRole;
  activity_sharing_started_at: string | null;
  members: GroupMemberDetail[];
  pending_invitations: GroupInvitation[];
}

export interface GroupReportMember extends ConversationMember {
  role: GroupRole;
  total_seconds: number;
  focus_seconds: number;
  focus_ratio: number;
  daily: { date: string; total_seconds: number; focus_seconds: number }[];
  sessions: { id: string; name: string; total_seconds: number; focus_seconds: number; completed_at: string; is_private: boolean }[];
}

export interface GroupReport {
  timezone: string;
  from: string;
  to: string;
  total_seconds: number;
  focus_seconds: number;
  members: GroupReportMember[];
}

export interface Conversation {
  id: string;
  is_group: boolean;
  title: string | null;
  emoji: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  last_message_kind: "text" | "session_invite" | null;
  unread_count: number;
  members: ConversationMember[];
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  kind: "text" | "session_invite";
  content: string | null;
  metadata: {
    session_id?: string;
    code?: string;
    name?: string;
    session_type?: "pomodoro" | "stopwatch";
    system_event?: "member_joined" | "member_left" | "member_removed" | "member_promoted" | "member_demoted" | "ownership_transferred" | "group_renamed";
    user_id?: string;
    username?: string;
    display_name?: string;
  };
  created_at: string;
  expires_at: string;
}

export function useConversations() {
  return useSWR<Conversation[]>("/api/chat/conversations", fetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 8_000,
    refreshInterval: 10_000,
  });
}

export function useGroupDetails(conversationId: string | null) {
  return useSWR<GroupDetails>(
    conversationId ? `/api/chat/conversations/${conversationId}/details` : null,
    fetcher,
    {
      revalidateOnFocus: true,
      dedupingInterval: 10_000,
      refreshInterval: (data) => data ? 30_000 : 0,
      errorRetryCount: 2,
      errorRetryInterval: 1_500,
    },
  );
}

export function useGroupInvitations() {
  return useSWR<PendingGroupInvitation[]>("/api/chat/group-invitations", fetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 8_000,
    refreshInterval: 20_000,
  });
}

export function useGroupInviteLinks(conversationId: string | null, enabled = true) {
  return useSWR<GroupInviteLink[]>(
    conversationId && enabled ? `/api/chat/conversations/${conversationId}/invite-links` : null,
    fetcher,
    { revalidateOnFocus: true, dedupingInterval: 8_000 },
  );
}

export function useGroupReport(conversationId: string | null, from: string, to: string) {
  return useSWR<GroupReport>(
    conversationId
      ? `/api/chat/conversations/${conversationId}/report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      : null,
    fetcher,
    { revalidateOnFocus: true, dedupingInterval: 15_000, errorRetryCount: 2, errorRetryInterval: 1_500 },
  );
}

export type NotificationType = "friend_request" | "friend_accept" | "session_invite" | "group_add" | "group_invite" | "trial_ending";

export interface AppNotification {
  id: string;
  type: NotificationType;
  actor_id: string | null;
  entity_id: string | null;
  metadata: {
    username?: string;
    display_name?: string;
    emoji?: string;
    name?: string;
    code?: string;
    session_type?: "pomodoro" | "stopwatch";
    title?: string | null;
    conversation_id?: string;
    invitation_id?: string;
    session_name?: string | null;
  };
  read_at: string | null;
  created_at: string;
}

export function useNotifications() {
  return useSWR<{ notifications: AppNotification[]; unread_count: number }>(
    "/api/notifications",
    fetcher,
    { revalidateOnFocus: true, dedupingInterval: 8_000, refreshInterval: 15_000 },
  );
}

export interface NotificationPreferences {
  timers: boolean;
  friends: boolean;
  sessions: boolean;
  messages: boolean;
  account: boolean;
}

export function useNotificationPreferences() {
  return useSWR<NotificationPreferences>("/api/notifications/preferences", fetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 10_000,
  });
}

export function useActiveSessions(q?: string) {
  const key = q ? `/api/sessions/active?q=${encodeURIComponent(q)}` : "/api/sessions/active";
  return useSWR<ActiveSession[]>(key, fetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 15_000,
    refreshInterval: 30_000,
  });
}

// ── Mutation helpers ───────────────────────────────────────────────────────────

export function useInvalidate() {
  const { mutate } = useSWRConfig();
  // Note: always call mutate with ONE argument here. Passing `undefined` as a
  // second argument counts as a data update — SWR writes undefined into the
  // cache before revalidating, so a failed refetch (offline) leaves screens
  // empty instead of showing the last known data.
  return {
    // After any profile PATCH — revalidates own profile + all /api/users/* pages
    invalidateProfile: () => {
      mutate("/api/profile");
      mutate((key: unknown) => typeof key === "string" && key.startsWith("/api/users/"));
    },
    // After adding/editing/deleting a history entry
    invalidateHistory: () => {
      mutate((key: unknown) => typeof key === "string" && key.startsWith("/api/history"));
      mutate((key: unknown) => typeof key === "string" && key.includes("/history"));
    },
    // After joining/leaving a session
    invalidateSessions: () => {
      mutate("/api/sessions");
      mutate("/api/sessions/mine/active");
    },
    // After any friend mutation (send/accept/decline/cancel/unfriend)
    invalidateFriends: () => {
      mutate((key: unknown) => typeof key === "string" && key.startsWith("/api/friends"));
      mutate((key: unknown) => typeof key === "string" && key.includes("/friends"));
    },
    // After any chat mutation (new conversation, message, read, invite, leave)
    invalidateChat: () => {
      mutate((key: unknown) => typeof key === "string" && key.startsWith("/api/chat"));
    },
    // After notifications change (new arrival via realtime, mark read, dismiss)
    invalidateNotifications: () => {
      mutate((key: unknown) => typeof key === "string" && key.startsWith("/api/notifications"));
    },
    // After a plan change lands (purchase, restore) — the history window and
    // profile entitlements change with the plan.
    invalidateBilling: () => {
      mutate("/api/billing");
      mutate("/api/profile");
      mutate((key: unknown) => typeof key === "string" && key.startsWith("/api/history"));
    },
  };
}
