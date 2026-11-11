# ADR-008 — WuzAPI como único transporte de WhatsApp

**Status:** Aceito  
**Data:** 2026-11-06  
**Substitui parcialmente:** ADR-007, quanto à manutenção da Evolution e ao rollback por provedor.

## Contexto

O usuário solicitou a remoção dos transportes anteriores e o vínculo de WhatsApp pela WuzAPI no espaço de trabalho. Os dados de contatos, conversas e mensagens pertencem ao CRM e devem ser preservados.

## Decisão

- Usar WuzAPI para novos vínculos, operações e webhooks. Recusar novos vínculos com outros provedores.
- Contas com configuração anterior devem desvincular a sessão anterior fora do CRM e criar uma sessão WuzAPI; atualizar a configuração da conta sem apagar o histórico.
- Manter campos e valores legados no banco durante a migração para identificar contas ainda não migradas, sem ativar o transporte antigo.
- Preservar as demais decisões do ADR-007, incluindo autenticação por conta e deploy em serviço único.

## Alternativas

- Migrar credenciais automaticamente: inviável porque a sessão e o token pertencem a provedores diferentes.
- Apagar configurações e histórico: descartado para preservar os dados da conta.

## Consequências

- É necessário configurar `WUZAPI_BASE_URL`, `WUZAPI_ADMIN_TOKEN`, `ENCRYPTION_KEY` e uma URL pública de webhook. O número precisa ser autenticado novamente por QR.
- Implementações e dados históricos precisam ser removidos de forma incremental; o vínculo e o webhook usam apenas WuzAPI. A paridade de mídia deve ser validada antes de depender desse caminho.
