// Port of betterpomo-webapp/lib/realtime.ts (crypto.randomUUID → expo-crypto).
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "expo-crypto";

/**
 * Create a realtime channel on a process-unique topic.
 *
 * supabase-js returns the *existing* channel when `.channel(topic)` is called
 * with a topic that's still registered, and `removeChannel()` is asynchronous —
 * so a fast unmount/remount hands back an already-subscribed channel. Adding a
 * `postgres_changes` listener to it then throws. A unique suffix guarantees
 * every mount gets a brand-new channel.
 *
 * ⚠️ Only use this for `postgres_changes` channels — each client subscribes to
 * the database independently, so the topic name is purely local. Channels that
 * exchange `broadcast`/`presence` messages need a shared, deterministic topic
 * across clients (e.g. `session:{sessionId}`) and must call
 * `supabase.channel()` directly.
 */
export function uniqueChannel(supabase: SupabaseClient, prefix: string): RealtimeChannel {
  return supabase.channel(`${prefix}:${randomUUID()}`);
}
