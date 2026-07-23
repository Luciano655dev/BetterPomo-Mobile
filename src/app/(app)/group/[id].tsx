import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/Segmented";
import { api } from "@/lib/api";
import { useGroupDetails, useGroupInviteLinks, useGroupReport, useInvalidate, useProfile, type GroupInvitation, type GroupInviteLink, type GroupMemberDetail } from "@/lib/hooks";
import { useTheme } from "@/theme/ThemeContext";
import { fonts, radius } from "@/theme/tokens";

type Tab = "overview" | "members" | "invites" | "reports";
type UserResult = { id: string; username: string; display_name: string; emoji: string };
type CreatedLink = GroupInviteLink & { token: string };

const GROUP_EMOJIS = ["👥", "🎯", "🚀", "💻", "📚", "🧠", "🌱", "🔥", "⚡", "🎨", "🎵", "🌍", "🏢", "🧑‍💻", "✍️", "🏆"];
const TIMEZONES = [
  ["🇧🇷", "Fortaleza", "America/Fortaleza"], ["🇧🇷", "São Paulo", "America/Sao_Paulo"],
  ["🇺🇸", "New York", "America/New_York"], ["🇺🇸", "Los Angeles", "America/Los_Angeles"],
  ["🇬🇧", "London", "Europe/London"], ["🇫🇷", "Paris", "Europe/Paris"],
  ["🇮🇳", "Kolkata", "Asia/Kolkata"], ["🇸🇬", "Singapore", "Asia/Singapore"],
  ["🇯🇵", "Tokyo", "Asia/Tokyo"], ["🇦🇺", "Sydney", "Australia/Sydney"], ["🌐", "UTC", "UTC"],
] as const;

function fmt(seconds: number | null | undefined) {
  if (seconds == null) return "Private";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export default function GroupInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = id ?? "";
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { data: profile } = useProfile();
  const { invalidateChat } = useInvalidate();
  const { data: details, mutate, error, isValidating } = useGroupDetails(conversationId);
  const canManage = details?.my_role === "owner" || details?.my_role === "admin";
  const { data: links, mutate: mutateLinks } = useGroupInviteLinks(conversationId, !!canManage);
  const [tab, setTab] = useState<Tab>("overview");
  const [now, setNow] = useState(0);
  const [rangeDays, setRangeDays] = useState(7);
  const [anchor, setAnchor] = useState(0);
  const [editingName, setEditingName] = useState(false);
  const [title, setTitle] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [timezoneOpen, setTimezoneOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<GroupMemberDetail | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<CreatedLink | null>(null);

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1_000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (query.trim().length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => api.get<{ results: UserResult[] }>(`/api/users/search?q=${encodeURIComponent(query.trim())}&page=1&limit=8`).then((value) => { if (!cancelled) setResults(value.results ?? []); }).catch(() => { if (!cancelled) setResults([]); }), 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  const reportRange = useMemo(() => ({ from: new Date(anchor - rangeDays * 86_400_000).toISOString(), to: new Date(anchor).toISOString() }), [anchor, rangeDays]);
  const { data: report, error: reportError, mutate: mutateReport, isValidating: reportLoading } = useGroupReport(tab === "reports" ? conversationId : null, reportRange.from, reportRange.to);
  const memberIds = new Set(details?.members.map((member) => member.id) ?? []);
  const pendingIds = new Set(details?.pending_invitations.map((invitation) => invitation.invited_user) ?? []);
  const visibleResults = query.trim().length >= 2 ? results : [];

  async function run(key: string, action: () => Promise<unknown>, success?: string) {
    setBusy(key);
    try { await action(); if (success) dialog.toast(success, "success"); await mutate(); invalidateChat(); return true; }
    catch (cause) { dialog.toast(cause instanceof Error ? cause.message : "Something went wrong", "error"); return false; }
    finally { setBusy(null); }
  }

  function live(member: GroupMemberDetail, focus: boolean) {
    const base = focus ? member.activity.focus_seconds : member.activity.total_seconds;
    if (base == null || !member.activity.measured_at || !member.activity.in_session) return base;
    return base + (!focus || member.activity.is_focus_running ? Math.max(0, Math.floor((now - Date.parse(member.activity.measured_at)) / 1000)) : 0);
  }

  async function updateGroup(patch: { title?: string; emoji?: string; timezone?: string }, message: string) {
    return run("settings", () => api.patch(`/api/chat/conversations/${conversationId}`, patch), message);
  }

  async function createLink() {
    setBusy("create-link");
    try { const value = await api.post<CreatedLink>(`/api/chat/conversations/${conversationId}/invite-links`, { expires_in_minutes: 1_440, max_uses: 25 }); setCreatedLink(value); await mutateLinks(); dialog.toast("Private invitation link created", "success"); }
    catch (cause) { dialog.toast(cause instanceof Error ? cause.message : "Could not create link", "error"); }
    finally { setBusy(null); }
  }

  async function copyLink() {
    if (!createdLink) return;
    const origin = process.env.EXPO_PUBLIC_WEB_URL ?? "https://app.betterpomo.com";
    await Clipboard.setStringAsync(`${origin}/group-invite/${createdLink.token}`);
    dialog.toast("Invitation link copied", "success");
  }

  async function revokeLink(link: GroupInviteLink) {
    const confirmed = await dialog.confirm({
      title: "Revoke this invitation link?",
      message: "Anyone who has this link will no longer be able to use it.",
      confirmText: "Revoke link",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await api.delete(`/api/chat/conversations/${conversationId}/invite-links/${link.id}`);
      await mutateLinks();
      if (createdLink?.id === link.id) setCreatedLink(null);
      dialog.toast("Link revoked", "success");
    } catch (cause) {
      dialog.toast(cause instanceof Error ? cause.message : "Could not revoke link", "error");
    }
  }

  async function revokeInvitation(invitation: GroupInvitation) {
    const username = invitation.profile?.username ?? "this user";
    const confirmed = await dialog.confirm({
      title: `Revoke @${username}'s invitation?`,
      message: "They will no longer be able to accept this invitation.",
      confirmText: "Revoke invitation",
      destructive: true,
    });
    if (!confirmed) return;
    await run(
      `revoke-${invitation.id}`,
      () => api.delete(`/api/chat/conversations/${conversationId}/invitations/${invitation.id}`),
      "Invitation revoked",
    );
  }

  if (error && !details) return <View style={[styles.root, styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}><Ionicons name="alert-circle-outline" size={32} color={colors.mutedForeground} /><Text style={[styles.heading, { color: colors.foreground }]}>Couldn&apos;t load this group</Text><Text style={[styles.help, { color: colors.mutedForeground, textAlign: "center" }]}>{error instanceof Error ? error.message : "Try again."}</Text><Button title="Retry" variant="outline" loading={isValidating} onPress={() => mutate()} /></View>;
  if (!details) return <View style={[styles.root, styles.center, { backgroundColor: colors.background }]}><Text style={[styles.help, { color: colors.mutedForeground }]}>Loading group…</Text></View>;

  return <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
    <View style={[styles.nav, { borderBottomColor: colors.border }]}><Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={25} color={colors.foreground} /></Pressable><Text style={[styles.navTitle, { color: colors.foreground }]}>Group info</Text><View style={[styles.rolePill, { borderColor: colors.border }]}><Text style={[styles.tiny, { color: colors.mutedForeground }]}>{details.my_role}</Text></View></View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}><Pressable onPress={() => canManage && setEmojiOpen(true)} style={[styles.heroEmoji, { backgroundColor: colors.muted, borderColor: colors.border }]}><Text style={{ fontSize: 36 }}>{details.emoji}</Text>{canManage && <View style={[styles.editDot, { backgroundColor: colors.background, borderColor: colors.border }]}><Ionicons name="pencil" size={11} color={colors.foreground} /></View>}</Pressable><View style={{ flex: 1, minWidth: 0 }}>{editingName ? <View style={{ gap: 8 }}><TextInput autoFocus value={title} onChangeText={setTitle} maxLength={80} style={[styles.input, { borderColor: colors.border, color: colors.foreground }]} /><View style={styles.rowActions}><Button title="Cancel" size="sm" variant="ghost" onPress={() => setEditingName(false)} /><Button title="Save" size="sm" disabled={!title.trim() || busy !== null} onPress={async () => { if (await updateGroup({ title: title.trim() }, "Group name updated")) setEditingName(false); }} /></View></View> : <View><View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Text numberOfLines={2} style={[styles.heroTitle, { color: colors.foreground }]}>{details.title}</Text>{canManage && <Pressable onPress={() => { setTitle(details.title); setEditingName(true); }} hitSlop={8}><Ionicons name="pencil-outline" size={17} color={colors.mutedForeground} /></Pressable>}</View><Text style={[styles.help, { color: colors.mutedForeground, marginTop: 4 }]}>{details.members.length} members · {details.timezone}</Text></View>}</View></View>

      <Segmented options={[{ value: "overview", label: "Overview" }, { value: "members", label: "Members" }, { value: "invites", label: `Invites${details.pending_invitations.length ? ` · ${details.pending_invitations.length}` : ""}` }, { value: "reports", label: "Reports" }]} value={tab} onChange={(value) => { setTab(value); if (value === "reports") setAnchor(Date.now()); }} />

      {tab === "overview" && <View style={{ gap: 12 }}>
        {!details.activity_sharing_started_at && <Card><Text style={[styles.cardTitle, { color: colors.foreground }]}>Share activity with this group?</Text><Text style={[styles.help, { color: colors.mutedForeground }]}>Members can see attendance and focus time. Private session names stay hidden.</Text><Button title="Enable sharing" size="sm" disabled={busy !== null} onPress={() => run("consent", () => api.post(`/api/chat/conversations/${conversationId}/activity-consent`), "Activity sharing enabled")} /></Card>}
        <Card><Text style={[styles.label, { color: colors.mutedForeground }]}>LIVE GROUP ACTIVITY</Text>{details.members.map((member) => <View key={member.id} style={[styles.activityRow, { borderBottomColor: colors.border }]}><Text style={{ fontSize: 21 }}>{member.emoji}</Text><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={[styles.memberName, { color: colors.foreground }]}>{member.display_name}</Text><Text numberOfLines={1} style={[styles.help, { color: colors.mutedForeground }]}>{member.activity.in_session ? member.activity.session?.name ?? "Private session" : "Not in a session"}</Text></View>{member.activity.in_session && <View style={{ alignItems: "flex-end" }}><Text style={[styles.mono, { color: colors.foreground }]}>{fmt(live(member, false))}</Text><Text style={[styles.tiny, { color: colors.mutedForeground }]}>{fmt(live(member, true))} focus</Text></View>}</View>)}</Card>
        <Card><Text style={[styles.label, { color: colors.mutedForeground }]}>REPORTING TIMEZONE</Text><Text style={[styles.help, { color: colors.mutedForeground }]}>Used to group work into calendar days.</Text><Pressable disabled={!canManage} onPress={() => setTimezoneOpen(true)} style={[styles.selector, { borderColor: colors.border }]}><Text style={[styles.memberName, { color: colors.foreground }]}>{TIMEZONES.find((zone) => zone[2] === details.timezone)?.[0] ?? "🌐"} {TIMEZONES.find((zone) => zone[2] === details.timezone)?.[1] ?? details.timezone}</Text><Ionicons name="chevron-down" size={17} color={colors.mutedForeground} /></Pressable></Card>
      </View>}

      {tab === "members" && <Card><Text style={[styles.cardTitle, { color: colors.foreground }]}>Participants</Text><Text style={[styles.help, { color: colors.mutedForeground }]}>Session visibility follows each person&apos;s privacy settings.</Text>{details.members.map((member) => { const self = member.id === profile?.id; const canRemove = !self && member.role !== "owner" && (details.my_role === "owner" || (details.my_role === "admin" && member.role === "member")); const actions = !self && member.role !== "owner" && (details.my_role === "owner" || canRemove); return <View key={member.id} style={[styles.memberRow, { borderBottomColor: colors.border }]}><View style={[styles.avatar, { backgroundColor: colors.muted }]}><Text style={{ fontSize: 20 }}>{member.emoji}</Text></View><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={[styles.memberName, { color: colors.foreground }]}>{member.display_name} <Text style={{ color: colors.mutedForeground }}>@{member.username}</Text></Text><Text numberOfLines={1} style={[styles.help, { color: colors.mutedForeground }]}>{member.role} · {member.activity.in_session ? member.activity.session?.name ?? "Private session" : "Offline"}</Text></View>{member.activity.session && <Pressable onPress={() => router.push(`/session/${member.activity.session?.code}`)} hitSlop={8}><Ionicons name="open-outline" size={20} color={colors.mutedForeground} /></Pressable>}{actions && <Pressable onPress={() => setSelectedMember(member)} hitSlop={10}><Ionicons name="ellipsis-vertical" size={21} color={colors.foreground} /></Pressable>}</View>; })}</Card>}

      {tab === "invites" && <View style={{ gap: 12 }}><Card><View style={{ flexDirection: "row", gap: 10 }}><Ionicons name="link-outline" size={22} color={colors.foreground} /><View style={{ flex: 1 }}><Text style={[styles.cardTitle, { color: colors.foreground }]}>Invitation link</Text><Text style={[styles.help, { color: colors.mutedForeground }]}>Expires in 24 hours. It can be revoked and its secret is never stored.</Text></View></View>{canManage && <View style={{ marginTop: 12, gap: 9 }}>{createdLink ? <View style={styles.rowActions}><Button title="Copy link" size="sm" icon={<Ionicons name="copy-outline" size={16} color={colors.primaryForeground} />} onPress={copyLink} style={{ flex: 1 }} /><Button title="New link" size="sm" variant="outline" onPress={createLink} /></View> : <Button title="Create temporary link" size="sm" loading={busy === "create-link"} onPress={createLink} />}{(links ?? []).map((link) => <View key={link.id} style={[styles.linkRow, { borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.memberName, { color: colors.foreground }]}>{link.use_count} of {link.max_uses} uses</Text><Text style={[styles.help, { color: colors.mutedForeground }]}>Expires {new Date(link.expires_at).toLocaleString()}</Text></View><Button title="Revoke" size="sm" variant="ghost" onPress={() => revokeLink(link)} /></View>)}</View>}</Card><Card><Text style={[styles.cardTitle, { color: colors.foreground }]}>Invite a BetterPomo user</Text><Text style={[styles.help, { color: colors.mutedForeground }]}>They will see it in the new Invites tab in Messages.</Text>{canManage && <><TextInput value={query} onChangeText={setQuery} autoCapitalize="none" placeholder="Search by username" placeholderTextColor={colors.mutedForeground} style={[styles.input, { borderColor: colors.border, color: colors.foreground, marginTop: 12 }]} />{visibleResults.filter((item) => !memberIds.has(item.id) && !pendingIds.has(item.id)).map((item) => <View key={item.id} style={styles.memberRow}><Text>{item.emoji}</Text><Text numberOfLines={1} style={[styles.memberName, { color: colors.foreground, flex: 1 }]}>{item.display_name} <Text style={{ color: colors.mutedForeground }}>@{item.username}</Text></Text><Button title="Invite" size="sm" variant="outline" disabled={busy !== null} onPress={() => run(`invite-${item.id}`, () => api.post(`/api/chat/conversations/${conversationId}/members`, { username: item.username }), "Invitation sent")} /></View>)}{details.pending_invitations.map((invitation) => <View key={invitation.id} style={styles.memberRow}><Text>{invitation.profile?.emoji ?? "🍅"}</Text><Text style={[styles.help, { color: colors.mutedForeground, flex: 1 }]}>@{invitation.profile?.username ?? "unknown"} · pending</Text><Button title="Revoke" size="sm" variant="ghost" onPress={() => revokeInvitation(invitation)} /></View>)}</>}</Card></View>}

      {tab === "reports" && <Card><View style={styles.rowActions}>{[1, 7, 30].map((days) => <Button key={days} title={days === 1 ? "24h" : `${days} days`} size="sm" variant={rangeDays === days ? "primary" : "outline"} onPress={() => { setRangeDays(days); setAnchor(Date.now()); }} />)}</View>{reportError && !report ? <View style={[styles.center, { paddingVertical: 28 }]}><Text style={[styles.cardTitle, { color: colors.foreground }]}>Couldn&apos;t load report</Text><Button title="Retry" variant="outline" size="sm" loading={reportLoading} onPress={() => mutateReport()} /></View> : !report ? <Text style={[styles.help, { color: colors.mutedForeground, marginTop: 20 }]}>Loading report…</Text> : <><View style={[styles.metrics, { marginTop: 14 }]}><Metric label="Total" value={fmt(report.total_seconds)} /><Metric label="Focus" value={fmt(report.focus_seconds)} /></View>{report.members.map((member) => <View key={member.id} style={[styles.reportRow, { borderColor: colors.border }]}><Text>{member.emoji}</Text><Text style={[styles.memberName, { color: colors.foreground, flex: 1 }]}>{member.display_name}</Text><Text style={[styles.mono, { color: colors.mutedForeground }]}>{fmt(member.total_seconds)} · {fmt(member.focus_seconds)}</Text></View>)}</>}</Card>}

      {details.my_role === "owner" && <Button title="Delete group" variant="destructive" onPress={async () => { const confirmed = await dialog.confirm({ title: "Delete group", message: `Delete ${details.title} for everyone?`, confirmText: "Delete", destructive: true }); if (confirmed && await run("delete", () => api.delete(`/api/chat/conversations/${conversationId}`), "Group deleted")) router.replace("/messages"); }} />}
    </ScrollView>

    <ChoiceModal open={emojiOpen} title="Choose a group icon" onClose={() => setEmojiOpen(false)}>{<View style={styles.emojiGrid}>{GROUP_EMOJIS.map((emoji) => <Pressable key={emoji} onPress={async () => { setEmojiOpen(false); await updateGroup({ emoji }, "Group icon updated"); }} style={[styles.emojiCell, { borderColor: details.emoji === emoji ? colors.foreground : colors.border, backgroundColor: details.emoji === emoji ? colors.muted : "transparent" }]}><Text style={{ fontSize: 23 }}>{emoji}</Text></Pressable>)}</View>}</ChoiceModal>
    <ChoiceModal open={timezoneOpen} title="Reporting timezone" onClose={() => setTimezoneOpen(false)}>{<ScrollView style={{ maxHeight: 420 }}>{TIMEZONES.map(([flag, label, value]) => <Pressable key={value} onPress={async () => { setTimezoneOpen(false); await updateGroup({ timezone: value }, "Timezone updated"); }} style={[styles.choiceRow, { borderBottomColor: colors.border }]}><Text style={{ fontSize: 22 }}>{flag}</Text><View style={{ flex: 1 }}><Text style={[styles.memberName, { color: colors.foreground }]}>{label}</Text><Text style={[styles.help, { color: colors.mutedForeground }]}>{value}</Text></View>{details.timezone === value && <Ionicons name="checkmark-circle" size={21} color={colors.foreground} />}</Pressable>)}</ScrollView>}</ChoiceModal>
    <MemberActions member={selectedMember} detailsRole={details.my_role} conversationId={conversationId} busy={busy !== null} onClose={() => setSelectedMember(null)} run={run} />
  </View>;
}

function Card({ children }: { children: React.ReactNode }) { const { colors } = useTheme(); return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{children}</View>; }
function Metric({ label, value }: { label: string; value: string }) { const { colors } = useTheme(); return <View style={[styles.metric, { borderColor: colors.border }]}><Text style={[styles.help, { color: colors.mutedForeground }]}>{label}</Text><Text style={[styles.metricValue, { color: colors.foreground }]}>{value}</Text></View>; }
function ChoiceModal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) { const { colors } = useTheme(); return <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}><Pressable style={styles.backdrop} onPress={onClose}><Pressable onPress={(event) => event.stopPropagation()} style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={styles.sheetHeader}><Text style={[styles.cardTitle, { color: colors.foreground }]}>{title}</Text><Pressable onPress={onClose}><Ionicons name="close" size={22} color={colors.foreground} /></Pressable></View>{children}</Pressable></Pressable></Modal>; }
function MemberActions({ member, detailsRole, conversationId, busy, onClose, run }: { member: GroupMemberDetail | null; detailsRole: "owner" | "admin" | "member"; conversationId: string; busy: boolean; onClose: () => void; run: (key: string, action: () => Promise<unknown>, success?: string) => Promise<boolean> }) {
  if (!member) return null;
  const selected = member;
  const canRemove = selected.role !== "owner" && (detailsRole === "owner" || (detailsRole === "admin" && selected.role === "member"));

  async function changeRole() {
    onClose();
    const makingAdmin = selected.role !== "admin";
    const confirmed = await dialog.confirm({
      title: makingAdmin ? `Make ${selected.display_name} an admin?` : `Remove ${selected.display_name} as an admin?`,
      message: makingAdmin
        ? "Admins can manage members, invitations, and group reporting settings."
        : "They will lose access to group management controls.",
      confirmText: makingAdmin ? "Make admin" : "Remove admin",
      destructive: !makingAdmin,
    });
    if (!confirmed) return;
    await run(
      `role-${selected.id}`,
      () => api.patch(`/api/chat/conversations/${conversationId}/members/${selected.id}/role`, { role: makingAdmin ? "admin" : "member" }),
      "Role updated",
    );
  }

  async function transferOwnership() {
    onClose();
    const confirmed = await dialog.confirm({
      title: `Transfer ownership to ${selected.display_name}?`,
      message: "You will become an admin and only the new owner can transfer ownership again.",
      confirmText: "Transfer ownership",
      destructive: true,
    });
    if (!confirmed) return;
    await run(
      `owner-${selected.id}`,
      () => api.post(`/api/chat/conversations/${conversationId}/transfer-ownership`, { user_id: selected.id }),
      "Ownership transferred",
    );
  }

  async function removeMember() {
    onClose();
    const confirmed = await dialog.confirm({
      title: `Remove ${selected.display_name} from this group?`,
      message: "They will lose access to group messages and reports until invited again.",
      confirmText: "Remove member",
      destructive: true,
    });
    if (!confirmed) return;
    await run(
      `remove-${selected.id}`,
      () => api.delete(`/api/chat/conversations/${conversationId}/members/${selected.id}`),
      "Member removed",
    );
  }

  return <ChoiceModal open title={selected.display_name} onClose={onClose}>{
    <View style={{ gap: 8 }}>
      {detailsRole === "owner" && <>
        <Button title={selected.role === "admin" ? "Remove admin" : "Make admin"} variant="outline" disabled={busy} onPress={changeRole} />
        <Button title="Transfer ownership" variant="outline" disabled={busy} onPress={transferOwnership} />
      </>}
      {canRemove && <Button title="Remove from group" variant="destructive" disabled={busy} onPress={removeMember} />}
    </View>
  }</ChoiceModal>;
}

const styles = StyleSheet.create({
  root: { flex: 1 }, center: { alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  nav: { height: 52, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth }, navTitle: { flex: 1, fontSize: 16, fontFamily: fonts.sansSemiBold }, rolePill: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 4 },
  content: { padding: 16, gap: 14, paddingBottom: 44 }, hero: { borderWidth: 1, borderRadius: radius["3xl"], padding: 16, flexDirection: "row", alignItems: "center", gap: 13 }, heroEmoji: { width: 72, height: 72, borderWidth: 1, borderRadius: radius["3xl"], alignItems: "center", justifyContent: "center" }, editDot: { position: "absolute", right: -3, bottom: -3, width: 25, height: 25, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" }, heroTitle: { flexShrink: 1, fontSize: 23, fontFamily: fonts.sansBold },
  heading: { fontSize: 18, fontFamily: fonts.sansBold }, card: { borderWidth: 1, borderRadius: radius["3xl"], padding: 15, gap: 9 }, cardTitle: { fontSize: 15, fontFamily: fonts.sansSemiBold }, label: { fontSize: 10, letterSpacing: 1.2, fontFamily: fonts.sansSemiBold }, help: { fontSize: 11, lineHeight: 16, fontFamily: fonts.sans }, tiny: { fontSize: 10, textTransform: "capitalize", fontFamily: fonts.sansMedium }, mono: { fontSize: 11, fontFamily: fonts.mono }, memberName: { fontSize: 13, fontFamily: fonts.sansSemiBold },
  input: { minHeight: 42, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 12, fontFamily: fonts.sans }, selector: { minHeight: 46, borderWidth: 1, borderRadius: radius.xl, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, activityRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth }, memberRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 9, borderBottomWidth: StyleSheet.hairlineWidth }, avatar: { width: 42, height: 42, borderRadius: radius.xl, alignItems: "center", justifyContent: "center" },
  rowActions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 }, linkRow: { borderWidth: 1, borderRadius: radius.xl, padding: 10, flexDirection: "row", alignItems: "center", gap: 8 }, metrics: { flexDirection: "row", gap: 9 }, metric: { flex: 1, borderWidth: 1, borderRadius: radius.xl, padding: 13, gap: 4 }, metricValue: { fontSize: 19, fontFamily: fonts.monoSemiBold }, reportRow: { borderWidth: 1, borderRadius: radius.xl, padding: 11, flexDirection: "row", alignItems: "center", gap: 8 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 20 }, sheet: { width: "100%", maxWidth: 460, borderWidth: 1, borderRadius: radius["3xl"], padding: 16 }, sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 13 }, emojiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, emojiCell: { width: 45, height: 45, borderWidth: 1, borderRadius: radius.xl, alignItems: "center", justifyContent: "center" }, choiceRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
});
