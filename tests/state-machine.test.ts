import { describe, expect, it } from 'vitest';
import { canRun, type MachineContext, type PresenterActionName } from '../src/lib/presenter/state-machine';

const ctx = (o: Partial<MachineContext> = {}): MachineContext => ({ status: 'live', screenState: 'lobby', roundStatus: 'pending', pendingRounds: 5, ...o });
const allowed = (c: MachineContext): PresenterActionName[] =>
  (['open_registration', 'close_registration', 'start_game', 'next_question', 'start_countdown', 'open_question', 'close_question', 'reveal_answer', 'show_explanation',
    'show_ranking', 'hide_ranking', 'pause', 'resume', 'skip_question', 'restart_round', 'show_podium', 'finish_game', 'reset_ranking'] as const).filter((a) => canRun(a, c));

describe('máquina de estados do apresentador', () => {
  it('fluxo normal de uma pergunta', () => {
    expect(allowed(ctx({ roundStatus: 'pending' }))).toContain('start_countdown');
    expect(canRun('open_question', ctx({ roundStatus: 'countdown' }))).toBe(true);
    expect(canRun('close_question', ctx({ roundStatus: 'open' }))).toBe(true);
    expect(canRun('reveal_answer', ctx({ roundStatus: 'closed' }))).toBe(true);
    expect(canRun('show_explanation', ctx({ roundStatus: 'revealed' }))).toBe(true);
    expect(canRun('next_question', ctx({ roundStatus: 'revealed' }))).toBe(true);
  });
  it('não revela nem mostra ranking com a pergunta aberta', () => {
    const open = ctx({ roundStatus: 'open' });
    expect(canRun('reveal_answer', open)).toBe(false);
    expect(canRun('show_ranking', open)).toBe(false);
    expect(canRun('show_podium', open)).toBe(false);
    expect(canRun('next_question', open)).toBe(false);
  });
  it('não avança sem perguntas pendentes', () => {
    expect(canRun('next_question', ctx({ roundStatus: 'revealed', pendingRounds: 0 }))).toBe(false);
    expect(canRun('show_podium', ctx({ roundStatus: 'revealed', pendingRounds: 0 }))).toBe(true);
  });
  it('pausado: só retomar, encerrar ou zerar', () => {
    expect(allowed(ctx({ status: 'paused', roundStatus: 'open' })).sort()).toEqual(['finish_game', 'reset_ranking', 'resume']);
  });
  it('encerrado: nada além de zerar', () => {
    expect(allowed(ctx({ status: 'finished', roundStatus: 'closed' }))).toEqual(['reset_ranking']);
  });
  it('inscrições e início', () => {
    expect(allowed(ctx({ status: 'draft', roundStatus: null })).sort()).toEqual(['open_registration', 'start_game']);
    expect(allowed(ctx({ status: 'registration_open', roundStatus: null })).sort()).toEqual(['close_registration', 'start_game']);
  });
  it('reiniciar rodada só depois de aberta', () => {
    expect(canRun('restart_round', ctx({ roundStatus: 'pending' }))).toBe(false);
    expect(canRun('restart_round', ctx({ roundStatus: 'revealed' }))).toBe(true);
  });
});
