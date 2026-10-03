// ============================================================
// Account role helpers — pure, unit-testable, no I/O.
//
// Predicates prefer OrgRole permission sets when provided, and
// fall back to the legacy AccountRole enum mapping so existing
// call sites that pass only a role string keep working.
// ============================================================

import {
  SYSTEM_ROLE_PERMISSIONS,
  type PermissionKey,
} from '@/domain/auth/permission-catalog'

export type AccountRole = 'owner' | 'admin' | 'agent' | 'viewer'

/** Ordered list of every valid role, lowest privilege first. */
export const ACCOUNT_ROLES: readonly AccountRole[] = [
  'viewer',
  'agent',
  'admin',
  'owner',
] as const

/**
 * Numeric rank of a role. Higher = more privileged. Mirrors the
 * CASE expression in `is_account_member` so JS/SQL stay aligned.
 */
export function roleRank(role: AccountRole): number {
  switch (role) {
    case 'owner':
      return 4
    case 'admin':
      return 3
    case 'agent':
      return 2
    case 'viewer':
      return 1
  }
}

/**
 * True iff `role` is at least as privileged as `min`. Use this
 * for any "user has at least admin" / "at least agent" checks.
 */
export function hasMinRole(role: AccountRole, min: AccountRole): boolean {
  return roleRank(role) >= roleRank(min)
}

/** Type-narrow an unknown string into a valid `AccountRole`. */
export function isAccountRole(value: unknown): value is AccountRole {
  return (
    typeof value === 'string' &&
    (ACCOUNT_ROLES as readonly string[]).includes(value)
  )
}

export type RoleCapabilityContext = {
  accountRole: AccountRole
  /** Permission keys from the member's OrgRole (if loaded). */
  permissions?: ReadonlySet<string> | readonly string[] | null
}

function hasPermission(
  ctx: RoleCapabilityContext | AccountRole,
  key: PermissionKey,
): boolean {
  if (typeof ctx === 'string') {
    if (ctx === 'owner') return true
    return SYSTEM_ROLE_PERMISSIONS[ctx].includes(key)
  }
  if (ctx.accountRole === 'owner') return true
  const set =
    ctx.permissions instanceof Set
      ? ctx.permissions
      : new Set(ctx.permissions ?? [])
  if (set.size > 0) return set.has(key)
  return SYSTEM_ROLE_PERMISSIONS[ctx.accountRole].includes(key)
}

/** Owner / admin (or members.manage): invite, remove, change roles. */
export function canManageMembers(
  roleOrCtx: AccountRole | RoleCapabilityContext,
): boolean {
  return hasPermission(roleOrCtx, 'members.manage')
}

/**
 * Owner / admin (or settings.edit): edit account-wide settings.
 */
export function canEditSettings(
  roleOrCtx: AccountRole | RoleCapabilityContext,
): boolean {
  return hasPermission(roleOrCtx, 'settings.edit')
}

/** Owner / admin (or roles.manage): create/edit custom OrgRoles. */
export function canManageRoles(
  roleOrCtx: AccountRole | RoleCapabilityContext,
): boolean {
  return hasPermission(roleOrCtx, 'roles.manage')
}

/**
 * Owner / admin / agent (or inbox.send): write operational data.
 */
export function canSendMessages(
  roleOrCtx: AccountRole | RoleCapabilityContext,
): boolean {
  return hasPermission(roleOrCtx, 'inbox.send')
}

/**
 * Viewer: read-only across everything.
 */
export function canViewOnly(role: AccountRole): boolean {
  return role === 'viewer'
}

/** Owner only: irreversible destructive operations. */
export function canDeleteAccount(role: AccountRole): boolean {
  return role === 'owner'
}

/** Owner only: hand the account to another member. */
export function canTransferOwnership(role: AccountRole): boolean {
  return role === 'owner'
}
