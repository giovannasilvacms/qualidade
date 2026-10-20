'use server';
import { z } from 'zod';
import { ERROR_TEXT } from '@/lib/presenter/state-machine';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { createSupabaseServer } from '@/lib/supabase/server';
import { loadQuestion } from '@/services/session-service';
import type { ParticipantAnswerRow, PresenterDataResult, PresenterParticipant, PresenterQuestion, RoundStatus, ScreenState, SessionStatus } from '@/types/game';
import { loadRoundView } from '@/services/session-service';

const ACTIONS = [
  'open_registration', 'close_registration', 'start_game', 'next_question', 'start_countdown', 'open_question', 'close_question', 'reveal_answer',
  'show_explanation', 'show_ranking', 'hide_ranking', 'pause', 'resume', 'skip_question', 'restart_round', 'show_podium', 'finish_game',
  'reset_ranking', 'remove_participant', 'disqualify_participant', 'release_participant',
] as const;

const actionSchema = z.object({
  sessionId: z.string().uuid(),
  action: z.enum(ACTIONS),
  participantId: z.string().uuid().optional(),
  reason: z.string().trim().max(300).optional(),
});

export type ActionResult = { ok: true; version: number } | { ok: false; error: string };

/** Toda ação do painel passa por aqui e por public.presenter_action: o banco valida, grava, versiona e emite o evento Realtime. */
export async function runPresenterAction(raw: unknown): Promise<ActionResult> {
  const parsed = actionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Ação inválida.' };
  const { sessionId, action, participantId, reason } = parsed.data;
  const supabase = createSupabaseServer();
  const { data, error } = await supabase.rpc('presenter_action', { p_session_id: sessionId, p_action: action, p_params: { participantId, reason } });
  if (error) {
    const code = Object.keys(ERROR_TEXT).find((k) => error.message.includes(k));
    if (!code) console.error('[presenter] erro inesperado', action, error.code);
    return { ok: false, error: code ? ERROR_TEXT[code]! : 'Não foi possível executar a ação. Tente de novo.' };
  }
  return { ok: true, version: Number((data as { version: number }).version) };
}

export async function closeIfExpired(roundId: string): Promise<boolean> {
  if (!z.string().uuid().safeParse(roundId).success) return false;
  const { data, error } = await createSupabaseServer().rpc('close_if_expired', { p_round_id: roundId });
  return !error && data === true;
}

const editSchema = z.object({
  roundId: z.string().uuid(), statement: z.string().trim().min(5).max(300), durationSeconds: z.number().int().min(5).max(180),
  explanation: z.string().trim().max(300), correctOptionId: z.string().uuid(),
});
export async function editUpcomingQuestion(raw: unknown): Promise<{ ok: boolean; error?: string }> {
  const p = editSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: ERROR_TEXT.INVALID_INPUT };
  const { error } = await createSupabaseServer().rpc('presenter_edit_question', {
    p_round_id: p.data.roundId, p_statement: p.data.statement, p_duration: p.data.durationSeconds, p_explanation: p.data.explanation, p_correct_option_id: p.data.correctOptionId,
  });
  if (error) { const code = Object.keys(ERROR_TEXT).find((k) => error.message.includes(k)); return { ok: false, error: code ? ERROR_TEXT[code] : 'Não foi possível salvar.' }; }
  return { ok: true };
}

export async function createSession(title?: string): Promise<{ ok: true; id: string; code: string } | { ok: false; error: string }> {
  const { data, error } = await createSupabaseServer().rpc('create_session', { p_title: title?.trim() || null });
  if (error) return { ok: false, error: error.message.includes('FORBIDDEN') ? 'Só administradores criam sessões.' : 'Não foi possível criar a sessão.' };
  const r = data as { id: string; code: string };
  return { ok: true, id: r.id, code: r.code };
}

interface SessionRow { id: string; quiz_id: string; session_code: string; title: string; status: SessionStatus; screen_state: ScreenState; state_version: number; registration_open: boolean; show_partial_ranking: boolean; current_round_id: string | null; paused_at: string | null }
interface RoundRow { id: string; question_id: string; round_number: number; status: RoundStatus; opened_at: string | null; closes_at: string | null }

/** Estado completo para o painel. Único lugar que entrega gabarito, e só a quem apresenta (RLS + checagem explícita). */
export async function getPresenterData(sessionId: string): Promise<PresenterDataResult> {
  if (!z.string().uuid().safeParse(sessionId).success) return { kind: 'no_session' };
  const supabase = createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || auth.user.is_anonymous) return { kind: 'no_auth' };

  const { data: s } = await supabase.from('game_sessions')
    .select('id,quiz_id,session_code,title,status,screen_state,state_version,registration_open,show_partial_ranking,current_round_id,paused_at').eq('id', sessionId).maybeSingle();
  const session = s as unknown as SessionRow | null;
  if (!session) return { kind: 'no_session' };
  const { data: can } = await supabase.rpc('current_user_can_present', { target_session_id: sessionId });
  if (can !== true) return { kind: 'forbidden' };

  const { data: rs } = await supabase.from('rounds').select('id,question_id,round_number,status,opened_at,closes_at').eq('session_id', sessionId).order('round_number');
  const rounds = (rs ?? []) as unknown as RoundRow[];
  const cur = rounds.find((r) => r.id === session.current_round_id) ?? null;
  const pendingRounds = rounds.length ? rounds.filter((r) => r.status === 'pending').length : 0;

  const admin = createSupabaseAdmin(); // só contagem de perguntas do quiz
  const { count: totalRounds } = await admin.from('questions').select('id', { count: 'exact', head: true }).eq('quiz_id', session.quiz_id).eq('is_active', true);

  // Próxima a ser liberada: a atual, se ainda não abriu; senão a próxima pendente; antes de iniciar, a 1ª do quiz.
  let upcomingRound: { roundId: string; questionId: string; roundNumber: number } | null = null;
  if (cur && (cur.status === 'pending' || cur.status === 'countdown')) upcomingRound = { roundId: cur.id, questionId: cur.question_id, roundNumber: cur.round_number };
  else {
    const next = rounds.find((r) => r.status === 'pending' && r.id !== cur?.id);
    if (next) upcomingRound = { roundId: next.id, questionId: next.question_id, roundNumber: next.round_number };
    else if (rounds.length === 0) {
      const { data: q1 } = await supabase.from('questions').select('id,question_order').eq('quiz_id', session.quiz_id).eq('is_active', true).order('question_order').limit(1).maybeSingle();
      if (q1) upcomingRound = { roundId: '', questionId: q1.id as string, roundNumber: 1 };
    }
  }

  const ids = [cur?.question_id, upcomingRound?.questionId].filter((x): x is string => !!x);
  const { data: keys } = ids.length ? await supabase.from('question_keys').select('question_id,correct_option_id,explanation').in('question_id', ids) : { data: [] };
  const keyOf = new Map(((keys ?? []) as { question_id: string; correct_option_id: string; explanation: string | null }[]).map((k) => [k.question_id, k]));
  const withKey = async (questionId: string | undefined, roundId: string, roundNumber: number): Promise<PresenterQuestion | null> => {
    if (!questionId) return null;
    const q = await loadQuestion(supabase, questionId);
    const k = keyOf.get(questionId);
    return q && { ...q, roundId, roundNumber, correctOptionId: k?.correct_option_id ?? null, explanation: k?.explanation ?? null };
  };
  const [current, upcoming] = await Promise.all([
    withKey(cur?.question_id, cur?.id ?? '', cur?.round_number ?? 0),
    withKey(upcomingRound?.questionId, upcomingRound?.roundId ?? '', upcomingRound?.roundNumber ?? 0),
  ]);

  const { data: ps } = await supabase.from('participants')
    .select('id,full_name,email,employee_number,department,unit_name,joined_at,is_disqualified,disqualification_reason,reconnect_released').eq('session_id', sessionId).order('full_name');
  const { data: ans } = cur ? await supabase.from('answers').select('participant_id').eq('round_id', cur.id) : { data: [] };
  const answered = new Set(((ans ?? []) as { participant_id: string }[]).map((a) => a.participant_id));
  const participants: PresenterParticipant[] = ((ps ?? []) as Record<string, unknown>[]).map((p) => ({
    id: p.id as string, fullName: p.full_name as string, email: p.email as string, employeeNumber: p.employee_number as string | null,
    department: p.department as string | null, unitName: p.unit_name as string | null, joinedAt: p.joined_at as string,
    isDisqualified: p.is_disqualified as boolean, disqualificationReason: p.disqualification_reason as string | null,
    reconnectReleased: p.reconnect_released as boolean, answeredCurrent: answered.has(p.id as string),
  }));

  return {
    kind: 'ok', version: Number(session.state_version), sessionId: session.id, code: session.session_code, title: session.title, status: session.status,
    screenState: session.screen_state, registrationOpen: session.registration_open, registeredCount: participants.filter((p) => !p.isDisqualified).length,
    totalRounds: totalRounds ?? 0, round: cur ? await loadRoundView(supabase, cur) : null, ranking: null, pausedAt: session.paused_at,
    showPartialRanking: session.show_partial_ranking, answersReceived: answered.size, pendingRounds: rounds.length ? pendingRounds : (totalRounds ?? 0),
    upcoming, current, participants,
  };
}

export async function getParticipantAnswers(sessionId: string, participantId: string): Promise<ParticipantAnswerRow[]> {
  if (!z.string().uuid().safeParse(sessionId).success || !z.string().uuid().safeParse(participantId).success) return [];
  const supabase = createSupabaseServer();
  const { data: can } = await supabase.rpc('current_user_can_present', { target_session_id: sessionId });
  if (can !== true) return [];
  const { data: rs } = await supabase.from('rounds').select('id,question_id,round_number,status').eq('session_id', sessionId).order('round_number');
  const rounds = (rs ?? []) as { id: string; question_id: string; round_number: number; status: RoundStatus }[];
  const { data: as } = await supabase.from('answers').select('round_id,selected_option_id,is_correct,elapsed_ms,answered_at').eq('participant_id', participantId);
  const answers = new Map(((as ?? []) as { round_id: string; selected_option_id: string; is_correct: boolean; elapsed_ms: number | string; answered_at: string }[]).map((a) => [a.round_id, a]));
  const qids = rounds.map((r) => r.question_id);
  const [{ data: qs }, { data: os }, { data: ks }] = await Promise.all([
    supabase.from('questions').select('id,statement').in('id', qids),
    supabase.from('question_options').select('id,question_id,option_key,option_text').in('question_id', qids),
    supabase.from('question_keys').select('question_id,correct_option_id').in('question_id', qids),
  ]);
  const stmt = new Map(((qs ?? []) as { id: string; statement: string }[]).map((q) => [q.id, q.statement]));
  const opt = new Map(((os ?? []) as { id: string; option_key: string; option_text: string }[]).map((o) => [o.id, `${o.option_key}. ${o.option_text}`]));
  const key = new Map(((ks ?? []) as { question_id: string; correct_option_id: string }[]).map((k) => [k.question_id, k.correct_option_id]));
  return rounds.filter((r) => r.status !== 'pending').map((r) => {
    const a = answers.get(r.id);
    const correctId = key.get(r.question_id);
    return {
      roundNumber: r.round_number, statement: stmt.get(r.question_id) ?? '', skipped: r.status === 'skipped',
      selected: a ? opt.get(a.selected_option_id) ?? null : null, correct: correctId ? opt.get(correctId) ?? null : null,
      isCorrect: a ? a.is_correct : null, elapsedMs: a ? Number(a.elapsed_ms) : null, answeredAt: a?.answered_at ?? null,
    };
  });
}
