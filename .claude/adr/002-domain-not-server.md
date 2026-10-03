# ADR-002 — Domínio em `src/domain`, não `src/server`

**Status:** Aceito  
**Data:** 2026-10-03  
**Contexto:** Ao consolidar regras de negócio, `src/server` quebrou o resolve de `next/server` no Turbopack.

---

## Decisão

Código de domínio (whatsapp, flows, ai, auth server, db, …) fica em `src/domain/**`, importado como `@/domain/...`.

Helpers só de cliente ficam em `src/lib/**`.

## Alternativas

1. `src/server` — conflito com o módulo `next/server`. Descartada.
2. Tudo em `src/lib` — mistura client/server e confunde vibecoding. Descartada.
3. `src/domain` — escolhida.

## Consequências

- Nunca renomear de volta para `src/server`
- Rotas em `src/app/api` importam domínio de `@/domain`
