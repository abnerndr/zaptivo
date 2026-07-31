import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { prisma } from '@/lib/db/prisma'
import { PERMISSION_KEYS } from '@/lib/auth/permission-catalog'
import { canManageRoles } from '@/lib/auth/roles'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const account = await requireRole('admin')
    if (!canManageRoles(account.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await ctx.params
    const role = await prisma.orgRole.findFirst({
      where: { id, accountId: account.accountId },
    })
    if (!role) {
      return NextResponse.json({ error: 'Cargo não encontrado' }, { status: 404 })
    }

    const body = (await request.json().catch(() => ({}))) as {
      name?: string
      description?: string | null
      permissions?: string[]
    }

    // System owner/admin: name/description locked; permissions locked for owner
    if (role.isSystem && role.systemKey === 'owner') {
      return NextResponse.json(
        { error: 'O cargo Proprietário não pode ser editado' },
        { status: 400 },
      )
    }

    const data: { name?: string; description?: string | null } = {}
    if (!role.isSystem && body.name?.trim()) {
      data.name = body.name.trim()
    }
    if (!role.isSystem && body.description !== undefined) {
      data.description = body.description?.trim() || null
    }

    if (Object.keys(data).length > 0) {
      await prisma.orgRole.update({ where: { id }, data })
    }

    if (Array.isArray(body.permissions) && !role.isSystem) {
      const perms = body.permissions.filter((k) =>
        (PERMISSION_KEYS as readonly string[]).includes(k),
      )
      await prisma.$transaction([
        prisma.orgRolePermission.deleteMany({ where: { orgRoleId: id } }),
        prisma.orgRolePermission.createMany({
          data: perms.map((permissionKey) => ({
            orgRoleId: id,
            permissionKey,
          })),
        }),
      ])
    }

    // Allow tweaking permissions on system admin/agent/viewer? Plan says
    // Owner/Admin system permissions are fixed. Agent/viewer system can stay fixed too.
    if (Array.isArray(body.permissions) && role.isSystem) {
      return NextResponse.json(
        { error: 'Permissões de cargos do sistema são fixas' },
        { status: 400 },
      )
    }

    const updated = await prisma.orgRole.findUniqueOrThrow({
      where: { id },
      include: { permissions: true },
    })

    return NextResponse.json({
      role: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        is_system: updated.isSystem,
        system_key: updated.systemKey,
        permissions: updated.permissions.map((p) => p.permissionKey),
      },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const account = await requireRole('admin')
    if (!canManageRoles(account.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await ctx.params
    const role = await prisma.orgRole.findFirst({
      where: { id, accountId: account.accountId },
      include: { _count: { select: { profiles: true } } },
    })
    if (!role) {
      return NextResponse.json({ error: 'Cargo não encontrado' }, { status: 404 })
    }
    if (role.isSystem) {
      return NextResponse.json(
        { error: 'Cargos do sistema não podem ser excluídos' },
        { status: 400 },
      )
    }
    if (role._count.profiles > 0) {
      return NextResponse.json(
        { error: 'Reatribua os membros antes de excluir este cargo' },
        { status: 400 },
      )
    }

    await prisma.orgRole.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
