# ADR-004 — Deploy Dokploy single-service

**Status:** Aceito  
**Data:** 2026-10-03  

---

## Decisão

Um `Dockerfile` na raiz, um serviço Dokploy, um domínio. Webhooks WAHA e crons apontam para o mesmo host. Sem serviço Nest separado.

## Consequências

- Docs em `docs/dokploy.md`
- Envs Nest (`API_INTERNAL_URL`, `WEB_ORIGIN`, cookie cross-subdomain) não voltam
