'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useRealtime } from '@/hooks/use-realtime'
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

type Conversation = {
  id: string
  last_message_text: string | null
  unread_count: number
  contact: {
    id: string
    name: string | null
    phone: string
  } | null
}

type Message = {
  id: string
  sender_type: string
  content_text: string | null
  content_type: string
  created_at: string
}

export default function InboxPage() {
  const { accountId } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [savingContact, setSavingContact] = useState(false)
  const [sending, setSending] = useState(false)

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selected) ?? null,
    [conversations, selected],
  )
  const selectedContact = selectedConversation?.contact ?? null
  const hasSavedName = Boolean(selectedContact?.name?.trim())

  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const conversationsReq = useRef(0)
  const messagesReq = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const loadConversations = useCallback(async () => {
    const reqId = ++conversationsReq.current
    const res = await fetch('/api/inbox/conversations', { cache: 'no-store' })
    if (reqId !== conversationsReq.current) return
    if (!res.ok) {
      setLoading(false)
      return
    }
    const data = (await res.json()) as { conversations: Conversation[] }
    if (reqId !== conversationsReq.current) return
    setConversations(data.conversations)
    setLoading(false)
    return data.conversations
  }, [])

  const loadMessages = useCallback(async (id: string) => {
    const reqId = ++messagesReq.current
    const res = await fetch(
      `/api/inbox/messages?conversationId=${encodeURIComponent(id)}`,
      { cache: 'no-store' },
    )
    if (reqId !== messagesReq.current) return
    if (!res.ok) return
    const data = (await res.json()) as { messages?: Message[] }
    if (reqId !== messagesReq.current) return
    if (selectedRef.current && selectedRef.current !== id) return
    const serverMessages = data.messages ?? []
    setMessages((prev) => {
      const map = new Map<string, Message>()
      // Keep anything we already show (protects against stale responses)
      for (const m of prev) {
        if (!m.id.startsWith('tmp-')) map.set(m.id, m)
      }
      for (const m of serverMessages) {
        map.set(m.id, m)
      }
      for (const m of prev) {
        if (!m.id.startsWith('tmp-')) continue
        const echoed = serverMessages.some(
          (s) =>
            s.sender_type === 'agent' &&
            s.content_text === m.content_text &&
            Math.abs(
              new Date(s.created_at).getTime() -
                new Date(m.created_at).getTime(),
            ) < 120_000,
        )
        if (!echoed) map.set(m.id, m)
      }
      return [...map.values()].sort((a, b) =>
        a.created_at.localeCompare(b.created_at),
      )
    })
  }, [])

  const refreshInbox = useCallback(() => {
    void loadConversations()
    const id = selectedRef.current
    if (id) void loadMessages(id)
  }, [loadConversations, loadMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const syncFromWaha = useCallback(async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/whatsapp/sync', { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        messages?: number
        chats?: number
        lidsUpgraded?: number
      }
      if (!res.ok) {
        toast.error(data.error ?? 'Falha ao sincronizar com o WhatsApp')
        return
      }
      toast.success(
        `Sincronizado: ${data.chats ?? 0} chats, ${data.messages ?? 0} msgs${
          data.lidsUpgraded
            ? `, ${data.lidsUpgraded} números resolvidos`
            : ''
        }`,
      )
      refreshInbox()
    } finally {
      setSyncing(false)
    }
  }, [refreshInbox])

  useEffect(() => {
    void (async () => {
      const list = await loadConversations()
      if (list && list.length === 0) {
        void syncFromWaha()
      }
    })()
  }, [loadConversations, syncFromWaha])

  useEffect(() => {
    if (selected) {
      setMessages([])
      void loadMessages(selected)
    } else {
      setMessages([])
    }
  }, [selected, loadMessages])

  // Realtime via SSE
  useRealtime(accountId, (payload) => {
    if (payload.table === 'messages' || payload.table === 'conversations') {
      refreshInbox()
    }
  })

  // Fallback polling — DB refresh (webhook may land via prod into same DB)
  useEffect(() => {
    if (!accountId) return
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return
      refreshInbox()
    }
    const id = setInterval(tick, 2000)
    const onFocus = () => refreshInbox()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [accountId, refreshInbox])

  // WAHA pull on open thread — localhost can't receive webhooks
  useEffect(() => {
    if (!accountId || !selected) return
    let busy = false
    let cancelled = false
    const pull = async () => {
      if (busy || cancelled) return
      if (typeof document !== 'undefined' && document.hidden) return
      busy = true
      const conversationId = selected
      try {
        const res = await fetch(
          `/api/whatsapp/sync?light=1&conversationId=${encodeURIComponent(conversationId)}`,
          { method: 'POST' },
        )
        if (!res.ok) return
        if (!cancelled && selectedRef.current === conversationId) {
          void loadMessages(conversationId)
          void loadConversations()
        }
      } catch {
        /* ignore */
      } finally {
        busy = false
      }
    }
    void pull()
    const id = setInterval(() => void pull(), 2500)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [accountId, selected, loadMessages, loadConversations])

  // Background: refresh recent chats list from WAHA (sidebar) every 15s
  useEffect(() => {
    if (!accountId) return
    let busy = false
    let cancelled = false
    const pull = async () => {
      if (busy || cancelled) return
      if (typeof document !== 'undefined' && document.hidden) return
      busy = true
      try {
        await fetch('/api/whatsapp/sync?light=1', { method: 'POST' })
        if (!cancelled) refreshInbox()
      } catch {
        /* ignore */
      } finally {
        busy = false
      }
    }
    const id = setInterval(() => void pull(), 15000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [accountId, refreshInbox])

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
      const res = await fetch(`/api/contacts/${selectedContact.id}`, {
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
      setConversations((prev) =>
        prev.map((c) =>
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

  const send = async () => {
    if (!selected || !text.trim() || sending) return
    const content = text.trim()
    const tempId = `tmp-${Date.now()}`
    const optimistic: Message = {
      id: tempId,
      sender_type: 'agent',
      content_text: content,
      content_type: 'text',
      created_at: new Date().toISOString(),
    }
    setText('')
    setMessages((prev) => [...prev, optimistic])
    setConversations((prev) =>
      prev.map((c) =>
        c.id === selected
          ? { ...c, last_message_text: content }
          : c,
      ),
    )
    setSending(true)
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: selected,
          message_type: 'text',
          content_text: content,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        messageId?: string
        contentText?: string | null
        contentType?: string
        createdAt?: string
      }
      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId))
        toast.error(data.error ?? 'Falha ao enviar')
        return
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? {
                id: data.messageId ?? tempId,
                sender_type: 'agent',
                content_text: data.contentText ?? content,
                content_type: data.contentType ?? 'text',
                created_at: data.createdAt ?? optimistic.created_at,
              }
            : m,
        ),
      )
      void loadConversations()
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando inbox…
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-sm font-medium text-foreground">Inbox</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={syncing}
          onClick={() => void syncFromWaha()}
        >
          {syncing ? (
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
                className={`block w-full border-b border-border px-3 py-3 text-left hover:bg-muted ${
                  selected === c.id ? 'bg-muted' : ''
                }`}
                onClick={() => setSelected(c.id)}
              >
                <div className="truncate font-medium text-foreground">
                  {title}
                </div>
                {showPhoneUnderName ? (
                  <div className="truncate text-xs tabular-nums text-muted-foreground">
                    {phoneLabel}
                  </div>
                ) : null}
                <div className="truncate text-xs text-muted-foreground">
                  {c.last_message_text || '—'}
                </div>
                {c.unread_count > 0 && (
                  <span className="text-xs text-primary">
                    {c.unread_count} novas
                  </span>
                )}
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
                      <time
                        dateTime={m.created_at}
                        className="px-1 text-[10px] tabular-nums text-muted-foreground"
                        title={new Date(m.created_at).toLocaleString('pt-BR')}
                      >
                        {formatMessageTime(m.created_at)}
                      </time>
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
                    if (e.key === 'Enter') void send()
                  }}
                />
                <Button onClick={() => void send()} disabled={sending}>
                  {sending ? (
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
