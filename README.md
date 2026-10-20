# DESAFIO DA QUALIDADE — A Jornada da Cal

Quiz em tempo real para o Dia Mundial da Qualidade da Carmeuse Brasil (Next.js + Supabase).
**Status: Etapas 1 a 7 e 10 escritas (SQL e telas não executados: ver "Verificação"); 8 e 9 parciais; 11 e 12 pendentes.**

## O que já existe
- Tema visual (paleta da apresentação), layout e tela inicial.
- 13 imagens extraídas do PPTX em `public/images/*` (proporção preservada, máx. 1920 px) e mapa `src/data/presentation-assets.ts`.
- `supabase/migrations/0001_schema.sql` e `supabase/seed.sql` (quiz, 3 capítulos, 15 perguntas, gabarito separado).
- Regra de ranking em `src/lib/ranking/rank.ts` com testes (`tests/ranking.test.ts`) e schemas Zod.

## Executar localmente
```bash
npm install
cp .env.example .env.local   # preencher as 4 variáveis
npm run dev
npm test
```

## Criar o projeto Supabase
1. Crie o projeto em supabase.com. Em **Authentication → Sign In / Providers**, ative **Allow anonymous sign-ins**.
2. **SQL Editor**: rode `supabase/migrations/0001_schema.sql`, depois `supabase/seed.sql`.
3. **Realtime → Settings**: desative "Allow public access" (canais privados).
4. Copie URL, publishable key e secret key para `.env.local` (a secret key só no servidor/Vercel, nunca `NEXT_PUBLIC_`).
5. Crie o administrador: Authentication → Users → Add user; depois no SQL Editor:
   `update public.profiles set role = 'admin' where email = 'seu.email@empresa.com';`
6. Storage: bucket `quality-game-images` (privado; leitura para `authenticated`, escrita só admin) — policies serão entregues na Etapa 2b.

## Ajustes no SQL do briefing (e por quê)
- **Gabarito fora do alcance do participante**: `is_correct` e `explanation` saíram de `question_options`/`questions` para `question_keys` (só admin/apresentador). O participante vê o gabarito apenas via `get_revealed_key()` e só com a rodada em `revealed`.
- **`submit_answer` validava nada sobre quem chama**: agora exige `participants.auth_user_id = auth.uid()` (impede enviar resposta em nome de outro), é idempotente por `client_request_id` e usa lock compartilhado.
- **Margem de latência** (`latency_grace_ms`) só aceita/rejeita; `elapsed_ms` nunca é reduzido.
- **View de ranking** com `security_invoker`; participantes recebem ranking só por `get_session_ranking()` quando liberado.
- **Removidas** a policy de auditoria `with check (true)` (qualquer um gravava) e a escrita de broadcast por participantes.
- Perguntas futuras só ficam legíveis quando a rodada abre (sem spoiler via API).
- E-mail/nome únicos sem diferenciar maiúsculas; um dispositivo por sessão; trigger cria `profiles` para usuários anônimos.
- **Telão**: a rota `/apresentacao/[sessionCode]` exige login de apresentador/admin uma vez no computador do telão.

## Regra do ranking
1) mais acertos; 2) menor soma do tempo das corretas; 3) mais respostas no prazo; 4) conclusão mais cedo; 5) sorteio administrativo (manual) se tudo empatar. Tempo = relógio do servidor (`answered_at − opened_at`).

## Como testar as etapas 3 a 5 (com dois celulares)
1. `npm run dev` (ou publique na Vercel; celulares precisam acessar a URL: use a URL da Vercel ou o IP da máquina em `NEXT_PUBLIC_APP_URL`).
2. Rode também `supabase/migrations/0002_presenter_actions.sql`. Promova seu usuário a admin (passo 5 acima) e entre em `/apresentador`: o botão **Criar sessão** gera a sala com um código de 6 caracteres. (`dev-test.sql` ficou obsoleto; não use.)
3. No computador do telão: `/apresentador` → login → **Telão** (ou `/apresentacao/CÓDIGO`). Deve mostrar QR code, código e contadores.
4. No painel (`/apresentador/sessoes/ID`, pode ser outro computador/rede): **Abrir inscrições**. Em cada celular, leia o QR code e cadastre-se com nomes e e-mails diferentes. O nome aparece no telão e o contador de online sobe.
5. Conduza o jogo pelo painel seguindo o botão laranja (próximo passo sugerido): Iniciar jogo → Iniciar contagem → Liberar pergunta → (tempo acaba ou Encerrar pergunta) → Revelar resposta → Mostrar explicação → Próxima pergunta. Confira: pergunta abre nos três lugares; cronômetro igual; celular mostra "Resposta registrada" sem revelar acerto; telão mostra respostas recebidas sem distribuição; após revelar aparecem gabarito, percentuais e acertos/erros; a miniatura do painel espelha o telão.
6. Testes de resiliência: recarregue o painel, o telão e um celular no meio da pergunta (todos voltam ao estado certo); desligue e religue o Wi-Fi de um celular; **Pausar** com a pergunta aberta (cronômetro congela nas três telas e, ao **Retomar**, ninguém perde tempo); **Pular pergunta** (sai do ranking); **Reiniciar rodada** (apaga só as respostas daquela pergunta).

Como a sincronização funciona (Etapa 7): toda ação do painel chama `public.presenter_action`, que na mesma transação valida a transição, grava o estado, incrementa `game_sessions.state_version`, registra `session_events` e `audit_events` e emite o Broadcast com `realtime.send`. Telas ignoram eventos de versão menor ou igual e refazem a busca quando a versão é maior; sem Realtime, o polling (4 s) mantém tudo sincronizado.

## Verificação
Ambiente sem internet: o app **não foi instalado nem compilado** e o SQL **não foi executado** em um Postgres. Só a lógica pura (ranking e máquina de estados) foi executada, com um substituto simples do vitest: 13/13 passaram. Rode `npm install && npm run typecheck && npm test` primeiro; podem aparecer ajustes de tipo. Tipos do banco: `npm run db:types` gera `src/types/database.ts` (ainda não usado; os clientes estão sem tipagem do esquema).

## Pendências
| Etapa | Situação |
|---|---|
| 1 Estrutura/tema/home | feita |
| 2 SQL + Supabase | SQL pronto (0001 e 0002); bucket e tipos gerados pendentes |
| 3 Auth/cadastro | escrita (anônimo, `joinSession`, reconexão por token, reconexão liberada pelo apresentador) |
| 4 Tela do participante | escrita |
| 5 Telão | escrita (fecha a rodada sozinho quando o tempo acaba) |
| 6 Painel do apresentador | escrito: monitoramento, 18 controles com confirmação, miniatura ao vivo, próxima pergunta com edição, participantes (busca, respostas, desclassificar, remover, liberar reconexão) |
| 7 Realtime | escrito: eventos emitidos pelo banco, presença, versionamento, polling de segurança |
| 8 Resposta segura | `submitAnswer` + RPC prontos; teste de carga pendente |
| 9 Ranking | regra, view, RPC e telas prontas |
| 11 Excel | pendente |
| 12 Testes e docs | ranking e máquina de estados com testes; faltam testes de integração (resposta duplicada, tempo esgotado, reconexão, múltiplas abas) |

## Pontos que precisam de decisão
- Só há 13 imagens no PPTX: não há imagem para siderurgia, mineração, saneamento, vidro nem papel e celulose; hoje nenhuma pergunta depende delas.
- Confirme no `presentation-assets.ts` o campo `origin` (real/conceitual/ilustração IA): foi estimado pela aparência.
- Slide 21: a ressalva sobre SELAFIL/psilídeo ficou fora das perguntas de propósito.
