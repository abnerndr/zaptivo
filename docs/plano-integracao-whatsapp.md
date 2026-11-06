# Plano de integração do WhatsApp no Zaptivo

## Decisão e ordem de entrega

Implementar **WuzAPI + SSE**, incluindo migração por conta e todas as melhorias abaixo. O projeto já envia por HTTP, recebe eventos por webhook e transmite atualizações ao navegador em `/api/realtime/stream`. Reutilizar esse fluxo para conectar a WuzAPI ao chat e às demais entradas de envio. Socket.IO ou WebSocket só merecem uma nova decisão se medições apontarem um limite específico do SSE. Trocar o transporte do navegador por si só não reduz o tempo que o provedor leva para entregar áudio ao telefone.

O CRM continua responsável por histórico, contatos, atribuição e permissões. Manter o app único no Dokploy e as regras em `src/domain`. Registrar a nova URL pública como adendo ao ADR-006. Incluir na implementação um novo ADR que substitua a decisão de transporte do ADR-006 e documente WuzAPI, seleção por conta e persistência dos trabalhos no Postgres. O anexo descreve a situação inicial. As etapas abaixo são trabalho proposto.

## 1. Medir antes de alterar

- Instrumentar a rota de envio, `send-message.ts`, o webhook, a publicação no Postgres e a aplicação do evento no inbox. Correlacionar ID local, ID remoto, conta e tentativa sem registrar conteúdo, áudio ou credenciais.
- Separar quatro tempos: clique até bolha local, envio até aceite do provedor, webhook até tela de outro atendente e aceite até recibo do telefone. Para voz, registrar também upload, conversão e duração do clipe. Na IA, medir separadamente o debounce de quatro segundos previsto no ADR-006, a inferência e o envio.
- Medir p50/p95 e taxa de falhas na implantação atual. Metas iniciais propostas em homologação: bolha local p95 ≤ 100 ms, webhook de texto até segunda tela p95 ≤ 500 ms e aceite de texto pelo provedor p95 ≤ 2 s. Medir entrega real com telefone de teste online. Definir a meta de áudio por duração e rede após a primeira rodada.

## 2. Publicar o webhook configurado pelo ambiente

Configuração proposta no ambiente do Zaptivo:

```dotenv
NEXT_PUBLIC_SITE_URL=https://minha-url
# Origem da API WuzAPI, a confirmar na instalação contratada
WUZAPI_BASE_URL=https://host-da-wuzapi
# URLs completas opcionais, derivadas de NEXT_PUBLIC_SITE_URL quando ausentes
WUZAPI_WEBHOOK_URL=https://minha-url/webhook/whatsapp
# Compatibilidade durante a migração da Evolution
EVOLUTION_WEBHOOK_URL=https://minha-url/webhook/whatsapp
```

- Expor **POST https://minha-url/webhook/whatsapp** por encaminhamento interno ao handler de `/api/whatsapp/webhook`. Manter a rota anterior durante a migração. Preservar método, corpo e autenticação, sem redirecionar o provedor.
- Corrigir `evolutionWebhookUrl()` em `src/domain/whatsapp/evolution-api.ts`: hoje a função reconhece apenas o caminho antigo e anexaria outro sufixo à nova URL explícita. Usar a URL completa de override literalmente e, na ausência dela, compor a origem pública com `/webhook/whatsapp`. Inventariar overrides legados que contenham só a origem. Validar HTTPS público em produção e apontar erro de configuração antes de registrar uma sessão.
- Atualizar exemplo de ambiente, tela de configuração e runbook. Registrar o callback na criação e reconciliar sessões já conectadas. Verificar resposta do registro e ler de volta a configuração. Usar segredo dedicado da Evolution, validado no servidor, e resolver a organização pela instância cadastrada. Rejeitar credencial inválida e instância desconhecida.
- **Aceite:** do exterior do Dokploy, enviar evento autenticado e repetir o mesmo evento pelas duas URLs. Deve haver uma mensagem, uma atualização lógica e no máximo uma resposta automática. Conferir também host com barra final, override explícito e configuração ausente.

## 3. Unificar envio, recebimento e respostas

- Fazer inbox, API pública, templates, automações e agente passarem pelo mesmo núcleo de persistência e envio, respeitando os escopos e contratos de cada entrada. Inventariar chamadas diretas ao provedor antes de mover cada fluxo. Validar organização, conta, conversa e permissão no servidor.
- Ao enviar, criar um ID de operação estável e mostrar a bolha pendente imediatamente. Persistir intenção e chave de idempotência antes da chamada externa. Associar o ID remoto à mesma bolha, inclusive se o eco do webhook chegar primeiro. Em timeout após possível aceite, reconciliar antes de reenviar. Exibir falha recuperável e ação de tentar novamente.
- No webhook, persistir o evento antes do 2xx. Deduplicar por conta, ID remoto e tipo/transição. Aplicar recibos fora de ordem sem regredir de lida para entregue. Guardar recibo antecipado até a chegada da mensagem. Resolver LID e atualizar contato sem duplicar a conversa nem atrasar a primeira bolha.
- Para resposta citada, guardar a referência remota da mensagem e validar que pertence à mesma conversa. Confirmar no telefone que a citação aponta ao original, tanto ao responder pelo CRM quanto ao receber uma resposta do aparelho.
- Atualizar conversa, última mensagem, ordenação da lista, não lidas e histórico a partir da mesma transação. Acionar automações e webhooks públicos habilitados após persistência. Para IA, persistir trabalho pendente no Postgres, consumir no mesmo processo e retomar após reinício. Rever pausa para atendimento humano imediatamente antes do envio.

## 4. Garantir continuidade do SSE

- Aproveitar `src/hooks/use-realtime.ts` e o redutor em `src/hooks/inbox/apply-realtime.ts`. Transmitir eventos pequenos por organização. A rota mantém hoje um cliente Postgres em LISTEN por stream. Medir conexões com múltiplas abas e adotar listener compartilhado por processo se o orçamento do banco exigir.
- Gravar eventos com cursor retomável e ordem de publicação consistente junto à mudança de estado. Usar NOTIFY para acordar o leitor. Enviar o cursor como ID do SSE, recuperar a lacuna na reconexão e refazer snapshot se o cursor expirou. Cobrir a corrida entre snapshot e assinatura. Deduplicar no cliente por ID estável.
- Validar heartbeat, cancelamento do stream, timeout e buffering no proxy do Dokploy. Revalidar a sessão ao reconectar e limitar eventos às conversas autorizadas. Testar duas organizações e dois atendentes, perda de rede e reinício durante envio. O histórico e os contadores devem convergir sem recarregar a página.

## 5. Fechar o ciclo do áudio

- No navegador, permitir gravar, ouvir, cancelar e enviar. Detectar o formato suportado pelo aparelho, impor limite de tamanho/duração e mostrar progresso do upload. Salvar a mídia em R2 com controle de acesso por organização.
- No servidor, validar o arquivo e converter uma única vez quando o provedor exigir. Validar nota de voz com reprodução no WhatsApp em Android e iOS. Para WuzAPI, a referência upstream especifica Opus e payload base64 no endpoint de áudio. Executar essa codificação apenas na borda do adaptador. [API de áudio WuzAPI](https://github.com/asternic/wuzapi/blob/main/API.md)
- Na entrada, persistir metadados e mostrar a bolha imediatamente. Buscar a mídia em segundo plano, sinalizar disponibilidade via SSE e oferecer nova tentativa se o download falhar. Testar áudio curto e de 60 segundos, rede lenta, formato incompatível, URL expirada e reprodução em outra sessão autorizada.

## 6. Implementar WuzAPI e migrar as contas

A implementação WuzAPI faz parte obrigatória desta entrega. Medir latência orienta os ajustes e comprova o resultado. A escolha da WuzAPI já integra o escopo solicitado.

### 6.1. Confirmar contrato e registrar a decisão

- Fixar a versão usada e confirmar a URL base real, credenciais, sessão/QR, texto, áudio, resposta citada, download de mídia, recibos e LID na instalação Juspilot. A URL de documentação pode ter um caminho diferente da API.
- Capturar exemplos anonimizados de sucesso, falha e webhook para testes de contrato. Confirmar o mecanismo de assinatura e o formato exato do corpo, incluindo JSON ou multipart.
- Registrar no novo ADR a decisão WuzAPI + SSE e o processamento persistente no Postgres dentro do app. Conferir os guias locais de Next.js em `node_modules/next/dist/docs/` antes de implementar handlers ou streaming.

A documentação da instância indicada não pôde ser consultada nesta análise. Confirmar seu contrato é a primeira tarefa técnica da implementação. [Instância indicada](https://wuzapi.juspilot.com/api/) · [Referência upstream](https://github.com/asternic/wuzapi/blob/main/API.md)

### 6.2. Criar o adaptador e o cadastro por conta

- Definir contrato de transporte em `src/domain/whatsapp` para conexão, QR, status, texto, áudio, mídia, citação, reações e recibos. Inventariar capacidades efetivamente usadas pelo sistema e mapear as disponíveis na versão instalada.
- Implementar `wuzapi-api.ts` e `wuzapi-event.ts`. Encaminhar o envio existente pelo adaptador selecionado, com timeout, erros normalizados e correlação das operações.
- Criar migração Prisma para provedor, identificador da sessão e credencial criptografada por conta. Preencher registros existentes com Evolution e configurar WuzAPI nas novas conexões. Utilizar o mecanismo de criptografia existente.
- Na configuração do WhatsApp, incluir seleção de provedor, credencial protegida, conectar, mostrar QR, status de conexão e desconectar. Validar propriedade da conta e restringir essas ações a usuários autorizados.
- Usar a URL base do ambiente. Guardar tokens e segredo de webhook por conta somente no servidor. Documentar os nomes finais das configurações no exemplo de ambiente, sem credenciais reais.

### 6.3. Integrar o webhook comum

- Registrar automaticamente a URL calculada para WuzAPI ao conectar e reconciliar sua configuração ao reconectar. Usar `WUZAPI_WEBHOOK_URL` quando explícita, ou a origem de `NEXT_PUBLIC_SITE_URL` com `/webhook/whatsapp`.
- No endpoint comum, identificar a conta por dados verificáveis e credencial/assinatura. Conferir a assinatura sobre o corpo original quando esse for o contrato do provedor. Tratar colisões de identificadores entre provedores.
- Normalizar mensagem, eco de envio, recibos, conexão e QR em eventos internos. Alimentar o mesmo núcleo de contatos, conversas, histórico, automações e SSE.
- Validar assinatura inválida, evento duplicado, recibo antecipado, mensagem com LID, mídia pendente e evento desconhecido. Persistir o recebimento antes da confirmação HTTP e tornar o processamento recuperável.

### 6.4. Integrar cada fluxo do sistema

- Texto e áudio enviados pelo inbox devem chegar ao aparelho e refletir aceite, entrega e leitura conforme os recibos disponíveis.
- Recebimento de texto, imagem, documento e áudio deve aparecer na conversa e atualizar lista, contadores e contatos.
- Resposta citada e reações devem preservar a referência correta no aparelho e no histórico.
- API pública, mensagens de templates internos, automações e IA devem usar o adaptador da conta. Distinguir templates internos de templates oficiais da Meta. Registrar capacidades e bloquear com mensagem clara operações que a versão WuzAPI não suporte.
- Tratar conflito entre resposta humana e IA. Adquirir trabalho pendente de forma atômica, revalidar pausa e atribuição antes do envio e impedir processamento simultâneo da mesma operação.
- Aplicar paginação por cursor no histórico e na lista quando necessário, índices por organização/conversa/data e atualizações incrementais no inbox. Evitar buscar todo o histórico a cada evento.
- Adicionar estados visíveis de conectando, reconectando, envio pendente, falha de mídia e nova tentativa. Manter o texto digitado ao falhar o envio.

### 6.5. Migrar e medir

- Migrar uma conta de teste primeiro. Suspender novos envios da conta durante a troca, reconciliar intenções pendentes, conectar a sessão WuzAPI e validar o callback antes de liberar o envio.
- Preservar IDs locais, contatos e histórico. Vincular IDs remotos ao provedor e à conta. Confirmar necessidade de novo QR e disponibilidade real de sincronização de histórico antes de prometer importação.
- Permitir apenas um provedor emissor ativo por número. Em rollback, pausar a conta, reconciliar operações incertas e reativar a conexão anterior de forma controlada.
- Medir p50/p95 e falhas em condições equivalentes à linha de base Evolution. Executar ao menos 100 textos e 30 áudios por duração, em períodos distintos e respeitando os limites da instalação. Validar também múltiplos atendentes simultâneos.
- Aprovar a expansão quando a matriz funcional passar, os testes de recuperação preservarem mensagens e as metas acordadas de latência forem atingidas. Registrar o desempenho observado e os gargalos restantes.

## 7. Liberar e validar o sistema integrado

1. Em homologação, executar testes de domínio, TypeScript e testes de contrato com eventos gravados e anonimizados. Exercitar a UI em duas sessões e confirmar recebimento no WhatsApp real.
2. Validar matriz ponta a ponta: mensagem recebida cria ou atualiza contato e conversa; resposta humana chega uma vez; áudio toca nos dois sentidos; citação é preservada; envio por API, template e agente aparece no mesmo histórico; pausa bloqueia o agente; viewer não envia; outra organização não vê evento ou mídia.
3. Entregar na ordem contrato/ADR e modelo de conta, adaptador WuzAPI, webhook comum, persistência/conciliação, SSE, áudio e integração das demais entradas. Liberar uma conta piloto por vez. Monitorar p95, fila mais antiga, conexões Postgres, erros de mídia e divergências entre histórico e tela. Simular reinício entre persistência e publicação.
4. Em regressão, interromper novos envios da conta piloto, reconciliar pendências com o provedor e restaurar configuração anterior e callback verificado. Preservar IDs e histórico. Expandir após um ciclo operacional completo com a matriz aprovada e sem perdas ou duplicações nos testes.

## 8. Checklist de conclusão da implementação

- [ ] ADR atualizado e migração de contas existentes validada.
- [ ] WuzAPI conecta, apresenta QR, informa status e reconecta pelo painel.
- [ ] Webhook público derivado do ambiente registrado e verificado na WuzAPI.
- [ ] Texto, áudio, mídia e resposta citada aprovados de ponta a ponta.
- [ ] SSE retoma após desconexão e mantém as sessões autorizadas consistentes.
- [ ] API pública, templates internos, automações e IA integrados ao provedor da conta.
- [ ] Idempotência, recibos fora de ordem e reinício durante envio validados.
- [ ] Permissões e isolamento entre organizações comprovados.
- [ ] Histórico, contatos, atribuição e contadores consistentes após migração.
- [ ] Metas de latência medidas, rollback ensaiado e runbook atualizado.

O resultado esperado é a WuzAPI integrada ao fluxo operacional completo, com as melhorias de desempenho e recuperação acima verificadas em homologação e na conta piloto.
