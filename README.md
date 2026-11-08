# Meus jogos zerados

Aplicação pessoal para catalogar jogos concluídos, acompanhar horas e conquistas, sincronizar a biblioteca Steam e buscar capas no IGDB. Interface em Next.js/React com TypeScript, persistência no Supabase e rotas HTTP sem estado local.

## Requisitos

- Node.js 20.9 ou superior
- Um projeto Supabase
- Credenciais Steam e Twitch/IGDB apenas para habilitar essas integrações

## Versionamento

A versao inicial registrada e `0.1.0`. O projeto segue SemVer (`MAJOR.MINOR.PATCH`); o historico fica em [CHANGELOG.md](CHANGELOG.md).

- `npm run version:patch`: correcoes compativeis, por exemplo `0.1.0` para `0.1.1`.
- `npm run version:minor`: novas funcionalidades, por exemplo `0.1.0` para `0.2.0`.
- `npm run version:major`: mudancas incompativeis, por exemplo `0.1.0` para `1.0.0`.

Antes de lancar uma versao, execute `npm test`, `npm run typecheck` e `npm run build`. Depois execute o comando de incremento apropriado, mova as notas de `Unreleased` para uma secao com a nova versao e data no changelog e mantenha `Unreleased` para as proximas mudancas. Os comandos sincronizam `package.json` e `package-lock.json`, mas nao atualizam o changelog nem criam commits ou tags. Enquanto a versao principal for zero, a API ainda e considerada em desenvolvimento.

## Executar localmente

1. Instale as dependências: `npm install`.
2. Crie uma tabela executando [`supabase/schema.sql`](supabase/schema.sql) no SQL Editor do Supabase.
3. Copie `.env.example` para `.env.local` e preencha `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `APP_SECRET`.
4. Inicie o Next.js com `npm run dev` e abra `http://localhost:3000`.
5. Digite o mesmo `APP_SECRET` configurado no ambiente para entrar.

As chaves Steam e IGDB são opcionais para cadastrar e editar jogos manualmente. Sem elas, apenas as integrações correspondentes ficam indisponíveis.

## Variáveis de ambiente

| Variável | Obrigatória | Uso |
| --- | --- | --- |
| `SUPABASE_URL` | Sim | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Acesso ao banco, somente nos handlers do servidor |
| `APP_SECRET` | Sim | Senha de acesso à aplicação; configure um valor longo e aleatório |
| `STEAM_API_KEY` | Não | Sincronização Steam |
| `STEAM_ID` | Não | SteamID64 do perfil |
| `TWITCH_CLIENT_ID` | Não | Busca IGDB |
| `TWITCH_CLIENT_SECRET` | Não | Busca IGDB |

Nunca use o prefixo `NEXT_PUBLIC_` nestas credenciais. O arquivo `.env.local` não deve ser commitado.

Se a sincronizacao Steam informar que o Supabase recusou a autenticacao, confira se `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` pertencem ao mesmo projeto e se a chave de servidor continua valida. Nao use a chave anon/publicavel. Reinicie o servidor local depois de alterar as variaveis; em producao, atualize o ambiente e faca um novo deploy. Um retorno 200 da Steam nao valida a conexao com o Supabase. Se houver erro de tabela ou colunas ausentes, confira a estrutura em [`supabase/schema.sql`](supabase/schema.sql); `create table if not exists` nao atualiza uma tabela ja existente.

## Funcionalidades

- Cadastro, edição, busca e exclusão de jogos.
- Listagem paginada com 12 jogos por pagina, contagem de resultados e controles de primeira, anterior, proxima e ultima pagina. A busca ignora maiusculas e espacos nas extremidades e volta a primeira pagina; exclusoes ajustam automaticamente paginas que deixaram de existir.
- Grid responsivo com tres colunas no desktop, duas no tablet e uma no celular. Cards mostram status, nota, progresso de conquistas e acoes de edicao/exclusao; capas ausentes ou indisponiveis usam um placeholder.
- Animacoes de entrada escalonadas com GSAP ao carregar, buscar ou trocar de pagina, com limpeza ao desmontar. A preferencia `prefers-reduced-motion` desativa animacoes e rolagem suave.
- Estados, plataforma, data de conclusão, horas, conquistas, nota, anotações e capa.
- Contadores de jogos concluídos, horas e progresso por ano.
- Busca de títulos/capas via IGDB.
- Sincronização Steam que adiciona jogos jogados e atualiza apenas horas/conquistas dos já cadastrados; status e dados pessoais editados são preservados.

Se a Steam responder HTTP 200 sem disponibilizar a biblioteca, a rota do app retorna 422 com orientacoes, nao 404. Confira se `STEAM_ID` e o SteamID64 numerico do perfil, deixe o perfil e "Detalhes do jogo" publicos e desmarque a opcao de manter o tempo de jogo privado. Uma biblioteca explicitamente vazia conclui a sincronizacao com zero jogos; HTTP 200 da Steam, sozinho, nao confirma acesso aos jogos.

## Testes e validação

Falhas de gravacao na sincronizacao Steam exibem orientacoes para restricoes UNIQUE, NOT NULL ou CHECK. O terminal do servidor registra apenas o status e o codigo do erro de gravacao, sem o payload dos jogos ou credenciais. O upsert requer uma restricao UNIQUE em `games.steam_appid`; antes de adicionar essa restricao em uma tabela existente, confira e resolva duplicatas sem apagar dados pessoais. Compare tambem os valores DEFAULT com [`supabase/schema.sql`](supabase/schema.sql).

```bash
npm test
npm run typecheck
npm run build
```

O teste unitário cobre a validação de payloads usada pela rota de jogos. O build valida a compilação de produção; as integrações externas exigem credenciais reais para um teste ponta a ponta.

Os testes de `paginateGames(games, query, requestedPage)` cobrem ordem, limites, busca, lista vazia e ajuste apos exclusao. A funcao nao altera os jogos de entrada e retorna `games`, `total`, `page`, `pageCount`, `start` e `end`; `GAMES_PER_PAGE` define o tamanho fixo de pagina. A paginacao e local: ela limita os cards renderizados, nao o carregamento de dados da API. As anotacoes ficam limitadas a duas linhas no card; o texto completo permanece disponivel na edicao.

## Deploy serverless

O deploy recomendado é Vercel + Supabase:

1. Importe o repositório no Vercel e configure todas as variáveis obrigatórias no projeto.
2. Selecione uma região de funções próxima à região do banco Supabase para reduzir latência.
3. Faça o deploy. A página pode ser servida como conteúdo estático; cada rota `app/api/*` é executada sob demanda no runtime Node.js.
4. Aplique `supabase/schema.sql` uma única vez no Supabase antes de usar a aplicação.

Os handlers não dependem de arquivos locais ou memória compartilhada entre instâncias. O Supabase é o armazenamento persistente; respostas pessoais usam `Cache-Control: no-store`; chaves de terceiros ficam apenas no servidor. A sincronização Steam processa no máximo 50 jogos por invocação e o navegador solicita os lotes seguintes, evitando uma função única para bibliotecas grandes. Ela ainda depende da disponibilidade/limites da Steam e pode levar alguns minutos em bibliotecas extensas.

O acesso é de usuário único por senha compartilhada. O segredo de acesso fica no armazenamento local do navegador; use o app apenas em ambiente privado e proteja `APP_SECRET` com cuidado. Para múltiplos usuários, substitua esse mecanismo por autenticação individual antes de publicar amplamente.

Para iniciar a versão de produção localmente, rode `npm run build` e depois `npm start`.
