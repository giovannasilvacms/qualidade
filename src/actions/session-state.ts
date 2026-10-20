'use server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { createSupabaseServer } from '@/lib/supabase/server';
import { loadRanking, loadReveal, loadRoundView } from '@/services/session-service';
import type { PlayerStateResult, ScreenData, ScreenDataResult, ScreenState, SessionStatus } from '@/types/game';

interface SessionRow {
  id: string; quiz_id: string; session_code: string; title: string; status: SessionStatus;
  screen_state: ScreenState; state_version: number; registration_open: boolean; current_round_id: string | null; paused_at: string | null;
}
const SESSION_COLS = 'id,quiz_id,session_code,title,status,screen_state,state_version,registration_open,current_round_id,paused_at';
const normalize = (c: string) => c.trim().toUpperCase();

async function findSessionByCode(code: string) {
  const { data } = await createSupabaseAdmin().from('game_sessions').select('id,quiz_id').eq('session_code', normalize(code)).maybeSingle();
  return data as { id: string; quiz_id: string } | null;
}

async function counts(sessionId: string, quizId: string) {
  const admin = createSupabaseAdmin();
  const [p, q] = await Promise.all([
    admin.from('participants').select('id', { count: 'exact', head: true }).eq('session_id', sessionId).eq('is_disqualified', false),
    admin.from('questions').select('id', { count: 'exact', head: true }).eq('quiz_id', quizId).eq('is_active', true),
  ]);
  return { registeredCount: p.count ?? 0, totalRounds: q.count ?? 0 };
}

/** Estado completo da sessão para o celular. Roda com a identidade do participante: a RLS é a barreira. */
export async function getPlayerState(code: string): Promise<PlayerStateResult> {
  const supabase = createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { kind: 'no_auth' };
  const found = await findSessionByCode(code);
  if (!found) return { kind: 'no_session' };

  const { data: me } = await supabase.from('participants').select('id,full_name,is_disqualified')
    .eq('session_id', found.id).eq('auth_user_id', auth.user.id).maybeSingle();
  if (!me || me.is_disqualified) return { kind: 'not_member' };

  const { data: s } = await supabase.from('game_sessions').select(SESSION_COLS).eq('id', found.id).maybeSingle();
  const session = s as unknown as SessionRow | null;
  if (!session) return { kind: 'not_member' };

  const { data: r } = session.current_round_id
    ? await supabase.from('rounds').select('id,question_id,round_number,status,opened_at,closes_at').eq('id', session.current_round_id).maybeSingle()
    : { data: null };
  const round = r ? await loadRoundView(supabase, r as never) : null;

  let myAnswer = null;
  let reveal = null;
  if (round) {
    const { data: a } = await supabase.from('my_answers').select('selected_option_id,elapsed_ms').eq('round_id', round.id).maybeSingle();
    if (a) myAnswer = { optionId: a.selected_option_id as string, elapsedMs: Number(a.elapsed_ms) };
    if (round.status === 'revealed') reveal = await loadReveal(supabase, round.id);
  }
  const ranking = await loadRanking(supabase, session.id);
  const { registeredCount, totalRounds } = await counts(session.id, found.quiz_id);

  return {
    kind: 'ok', version: Number(session.state_version), sessionId: session.id, code: session.session_code, title: session.title,
    status: session.status, screenState: session.screen_state, registrationOpen: session.registration_open,
    registeredCount, totalRounds, round, ranking: ranking ? ranking.slice(0, 10) : null, pausedAt: session.paused_at,
    participant: { id: me.id as string, fullName: me.full_name as string }, myAnswer, reveal,
    myPosition: ranking?.find((x) => x.participantId === me.id)?.position ?? null,
  };
}

/** Estado completo da sessão para o telão. Exige login de apresentador/admin: a RLS devolve a sessão só a quem apresenta. */
export async function getScreenData(code: string): Promise<ScreenDataResult> {
  const supabase = createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { kind: 'no_auth' };
  const found = await findSessionByCode(code);
  if (!found) return { kind: 'no_session' };

  const { data: s } = await supabase.from('game_sessions').select(SESSION_COLS).eq('id', found.id).maybeSingle();
  const session = s as unknown as SessionRow | null;
  const { data: can } = await supabase.rpc('current_user_can_present', { target_session_id: found.id });
  if (!session || can !== true) return { kind: 'forbidden' };

  const { data: r } = session.current_round_id
    ? await supabase.from('rounds').select('id,question_id,round_number,status,opened_at,closes_at').eq('id', session.current_round_id).maybeSingle()
    : { data: null };
  const round = r ? await loadRoundView(supabase, r as never) : null;
  const { registeredCount, totalRounds } = await counts(session.id, found.quiz_id);

  let answersReceived = 0;
  let reveal: ScreenData['reveal'] = null;
  if (round) {
    const { data: answers } = await supabase.from('answers').select('selected_option_id,is_correct').eq('round_id', round.id);
    const list = (answers ?? []) as { selected_option_id: string; is_correct: boolean }[];
    answersReceived = list.length;
    // Resultado só vai ao telão depois que o apresentador revela: antes disso a distribuição não sai do servidor.
    if (round.status === 'revealed') {
      const key = await loadReveal(supabase, round.id);
      if (key) {
        const distribution: Record<string, number> = {};
        list.forEach((a) => { distribution[a.selected_option_id] = (distribution[a.selected_option_id] ?? 0) + 1; });
        const correct = list.filter((a) => a.is_correct).length;
        reveal = { ...key, distribution, correct, wrong: list.length - correct, unanswered: Math.max(0, registeredCount - list.length) };
      }
    }
  }

  const showRanking = ['ranking', 'podium', 'finished'].includes(session.screen_state);
  const ranking = showRanking ? await loadRanking(supabase, session.id, 10) : null;

  // Pré-carregamento: imagem da próxima pergunta (só o telão/apresentador pode saber qual é).
  let nextImage: string | null = null;
  const { data: nextRound } = await supabase.from('rounds').select('question_id,round_number').eq('session_id', session.id)
    .eq('status', 'pending').order('round_number').limit(1).maybeSingle();
  if (nextRound) {
    const { data: nq } = await supabase.from('questions').select('image_url').eq('id', nextRound.question_id as string).maybeSingle();
    nextImage = (nq?.image_url as string | null) ?? null;
  }

  const { data: names } = await supabase.from('participants').select('full_name').eq('session_id', session.id)
    .eq('is_disqualified', false).order('joined_at', { ascending: false }).limit(12);
  const recentNames = ((names ?? []) as { full_name: string }[]).map((n) => n.full_name);

  return {
    kind: 'ok', version: Number(session.state_version), sessionId: session.id, code: session.session_code, title: session.title,
    status: session.status, screenState: session.screen_state, registrationOpen: session.registration_open,
    registeredCount, totalRounds, round, ranking, pausedAt: session.paused_at, answersReceived, reveal, nextImage, recentNames,
  };
}
