'use client'
import { apiFetch } from '@/lib/api/client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/use-auth'
import {
  useConversations,
  useInboxRealtime,
  useMessages,
} from '@/hooks/inbox/use-inbox-queries'
import {
  useMarkConversationRead,
  useSendMessage,
  useSyncWhatsapp,
} from '@/hooks/inbox/use-inbox-mutations'
import { inboxKeys, type InboxContact } from '@/hooks/inbox/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { StatusIcon } from '@/components/inbox/status-icon'
import {
  contactDisplayName,
  formatWhatsAppPhone,
  isLikelyLid,
} from '@/lib/whatsapp/format-phone'
import { Loader2, RefreshCw, UserPlus, UserRoundPen } from 'lucide-react'
import { toast } from 'sonner'

function formatMessageTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()

  const time = d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
  if (sameDay) return time
  if (isYesterday) return `ontem ${time}`
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatListTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  })
}

function contactInitial(contact: InboxContact | null | undefined): string {
  const name = contact?.name?.trim()
  if (name) return name.charAt(0).toUpperCase()
  const phone = contact?.phone?.replace(/\D/g, '') ?? ''
  if (phone) return phone.slice(-1)
  return '?'
}

function ContactAvatar({
  contact,
  size = 'default',
}: {
  contact: InboxContact | null | undefined
  size?: 'default' | 'sm' | 'lg'
}) {
  return (
    <Avatar size={size} className="shrink-0">
      {contact?.avatar_url ? (
        <AvatarImage src={contact.avatar_url} alt="" />
      ) : null}
      <AvatarFallback className="bg-primary/10 font-semibold text-primary">
        {contactInitial(contact)}
      </AvatarFallback>
    </Avatar>
  )
}

export default function InboxPage() {
  const { accountId } = useAuth()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<string | null>(null)
  const [text, setText] = useState('')

  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [savingContact, setSavingContact] = useState(false)

  const {
    data: conversations = [],
    isLoading: loadingConversations,
    isFetching: fetchingConversations,
  } = useConversations(Boolean(accountId))

  const { data: messages = [], isLoading: loadingMessages } = useMessages(selected)

  const syncMutation = useSyncWhatsapp()
  const sendMutation = useSendMessage()
  const markReadMutation = useMarkConversationRead()

  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const emptySyncedRef = useRef(false)

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selected) ?? null,
    [conversations, selected],
  )
  const selectedContact = selectedConversation?.contact ?? null
  const hasSavedName = Boolean(selectedContact?.name?.trim())

  const sseConnected = useInboxRealtime(accountId)
  const syncMutate = syncMutation.mutate
  const syncBusyRef = useRef(false)
  const sseConnectedRef = useRef(sseConnected)
  sseConnectedRef.current = sseConnected

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto full-sync once if inbox empty
  useEffect(() => {
    if (loadingConversations || emptySyncedRef.current) return
    if (conversations.length === 0) {
      emptySyncedRef.current = true
      syncMutate(undefined)
    }
  }, [loadingConversations, conversations.length, syncMutate])

  // Mark read when selecting a conversation
  useEffect(() => {
    if (!selected) return
    const conv = conversations.find((c) => c.id === selected)
    if (conv && conv.unread_count > 0) {
      markReadMutation.mutate(selected)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on select change
  }, [selected])

  // Soft fallback: only on tab focus, and only if SSE is down. Never poll in a loop.
  useEffect(() => {
    if (!accountId) return

    const onFocus = () => {
      if (typeof document !== 'undefined' && document.hidden) return
      void queryClient.invalidateQueries({ queryKey: inboxKeys.all })
      if (sseConnectedRef.current || syncBusyRef.current) return
      syncBusyRef.current = true
      syncMutate(
        selectedRef.current
          ? { light: true, conversationId: selectedRef.current }
          : { light: true },
        {
          onSettled: () => {
            syncBusyRef.current = false
          },
        },
      )
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [accountId, queryClient, syncMutate])

  function openSaveContact() {
    if (!selectedContact) return
    setSaveName(selectedContact.name?.trim() || '')
    setSaveOpen(true)
  }

  async function saveContact() {
    if (!selectedContact) return
    const name = saveName.trim()
    if (!name) {
      toast.error('Informe um nome para o contato')
      return
    }
    setSavingContact(true)
    try {
      const res = await apiFetch(`/api/contacts/${selectedContact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        name?: string | null
      }
      if (!res.ok) {
        toast.error(data.error ?? 'Falha ao salvar contato')
        return
      }
      queryClient.setQueryData(
        inboxKeys.conversations(),
        (prev: typeof conversations | undefined) =>
          prev?.map((c) =>
            c.contact?.id === selectedContact.id
              ? {
                  ...c,
                  contact: c.contact
                    ? { ...c.contact, name: data.name ?? name }
                    : c.contact,
                }
              : c,
          ),
      )
      toast.success(
        hasSavedName ? 'Contato atualizado' : 'Contato salvo na agenda',
      )
      setSaveOpen(false)
    } finally {
      setSavingContact(false)
    }
  }

  const send = () => {
    if (!selected || !text.trim() || sendMutation.isPending) return
    const content = text.trim()
    const tempId = `tmp-${Date.now()}`
    setText('')
    sendMutation.mutate({
      conversationId: selected,
      content,
      tempId,
    })
  }

  const selectConversation = (id: string) => {
    setSelected(id)
  }

  if (loadingConversations && conversations.length === 0) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando inbox…
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-sm font-medium text-foreground">
          Inbox
          {fetchingConversations ? (
            <Loader2 className="ml-2 inline size-3 animate-spin text-muted-foreground" />
          ) : null}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={syncMutation.isPending}
          onClick={() => syncMutation.mutate(undefined)}
        >
          {syncMutation.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 size-4" />
          )}
          Sincronizar WhatsApp
        </Button>
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="w-80 overflow-y-auto border-r border-border">
          {conversations.map((c) => {
            const title = contactDisplayName(c.contact)
            const phoneLabel = formatWhatsAppPhone(c.contact?.phone)
            const showPhoneUnderName =
              Boolean(c.contact?.name?.trim()) &&
              phoneLabel !== '—' &&
              phoneLabel !== title

            return (
              <button
                key={c.id}
                type="button"
                className={`flex w-full gap-3 border-b border-border px-3 py-3 text-left hover:bg-muted ${
                  selected === c.id ? 'bg-muted' : ''
                }`}
                onClick={() => selectConversation(c.id)}
              >
                <ContactAvatar contact={c.contact} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium text-foreground">
                      {title}
                    </span>
                    <span
                      className={`shrink-0 text-[10px] tabular-nums ${
                        c.unread_count > 0
                          ? 'font-medium text-primary'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {formatListTime(c.last_message_at ?? null)}
                    </span>
                  </div>
                  {showPhoneUnderName ? (
                    <div className="truncate text-xs tabular-nums text-muted-foreground">
                      {phoneLabel}
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-xs text-muted-foreground">
                      {c.last_message_text || '—'}
                    </div>
                    {c.unread_count > 0 ? (
                      <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                        {c.unread_count > 99 ? '99+' : c.unread_count}
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            )
          })}
          {conversations.length === 0 && (
            <div className="space-y-2 p-4 text-sm text-muted-foreground">
              <p>Nenhuma conversa ainda.</p>
              <p className="text-xs">
                Envie uma mensagem para o número conectado e clique em
                Sincronizar, ou configure um webhook público (não use
                localhost).
              </p>
            </div>
          )}
        </aside>
        <main className="flex flex-1 flex-col">
          {selected && selectedContact ? (
            <>
              <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <ContactAvatar contact={selectedContact} size="lg" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {contactDisplayName(selectedContact)}
                    </p>
                    <p className="truncate text-xs tabular-nums text-muted-foreground">
                      {formatWhatsAppPhone(selectedContact.phone)}
                      {isLikelyLid(selectedContact.phone) ? (
                        <span className="ml-1 text-amber-600 dark:text-amber-400">
                          (ainda sem telefone — clique em Sincronizar)
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={openSaveContact}
                >
                  {hasSavedName ? (
                    <>
                      <UserRoundPen className="mr-2 size-4" />
                      Renomear
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 size-4" />
                      Salvar contato
                    </>
                  )}
                </Button>
              </header>
              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                {loadingMessages && messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Carregando mensagens…
                  </div>
                ) : null}
                {!loadingMessages && messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Nenhuma mensagem nesta conversa.
                  </div>
                ) : null}
                {messages.map((m) => {
                  const outgoing =
                    m.sender_type === 'agent' || m.sender_type === 'bot'
                  return (
                    <div
                      key={m.id}
                      className={`flex max-w-[75%] flex-col gap-0.5 ${
                        outgoing ? 'ml-auto items-end' : 'mr-auto items-start'
                      }`}
                    >
                      <div
                        className={`rounded-lg px-3 py-2 text-sm ${
                          outgoing
                            ? 'bg-primary text-primary-foreground'
                            : 'border border-border bg-card text-card-foreground'
                        }`}
                      >
                        {m.content_text || `[${m.content_type}]`}
                      </div>
                      <div className="flex items-center gap-1 px-1">
                        <time
                          dateTime={m.created_at}
                          className="text-[10px] tabular-nums text-muted-foreground"
                          title={new Date(m.created_at).toLocaleString(
                            'pt-BR',
                          )}
                        >
                          {formatMessageTime(m.created_at)}
                        </time>
                        {outgoing ? <StatusIcon status={m.status} /> : null}
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>
              <div className="flex gap-2 border-t border-border p-3">
                <Input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Mensagem…"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') send()
                  }}
                />
                <Button
                  onClick={send}
                  disabled={sendMutation.isPending}
                >
                  {sendMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    'Enviar'
                  )}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              Selecione uma conversa
            </div>
          )}
        </main>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {hasSavedName ? 'Renomear contato' : 'Salvar contato'}
            </DialogTitle>
            <DialogDescription>
              O número fica vinculado a esta conversa. Escolha um nome para
              aparecer na Inbox e em Contatos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="inbox-contact-phone">WhatsApp</Label>
              <Input
                id="inbox-contact-phone"
                value={formatWhatsAppPhone(selectedContact?.phone)}
                readOnly
                className="tabular-nums bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inbox-contact-name">Nome</Label>
              <Input
                id="inbox-contact-name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Ex.: Maria — suporte"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveContact()
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSaveOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={savingContact || !saveName.trim()}
              onClick={() => void saveContact()}
            >
              {savingContact ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Salvando…
                </>
              ) : hasSavedName ? (
                'Salvar nome'
              ) : (
                'Adicionar aos contatos'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
