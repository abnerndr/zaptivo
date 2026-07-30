'use client';

// ============================================================
// MembersTab — Settings → Members
//
// Two stacked sections:
//   1. Roster   — every member of the account. Admin+ can change a
//                 teammate's role inline and remove them. Owner row
//                 is non-editable everywhere (transfer is its own
//                 separate flow, deferred to a later PR).
//   2. Pending  — outstanding invite links. Admin+ can revoke. The
//                 plaintext URL is gone after the create dialog
//                 closes, so we surface a "revoke + new link" hint
//                 rather than pretending we can resurface it.
//
// Role-gating
//   The tab itself is reachable by any member, but mutation buttons
//   are wrapped in `<RequireRole min="admin">` / `useCan` so an
//   agent or viewer sees the roster read-only. The server-side
//   RPCs (set_member_role, remove_account_member) double-check
//   the role anyway.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Loader2,
  Mail,
  MailX,
  Pencil,
  Plus,
  Trash2,
  UsersRound,
} from 'lucide-react';

import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslations } from 'next-intl';
import { RequireRole } from '@/components/auth/require-role';
import { useAuth } from '@/hooks/use-auth';
import { usePresence } from '@/hooks/use-presence';
import type { AccountRole } from '@/lib/auth/roles';
import { presenceLabel, summarize } from '@/lib/presence';
import {
  PRESENCE_DOT_CLASS,
  PresenceDot,
} from '@/components/presence/presence-dot';
import { InviteMemberDialog } from './invite-member-dialog';
import { SettingsPanelHead } from './settings-panel-head';
import { ROLE_META } from './role-meta';

interface Member {
  user_id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  role: AccountRole;
  org_role_id?: string | null;
  org_role_name?: string | null;
  joined_at: string;
}

interface Invitation {
  id: string;
  role: 'admin' | 'agent' | 'viewer';
  org_role_name?: string | null;
  email?: string | null;
  label: string | null;
  created_at: string;
  expires_at: string;
}

type OrgRoleOption = {
  id: string;
  name: string;
  system_key: string | null;
};

// Per-role chip metadata (icon / label / colour) lives in the shared
// ROLE_META module so this roster and the Overview identity chip can't
// drift. The colour scale runs amber (owner — scarce, immutable) →
// primary (admin) → muted (agent / viewer).

function fmtDate(iso: string): string {
  // Match the rest of the dashboard's locale-light formatting.
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function fmtExpiresIn(iso: string, t: (key: string, values?: Record<string, string | number>) => string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return t('expired');
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return t('expiresInDays', { days });
  const hours = Math.max(1, Math.floor(ms / (60 * 60 * 1000)));
  return t('expiresInHours', { hours });
}

export function MembersTab() {
  const t = useTranslations('Settings.members');
  const tRoles = useTranslations('Settings.roles');
  const { user, canManageMembers } = useAuth();
  const { getPresence, getRow, now } = usePresence();

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [removingMember, setRemovingMember] = useState<Member | null>(null);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editOrgRoleId, setEditOrgRoleId] = useState('');
  const [orgRoles, setOrgRoles] = useState<OrgRoleOption[]>([]);
  const [pendingMemberAction, setPendingMemberAction] = useState<string | null>(
    null,
  );

  const loadEverything = useCallback(async () => {
    try {
      const [mres, ires, rres] = await Promise.all([
        fetch('/api/account/members', { cache: 'no-store' }),
        canManageMembers
          ? fetch('/api/account/invitations', { cache: 'no-store' })
          : Promise.resolve(null),
        canManageMembers
          ? fetch('/api/account/roles', { cache: 'no-store' })
          : Promise.resolve(null),
      ]);

      if (!mres.ok) {
        const payload = await mres.json().catch(() => ({}));
        toast.error(payload.error || t('loadMembersFailed'));
        return;
      }
      const mdata = (await mres.json()) as { members?: Member[] };
      setMembers(mdata.members ?? []);

      if (ires) {
        if (!ires.ok) {
          const payload = await ires.json().catch(() => ({}));
          toast.error(payload.error || t('loadInvitesFailed'));
          return;
        }
        const idata = (await ires.json()) as { invitations?: Invitation[] };
        setInvitations(idata.invitations ?? []);
      } else {
        setInvitations([]);
      }

      if (rres?.ok) {
        const rdata = (await rres.json()) as { roles?: OrgRoleOption[] };
        setOrgRoles(
          (rdata.roles ?? []).filter((r) => r.system_key !== 'owner'),
        );
      }
    } catch (err) {
      console.error('[MembersTab] load error:', err);
      toast.error(t('networkError'));
    } finally {
      setLoading(false);
    }
  }, [canManageMembers, t]);

  useEffect(() => {
    void loadEverything();
  }, [loadEverything]);

  function openEdit(member: Member) {
    setEditingMember(member);
    setEditName(member.full_name || '');
    setEditEmail(member.email || '');
    setEditOrgRoleId(
      member.org_role_id ||
        orgRoles.find((r) => r.system_key === member.role)?.id ||
        '',
    );
  }

  async function handleSaveEdit() {
    if (!editingMember) return;
    const name = editName.trim();
    if (!name) {
      toast.error(t('editNameRequired'));
      return;
    }
    setPendingMemberAction(editingMember.user_id);
    try {
      const res = await fetch(`/api/account/members/${editingMember.user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: name,
          email: editEmail.trim() || undefined,
          orgRoleId: editOrgRoleId || undefined,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || t('editFailed'));
        return;
      }
      toast.success(
        t('memberUpdatedToast', { name: name || t('unnamed') }),
      );
      setEditingMember(null);
      await loadEverything();
    } catch (err) {
      console.error('[MembersTab] edit error:', err);
      toast.error(t('networkError'));
    } finally {
      setPendingMemberAction(null);
    }
  }

  async function handleRemove() {
    if (!removingMember) return;
    setPendingMemberAction(removingMember.user_id);
    try {
      const res = await fetch(
        `/api/account/members/${removingMember.user_id}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || t('removeFailed'));
        return;
      }
      toast.success(t('removedToast', { name: removingMember.full_name || t('unnamed') }));
      setMembers((prev) =>
        prev.filter((m) => m.user_id !== removingMember.user_id),
      );
      setRemovingMember(null);
    } catch (err) {
      console.error('[MembersTab] remove error:', err);
      toast.error(t('networkError'));
    } finally {
      setPendingMemberAction(null);
    }
  }

  async function handleRevoke(invite: Invitation) {
    try {
      const res = await fetch(`/api/account/invitations/${invite.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || t('revokeFailed'));
        return;
      }
      toast.success(t('revokedToast'));
      setInvitations((prev) => prev.filter((i) => i.id !== invite.id));
    } catch (err) {
      console.error('[MembersTab] revoke error:', err);
      toast.error(t('networkError'));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
        action={
          <RequireRole min="admin">
            <Button onClick={() => setInviteOpen(true)}>
              <Plus className="size-4" />
              {t('inviteMember')}
            </Button>
          </RequireRole>
        }
      />

      {/* Live presence summary across the roster. Updates without a
          full refresh as heartbeats and the local re-derive tick land. */}
      {members.length > 0 &&
        (() => {
          const counts = summarize(members.map((m) => getPresence(m.user_id)));
          return (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <PresenceDot status="online" />
                {counts.online} {t('online')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <PresenceDot status="away" />
                {counts.away} {t('away')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <PresenceDot status="offline" />
                {counts.offline} {t('offline')}
              </span>
              <span className="text-muted-foreground/70">
                · {t('memberCount', { count: members.length })}
              </span>
            </div>
          );
        })()}

      {/* Roster */}
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {members.map((member) => {
              const roleMeta = ROLE_META[member.role];
              const RoleIcon = roleMeta.icon;
              const isSelf = member.user_id === user?.id;
              const isOwnerRow = member.role === 'owner';
              const isBusy = pendingMemberAction === member.user_id;
              const presence = getPresence(member.user_id);
              const presenceRow = getRow(member.user_id);
              const presenceText = presenceLabel(
                presence,
                presenceRow?.last_seen_at ?? null,
                now,
              );

              return (
                <li
                  key={member.user_id}
                  // Mobile: stack identity (avatar+name+email) above the
                  // role/remove actions so the role dropdown's fixed
                  // 128px width doesn't force the name into a 50-pixel
                  // truncation. Desktop (sm+): everything inline as
                  // before.
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Avatar className="size-9 shrink-0">
                            {member.avatar_url ? (
                              <AvatarImage
                                src={member.avatar_url}
                                alt={member.full_name || 'Member'}
                              />
                            ) : null}
                            <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                              {(member.full_name || member.email || 'U')
                                .charAt(0)
                                .toUpperCase()}
                            </AvatarFallback>
                            {/* role+label so screen readers announce
                                presence — the hover tooltip alone isn't
                                reachable by keyboard/AT on a non-focusable
                                avatar. */}
                            <AvatarBadge
                              role="img"
                              aria-label={presenceText}
                              className={PRESENCE_DOT_CLASS[presence]}
                            />
                          </Avatar>
                        }
                      />
                      <TooltipContent>{presenceText}</TooltipContent>
                    </Tooltip>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {member.full_name || t('unnamed')}
                        </span>
                        {isSelf && (
                          <Badge className="bg-muted text-muted-foreground border-border text-[10px] uppercase tracking-wide">
                            {t('you')}
                          </Badge>
                        )}
                      </div>
                      {member.email && (
                        <p className="truncate text-xs text-muted-foreground">
                          {member.email}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Joined date stays desktop-only. The mobile row's
                      vertical density makes the joined date noise. */}
                  <div className="hidden sm:block text-right text-xs text-muted-foreground">
                    {t('joined', { date: fmtDate(member.joined_at) })}
                  </div>

                  {/* Actions cluster. On mobile this is its own row
                      below the identity block; on desktop it sits
                      inline. Items align to the start on mobile so the
                      role dropdown lines up under the avatar. */}
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${roleMeta.className}`}
                    >
                      <RoleIcon className="size-3.5" />
                      {member.org_role_name || tRoles(member.role)}
                    </span>

                    {canManageMembers && !isOwnerRow && !isSelf && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(member)}
                          disabled={isBusy}
                          className="border-border"
                        >
                          <Pencil className="size-4" />
                          {t('edit')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRemovingMember(member)}
                          disabled={isBusy}
                          className="border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:border-red-500/60 hover:text-red-200"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Pending invitations — admin+ only */}
      <RequireRole min="admin">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <UsersRound className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">
              {t('pendingInvitations')}
            </h3>
            <Badge className="bg-muted text-muted-foreground border-border">
              {invitations.length}
            </Badge>
          </div>
          {/* P10 — make the no-resend design explicit. Admins were
              confused why the pending list shows roles + expiry but
              no "copy link again" button. Stating the constraint up
              front (rather than letting the user discover it by
              looking for a button) keeps it from feeling like a bug. */}
          {invitations.length > 0 ? (
            <p className="mb-3 text-xs text-muted-foreground">
              {t('inviteHint')}
            </p>
          ) : null}

          {invitations.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                <Mail className="size-6 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('noPendingTitle')}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.rich('noPendingDesc', { bold: (chunks) => <strong>{chunks}</strong> })}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {invitations.map((inv) => {
                    const inviteRoleMeta = ROLE_META[inv.role];
                    const InviteRoleIcon = inviteRoleMeta.icon;
                    return (
                    <li
                      key={inv.id}
                      className="flex items-center gap-4 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {inv.label || inv.email || t('untitledInvite')}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${inviteRoleMeta.className}`}
                          >
                            <InviteRoleIcon className="size-3" />
                            {inv.org_role_name || tRoles(inv.role)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {inv.email ? `${inv.email} · ` : ''}
                          {t('created', { date: fmtDate(inv.created_at) })} ·{' '}
                          {fmtExpiresIn(inv.expires_at, t)}
                        </p>
                      </div>

                      {/* Revoke: red default state, mirrors the
                          members-tab Remove button. Pre-polish version
                          read as a neutral secondary button until
                          hover. */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRevoke(inv)}
                        className="border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:border-red-500/60 hover:text-red-200"
                      >
                        <MailX className="size-4" />
                        {t('revoke')}
                      </Button>
                    </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </RequireRole>

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onCreated={loadEverything}
      />

      <Dialog
        open={editingMember !== null}
        onOpenChange={(open) => {
          if (!open) setEditingMember(null);
        }}
      >
        <DialogContent className="bg-popover border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              {t('editDialogTitle')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('editDialogDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('editName')}</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="bg-muted border-border"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('editEmail')}</Label>
              <Input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="bg-muted border-border"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('editRole')}</Label>
              <Select
                value={editOrgRoleId}
                onValueChange={(v) => v && setEditOrgRoleId(v)}
              >
                <SelectTrigger className="w-full bg-muted border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {orgRoles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMember(null)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={() => void handleSaveEdit()}
              disabled={!!pendingMemberAction}
            >
              {pendingMemberAction ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              {t('saveEdit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={removingMember !== null}
        onOpenChange={(open) => {
          if (!open) setRemovingMember(null);
        }}
      >
        <DialogContent className="bg-popover border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-popover-foreground">
              <AlertTriangle className="size-4 text-amber-400" />
              {t('removeDialogTitle')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t.rich('removeDialogDesc', { 
                name: removingMember?.full_name || t('unnamed'),
                bold: (chunks: React.ReactNode) => <strong>{chunks}</strong>
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setRemovingMember(null)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleRemove}
              disabled={!!pendingMemberAction}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {pendingMemberAction ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('removing')}
                </>
              ) : (
                t('removeBtn')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
