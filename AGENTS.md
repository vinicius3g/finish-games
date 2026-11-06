# Orientações do projeto

- O projeto usa Next.js App Router, React, TypeScript estrito e Supabase.
- Mantenha handlers HTTP sem estado local para compatibilidade com funções serverless. Use Supabase para estado persistente; não dependa de arquivos graváveis ou memória compartilhada entre invocações.
- Nunca exponha `SUPABASE_SERVICE_ROLE_KEY`, `APP_SECRET`, chaves Steam ou credenciais Twitch ao cliente nem use prefixo `NEXT_PUBLIC_` nelas.
- Todas as rotas privadas devem validar `x-app-secret` e desabilitar cache de respostas.
- Valide entradas externas em `lib/games.ts` ou em um módulo puro equivalente e cubra mudanças de comportamento com testes em `test/`.
- Preserve status, nota e anotações ao sincronizar jogos existentes da Steam.
- Atualize `README.md` quando mudar configuração, variáveis de ambiente, deploy ou comportamento visível.

## Comandos de validação

- `npm test`
- `npm run typecheck`
- `npm run build`

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
