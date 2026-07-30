import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { prisma } from '@/lib/db/prisma'
import { ensureSystemOrgRoles } from '@/lib/auth/org-roles'
import { PERMISSION_KEYS } from '@/lib/auth/permission-catalog'
import { canManageRoles } from '@/lib/auth/roles'

export async function GET() {
  try {
    const ctx = await requireRole('admin')
    await ensureSystemOrgRoles(ctx.accountId)

    const [roles, permissions] = await Promise.all([
      prisma.orgRole.findMany({
        where: { accountId: ctx.accountId },
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
        include: {
          permissions: { select: { permissionKey: true } },
          _count: { select: { profiles: true } },
        },
      }),
      prisma.permission.findMany({ orderBy: { sortOrder: 'asc' } }),
    ])

    return NextResponse.json({
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        is_system: r.isSystem,
        system_key: r.systemKey,
        member_count: r._count.profiles,
        permissions: r.permissions.map((p) => p.permissionKey),
      })),
      permissions: permissions.map((p) => ({
        key: p.key,
        label: p.label,
        description: p.description,
        group_key: p.groupKey,
        sort_order: p.sortOrder,
      })),
      can_manage: canManageRoles(ctx.role),
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin')
    if (!canManageRoles(ctx.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = (await request.json().catch(() => ({}))) as {
      name?: string
      description?: string
      permissions?: string[]
    }

    const name = body.name?.trim()
    if (!name) {
      return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 })
    }

    await ensureSystemOrgRoles(ctx.accountId)

    const perms = (body.permissions ?? []).filter((k) =>
      (PERMISSION_KEYS as readonly string[]).includes(k),
    )

    const role = await prisma.orgRole.create({
      data: {
        accountId: ctx.accountId,
        name,
        description: body.description?.trim() || null,
        isSystem: false,
        systemKey: null,
        permissions: {
          create: perms.map((permissionKey) => ({ permissionKey })),
        },
      },
      include: { permissions: true },
    })

    return NextResponse.json({
      role: {
        id: role.id,
        name: role.name,
        description: role.description,
        is_system: role.isSystem,
        system_key: role.systemKey,
        permissions: role.permissions.map((p) => p.permissionKey),
      },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
