import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";
import type { SessionChatItem, SessionChatMessage, SessionChatNotice } from "@/lib/session-types";
import { supabase } from "@/lib/supabase";

const MAX_LOCAL_MESSAGES = 200;

function isSessionChatMessage(value: unknown): value is SessionChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<SessionChatMessage>;
  return (
    typeof message.id === "string" &&
    typeof message.content === "string" &&
    typeof message.created_at === "string" &&
    typeof message.user_id === "string"
  );
}

function isSessionChatNotice(value: unknown): value is SessionChatNotice {
  return isSessionChatMessage(value)
    && "type" in value
    && value.type === "participant_joined";
}

function appendMessage(
  messages: SessionChatItem[],
  message: SessionChatItem,
): SessionChatItem[] {
  if (messages.some((current) => current.id === message.id)) return messages;
  return [...messages, message].slice(-MAX_LOCAL_MESSAGES);
}

/**
 * Session chat is intentionally ephemeral. Messages exist only in the memory
 * of clients currently subscribed to this session and are never replayed.
 */
export function useSessionChat(sessionId: string) {
  const [messages, setMessages] = useState<SessionChatItem[]>([]);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function subscribe() {
      try {
        await supabase.realtime.setAuth();
        if (!active) return;

        channel = supabase
          .channel(`session:${sessionId}:chat`, { config: { private: true } })
          .on("broadcast", { event: "message" }, ({ payload }) => {
            if (!active || !isSessionChatMessage(payload)) return;
            setMessages((current) => appendMessage(current, payload));
          })
          .on("broadcast", { event: "notice" }, ({ payload }) => {
            if (!active || !isSessionChatNotice(payload)) return;
            setMessages((current) => appendMessage(current, payload));
          })
          .subscribe();
      } catch (error) {
        console.error("Failed to subscribe to session chat:", error);
      }
    }

    void subscribe();

    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const sendMessage = useCallback(
    async (content: string) => {
      const message = await api.post<SessionChatMessage>(
        `/api/sessions/${sessionId}/messages`,
        { content },
      );
      setMessages((current) => appendMessage(current, message));
    },
    [sessionId],
  );

  return { messages, sendMessage };
}
