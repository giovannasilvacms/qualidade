-- Etapas 6 e 7: transições de estado do jogo no banco.
-- Contrato: cada ação (1) valida permissão e transição, (2) grava o estado oficial, (3) incrementa game_sessions.state_version,
-- (4) registra session_events + audit_events e (5) emite o Broadcast, tudo na MESMA transação. O evento só avisa; quem manda é o banco.

alter table public.game_sessions add column if not exists paused_at timestamptz;
alter table public.participants add column if not exists reconnect_released boolean not null default false;

-- Perguntas puladas não contam no ranking.
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
left join (
  select x.* from public.answers x join public.rounds r on r.id = x.round_id where r.status <> 'skipped'
) a on a.participant_id = p.id
where p.is_disqualified = false
group by p.session_id, p.id, p.full_name, p.department, p.unit_name, p.completed_at, p.joined_at;

-- Núcleo: atualiza sessão, versiona, persiste evento + auditoria e emite o Broadcast. Não é chamável pelo cliente.
create or replace function public._bump_and_emit(
  p_session_id uuid, p_event text, p_payload jsonb default '{}'::jsonb,
  p_screen text default null, p_status public.session_status default null, p_audit jsonb default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v bigint; actor uuid := auth.uid();
begin
  update public.game_sessions
     set screen_state = coalesce(p_screen, screen_state), status = coalesce(p_status, status), state_version = state_version + 1
   where id = p_session_id returning state_version into v;
  insert into public.session_events (session_id, event_type, state_version, actor_id, payload)
  values (p_session_id, p_event, v, actor, p_payload);
  insert into public.audit_events (session_id, actor_id, actor_type, event_type, entity_type, entity_id, metadata)
  values (p_session_id, actor, (select role from public.profiles where id = actor), p_event, 'session', p_session_id, coalesce(p_audit, p_payload));
  perform realtime.send(
    jsonb_build_object('sessionId', p_session_id, 'eventId', gen_random_uuid(), 'eventType', p_event,
                       'serverTimestamp', now(), 'version', v, 'payload', p_payload, 'actorId', actor),
    'game_event', 'session:' || p_session_id::text, true);
  return v;
end $$;
revoke all on function public._bump_and_emit(uuid, text, jsonb, text, public.session_status, jsonb) from public, anon, authenticated;

create or replace function public._finalize_participants(p_session_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.participants p set completed_at = (select max(a.answered_at) from public.answers a where a.participant_id = p.id)
  where p.session_id = p_session_id and p.completed_at is null;
$$;
revoke all on function public._finalize_participants(uuid) from public, anon, authenticated;

create or replace function public.presenter_action(p_session_id uuid, p_action text, p_params jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.game_sessions; rid uuid; rstat public.round_status; nid uuid; v bigint;
  t timestamptz; dur int; delta interval; pid uuid; reason text; closes timestamptz;
begin
  if auth.uid() is null or not public.current_user_can_present(p_session_id) then raise exception 'FORBIDDEN'; end if;
  select * into s from public.game_sessions where id = p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  rid := s.current_round_id;
  if rid is not null then select status into rstat from public.rounds where id = rid for update; end if;

  case p_action
  when 'open_registration' then
    if s.status not in ('draft','registration_closed') then raise exception 'INVALID_TRANSITION'; end if;
    update public.game_sessions set registration_open = true where id = s.id;
    v := public._bump_and_emit(s.id, 'SESSION_OPENED', '{}'::jsonb, 'lobby', 'registration_open');

  when 'close_registration' then
    if s.status <> 'registration_open' then raise exception 'INVALID_TRANSITION'; end if;
    update public.game_sessions set registration_open = false where id = s.id;
    v := public._bump_and_emit(s.id, 'REGISTRATION_CLOSED', '{}'::jsonb, null, 'registration_closed');

  when 'start_game' then
    if s.status not in ('draft','registration_open','registration_closed') then raise exception 'INVALID_TRANSITION'; end if;
    if not exists (select 1 from public.rounds where session_id = s.id) then
      insert into public.rounds (session_id, question_id, round_number)
      select s.id, q.id, row_number() over (order by q.question_order) from public.questions q
      where q.quiz_id = s.quiz_id and q.is_active;
    end if;
    select id into nid from public.rounds where session_id = s.id and status = 'pending' order by round_number limit 1;
    if nid is null then raise exception 'NO_QUESTIONS'; end if;
    update public.game_sessions set registration_open = false, current_round_id = nid, started_at = coalesce(started_at, now()) where id = s.id;
    v := public._bump_and_emit(s.id, 'GAME_STARTED', jsonb_build_object('roundId', nid), 'lobby', 'live');

  when 'next_question' then
    if s.status <> 'live' or not (rstat is null or rstat in ('revealed','skipped')) then raise exception 'INVALID_TRANSITION'; end if;
    select id into nid from public.rounds where session_id = s.id and status = 'pending' order by round_number limit 1;
    if nid is null then raise exception 'NO_MORE_QUESTIONS'; end if;
    update public.game_sessions set current_round_id = nid, show_partial_ranking = false where id = s.id;
    v := public._bump_and_emit(s.id, 'NEXT_QUESTION', jsonb_build_object('roundId', nid), 'break');

  when 'start_countdown' then
    if s.status <> 'live' or rstat is distinct from 'pending' then raise exception 'INVALID_TRANSITION'; end if;
    update public.rounds set status = 'countdown', countdown_started_at = clock_timestamp(), state_version = state_version + 1 where id = rid;
    v := public._bump_and_emit(s.id, 'COUNTDOWN_STARTED', jsonb_build_object('roundId', rid), 'countdown');

  when 'open_question' then
    if s.status <> 'live' or rstat is null or rstat not in ('pending','countdown') then raise exception 'INVALID_TRANSITION'; end if;
    select q.duration_seconds into dur from public.rounds ro join public.questions q on q.id = ro.question_id where ro.id = rid;
    t := clock_timestamp(); closes := t + make_interval(secs => dur);
    update public.rounds set status = 'open', opened_at = t, closes_at = closes, state_version = state_version + 1 where id = rid;
    v := public._bump_and_emit(s.id, 'QUESTION_OPENED', jsonb_build_object('roundId', rid, 'openedAt', t, 'closesAt', closes), 'question');

  when 'close_question' then
    if s.status <> 'live' or rstat is distinct from 'open' then raise exception 'INVALID_TRANSITION'; end if;
    update public.rounds set status = 'closed', closed_at = clock_timestamp(), state_version = state_version + 1 where id = rid;
    v := public._bump_and_emit(s.id, 'QUESTION_CLOSED', jsonb_build_object('roundId', rid), 'question_closed');

  when 'reveal_answer' then
    if s.status <> 'live' or rstat is distinct from 'closed' then raise exception 'INVALID_TRANSITION'; end if;
    update public.rounds set status = 'revealed', revealed_at = clock_timestamp(), state_version = state_version + 1 where id = rid;
    v := public._bump_and_emit(s.id, 'ANSWER_REVEALED', jsonb_build_object('roundId', rid), 'answer_revealed');

  when 'show_explanation' then
    if s.status <> 'live' or rstat is distinct from 'revealed' then raise exception 'INVALID_TRANSITION'; end if;
    v := public._bump_and_emit(s.id, 'EXPLANATION_SHOWN', jsonb_build_object('roundId', rid), 'explanation');

  when 'show_ranking' then
    if s.status <> 'live' or not (rstat is null or rstat in ('pending','revealed','skipped')) then raise exception 'INVALID_TRANSITION'; end if;
    update public.game_sessions set show_partial_ranking = true where id = s.id;
    v := public._bump_and_emit(s.id, 'RANKING_SHOWN', '{}'::jsonb, 'ranking');

  when 'hide_ranking' then
    if s.status <> 'live' or s.screen_state <> 'ranking' then raise exception 'INVALID_TRANSITION'; end if;
    update public.game_sessions set show_partial_ranking = false where id = s.id;
    v := public._bump_and_emit(s.id, 'RANKING_HIDDEN', '{}'::jsonb, case when rstat = 'revealed' then 'answer_revealed' else 'break' end);

  when 'pause' then
    if s.status <> 'live' then raise exception 'INVALID_TRANSITION'; end if;
    update public.game_sessions set paused_at = clock_timestamp() where id = s.id;
    v := public._bump_and_emit(s.id, 'GAME_PAUSED', '{}'::jsonb, null, 'paused');

  when 'resume' then
    if s.status <> 'paused' then raise exception 'INVALID_TRANSITION'; end if;
    -- Pausa não custa tempo a ninguém: opened_at e closes_at avançam o tempo parado, então elapsed_ms continua justo.
    delta := clock_timestamp() - coalesce(s.paused_at, clock_timestamp());
    if rstat = 'open' then
      update public.rounds set opened_at = opened_at + delta, closes_at = closes_at + delta, state_version = state_version + 1 where id = rid;
    end if;
    update public.game_sessions set paused_at = null where id = s.id;
    v := public._bump_and_emit(s.id, 'GAME_RESUMED', jsonb_build_object('roundId', rid), null, 'live');

  when 'skip_question' then
    if s.status <> 'live' or rstat is null or rstat not in ('pending','countdown','open','closed') then raise exception 'INVALID_TRANSITION'; end if;
    update public.rounds set status = 'skipped', state_version = state_version + 1 where id = rid;
    v := public._bump_and_emit(s.id, 'QUESTION_SKIPPED', jsonb_build_object('roundId', rid), 'break');

  when 'restart_round' then
    if s.status <> 'live' or rstat is null or rstat not in ('open','closed','revealed') then raise exception 'INVALID_TRANSITION'; end if;
    delete from public.answers where round_id = rid;
    update public.rounds set status = 'pending', countdown_started_at = null, opened_at = null, closes_at = null, closed_at = null,
           revealed_at = null, state_version = state_version + 1 where id = rid;
    v := public._bump_and_emit(s.id, 'SCREEN_STATE_CHANGED', jsonb_build_object('roundId', rid, 'reason', 'round_restarted'), 'break');

  when 'show_podium' then
    if s.status <> 'live' or not (rstat is null or rstat in ('pending','revealed','skipped')) then raise exception 'INVALID_TRANSITION'; end if;
    perform public._finalize_participants(s.id);
    update public.game_sessions set show_partial_ranking = true where id = s.id;
    v := public._bump_and_emit(s.id, 'PODIUM_SHOWN', '{}'::jsonb, 'podium');

  when 'finish_game' then
    if s.status not in ('live','paused') then raise exception 'INVALID_TRANSITION'; end if;
    update public.rounds set status = 'closed', closed_at = clock_timestamp() where id = rid and status = 'open';
    perform public._finalize_participants(s.id);
    update public.game_sessions set finished_at = now(), paused_at = null, show_partial_ranking = true where id = s.id;
    v := public._bump_and_emit(s.id, 'GAME_FINISHED', '{}'::jsonb, 'finished', 'finished');

  when 'reset_ranking' then
    if s.status not in ('live','paused','finished') then raise exception 'INVALID_TRANSITION'; end if;
    delete from public.answers where session_id = s.id;
    update public.participants set completed_at = null where session_id = s.id;
    update public.rounds set status = 'pending', countdown_started_at = null, opened_at = null, closes_at = null, closed_at = null,
           revealed_at = null, state_version = state_version + 1 where session_id = s.id;
    select id into nid from public.rounds where session_id = s.id order by round_number limit 1;
    update public.game_sessions set current_round_id = nid, show_partial_ranking = false, paused_at = null, finished_at = null where id = s.id;
    v := public._bump_and_emit(s.id, 'SCREEN_STATE_CHANGED', jsonb_build_object('reason', 'ranking_reset'), 'lobby', 'live');

  when 'remove_participant', 'disqualify_participant' then
    pid := (p_params->>'participantId')::uuid;
    reason := nullif(btrim(coalesce(p_params->>'reason', '')), '');
    if p_action = 'disqualify_participant' then
      if reason is null or char_length(reason) < 3 then raise exception 'REASON_REQUIRED'; end if;
      update public.participants set is_disqualified = true, disqualification_reason = reason where id = pid and session_id = s.id;
    else
      delete from public.participants where id = pid and session_id = s.id;
    end if;
    if not found then raise exception 'PARTICIPANT_NOT_FOUND'; end if;
    v := public._bump_and_emit(s.id, 'PARTICIPANT_REMOVED',
           jsonb_build_object('participantId', pid, 'disqualified', p_action = 'disqualify_participant'), null, null,
           jsonb_build_object('participantId', pid, 'action', p_action, 'reason', reason));

  when 'release_participant' then
    pid := (p_params->>'participantId')::uuid;
    update public.participants set reconnect_released = true where id = pid and session_id = s.id and not is_disqualified;
    if not found then raise exception 'PARTICIPANT_NOT_FOUND'; end if;
    insert into public.audit_events (session_id, actor_id, actor_type, event_type, entity_type, entity_id, metadata)
    values (s.id, auth.uid(), (select role from public.profiles where id = auth.uid()), 'PARTICIPANT_RECONNECT_RELEASED', 'participant', pid, '{}'::jsonb);
    v := s.state_version;

  else
    raise exception 'UNKNOWN_ACTION';
  end case;

  return jsonb_build_object('version', v);
end $$;
revoke all on function public.presenter_action(uuid, text, jsonb) from public, anon;
grant execute on function public.presenter_action(uuid, text, jsonb) to authenticated;

-- Fecha a rodada quando o prazo acaba, sem depender de o apresentador estar online. Idempotente; telão e painel chamam ao zerar o cronômetro.
create or replace function public.close_if_expired(p_round_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare sid uuid; ro public.rounds; ss public.game_sessions;
begin
  select session_id into sid from public.rounds where id = p_round_id;
  if sid is null then return false; end if;
  if auth.uid() is null or not (public.current_user_can_present(sid) or public.current_user_in_session(sid)) then raise exception 'FORBIDDEN'; end if;
  select * into ss from public.game_sessions where id = sid for update;   -- mesma ordem de locks de presenter_action
  select * into ro from public.rounds where id = p_round_id for update;
  if ro.status <> 'open' or ss.status <> 'live' or ro.closes_at is null or clock_timestamp() < ro.closes_at then return false; end if;
  update public.rounds set status = 'closed', closed_at = clock_timestamp(), state_version = state_version + 1 where id = ro.id;
  perform public._bump_and_emit(sid, 'QUESTION_CLOSED', jsonb_build_object('roundId', ro.id, 'auto', true), 'question_closed');
  return true;
end $$;
revoke all on function public.close_if_expired(uuid) from public, anon;
grant execute on function public.close_if_expired(uuid) to authenticated;

-- Edição da pergunta ANTES de ser liberada. Atenção: altera a pergunta do quiz (vale para sessões futuras também); fica na auditoria.
create or replace function public.presenter_edit_question(
  p_round_id uuid, p_statement text, p_duration int, p_explanation text, p_correct_option_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ro public.rounds; s public.game_sessions;
begin
  select * into ro from public.rounds where id = p_round_id;
  if not found then raise exception 'ROUND_NOT_FOUND'; end if;
  if not public.current_user_can_present(ro.session_id) then raise exception 'FORBIDDEN'; end if;
  select * into s from public.game_sessions where id = ro.session_id for update;
  if ro.status <> 'pending' then raise exception 'ROUND_ALREADY_RELEASED'; end if;
  if char_length(btrim(p_statement)) < 5 or p_duration not between 5 and 180 or char_length(coalesce(p_explanation, '')) > 300 then raise exception 'INVALID_INPUT'; end if;
  if not exists (select 1 from public.question_options where id = p_correct_option_id and question_id = ro.question_id) then raise exception 'INVALID_INPUT'; end if;
  update public.questions set statement = btrim(p_statement), duration_seconds = p_duration where id = ro.question_id;
  update public.question_keys set correct_option_id = p_correct_option_id, explanation = nullif(btrim(coalesce(p_explanation, '')), '') where question_id = ro.question_id;
  insert into public.audit_events (session_id, actor_id, actor_type, event_type, entity_type, entity_id, metadata)
  values (s.id, auth.uid(), (select role from public.profiles where id = auth.uid()), 'QUESTION_EDITED', 'question', ro.question_id,
          jsonb_build_object('roundId', ro.id, 'duration', p_duration));
end $$;
revoke all on function public.presenter_edit_question(uuid, text, int, text, uuid) from public, anon;
grant execute on function public.presenter_edit_question(uuid, text, int, text, uuid) to authenticated;

-- Criação de sessão (admin). Código de 6 caracteres sem 0/O/1/I.
create or replace function public.create_session(p_quiz_id uuid default null, p_title text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare q public.quizzes; c text; sid uuid;
begin
  if not public.current_user_is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into q from public.quizzes where (p_quiz_id is null or id = p_quiz_id) and is_active order by created_at limit 1;
  if not found then raise exception 'QUIZ_NOT_FOUND'; end if;
  loop
    c := (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from public.game_sessions where session_code = c);
  end loop;
  insert into public.game_sessions (quiz_id, session_code, title, status, screen_state, created_by)
  values (q.id, c, coalesce(nullif(btrim(p_title), ''), q.title || ' — ' || to_char(now(), 'DD/MM/YYYY HH24:MI')), 'draft', 'lobby', auth.uid())
  returning id into sid;
  insert into public.audit_events (session_id, actor_id, actor_type, event_type, entity_type, entity_id)
  values (sid, auth.uid(), 'admin', 'SESSION_CREATED', 'session', sid);
  return jsonb_build_object('id', sid, 'code', c);
end $$;
revoke all on function public.create_session(uuid, text) from public, anon;
grant execute on function public.create_session(uuid, text) to authenticated;
