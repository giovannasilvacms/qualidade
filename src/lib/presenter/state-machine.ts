import type { RoundStatus, SessionStatus } from '@/types/game';

/** Espelho EXATO das transições de public.presenter_action (SQL). O banco é quem decide; isto só habilita/desabilita botões. */
export type PresenterActionName =
  | 'open_registration' | 'close_registration' | 'start_game' | 'next_question' | 'start_countdown' | 'open_question'
  | 'close_question' | 'reveal_answer' | 'show_explanation' | 'show_ranking' | 'hide_ranking' | 'pause' | 'resume'
  | 'skip_question' | 'restart_round' | 'show_podium' | 'finish_game' | 'reset_ranking'
  | 'remove_participant' | 'disqualify_participant' | 'release_participant';

export interface MachineContext {
  status: SessionStatus;
  screenState: string;
  roundStatus: RoundStatus | null;
  pendingRounds: number;
}

const IN = <T,>(v: T, list: readonly T[]) => list.includes(v);

export function canRun(a: PresenterActionName, c: MachineContext): boolean {
  const live = c.status === 'live';
  const r = c.roundStatus;
  switch (a) {
    case 'open_registration': return IN(c.status, ['draft', 'registration_closed']);
    case 'close_registration': return c.status === 'registration_open';
    case 'start_game': return IN(c.status, ['draft', 'registration_open', 'registration_closed']);
    case 'next_question': return live && (r === null || IN(r, ['revealed', 'skipped'])) && c.pendingRounds > 0;
    case 'start_countdown': return live && r === 'pending';
    case 'open_question': return live && r !== null && IN(r, ['pending', 'countdown']);
    case 'close_question': return live && r === 'open';
    case 'reveal_answer': return live && r === 'closed';
    case 'show_explanation': return live && r === 'revealed';
    case 'show_ranking': return live && (r === null || IN(r, ['pending', 'revealed', 'skipped'])) && c.screenState !== 'ranking';
    case 'hide_ranking': return live && c.screenState === 'ranking';
    case 'pause': return live;
    case 'resume': return c.status === 'paused';
    case 'skip_question': return live && r !== null && IN(r, ['pending', 'countdown', 'open', 'closed']);
    case 'restart_round': return live && r !== null && IN(r, ['open', 'closed', 'revealed']);
    case 'show_podium': return live && (r === null || IN(r, ['pending', 'revealed', 'skipped']));
    case 'finish_game': return IN(c.status, ['live', 'paused']);
    case 'reset_ranking': return IN(c.status, ['live', 'paused', 'finished']);
    default: return true; // ações sobre participantes valem em qualquer estado
  }
}

export const CRITICAL: ReadonlySet<PresenterActionName> = new Set<PresenterActionName>([
  'finish_game', 'skip_question', 'remove_participant', 'restart_round', 'reset_ranking', 'disqualify_participant',
]);

export const CONFIRM_TEXT: Partial<Record<PresenterActionName, { title: string; text: string; confirm: string }>> = {
  finish_game: { title: 'Encerrar o jogo?', text: 'O ranking final é fechado e o telão mostra a mensagem final. Não dá para reabrir perguntas.', confirm: 'Encerrar jogo' },
  skip_question: { title: 'Pular esta pergunta?', text: 'A pergunta sai do ranking, inclusive as respostas já enviadas.', confirm: 'Pular pergunta' },
  restart_round: { title: 'Reiniciar a rodada?', text: 'As respostas desta pergunta serão apagadas e ela volta a ficar pendente.', confirm: 'Reiniciar rodada' },
  reset_ranking: { title: 'Zerar o ranking?', text: 'Apaga TODAS as respostas da sessão e volta para a primeira pergunta. Os participantes continuam cadastrados.', confirm: 'Zerar ranking' },
  remove_participant: { title: 'Remover cadastro?', text: 'O cadastro e as respostas deste participante são apagados.', confirm: 'Remover' },
};

export const ACTION_LABEL: Partial<Record<PresenterActionName, string>> = {
  open_registration: 'Abrir inscrições', close_registration: 'Fechar inscrições', start_game: 'Iniciar jogo',
  start_countdown: 'Iniciar contagem regressiva', open_question: 'Liberar pergunta', close_question: 'Encerrar pergunta',
  reveal_answer: 'Revelar resposta', show_explanation: 'Mostrar explicação', show_ranking: 'Mostrar ranking',
  hide_ranking: 'Ocultar ranking', next_question: 'Próxima pergunta', pause: 'Pausar', resume: 'Retomar',
  skip_question: 'Pular pergunta', finish_game: 'Encerrar jogo', show_podium: 'Mostrar pódio',
  restart_round: 'Reiniciar rodada', reset_ranking: 'Zerar ranking',
};

export const ERROR_TEXT: Record<string, string> = {
  FORBIDDEN: 'Você não tem permissão nesta sessão.',
  INVALID_TRANSITION: 'Essa ação não está disponível no estado atual. A tela foi atualizada.',
  NO_MORE_QUESTIONS: 'Não há mais perguntas pendentes. Mostre o pódio ou encerre o jogo.',
  NO_QUESTIONS: 'O quiz desta sessão não tem perguntas ativas.',
  REASON_REQUIRED: 'Informe a justificativa da desclassificação.',
  PARTICIPANT_NOT_FOUND: 'Participante não encontrado.',
  ROUND_ALREADY_RELEASED: 'A pergunta já foi liberada e não pode mais ser editada.',
  INVALID_INPUT: 'Dados inválidos. Confira enunciado, tempo (5 a 180 s) e explicação (até 300 caracteres).',
};
