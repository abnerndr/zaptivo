# ADR-001 — App único Next.js (aposentar Nest/monorepo)

**Status:** Aceito  
**Data:** 2026-10-03  
**Contexto:** Manutenção dolorosa do monorepo Turborepo (Next + Nest) no MVP Zaptivo.

---

## Decisão

Unificar o CRM em um único app Next.js na raiz. Aposentar NestJS, Turborepo e packages de app. Toda HTTP (UI BFF, webhooks WAHA, `/api/v1`) vive em Route Handlers.

## Alternativas

1. **Manter monorepo com web fino + Nest** — ainda 2 deploys/envs; vibecoding continua dividido. Descartada.
2. **Dois repositórios** — piora sync de schema/tipos. Descartada.
3. **App Next único** — escolhida.

## Consequências

- DX e vibecoding mais simples; 1 serviço Dokploy
- Worker/queue só quando houver necessidade real de escala
- Proibido recriar `apps/api` sem ADR que substitua este
