'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2, Plus, Search } from 'lucide-react'
import { useCan } from '@/hooks/use-can'

type ContactRow = {
  id: string
  name: string | null
  phone: string
  email: string | null
  company: string | null
  tags?: Array<{ id: string; name: string; color: string }>
}

export default function ContactsPage() {
  const canEdit = useCan('send-messages')
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: '25',
        ...(search ? { q: search } : {}),
      })
      const res = await fetch(`/api/contacts?${qs}`)
      if (!res.ok) throw new Error('Falha ao carregar')
      const data = (await res.json()) as {
        contacts: ContactRow[]
        totalCount: number
      }
      setContacts(data.contacts)
      setTotalCount(data.totalCount)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => {
    void load()
  }, [load])

  const create = async () => {
    if (!phone.trim()) {
      toast.error('Telefone obrigatório')
      return
    }
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, name: name || undefined }),
    })
    if (!res.ok) {
      toast.error('Falha ao criar')
      return
    }
    setPhone('')
    setName('')
    toast.success('Contato criado')
    void load()
  }

  const remove = async (id: string) => {
    const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error('Falha ao remover')
      return
    }
    toast.success('Removido')
    void load()
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Contatos</h1>
        <span className="text-sm text-muted-foreground">{totalCount} total</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar…"
            value={search}
            onChange={(e) => {
              setPage(0)
              setSearch(e.target.value)
            }}
          />
        </div>
      </div>

      {canEdit && (
        <div className="flex flex-wrap gap-2 rounded-lg border border-border p-3">
          <Input
            placeholder="Telefone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Input
            placeholder="Nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button onClick={() => void create()}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.name || '—'}</TableCell>
                <TableCell>{c.phone}</TableCell>
                <TableCell>{c.email || '—'}</TableCell>
                <TableCell className="text-right">
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void remove(c.id)}
                    >
                      Remover
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </Button>
        <Button
          variant="outline"
          disabled={(page + 1) * 25 >= totalCount}
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima
        </Button>
      </div>
    </div>
  )
}
