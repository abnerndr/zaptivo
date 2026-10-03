# ADR-005 — Harness Memory + ADR + session-log

**Status:** Aceito  
**Data:** 2026-10-03  
**Contexto:** Vibecoding e sessões longas revertiam decisões já fechadas (monorepo, Nest, Supabase).

---

## Decisão

Adotar harness de projeto:

| Camada | Path | Função |
|--------|------|--------|
| Memory | `.claude/memory/` | Fatos estáveis + anti-padrões |
| ADR | `.claude/adr/` | Decisões arquiteturais imutáveis sem substituto |
| Session log | `docs/session-log.md` | Log append-only de mudanças feitas por IA |
| Cursor rule | `.cursor/rules/zaptivo-harness.mdc` | Obriga ler/atualizar o harness |
| Guard | `.claude/hooks/protected-files/` | Bloqueia `rm`/`mv` destrutivo em memory/adr |

## Consequências

- Toda sessão relevante appenda em `docs/session-log.md`
- Mudança de arquitetura exige ADR novo ou atualização de status
- Arquivos do harness são protegidos contra delete acidental
