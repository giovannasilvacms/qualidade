import type { SupabaseClient } from '@supabase/supabase-js';
import type { PublicQuestion, PublicRound, RankingRow, RoundStatus } from '@/types/game';

interface RoundRow { id: string; question_id: string; round_number: number; status: RoundStatus; opened_at: string | null; closes_at: string | null }
interface QuestionRow {
  id: string; statement: string; image_url: string | null; question_type: PublicQuestion['question_type']; duration_seconds: number;
  source_slide: number | null;
  quiz_chapters: { chapter_number: number; title: string } | null;
  question_options: PublicQuestion['options'];
}

/** Pergunta com alternativas (sem gabarito). A RLS do cliente decide se ela já pode ser vista. */
export async function loadQuestion(client: SupabaseClient, questionId: string): Promise<PublicQuestion | null> {
  const { data } = await client
    .from('questions')
    .select('id,statement,image_url,question_type,duration_seconds,source_slide,quiz_chapters(chapter_number,title),question_options(id,option_key,option_text,image_url,option_order)')
    .eq('id', questionId)
    .maybeSingle();
  const q = data as unknown as QuestionRow | null;
  if (!q) return null;
  return {
    id: q.id, statement: q.statement, image_url: q.image_url, question_type: q.question_type, duration_seconds: q.duration_seconds,
    sourceSlide: q.source_slide,
    chapter: q.quiz_chapters ? { number: q.quiz_chapters.chapter_number, title: q.quiz_chapters.title } : null,
    options: [...q.question_options].sort((a, b) => a.option_order - b.option_order),
  };
}

export async function loadRoundView(client: SupabaseClient, round: RoundRow): Promise<PublicRound> {
  return {
    id: round.id, roundNumber: round.round_number, status: round.status, openedAt: round.opened_at, closesAt: round.closes_at,
    question: await loadQuestion(client, round.question_id),
  };
}

interface RankRpcRow { ranking_position: number | string; participant_id: string; full_name: string; department: string | null; correct_answers: number | string; correct_elapsed_ms: number | string }

/** Ranking via RPC: o próprio Postgres decide se o chamador pode ver (apresentador, ou participante com ranking liberado). */
export async function loadRanking(client: SupabaseClient, sessionId: string, limit = 200): Promise<RankingRow[] | null> {
  const { data, error } = await client.rpc('get_session_ranking', { p_session_id: sessionId, p_limit: limit });
  if (error || !data || (data as RankRpcRow[]).length === 0) return null;
  return (data as RankRpcRow[]).map((r) => ({
    position: Number(r.ranking_position), participantId: r.participant_id, fullName: r.full_name, department: r.department,
    correctAnswers: Number(r.correct_answers), correctElapsedMs: Number(r.correct_elapsed_ms),
  }));
}

export async function loadReveal(client: SupabaseClient, roundId: string) {
  const { data } = await client.rpc('get_revealed_key', { p_round_id: roundId });
  const row = (data as { correct_option_id: string; explanation: string | null }[] | null)?.[0];
  return row ? { correctOptionId: row.correct_option_id, explanation: row.explanation } : null;
}
