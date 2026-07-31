import type { AccountRole } from '@/lib/auth/roles'

/** Stable permission keys used by API guards and the Roles UI. */
export const PERMISSION_KEYS = [
  'members.manage',
  'roles.manage',
  'settings.edit',
  'inbox.send',
  'contacts.write',
  'deals.write',
  'broadcasts.send',
  'automations.edit',
  'api.manage',
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]

export type PermissionDef = {
  key: PermissionKey
  label: string
  description: string
  groupKey: string
  sortOrder: number
}

export const PERMISSION_CATALOG: PermissionDef[] = [
  {
    key: 'members.manage',
    label: 'Gerenciar membros',
    description: 'Convidar, editar e remover membros da equipe',
    groupKey: 'equipe',
    sortOrder: 10,
  },
  {
    key: 'roles.manage',
    label: 'Gerenciar cargos',
    description: 'Criar e editar cargos e permissões',
    groupKey: 'equipe',
    sortOrder: 20,
  },
  {
    key: 'settings.edit',
    label: 'Editar configurações',
    description: 'WhatsApp, templates, campos, moeda e aparência da conta',
    groupKey: 'conta',
    sortOrder: 30,
  },
  {
    key: 'inbox.send',
    label: 'Enviar mensagens',
    description: 'Responder e enviar mensagens no Inbox',
    groupKey: 'operacao',
    sortOrder: 40,
  },
  {
    key: 'contacts.write',
    label: 'Editar contatos',
    description: 'Criar e editar contatos',
    groupKey: 'operacao',
    sortOrder: 50,
  },
  {
    key: 'deals.write',
    label: 'Editar negócios',
    description: 'Mover e editar deals no pipeline',
    groupKey: 'operacao',
    sortOrder: 60,
  },
  {
    key: 'broadcasts.send',
    label: 'Disparos em massa',
    description: 'Criar e enviar broadcasts',
    groupKey: 'operacao',
    sortOrder: 70,
  },
  {
    key: 'automations.edit',
    label: 'Automações e fluxos',
    description: 'Editar automações e fluxos',
    groupKey: 'operacao',
    sortOrder: 80,
  },
  {
    key: 'api.manage',
    label: 'Chaves de API',
    description: 'Criar e revogar API keys',
    groupKey: 'conta',
    sortOrder: 90,
  },
]

export const SYSTEM_ROLE_PERMISSIONS: Record<AccountRole, PermissionKey[]> = {
  owner: [...PERMISSION_KEYS],
  admin: [
    'members.manage',
    'roles.manage',
    'settings.edit',
    'inbox.send',
    'contacts.write',
    'deals.write',
    'broadcasts.send',
    'automations.edit',
    'api.manage',
  ],
  agent: [
    'inbox.send',
    'contacts.write',
    'deals.write',
    'broadcasts.send',
    'automations.edit',
  ],
  viewer: [],
}

export const SYSTEM_ROLE_META: Record<
  AccountRole,
  { name: string; description: string }
> = {
  owner: {
    name: 'Proprietário',
    description: 'Acesso total à organização',
  },
  admin: {
    name: 'Administrador',
    description: 'Gerencia equipe, cargos e configurações',
  },
  agent: {
    name: 'Agente',
    description: 'Opera inbox, contatos e negócios',
  },
  viewer: {
    name: 'Visualizador',
    description: 'Acesso somente leitura',
  },
}
