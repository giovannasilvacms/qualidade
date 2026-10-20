-- OBSOLETO: o painel do apresentador (Etapas 6 e 7) substitui este roteiro. Mantido só como referência.
-- SOMENTE DESENVOLVIMENTO. Simula o apresentador até o painel remoto (Etapa 6) existir.
-- Rode no SQL Editor, bloco a bloco. Troque 'TESTE1' se quiser outro código. Nada aqui deve rodar em produção.

-- 0) Sessão de teste com inscrições abertas e uma rodada por pergunta do quiz.
insert into public.game_sessions (id, quiz_id, session_code, title, status, registration_open, screen_state)
select 'aaaaaaaa-0000-4000-8000-000000000001', id, 'TESTE1', 'Sessão de teste', 'registration_open', true, 'lobby'
from public.quizzes where title = 'DESAFIO DA QUALIDADE' limit 1
on conflict (id) do nothing;

insert into public.rounds (session_id, question_id, round_number)
select 'aaaaaaaa-0000-4000-8000-000000000001', id, question_order
from public.questions where quiz_id = (select quiz_id from public.game_sessions where id = 'aaaaaaaa-0000-4000-8000-000000000001')
on conflict do nothing;

-- Seu usuário (Authentication → Users) precisa ser admin para abrir o telão:
-- update public.profiles set role = 'admin' where email = 'voce@empresa.com';

-- 1) Função auxiliar: avança o estado, incrementa a versão e emite o evento Broadcast (como a Etapa 7 fará).
create or replace function public.dev_emit(p_event text, p_screen text, p_status public.session_status default null)
returns void language plpgsql as $$
declare sid constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001'; v bigint;
begin
  update public.game_sessions set screen_state = p_screen, status = coalesce(p_status, status), state_version = state_version + 1
  where id = sid returning state_version into v;
  perform realtime.send(jsonb_build_object('sessionId', sid, 'eventId', gen_random_uuid(), 'eventType', p_event,
    'serverTimestamp', now(), 'version', v, 'payload', '{}'::jsonb, 'actorId', null), 'game_event', 'session:' || sid, true);
end $$;

-- 2) Abrir pergunta N (troque o 1). Define opened_at/closes_at no servidor.
create or replace function public.dev_open_round(n int) returns void language plpgsql as $$
declare sid constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001'; rid uuid;
begin
  update public.rounds r set status = 'open', opened_at = clock_timestamp(),
         closes_at = clock_timestamp() + make_interval(secs => q.duration_seconds), state_version = r.state_version + 1
  from public.questions q where r.session_id = sid and r.round_number = n and q.id = r.question_id returning r.id into rid;
  update public.game_sessions set current_round_id = rid, registration_open = false where id = sid;
  perform public.dev_emit('QUESTION_OPENED', 'question', 'live');
end $$;

-- Roteiro:
-- select public.dev_open_round(1);                                   -- pergunta aberta (celular + telão)
-- update public.rounds set status='closed', closed_at=now() where session_id='aaaaaaaa-0000-4000-8000-000000000001' and round_number=1;
-- select public.dev_emit('QUESTION_CLOSED','question_closed');
-- update public.rounds set status='revealed', revealed_at=now() where session_id='aaaaaaaa-0000-4000-8000-000000000001' and round_number=1;
-- select public.dev_emit('ANSWER_REVEALED','answer_revealed');
-- select public.dev_emit('EXPLANATION_SHOWN','explanation');
-- update public.game_sessions set show_partial_ranking = true where id='aaaaaaaa-0000-4000-8000-000000000001';
-- select public.dev_emit('RANKING_SHOWN','ranking');
-- select public.dev_emit('PODIUM_SHOWN','podium');
-- select public.dev_emit('GAME_FINISHED','finished','finished');
-- Limpeza: drop function public.dev_emit(text,text,public.session_status); drop function public.dev_open_round(int);
--          delete from public.game_sessions where id='aaaaaaaa-0000-4000-8000-000000000001';
