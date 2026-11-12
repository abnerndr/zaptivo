"use client";
import { apiFetch } from '@/lib/api/client'

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SettingsPanelHead } from "./settings-panel-head";
import {
  InteractiveBuilder,
  blankButtonsPayload,
} from "@/components/interactive/interactive-builder";
import {
  interactivePayloadPreviewText,
  type InteractiveMessagePayload,
} from "@/domain/whatsapp/interactive";
import type { QuickReply, QuickReplyKind } from "@/types";
import { inboxMessageVariables } from '@/domain/inbox/message-variables';

interface DraftState {
  id?: string;
  title: string;
  kind: QuickReplyKind;
  content_text: string;
  interactive_payload: InteractiveMessagePayload;
}

function emptyDraft(): DraftState {
  return {
    title: "",
    kind: "text",
    content_text: "",
    interactive_payload: blankButtonsPayload(),
  };
}

export function QuickRepliesManager() {
  const [items, setItems] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saving, setSaving] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/quick-replies", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Falha ao carregar modelos');
      setItems((data.quick_replies as QuickReply[]) ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao carregar modelos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => setDraft(emptyDraft());
  const openEdit = (qr: QuickReply) =>
    setDraft({
      id: qr.id,
      title: qr.title,
      kind: qr.kind,
      content_text: qr.content_text ?? "",
      interactive_payload:
        qr.interactive_payload ?? blankButtonsPayload(),
    });

  const save = useCallback(async () => {
    if (!draft) return;
    if (!draft.title.trim()) {
      toast.error("Informe o nome do modelo.");
      return;
    }
    const payload =
      draft.kind === "interactive"
        ? { title: draft.title, kind: "interactive", interactive_payload: draft.interactive_payload }
        : { title: draft.title, kind: "text", content_text: draft.content_text };

    setSaving(true);
    try {
      const res = await apiFetch(
        draft.id ? `/api/quick-replies/${draft.id}` : "/api/quick-replies",
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Não foi possível salvar o modelo.");
        return;
      }
      toast.success(draft.id ? "Modelo atualizado." : "Modelo criado.");
      setDraft(null);
      await load();
    } catch {
      toast.error("Não foi possível salvar o modelo.");
    } finally {
      setSaving(false);
    }
  }, [draft, load]);

  const remove = useCallback(
    async (id: string) => {
      if (!window.confirm("Excluir este modelo?")) return;
      try {
        const res = await apiFetch(`/api/quick-replies/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
        await load();
      } catch {
        toast.error("Não foi possível excluir o modelo.");
      }
    },
    [load],
  );

  return (
    <div>
      <SettingsPanelHead
        title="Modelos da inbox"
        description="Crie e edite textos para reutilizar nas conversas. As variáveis são preenchidas com os dados de cada contato."
        action={
          <Button onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />
            Novo modelo
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          Nenhum modelo criado. Adicione um texto para reutilizar na inbox.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((qr) => (
            <li
              key={qr.id}
              className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
            >
              {qr.kind === "interactive" ? (
                <Zap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              ) : (
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{qr.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {qr.kind === "interactive" && qr.interactive_payload
                    ? interactivePayloadPreviewText(qr.interactive_payload)
                    : qr.content_text}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(qr)} aria-label={`Editar ${qr.title}`}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remove(qr.id)}
                  aria-label={`Excluir ${qr.title}`}
                  className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Editar modelo" : "Novo modelo"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="max-h-[70vh] space-y-3 overflow-y-auto">
              <div>
                <label htmlFor="reply-title" className="mb-1 block text-xs text-muted-foreground">Nome</label>
                <Input
                  id="reply-title"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Ex.: Mensagem de boas-vindas"
                  className="bg-muted text-foreground"
                />
              </div>
              <div className="flex gap-2">
                <KindTab
                  active={draft.kind === "text"}
                  label="Texto"
                  onClick={() => setDraft({ ...draft, kind: "text" })}
                />
                <KindTab
                  active={draft.kind === "interactive"}
                  label="Interativa"
                  onClick={() => setDraft({ ...draft, kind: "interactive" })}
                />
              </div>
              {draft.kind === "text" ? (<>
                <label htmlFor="reply-text" className="block text-xs text-muted-foreground">Mensagem</label>
                <Textarea
                  id="reply-text"
                  ref={textRef}
                  value={draft.content_text}
                  onChange={(e) => setDraft({ ...draft, content_text: e.target.value })}
                  placeholder="Olá {{first_name}}, como posso ajudar?"
                  className="min-h-28 bg-muted text-foreground"
                />
                <div className="flex flex-wrap gap-2">
                  {inboxMessageVariables.map(({ key, label }) => (
                    <button key={key} type="button" className="rounded border border-border px-2 py-1 text-xs hover:bg-muted" onClick={() => {
                      const input = textRef.current;
                      const start = input?.selectionStart ?? draft.content_text.length;
                      const end = input?.selectionEnd ?? start;
                      const token = `{{${key}}}`;
                      setDraft({ ...draft, content_text: draft.content_text.slice(0, start) + token + draft.content_text.slice(end) });
                      requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + token.length, start + token.length); });
                    }}>{label} {'{{'}{key}{'}}'}</button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">A inbox mostra a prévia e alerta se algum dado do contato estiver faltando.</p>
              </>
              ) : (
                <><p className="text-xs text-muted-foreground">Mensagens interativas não estão disponíveis na inbox atual.</p><InteractiveBuilder
                  value={draft.interactive_payload}
                  onChange={(p) => setDraft({ ...draft, interactive_payload: p })}
                /></>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KindTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "flex-1 rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
          : "flex-1 rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      }
    >
      {label}
    </button>
  );
}
