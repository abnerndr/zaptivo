# Session log (IA)

Registro **append-only** de mudanças relevantes feitas por agentes de IA.  
Não edite entradas antigas — só acrescente no topo (mais recente primeiro).

---

## 2026-10-04 — Fix deploy: dependência `shadcn` faltando

### O que foi feito
- Adicionou `shadcn@^4.11.0` ao `package.json` da raiz (perdido no flatten)
- Validou `pnpm build` local com sucesso

### Por que
- Dokploy falhava em `Can't resolve 'shadcn/tailwind.css'` — import em `globals.css` sem o pacote

### Onde revisar
- `package.json` / `pnpm-lock.yaml`
- `src/app/globals.css` (`@import "shadcn/tailwind.css"`)

### Impacto
- [x] Frontend / Build / Deploy
- [ ] Backend / DB

### Risco / Atenção
- Precisa commit + push para o redeploy no Dokploy pegar o lockfile

### Como validar
- `pnpm build` (já OK localmente)
- Redeploy Dokploy após push

---

## 2026-10-03 — Unificação Next + flatten + harness

### O que foi feito
- Aposentou Nest / monorepo Turborepo; app Next na raiz
- Domínio em `src/domain` (não `src/server`)
- Prisma na raiz; removeu `@wacrm/database`, stubs Supabase, `packages/shared`, MCP opcional, docs legadas
- Criou harness `.claude/memory`, `.claude/adr`, este session-log e regra Cursor

### Por que
- Manutenção e vibecoding quebravam com web+api duplicados
- Evitar regressão das decisões de arquitetura em sessões futuras

### Onde revisar
- `.claude/adr/001`–`005`
- `.claude/memory/MEMORY.md`
- `src/app/api/**`, `src/domain/**`, `Dockerfile`

### Impacto
- [x] Frontend
- [x] Backend (API no Next)
- [ ] DB schema (estrutura de pasta Prisma, sem mudança de modelo neste log)
- [x] Deploy / ops
- [x] DX / vibecoding

### Risco / Atenção
- Dokploy: apontar para `Dockerfile` na raiz; desligar serviço Nest antigo
- Webhooks WAHA devem ir para o host único do Next

### Como validar
- `pnpm typecheck && pnpm test && pnpm build`
- `pnpm dev` só na porta 3000
