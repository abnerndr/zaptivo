# ADR-007 — WuzAPI, SSE e processamento persistente no Postgres

**Status:** Aceito  
**Data:** 2026-11-05  
**Substitui:** a escolha exclusiva de Evolution e o debounce apenas em memória do [ADR-006](006-evolution-transporte.md). As demais decisões de ADR-006 e ADR-004 continuam aplicáveis.

## Contexto

O CRM mantém contatos, conversas, histórico, atribuição e permissões como fonte da verdade. A migração precisa ocorrer por conta sem perder mensagens ao reiniciar o processo ou desconectar o navegador. O app permanece um único serviço no Dokploy, com regras de domínio em `src/domain`.

## Decisão

- Adotar WuzAPI para novas conexões e manter Evolution para contas existentes e rollback. Cada conta seleciona seu provedor e identifica sua sessão; credenciais são armazenadas criptografadas no servidor com o mecanismo existente e nunca expostas ao cliente. Somente um provedor emissor fica ativo por número.
- A referência de contrato do adaptador é [asternic/wuzapi, revisão `4f4838c8586e341b1f67850bd77d7828a72e6d04`](https://github.com/asternic/wuzapi/blob/4f4838c8586e341b1f67850bd77d7828a72e6d04/API.md). Esta é a revisão upstream fixada como base da implementação, **não uma versão comprovadamente instalada**. A [especificação publicada pela Juspilot](https://wuzapi.juspilot.com/api/spec.yml) declara `info.version` 3.0.0, o que por si só não comprova a versão do servidor. Ela descreve diferenças de contrato frente ao adaptador atual (header `token` e corpo de registro do webhook); reconciliar e validar na instância antes da liberação.
- Receber eventos por `POST /webhook/whatsapp`, com encaminhamento interno ao handler existente; manter `/api/whatsapp/webhook` durante a migração. Autenticar e identificar a conta antes de processar e persistir o evento antes do 2xx. Registrar e verificar o callback ao conectar e reconciliá-lo ao reconectar.
- Persistir intenções de envio, eventos e trabalho pendente da IA no Postgres. Consumir o trabalho no mesmo processo da aplicação, com aquisição atômica, recuperação após reinício e nova verificação de pausa humana antes do envio. Reconciliar resultado incerto com o provedor antes de repetir uma operação.
- Usar SSE entre app e navegador. Persistir eventos com cursor retomável e ordem consistente junto da mudança de estado; `NOTIFY` acorda o leitor, não substitui o registro durável. Enviar cursor como ID SSE, recuperar a lacuna na reconexão, refazer snapshot quando o cursor expirar e cobrir a corrida entre snapshot e assinatura. Deduplicar por ID estável no cliente e limitar eventos às conversas autorizadas.

## Alternativas

- Somente Evolution: mantém o caminho anterior, mas não atende à migração WuzAPI por conta.
- WebSocket ou Socket.IO para o navegador: adiados até medições evidenciarem limitação específica do SSE.
- Fila externa e worker separado: não necessários para esta decisão; persistência e consumo ficam no app único e Postgres.

## Consequências

- O deploy depende de Postgres e de sessão direta para LISTEN quando houver pooler; monitorar conexões, idade do trabalho pendente, falhas e recuperação após reinício.
- O cadastro existente permanece Evolution; a migração e o rollback são controlados por conta, preservando IDs locais e histórico. Credenciais e IDs remotos pertencem à conta e ao provedor.
- O ADR registra a arquitetura alvo da entrega. A disponibilidade real da rota comum, processamento persistente, retomada SSE e UI deve ser verificada na versão implantada pela matriz de aceite antes de operar a migração.
