"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, QrCode, Power, PowerOff, Copy } from "lucide-react";

type ConfigState = {
  configured: boolean;
  waha_session?: string;
  status?: string;
  display_name?: string | null;
  webhook_url?: string;
};

export function WhatsAppConfig() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ConfigState>({ configured: false });
  const [sessionName, setSessionName] = useState("");
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/whatsapp/config");
    if (!res.ok) return;
    const data = (await res.json()) as ConfigState;
    setConfig(data);
    if (data.waha_session) setSessionName(data.waha_session);
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  const loadQr = async () => {
    const res = await fetch("/api/whatsapp/session");
    if (!res.ok) {
      toast.error("Não foi possível obter o QR");
      return;
    }
    const blob = await res.blob();
    setQrUrl(URL.createObjectURL(blob));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/whatsapp/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waha_session: sessionName }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Falha ao salvar");
        return;
      }
      toast.success("Sessão WAHA salva");
      await refresh();
      await loadQr();
    } finally {
      setSaving(false);
    }
  };

  const startStop = async (action: "start" | "stop") => {
    const res = await fetch("/api/whatsapp/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      toast.error("Falha na ação da sessão");
      return;
    }
    toast.success(action === "start" ? "Sessão iniciando…" : "Sessão parada");
    await refresh();
    if (action === "start") await loadQr();
  };

  const disconnect = async () => {
    await fetch("/api/whatsapp/config", { method: "DELETE" });
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

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">WhatsApp (WAHA)</h2>
        <p className="text-sm text-muted-foreground">
          Conecte via WAHA (não oficial). Risco de banimento — use por sua conta.
          Uma sessão por conta do CRM.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="session">Nome da sessão WAHA</Label>
        <Input
          id="session"
          value={sessionName}
          onChange={(e) => setSessionName(e.target.value)}
          placeholder="default"
        />
      </div>

      {config.configured && (
        <p className="text-sm">
          Status:{" "}
          <span className="font-medium">{config.status ?? "—"}</span>
        </p>
      )}

      {config.webhook_url && (
        <div className="space-y-1">
          <Label>Webhook URL (configure no WAHA)</Label>
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
        <Button onClick={() => void save()} disabled={saving || !sessionName}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Salvar e iniciar
        </Button>
        <Button variant="outline" onClick={() => void startStop("start")}>
          <Power className="mr-1 h-4 w-4" /> Start
        </Button>
        <Button variant="outline" onClick={() => void startStop("stop")}>
          <PowerOff className="mr-1 h-4 w-4" /> Stop
        </Button>
        <Button variant="outline" onClick={() => void loadQr()}>
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
          <img src={qrUrl} alt="QR Code WAHA" className="mx-auto max-w-xs" />
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Escaneie com o WhatsApp do número desta sessão
          </p>
        </div>
      )}
    </div>
  );
}
