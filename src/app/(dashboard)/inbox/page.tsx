'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useRealtime } from '@/hooks/use-realtime'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type Conversation = {
  id: string
  last_message_text: string | null
  unread_count: number
  contact: { id: string; name: string | null; phone: string } | null
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

  const loadConversations = useCallback(async () => {
    const res = await fetch('/api/inbox/conversations')
    if (!res.ok) return
    const data = (await res.json()) as { conversations: Conversation[] }
    setConversations(data.conversations)
    setLoading(false)
  }, [])

  const loadMessages = useCallback(async (id: string) => {
    const res = await fetch(
      `/api/inbox/messages?conversationId=${encodeURIComponent(id)}`
    )
    if (!res.ok) return
    const data = (await res.json()) as { messages: Message[] }
    setMessages(data.messages)
  }, [])

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  useEffect(() => {
    if (selected) void loadMessages(selected)
  }, [selected, loadMessages])

  useRealtime(accountId, (payload) => {
    if (payload.table === 'messages' || payload.table === 'conversations') {
      void loadConversations()
      if (selected) void loadMessages(selected)
    }
  })

  const send = async () => {
    if (!selected || !text.trim()) return
    const res = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: selected,
        message_type: 'text',
        content_text: text,
      }),
    })
    if (!res.ok) {
      const data = (await res.json()) as { error?: string }
      toast.error(data.error ?? 'Falha ao enviar')
      return
    }
    setText('')
    void loadMessages(selected)
    void loadConversations()
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando inbox…
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <aside className="w-80 overflow-y-auto border-r border-border">
        {conversations.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`block w-full border-b border-border px-3 py-3 text-left hover:bg-muted ${
              selected === c.id ? 'bg-muted' : ''
            }`}
            onClick={() => setSelected(c.id)}
          >
            <div className="font-medium">
              {c.contact?.name || c.contact?.phone || 'Sem nome'}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {c.last_message_text || '—'}
            </div>
            {c.unread_count > 0 && (
              <span className="text-xs text-primary">{c.unread_count} novas</span>
            )}
          </button>
        ))}
        {conversations.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">
            Nenhuma conversa ainda.
          </p>
        )}
      </aside>
      <main className="flex flex-1 flex-col">
        {selected ? (
          <>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                    m.sender_type === 'agent'
                      ? 'ml-auto bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {m.content_text || `[${m.content_type}]`}
                </div>
              ))}
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
              <Button onClick={() => void send()}>Enviar</Button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            Selecione uma conversa
          </div>
        )}
      </main>
    </div>
  )
}
