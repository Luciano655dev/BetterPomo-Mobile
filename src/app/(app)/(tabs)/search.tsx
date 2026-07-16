import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import useSWRInfinite from "swr/infinite";

import { EmptyState } from "@/components/ui/EmptyState";
import { EmojiAvatar } from "@/components/ui/EmojiAvatar";
import { ErrorState } from "@/components/ui/ErrorState";
import { Screen } from "@/components/ui/Screen";
import { Segmented } from "@/components/ui/Segmented";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { useActiveSessions, type ActiveSession, type UserProfile } from "@/lib/hooks";
import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

type Tab = "sessions" | "people";

const PAGE_SIZE = 18;

interface SearchPage {
  results: UserProfile[];
  total: number;
  page: number;
  totalPages: number;
}

function useDebounced(value: string, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function SearchScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("sessions");
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim());

  return (
    <Screen
      header={
        <View
          style={[
            styles.searchBox,
            { flex: 1, backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Ionicons name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            placeholder={tab === "sessions" ? "Search live sessions…" : "Search people…"}
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            style={{ flex: 1, fontSize: 15, color: colors.foreground, fontFamily: fonts.sans, height: 42 }}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
      }
    >
      <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
        <Segmented<Tab>
          options={[
            { value: "sessions", label: "Sessions" },
            { value: "people", label: "People" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {tab === "sessions" ? (
        <SessionsList q={q} onJoin={(code) => router.push(`/session/${code}`)} />
      ) : (
        <PeopleList q={q} onOpen={(u) => router.push(`/u/${encodeURIComponent(u)}`)} />
      )}
    </Screen>
  );
}

// ── Live sessions ─────────────────────────────────────────────────────────────

function SessionsList({ q, onJoin }: { q: string; onJoin: (code: string) => void }) {
  const { data, isLoading, error, mutate } = useActiveSessions(q || undefined);
  const [refreshing, setRefreshing] = useState(false);

  if (isLoading && !data) {
    return (
      <View style={{ padding: 20, gap: 10 }}>
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} height={68} round={radius.lg} />
        ))}
      </View>
    );
  }

  if (error && !data) {
    return (
      <ErrorState
        title="Couldn't load sessions"
        subtitle="Check your connection and try again."
        onRetry={() => mutate()}
      />
    );
  }

  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(s) => s.id}
      contentContainerStyle={{ padding: 20, gap: 10, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await mutate();
            setRefreshing(false);
          }}
        />
      }
      ListEmptyComponent={
        <EmptyState
          emoji="📡"
          title={q ? "No sessions match" : "No live sessions right now"}
          subtitle="Public sessions show up here while they're running."
        />
      }
      renderItem={({ item }) => <SessionRow session={item} onJoin={onJoin} />}
    />
  );
}

function SessionRow({ session, onJoin }: { session: ActiveSession; onJoin: (code: string) => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => onJoin(session.code)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View
        style={[
          styles.sessionIcon,
          { backgroundColor: session.status === "active" ? colors.brandTint : colors.muted },
        ]}
      >
        <Ionicons
          name={session.session_type === "stopwatch" ? "stopwatch-outline" : "timer-outline"}
          size={18}
          color={session.status === "active" ? colors.brandText : colors.mutedForeground}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text numberOfLines={1} style={{ fontSize: 14, fontFamily: fonts.sansSemiBold, color: colors.foreground, flexShrink: 1 }}>
            {session.name}
          </Text>
          {session.is_password_protected && (
            <Ionicons name="lock-closed" size={11} color={colors.mutedForeground} />
          )}
        </View>
        <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: fonts.sans }}>
          {session.status === "active" ? "Live" : "Waiting"} ·{" "}
          {session.participant_count} {session.participant_count === 1 ? "person" : "people"} ·{" "}
          <Text style={{ fontFamily: fonts.mono }}>{session.code}</Text>
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

// ── People ────────────────────────────────────────────────────────────────────

function PeopleList({ q, onOpen }: { q: string; onOpen: (username: string) => void }) {
  const { colors } = useTheme();

  const getKey = (pageIndex: number, previous: SearchPage | null) => {
    if (previous && previous.page >= previous.totalPages) return null;
    return `/api/users/search?q=${encodeURIComponent(q)}&page=${pageIndex + 1}&limit=${PAGE_SIZE}`;
  };

  const { data, size, setSize, isLoading, isValidating, error, mutate } = useSWRInfinite<SearchPage>(
    getKey,
    (url: string) => api.get<SearchPage>(url),
    { revalidateFirstPage: false },
  );

  const users = (data ?? []).flatMap((p) => p.results);
  const hasMore = data && data.length > 0 && data[data.length - 1].page < data[data.length - 1].totalPages;
  const [refreshing, setRefreshing] = useState(false);

  if (isLoading && !data) {
    return (
      <View style={{ padding: 20, gap: 10 }}>
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} height={58} round={radius.lg} />
        ))}
      </View>
    );
  }

  if (error && !data) {
    return (
      <ErrorState
        title="Couldn't load people"
        subtitle="Check your connection and try again."
        onRetry={() => mutate()}
      />
    );
  }

  return (
    <FlatList
      data={users}
      keyExtractor={(u) => u.id}
      contentContainerStyle={{ padding: 20, gap: 10, paddingBottom: 40 }}
      onEndReached={() => {
        if (hasMore && !isValidating) setSize(size + 1);
      }}
      onEndReachedThreshold={0.4}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await mutate();
            setRefreshing(false);
          }}
        />
      }
      ListEmptyComponent={
        <EmptyState emoji="🔎" title={q ? "Nobody matches that" : "Search for people"} />
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onOpen(item.username)}
          style={({ pressed }) => [
            styles.row,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <EmojiAvatar emoji={item.emoji} size={38} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text numberOfLines={1} style={{ fontSize: 14, fontFamily: fonts.sansSemiBold, color: colors.foreground }}>
                {item.display_name}
              </Text>
              {item.is_private && (
                <Ionicons name="lock-closed" size={11} color={colors.mutedForeground} />
              )}
            </View>
            <Text numberOfLines={1} style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: fonts.mono }}>
              @{item.username}
            </Text>
            {item.bio ? (
              <Text numberOfLines={1} style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: fonts.sans }}>
                {item.bio}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sessionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
