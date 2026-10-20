'use server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { submitAnswerSchema } from '@/lib/validation/participant';

export type AnswerResult =
  | { ok: true; elapsedMs: number; optionId: string }
  | { ok: false; code: 'EXPIRED' | 'ALREADY' | 'NOT_OPEN' | 'FORBIDDEN' | 'INVALID' | 'ERROR' };

const MAP: Record<string, Exclude<AnswerResult, { ok: true }>['code']> = {
  ANSWER_TIME_EXPIRED: 'EXPIRED', ANSWER_ALREADY_SUBMITTED: 'ALREADY', ROUND_NOT_OPEN: 'NOT_OPEN', SESSION_NOT_LIVE: 'NOT_OPEN',
  FORBIDDEN: 'FORBIDDEN', PARTICIPANT_DISQUALIFIED: 'FORBIDDEN', PARTICIPANT_NOT_IN_SESSION: 'FORBIDDEN', OPTION_NOT_VALID_FOR_QUESTION: 'INVALID',
};

/** Envia a resposta. Devolve só o tempo oficial e a opção: o `is_correct` que vem do banco é descartado aqui de propósito. */
export async function submitAnswer(raw: unknown): Promise<AnswerResult> {
  const parsed = submitAnswerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: 'INVALID' };
  const { roundId, optionId, clientRequestId } = parsed.data;

  const supabase = createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, code: 'FORBIDDEN' };

  // A rodada só é visível (RLS) a quem está na sessão; daí sai a sessão e, dela, o participante deste usuário.
  const { data: round } = await supabase.from('rounds').select('session_id').eq('id', roundId).maybeSingle();
  if (!round) return { ok: false, code: 'FORBIDDEN' };
  const { data: me } = await supabase.from('participants').select('id').eq('session_id', round.session_id as string).eq('auth_user_id', auth.user.id).maybeSingle();
  if (!me) return { ok: false, code: 'FORBIDDEN' };

  const { data, error } = await supabase.rpc('submit_answer', {
    p_round_id: roundId, p_participant_id: me.id, p_option_id: optionId, p_client_request_id: clientRequestId,
  });
  if (error) {
    const known = Object.keys(MAP).find((k) => error.message.includes(k));
    if (!known) console.error('[answer] erro inesperado', error.code);
    return { ok: false, code: known ? MAP[known]! : 'ERROR' };
  }
  const row = data as { selected_option_id: string; elapsed_ms: number | string };
  return { ok: true, elapsedMs: Number(row.elapsed_ms), optionId: row.selected_option_id };
}
