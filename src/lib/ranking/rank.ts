/** Regra oficial do ranking (espelha a view public.session_ranking). Acerto sempre vale mais que velocidade. */
export interface RankInput {
  participantId: string;
  correctAnswers: number;
  correctElapsedMs: number;   // soma do tempo só das respostas corretas
  submittedAnswers: number;
  completedAt: string | null; // ISO
  joinedAt: string;           // ISO
  disqualified?: boolean;
}
export interface Ranked extends RankInput { position: number }

const t = (iso: string | null) => (iso === null ? Number.POSITIVE_INFINITY : Date.parse(iso));

export function compareRank(a: RankInput, b: RankInput): number {
  return (
    b.correctAnswers - a.correctAnswers ||        // 1. mais acertos
    a.correctElapsedMs - b.correctElapsedMs ||    // 2. menor soma de tempo das corretas
    b.submittedAnswers - a.submittedAnswers ||    // 3. mais respostas dentro do prazo
    t(a.completedAt) - t(b.completedAt) ||        // 4. conclusão mais cedo
    t(a.joinedAt) - t(b.joinedAt)                 // desempate técnico final (o sorteio administrativo é manual)
  );
}

export function rank(inputs: RankInput[]): Ranked[] {
  return inputs
    .filter((p) => !p.disqualified)
    .sort(compareRank)
    .map((p, i) => ({ ...p, position: i + 1 }));
}

/** Empatados em TODOS os critérios 1-4 (candidatos ao sorteio administrativo). */
export function fullyTied(a: RankInput, b: RankInput): boolean {
  return (
    a.correctAnswers === b.correctAnswers && a.correctElapsedMs === b.correctElapsedMs &&
    a.submittedAnswers === b.submittedAnswers && t(a.completedAt) === t(b.completedAt)
  );
}
