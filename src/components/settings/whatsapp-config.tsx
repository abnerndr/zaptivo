"use client";
import { apiFetch } from '@/lib/api/client'

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  QrCode,
  Power,
  PowerOff,
  Copy,
} from "lucide-react";

type RemoteInstance = {
  id: string;
  name: string;
  connected?: boolean;
  logged_in?: boolean;
  jid?: string;
};

type ConfigState = {
  configured: boolean;
  provider?: "WUZAPI";
  migration_required?: boolean;
  status?: string;
  display_name?: string | null;
  webhook_url?: string;
  me?: { id?: string; pushName?: string } | null;
  instances?: RemoteInstance[];
  admin_error?: string;
};

export function WhatsAppConfig() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ConfigState>({ configured: false });
  const [displayName, setDisplayName] = useState("");
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await apiFetch("/api/whatsapp/config");
    if (!res.ok) return;
    const data = (await res.json()) as ConfigState;
    setConfig(data);
    if (data.display_name) setDisplayName(data.display_name);
    if (data.status === "WORKING") setQrUrl(null);
    return data;
  }, []);

  useEffect(() => {
    void Promise.resolve().then(refresh).catch(() => toast.error("Não foi possível carregar a configuração do WhatsApp")).finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (!qrUrl || !config.configured) return;
    const timer = window.setInterval(() => void refresh().catch(() => {}), 5000);
    return () => window.clearInterval(timer);
  }, [config.configured, qrUrl, refresh]);

  useEffect(() => {
    return () => {
      if (qrUrl?.startsWith("blob:")) URL.revokeObjectURL(qrUrl);
    };
  }, [qrUrl]);

  const loadQr = async () => {
    const res = await apiFetch("/api/whatsapp/session");
    const ct = res.headers.get("content-type") ?? "";

    if (!res.ok) {
      let message = "Não foi possível obter o QR";
      if (ct.includes("application/json")) {
        const data = (await res.json()) as { error?: string; status?: string };
        message = data.error ?? message;
        if (data.status) await refresh();
      }
      toast.error(message);
      return;
    }

    if (ct.includes("application/json")) {
      const data = (await res.json()) as { qr?: string };
      if (data.qr?.startsWith("data:image")) {
        setQrUrl((prev) => {
          if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
          return data.qr!;
        });
        toast.success("QR atualizado — escaneie no WhatsApp");
        await refresh();
        return;
      }
      toast.error("Resposta inesperada ao buscar QR");
      return;
    }

    if (!ct.includes("image")) {
      toast.error("Resposta inesperada ao buscar QR");
      return;
    }

    const blob = await res.blob();
    setQrUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(blob);
    });
    toast.success("QR atualizado — escaneie no WhatsApp");
    await refresh();
  };

  const save = async (instanceId?: string) => {
    setSaving(true);
    try {
      const body = {
        provider: "WUZAPI",
        display_name: displayName || undefined,
        ...(instanceId ? { instance_id: instanceId } : {}),
      };
      const res = await apiFetch("/api/whatsapp/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Falha ao salvar");
        await refresh();
        return;
      }
      toast.success(instanceId ? "Instância WuzAPI vinculada" : "Instância WuzAPI criada/conectada");
      const cfg = await refresh();
      if (cfg?.status === "WORKING") {
        toast.message("Sessão já autenticada — sem QR necessário");
        setQrUrl(null);
      } else {
        await loadQr();
      }
    } catch {
      toast.error("Não foi possível conectar à WuzAPI");
    } finally {
      setSaving(false);
    }
  };

  const startStop = async (action: "start" | "stop") => {
    const res = await apiFetch("/api/whatsapp/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(data.error ?? "Falha na ação da sessão");
      return;
    }
    const labels = {
      start: "Sessão iniciando…",
      stop: "Sessão parada",
    } as const;
    toast.success(labels[action]);
    setQrUrl(null);
    await refresh();
    if (action === "start") await loadQr();
  };

  const disconnect = async () => {
    const res = await apiFetch("/api/whatsapp/config", { method: "DELETE" });
    if (!res.ok) {
      toast.error("Não foi possível desconectar");
      return;
    }
    setQrUrl(null);
    await refresh();
    toast.success("Vínculo removido. A instância continua na WuzAPI.");
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  const isWorking = config.status === "WORKING";

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">WhatsApp</h2>
        <p className="text-sm text-muted-foreground">
          Conecte seu WhatsApp pela WuzAPI. Uma sessão por conta do CRM.
        </p>
      </div>

      {config.admin_error && (
        <p className="text-sm text-destructive">
          Não foi possível listar as instâncias da WuzAPI: {config.admin_error}
        </p>
      )}

      {!config.configured && (config.instances?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <Label>Instâncias já existentes</Label>
          <ul className="space-y-2">
            {config.instances!.map((instance) => {
              const phone = instance.jid?.split("@")[0];
              const state = instance.logged_in
                ? "autenticada"
                : instance.connected
                  ? "conectada, aguardando QR"
                  : "parada";
              return (
                <li
                  key={instance.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">{instance.name || instance.id}</p>
                    <p className="text-muted-foreground">
                      {state}
                      {phone ? ` · ${phone}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={() => void save(instance.id)}
                  >
                    Vincular
                  </Button>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            Vincular uma instância autenticada mantém o webhook que ela já usa.
          </p>
        </div>
      )}

      {config.migration_required && (
        <p className="text-sm text-amber-600">
          Esta conta precisa ser vinculada novamente. Desconecte a sessão anterior no provedor antigo antes de conectar o mesmo número na WuzAPI. O histórico do CRM será preservado.
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="display">Nome da instância</Label>
        <Input
          id="display"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Loja principal"
        />
      </div>

      {config.configured && (
        <div className="space-y-1 text-sm">
          <p>
            Provedor:{" "}
            <span className="font-medium">WuzAPI</span>
          </p>
          <p>
            Status:{" "}
            <span className="font-medium">{config.status ?? "—"}</span>
          </p>
          {isWorking && (
            <p className="text-emerald-600 dark:text-emerald-400">
              Conectado
              {config.me?.pushName || config.display_name
                ? ` como ${config.me?.pushName ?? config.display_name}`
                : ""}
              {config.me?.id ? ` (${config.me.id})` : ""}.
            </p>
          )}
        </div>
      )}

      {config.webhook_url && (
        <div className="space-y-1">
          <Label>Webhook URL</Label>
          <div className="flex gap-2">
            <Input readOnly value={config.webhook_url} />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => {
                void navigator.clipboard.writeText(config.webhook_url!);
                toast.success("Copiado");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => void save()}
          disabled={saving}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {config.configured ? "Salvar e conectar" : "Criar nova instância"}
        </Button>
        <Button variant="outline" disabled={!config.configured} onClick={() => void startStop("start")}>
          <Power className="mr-1 h-4 w-4" /> Start
        </Button>
        <Button variant="outline" disabled={!config.configured} onClick={() => void startStop("stop")}>
          <PowerOff className="mr-1 h-4 w-4" /> Stop
        </Button>
        <Button
          variant="outline"
          onClick={() => void loadQr()}
          disabled={!config.configured || isWorking}
        >
          <QrCode className="mr-1 h-4 w-4" /> QR
        </Button>
        {config.configured && (
          <Button variant="destructive" onClick={() => void disconnect()}>
            Desconectar
          </Button>
        )}
      </div>

      {qrUrl && (
        <div className="rounded-lg border border-border p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt="QR Code WhatsApp" className="mx-auto max-w-xs" />
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Escaneie com o WhatsApp do número desta sessão
          </p>
        </div>
      )}
    </div>
  );
}
