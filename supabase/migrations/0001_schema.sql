-- DESAFIO DA QUALIDADE - A Jornada da Cal
-- Migration 0001. Baseada no esquema do briefing, com correções de segurança (ver README, seção "Ajustes no SQL").
create extension if not exists pgcrypto;

create type public.user_role as enum ('admin','presenter','participant');
create type public.session_status as enum ('draft','registration_open','registration_closed','countdown','live','paused','finished','cancelled');
create type public.round_status as enum ('pending','countdown','open','closed','revealed','skipped');
create type public.question_type as enum ('multiple_choice','true_false','image_choice');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  role public.user_role not null default 'participant',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Todo usuário do Auth (inclusive anônimo) ganha um profile 'participant'. Promoção a admin/presenter é manual.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.email, 'participant')
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  title text not null, subtitle text, description text, cover_image_url text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.quiz_chapters (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  title text not null, subtitle text, chapter_number integer not null, image_url text,
  created_at timestamptz not null default now(),
  unique (quiz_id, chapter_number)
);

-- AJUSTE: "explanation" saiu daqui (vazaria antes da revelação) e foi para question_keys.
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  chapter_id uuid references public.quiz_chapters(id) on delete set null,
  question_type public.question_type not null default 'multiple_choice',
  statement text not null,
  image_url text,
  source_slide integer,
  duration_seconds integer not null default 20 check (duration_seconds between 5 and 180),
  question_order integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (quiz_id, question_order)
);

-- AJUSTE: sem is_correct. O gabarito fica em question_keys (somente admin/apresentador).
create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  option_key text not null, option_text text not null, image_url text,
  option_order integer not null,
  created_at timestamptz not null default now(),
  unique (question_id, option_key), unique (question_id, option_order)
);

create table public.question_keys (
  question_id uuid primary key references public.questions(id) on delete cascade,
  correct_option_id uuid not null references public.question_options(id) on delete restrict,
  explanation text check (char_length(explanation) <= 300)
);

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id),
  session_code text not null unique,
  title text not null,
  status public.session_status not null default 'draft',
  current_round_id uuid,
  screen_state text not null default 'lobby',
  state_version bigint not null default 1,
  registration_open boolean not null default false,
  show_partial_ranking boolean not null default false,
  allow_reconnection boolean not null default true,
  latency_grace_ms integer not null default 500 check (latency_grace_ms between 0 and 3000),
  scheduled_at timestamptz, started_at timestamptz, finished_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.session_presenters (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_owner boolean not null default false,
  created_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  auth_user_id uuid references public.profiles(id) on delete set null,
  full_name text not null, email text not null,
  employee_number text, department text, unit_name text,
  reconnect_token_hash text, device_hash text,
  is_online boolean not null default false,
  is_disqualified boolean not null default false,
  disqualification_reason text,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz, completed_at timestamptz
);
-- AJUSTE: unicidade case-insensitive de e-mail e nome por sessão; um dispositivo por sessão.
create unique index participants_session_email_uq on public.participants (session_id, lower(email));
create unique index participants_session_name_uq on public.participants (session_id, lower(full_name));
create unique index participants_session_device_uq on public.participants (session_id, device_hash) where device_hash is not null;
create unique index participants_session_auth_uq on public.participants (session_id, auth_user_id) where auth_user_id is not null;

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id),
  round_number integer not null,
  status public.round_status not null default 'pending',
  state_version bigint not null default 1,
  countdown_started_at timestamptz, opened_at timestamptz, closes_at timestamptz,
  closed_at timestamptz, revealed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, round_number), unique (session_id, question_id)
);

alter table public.game_sessions add constraint game_sessions_current_round_fk
  foreign key (current_round_id) references public.rounds(id) on delete set null;

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  selected_option_id uuid not null references public.question_options(id),
  is_correct boolean not null,
  answered_at timestamptz not null default clock_timestamp(),
  elapsed_ms bigint not null check (elapsed_ms >= 0),
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  unique (round_id, participant_id), unique (participant_id, client_request_id)
);

create table public.session_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  event_type text not null, state_version bigint not null,
  actor_id uuid references public.profiles(id),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.game_sessions(id) on delete cascade,
  actor_id uuid references public.profiles(id), actor_type public.user_role,
  event_type text not null, entity_type text, entity_id uuid,
  metadata jsonb not null default '{}'::jsonb, ip_hash text,
  created_at timestamptz not null default now()
);

create index participants_session_idx on public.participants(session_id);
create index participants_session_online_idx on public.participants(session_id, is_online);
create index rounds_session_status_idx on public.rounds(session_id, status);
create index answers_round_idx on public.answers(round_id);
create index answers_participant_idx on public.answers(participant_id);
create index answers_ranking_idx on public.answers(session_id, is_correct, elapsed_ms);
create index session_events_version_idx on public.session_events(session_id, state_version);
create index audit_events_session_created_idx on public.audit_events(session_id, created_at desc);

-- ---------- Funções auxiliares ----------
create or replace function public.current_user_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.current_user_can_present(target_session_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_user_is_admin() or exists (
    select 1 from public.session_presenters where session_id = target_session_id and user_id = auth.uid());
$$;

create or replace function public.current_user_in_session(target_session_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.participants
    where session_id = target_session_id and auth_user_id = auth.uid() and not is_disqualified);
$$;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger quizzes_set_updated_at before update on public.quizzes for each row execute function public.set_updated_at();
create trigger questions_set_updated_at before update on public.questions for each row execute function public.set_updated_at();
create trigger game_sessions_set_updated_at before update on public.game_sessions for each row execute function public.set_updated_at();

-- ---------- Resposta segura ----------
-- AJUSTES: valida que p_participant_id pertence a auth.uid() (evita personificação);
-- idempotente por client_request_id; lock compartilhado (não serializa todos os participantes);
-- gabarito vem de question_keys; margem de latência configurável só para ACEITAR, nunca altera elapsed_ms.
create or replace function public.submit_answer(
  p_round_id uuid, p_participant_id uuid, p_option_id uuid, p_client_request_id uuid)
returns public.answers language plpgsql security definer set search_path = public as $$
declare
  v_round public.rounds; v_session public.game_sessions; v_participant public.participants;
  v_correct_option uuid; v_valid boolean; v_now timestamptz; v_elapsed bigint; v_answer public.answers;
begin
  v_now := clock_timestamp();

  select * into v_answer from public.answers
   where participant_id = p_participant_id and client_request_id = p_client_request_id;
  if found then return v_answer; end if;  -- reenvio idempotente

  select * into v_round from public.rounds where id = p_round_id for share;
  if not found then raise exception 'ROUND_NOT_FOUND'; end if;
  if v_round.status <> 'open' then raise exception 'ROUND_NOT_OPEN'; end if;
  if v_round.opened_at is null then raise exception 'ROUND_HAS_NO_OPENING_TIME'; end if;

  select * into v_session from public.game_sessions where id = v_round.session_id;
  if v_session.status <> 'live' then raise exception 'SESSION_NOT_LIVE'; end if;

  if v_round.closes_at is not null
     and v_now > v_round.closes_at + make_interval(secs => v_session.latency_grace_ms / 1000.0) then
    raise exception 'ANSWER_TIME_EXPIRED';
  end if;

  select * into v_participant from public.participants
   where id = p_participant_id and session_id = v_round.session_id;
  if not found then raise exception 'PARTICIPANT_NOT_IN_SESSION'; end if;
  if v_participant.auth_user_id is distinct from auth.uid() then raise exception 'FORBIDDEN'; end if;
  if v_participant.is_disqualified then raise exception 'PARTICIPANT_DISQUALIFIED'; end if;

  if exists (select 1 from public.answers where round_id = p_round_id and participant_id = p_participant_id) then
    raise exception 'ANSWER_ALREADY_SUBMITTED';
  end if;

  select exists (select 1 from public.question_options where id = p_option_id and question_id = v_round.question_id)
    into v_valid;
  if not v_valid then raise exception 'OPTION_NOT_VALID_FOR_QUESTION'; end if;

  select correct_option_id into v_correct_option from public.question_keys where question_id = v_round.question_id;

  v_elapsed := greatest(0, floor(extract(epoch from (v_now - v_round.opened_at)) * 1000)::bigint);

  insert into public.answers (session_id, round_id, participant_id, selected_option_id, is_correct, answered_at, elapsed_ms, client_request_id)
  values (v_round.session_id, p_round_id, p_participant_id, p_option_id, (p_option_id = v_correct_option), v_now, v_elapsed, p_client_request_id)
  returning * into v_answer;

  -- O retorno inclui is_correct. A camada de API (src/actions/answer-actions.ts) NÃO o repassa ao participante.
  return v_answer;
end $$;

-- Gabarito só após a revelação, só para quem participa da sessão (ou apresenta).
create or replace function public.get_revealed_key(p_round_id uuid)
returns table (correct_option_id uuid, explanation text)
language plpgsql stable security definer set search_path = public as $$
declare v_round public.rounds;
begin
  select * into v_round from public.rounds where id = p_round_id;
  if not found then return; end if;
  if not (public.current_user_can_present(v_round.session_id) or
          (public.current_user_in_session(v_round.session_id) and v_round.status = 'revealed')) then
    return;
  end if;
  return query select k.correct_option_id, k.explanation from public.question_keys k where k.question_id = v_round.question_id;
end $$;

-- Ranking. Critérios: acertos desc; soma do tempo das corretas asc; respostas enviadas desc;
-- conclusão asc; entrada asc (o sorteio administrativo é manual, ver README).
create or replace view public.session_ranking with (security_invoker = true) as
select
  p.session_id, p.id as participant_id, p.full_name, p.department, p.unit_name,
  count(a.id) filter (where a.is_correct) as correct_answers,
  count(a.id) as submitted_answers,
  coalesce(sum(a.elapsed_ms) filter (where a.is_correct), 0) as correct_elapsed_ms,
  p.completed_at,
  row_number() over (
    partition by p.session_id
    order by count(a.id) filter (where a.is_correct) desc,
             coalesce(sum(a.elapsed_ms) filter (where a.is_correct), 0) asc,
             count(a.id) desc, p.completed_at asc nulls last, p.joined_at asc
  ) as ranking_position
from public.participants p
left join public.answers a on a.participant_id = p.id
where p.is_disqualified = false
group by p.session_id, p.id, p.full_name, p.department, p.unit_name, p.completed_at, p.joined_at;

-- Ranking para participantes: só quando o apresentador liberou (ou sessão encerrada).
create or replace function public.get_session_ranking(p_session_id uuid, p_limit int default 20)
returns table (ranking_position bigint, participant_id uuid, full_name text, department text,
               correct_answers bigint, correct_elapsed_ms numeric)
language plpgsql stable security definer set search_path = public as $$
declare v public.game_sessions;
begin
  select * into v from public.game_sessions where id = p_session_id;
  if not found then return; end if;
  if not (public.current_user_can_present(p_session_id)
          or (public.current_user_in_session(p_session_id) and (v.show_partial_ranking or v.status = 'finished'))) then
    return;
  end if;
  return query
    select r.ranking_position, r.participant_id, r.full_name, r.department, r.correct_answers, r.correct_elapsed_ms::numeric
    from public.session_ranking r where r.session_id = p_session_id order by r.ranking_position limit p_limit;
end $$;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_chapters enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.question_keys enable row level security;
alter table public.game_sessions enable row level security;
alter table public.session_presenters enable row level security;
alter table public.participants enable row level security;
alter table public.rounds enable row level security;
alter table public.answers enable row level security;
alter table public.session_events enable row level security;
alter table public.audit_events enable row level security;

create policy "own profile" on public.profiles for select to authenticated using (id = auth.uid() or public.current_user_is_admin());
create policy "admin manages profiles" on public.profiles for all to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());

create policy "read active quizzes" on public.quizzes for select to authenticated using (is_active or public.current_user_is_admin());
create policy "admin manages quizzes" on public.quizzes for all to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy "read chapters" on public.quiz_chapters for select to authenticated using (true);
create policy "admin manages chapters" on public.quiz_chapters for all to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());

-- AJUSTE: participante só lê pergunta/alternativas de rodadas já abertas na sua sessão (sem spoiler das próximas).
create policy "read questions of opened rounds" on public.questions for select to authenticated using (
  public.current_user_is_admin()
  or exists (select 1 from public.session_presenters sp join public.game_sessions gs on gs.id = sp.session_id
             where sp.user_id = auth.uid() and gs.quiz_id = questions.quiz_id)
  or exists (select 1 from public.rounds r where r.question_id = questions.id
             and r.status in ('open','closed','revealed') and public.current_user_in_session(r.session_id)));
create policy "admin manages questions" on public.questions for all to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());

create policy "read options of opened rounds" on public.question_options for select to authenticated using (
  exists (select 1 from public.questions q where q.id = question_options.question_id));  -- herda a RLS de questions
create policy "admin manages options" on public.question_options for all to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());

create policy "presenter reads keys" on public.question_keys for select to authenticated using (
  public.current_user_is_admin()
  or exists (select 1 from public.questions q join public.game_sessions gs on gs.quiz_id = q.quiz_id
             join public.session_presenters sp on sp.session_id = gs.id
             where q.id = question_keys.question_id and sp.user_id = auth.uid()));
create policy "admin manages keys" on public.question_keys for all to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());

-- Participantes localizam a sala pelo código via API server-side (service role); aqui só leem a sessão em que estão.
create policy "read own or presented sessions" on public.game_sessions for select to authenticated using (
  public.current_user_can_present(id) or public.current_user_in_session(id));
create policy "admin creates sessions" on public.game_sessions for insert to authenticated with check (public.current_user_is_admin());
create policy "presenter updates assigned sessions" on public.game_sessions for update to authenticated
  using (public.current_user_can_present(id)) with check (public.current_user_can_present(id));

create policy "read own assignments" on public.session_presenters for select to authenticated using (user_id = auth.uid() or public.current_user_is_admin());
create policy "admin manages assignments" on public.session_presenters for all to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());

-- Cadastro do participante é feito por server action (service role) após validação Zod; sem INSERT direto.
create policy "read own participant row" on public.participants for select to authenticated using (auth_user_id = auth.uid() or public.current_user_can_present(session_id));
create policy "presenter manages participants" on public.participants for update to authenticated
  using (public.current_user_can_present(session_id)) with check (public.current_user_can_present(session_id));

create policy "read rounds of own session" on public.rounds for select to authenticated using (
  public.current_user_can_present(session_id) or public.current_user_in_session(session_id));
create policy "presenter manages rounds" on public.rounds for all to authenticated
  using (public.current_user_can_present(session_id)) with check (public.current_user_can_present(session_id));

-- AJUSTE: durante a rodada o participante NÃO lê respostas, só as suas; is_correct nunca chega ao cliente (ver view abaixo).
create policy "presenter reads answers" on public.answers for select to authenticated using (public.current_user_can_present(session_id));

create policy "members read events" on public.session_events for select to authenticated using (
  public.current_user_can_present(session_id) or public.current_user_in_session(session_id));
create policy "presenters create events" on public.session_events for insert to authenticated with check (public.current_user_can_present(session_id));

create policy "admin or presenter reads audit" on public.audit_events for select to authenticated using (
  public.current_user_is_admin() or (session_id is not null and public.current_user_can_present(session_id)));
-- AJUSTE: removida a policy "with check (true)": auditoria é gravada só pelo servidor (service role).

-- Minha resposta SEM is_correct (o participante recupera o próprio envio ao reconectar).
create or replace view public.my_answers with (security_invoker = false) as
select a.id, a.round_id, a.participant_id, a.selected_option_id, a.elapsed_ms, a.answered_at
from public.answers a join public.participants p on p.id = a.participant_id
where p.auth_user_id = auth.uid();

-- Realtime: canal privado session:{id}. Participantes só RECEBEM broadcast e fazem Presence; só apresentador ENVIA broadcast.
create policy "members receive realtime" on realtime.messages for select to authenticated using (
  exists (select 1 from public.game_sessions gs where ('session:' || gs.id::text) = realtime.topic()
          and (public.current_user_can_present(gs.id) or public.current_user_in_session(gs.id))));
create policy "presenters send broadcast" on realtime.messages for insert to authenticated with check (
  realtime.messages.extension = 'broadcast' and exists (select 1 from public.game_sessions gs
    where ('session:' || gs.id::text) = realtime.topic() and public.current_user_can_present(gs.id)));
create policy "members track presence" on realtime.messages for insert to authenticated with check (
  realtime.messages.extension = 'presence' and exists (select 1 from public.game_sessions gs
    where ('session:' || gs.id::text) = realtime.topic()
      and (public.current_user_can_present(gs.id) or public.current_user_in_session(gs.id))));

revoke all on function public.submit_answer(uuid,uuid,uuid,uuid) from public, anon;
grant execute on function public.submit_answer(uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.get_revealed_key(uuid) to authenticated;
grant execute on function public.get_session_ranking(uuid,int) to authenticated;
grant select on public.session_ranking to authenticated;
grant select on public.my_answers to authenticated;
