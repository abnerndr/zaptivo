import { prisma } from '@/domain/db/prisma'
import type { AccountRole } from '@/domain/auth/roles'
import {
  PERMISSION_CATALOG,
  SYSTEM_ROLE_META,
  SYSTEM_ROLE_PERMISSIONS,
  type PermissionKey,
} from '@/domain/auth/permission-catalog'

/** Ensure global permission rows exist (idempotent). */
export async function ensurePermissionCatalog(): Promise<void> {
  for (const p of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { key: p.key },
      create: {
        key: p.key,
        label: p.label,
        description: p.description,
        groupKey: p.groupKey,
        sortOrder: p.sortOrder,
      },
      update: {
        label: p.label,
        description: p.description,
        groupKey: p.groupKey,
        sortOrder: p.sortOrder,
      },
    })
  }
}

/**
 * Seed system OrgRoles for a tenant and link existing profiles by accountRole.
 */
export async function ensureSystemOrgRoles(accountId: string): Promise<void> {
  await ensurePermissionCatalog()

  const keys: AccountRole[] = ['owner', 'admin', 'agent', 'viewer']
  for (const systemKey of keys) {
    const meta = SYSTEM_ROLE_META[systemKey]
    const perms = SYSTEM_ROLE_PERMISSIONS[systemKey]

    let role = await prisma.orgRole.findFirst({
      where: { accountId, systemKey },
    })

    if (!role) {
      role = await prisma.orgRole.create({
        data: {
          accountId,
          name: meta.name,
          description: meta.description,
          isSystem: true,
          systemKey,
        },
      })
    } else {
      role = await prisma.orgRole.update({
        where: { id: role.id },
        data: {
          name: meta.name,
          description: meta.description,
          isSystem: true,
        },
      })
    }

    await prisma.orgRolePermission.deleteMany({ where: { orgRoleId: role.id } })
    if (perms.length > 0) {
      await prisma.orgRolePermission.createMany({
        data: perms.map((permissionKey) => ({
          orgRoleId: role!.id,
          permissionKey,
        })),
        skipDuplicates: true,
      })
    }

    await prisma.profile.updateMany({
      where: {
        accountId,
        accountRole: systemKey,
        OR: [{ orgRoleId: null }, { orgRoleId: { not: role.id } }],
      },
      data: { orgRoleId: role.id },
    })
  }
}

export async function getOrgRolePermissions(
  orgRoleId: string | null | undefined,
): Promise<Set<PermissionKey>> {
  if (!orgRoleId) return new Set()
  const rows = await prisma.orgRolePermission.findMany({
    where: { orgRoleId },
    select: { permissionKey: true },
  })
  return new Set(rows.map((r) => r.permissionKey as PermissionKey))
}

export async function profileHasPermission(args: {
  accountRole: AccountRole
  orgRoleId?: string | null
  permission: PermissionKey
}): Promise<boolean> {
  if (args.accountRole === 'owner') return true
  if (args.orgRoleId) {
    const perms = await getOrgRolePermissions(args.orgRoleId)
    if (perms.has(args.permission)) return true
  }
  // Fallback to legacy enum mapping while migrating
  return SYSTEM_ROLE_PERMISSIONS[args.accountRole].includes(args.permission)
}
