import { useEffect, useRef } from "react";

import { useInvalidate } from "@/lib/hooks";
import { uniqueChannel } from "@/lib/realtime";
import { supabase } from "@/lib/supabase";

/**
 * Headless subscriber that keeps the notifications cache fresh in real time.
 * Mounted once in the (app) layout; renders nothing.
 */
export function NotificationRealtime() {
  const { invalidateNotifications } = useInvalidate();

  const invalidateRef = useRef(invalidateNotifications);
  useEffect(() => {
    invalidateRef.current = invalidateNotifications;
  });

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(({ data: u }) => {
      if (cancelled) return;
      const id = u.user?.id ?? null;
      if (!id) return;
      channel = uniqueChannel(supabase, `notifications:${id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${id}` },
          () => invalidateRef.current(),
        )
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return null;
}
