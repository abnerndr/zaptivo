# Inbox WhatsApp-like + realtime (design)

**Date:** 2026-07-22  
**Status:** approved (brainstorming)

## Goal

Melhorar o Inbox do CRM para vários funcionários: avatares (foto WAHA ou inicial), ticks de visualização (✓✓), e atualização em tempo real via TanStack React Query + SSE/webhook WAHA — mantendo o tema visual do CRM (não skin WhatsApp).

## Decisions

| Decisão | Escolha |
|---|---|
| Visual | A — tema CRM + avatares + ticks |
| Multi-agente | Inbox compartilhado em tempo real; sem atribuição nesta entrega |
| Arquitetura | React Query + SSE existente; sync WAHA só como fallback |
| UI | Evoluir a page atual; reaproveitar `StatusIcon` do bubble; sem migrar composer rico |

## Out of scope

- Skin verde / wallpaper WhatsApp
- Composer rico (mídia, IA, templates)
- Atribuição / presença de agente na conversa
- Reescrever lista/thread nos stubs de migração

## Architecture

```
WAHA (message, message.any, message.ack)
  → POST /api/whatsapp/webhook
  → Prisma (messages.status, contacts.avatarUrl)
  → Postgres NOTIFY
  → SSE /api/realtime/stream
  → React Query invalidateQueries(['inbox', ...])
  → Inbox UI

Fallback: POST /api/whatsapp/sync?light=1 (focus / SSE offline only)
```

## Backend

### Profile picture

- `GET /api/contacts/profile-picture?contactId=...&session=...` (WAHA)
- Novo helper em `src/lib/whatsapp/waha-api.ts`
- Persistir URL em `Contact.avatarUrl` no sync/inbound quando ausente (não refresh agressivo; WAHA cacheia ~24h)
- Falha → UI usa inicial; não quebra lista

### Read receipts

- Adicionar `message.ack` em `webhookConfig().events`
- Handler no webhook: mapear ack numérico WAHA → `sent` | `delivered` | `read` (e `failed` se erro)
- Update por `messageId` + `notifyAccount`
- Envio inicial continua `sent`

### Mark conversation read

- Endpoint novo (ex.: `POST /api/inbox/conversations/[id]/read`) zera `unreadCount`
- Chamado ao abrir a conversa na UI

## Frontend

### React Query

- Instalar `@tanstack/react-query`
- Provider no `DashboardShell` (client)
- Keys: `['inbox','conversations']`, `['inbox','messages', conversationId]`
- Mutations: send, sync, mark-read
- `useRealtime` → invalidate (não refetch manual ad-hoc)
- Remover polling 2s / 2.5s / 15s da page; fallback só se SSE desconectado

### UI (tema CRM)

- Lista: avatar + nome + preview + hora + badge numérico unread
- Header: avatar + nome + telefone
- Bolhas: tipar `status`; ticks em outbound (`sending` → `sent` → `delivered` → `read`)
- Avatar: shadcn `Avatar` / `AvatarImage` / `AvatarFallback` com inicial

## Error handling

- Foto WAHA falhou → inicial
- Ack sem mensagem no banco → log + ignore
- SSE down → sync light com backoff; sem toast contínuo

## Success criteria

1. Lista e header mostram foto ou inicial
2. Mensagens enviadas mostram ticks que avançam até azul quando lidas
3. Inbox atualiza sem refresh manual quando chega mensagem/ack (webhook + SSE)
4. Vários funcionários veem a mesma lista/thread atualizada
5. Abrir conversa zera unread dessa conversa
