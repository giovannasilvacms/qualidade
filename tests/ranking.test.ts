import { describe, expect, it } from 'vitest';
import { fullyTied, rank, type RankInput } from '../src/lib/ranking/rank';

const p = (id: string, o: Partial<RankInput> = {}): RankInput => ({
  participantId: id, correctAnswers: 0, correctElapsedMs: 0, submittedAnswers: 0,
  completedAt: null, joinedAt: '2026-11-12T10:00:00Z', ...o,
});

describe('regra do ranking', () => {
  it('prioriza acertos: velocidade não compensa erro', () => {
    const r = rank([p('rapido', { correctAnswers: 9, correctElapsedMs: 1_000 }), p('certeiro', { correctAnswers: 10, correctElapsedMs: 90_000 })]);
    expect(r.map((x) => x.participantId)).toEqual(['certeiro', 'rapido']);
  });
  it('com mesmos acertos, vence a menor soma de tempo das corretas', () => {
    const r = rank([p('a', { correctAnswers: 5, correctElapsedMs: 20_000 }), p('b', { correctAnswers: 5, correctElapsedMs: 15_000 })]);
    expect(r[0]?.participantId).toBe('b');
  });
  it('3º critério: mais respostas enviadas no prazo', () => {
    const base = { correctAnswers: 5, correctElapsedMs: 10_000 };
    const r = rank([p('a', { ...base, submittedAnswers: 6 }), p('b', { ...base, submittedAnswers: 8 })]);
    expect(r[0]?.participantId).toBe('b');
  });
  it('4º critério: conclusão mais cedo; quem não concluiu fica atrás', () => {
    const base = { correctAnswers: 5, correctElapsedMs: 10_000, submittedAnswers: 8 };
    const r = rank([p('a', { ...base, completedAt: null }), p('b', { ...base, completedAt: '2026-11-12T10:30:00Z' }), p('c', { ...base, completedAt: '2026-11-12T10:20:00Z' })]);
    expect(r.map((x) => x.participantId)).toEqual(['c', 'b', 'a']);
  });
  it('desclassificados saem do ranking', () => {
    expect(rank([p('a', { disqualified: true, correctAnswers: 15 }), p('b')]).map((x) => x.participantId)).toEqual(['b']);
  });
  it('detecta empate total para o sorteio administrativo', () => {
    const base = { correctAnswers: 5, correctElapsedMs: 10_000, submittedAnswers: 8, completedAt: '2026-11-12T10:20:00Z' };
    expect(fullyTied(p('a', base), p('b', base))).toBe(true);
    expect(fullyTied(p('a', base), p('b', { ...base, correctElapsedMs: 10_001 }))).toBe(false);
  });
});
