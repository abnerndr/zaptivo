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
  LogOut,
} from "lucide-react";

type ConfigState = {
  configured: boolean;
  provider?: "WUZAPI" | "EVOLUTION";
  waha_session?: string;
  status?: string;
  display_name?: string | null;
  webhook_url?: string;
  me?: { id?: string; pushName?: string } | null;
};

export function WhatsAppConfig() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ConfigState>({ configured: false });
  const [provider, setProvider] = useState<"WUZAPI" | "EVOLUTION">("WUZAPI");
  const [sessionName, setSessionName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await apiFetch("/api/whatsapp/config");
    if (!res.ok) return;
    const data = (await res.json()) as ConfigState;
    setConfig(data);
    if (data.provider) setProvider(data.provider);
    if (data.waha_session) setSessionName(data.waha_session);
    if (data.display_name) setDisplayName(data.display_name);
    if (data.status === "WORKING") setQrUrl(null);
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

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
      if (data.qr) {
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

  const save = async () => {
    setSaving(true);
    try {
      const body =
        provider === "WUZAPI"
          ? { provider: "WUZAPI", display_name: displayName || undefined }
          : {
              provider: "EVOLUTION",
              waha_session: sessionName,
              display_name: displayName || undefined,
            };
      const res = await apiFetch("/api/whatsapp/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Falha ao salvar");
        return;
      }
      toast.success(
        provider === "WUZAPI"
          ? "Instância WuzAPI criada/conectada"
          : "Sessão Evolution salva",
      );
      await refresh();
      const after = await apiFetch("/api/whatsapp/config");
      const cfg = (await after.json()) as ConfigState;
      if (cfg.status === "WORKING") {
        toast.message("Sessão já autenticada — sem QR necessário");
        setQrUrl(null);
      } else {
        await loadQr();
      }
    } finally {
      setSaving(false);
    }
  };

  const startStop = async (action: "start" | "stop" | "logout") => {
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
      logout: "Logout feito — inicie de novo para gerar QR",
    } as const;
    toast.success(labels[action]);
    setQrUrl(null);
    await refresh();
    if (action === "start") await loadQr();
  };

  const disconnect = async () => {
    await apiFetch("/api/whatsapp/config", { method: "DELETE" });
    setConfig({ configured: false });
    setQrUrl(null);
    toast.success("Desconectado");
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
          Conecte via WuzAPI (recomendado) ou Evolution. Uma sessão por conta do
          CRM. Controle de instâncias fica no seu WuzAPI.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="provider">Provedor</Label>
        <select
          id="provider"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          value={provider}
          onChange={(e) =>
            setProvider(e.target.value === "EVOLUTION" ? "EVOLUTION" : "WUZAPI")
          }
          disabled={config.configured}
        >
          <option value="WUZAPI">WuzAPI</option>
          <option value="EVOLUTION">Evolution (legado)</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="display">Nome da instância</Label>
        <Input
          id="display"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Loja principal"
        />
      </div>

      {provider === "EVOLUTION" && (
        <div className="space-y-2">
          <Label htmlFor="session">Nome da sessão Evolution</Label>
          <Input
            id="session"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            placeholder="default"
          />
        </div>
      )}

      {config.configured && (
        <div className="space-y-1 text-sm">
          <p>
            Provedor:{" "}
            <span className="font-medium">{config.provider ?? provider}</span>
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
          disabled={
            saving || (provider === "EVOLUTION" && !sessionName.trim())
          }
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {provider === "WUZAPI" ? "Criar instância WuzAPI" : "Salvar e iniciar"}
        </Button>
        <Button variant="outline" onClick={() => void startStop("start")}>
          <Power className="mr-1 h-4 w-4" /> Start
        </Button>
        <Button variant="outline" onClick={() => void startStop("stop")}>
          <PowerOff className="mr-1 h-4 w-4" /> Stop
        </Button>
        <Button
          variant="outline"
          onClick={() => void loadQr()}
          disabled={isWorking}
        >
          <QrCode className="mr-1 h-4 w-4" /> QR
        </Button>
        <Button variant="outline" onClick={() => void startStop("logout")}>
          <LogOut className="mr-1 h-4 w-4" /> Logout
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
