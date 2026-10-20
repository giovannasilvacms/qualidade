export type SessionStatus = 'draft' | 'registration_open' | 'registration_closed' | 'countdown' | 'live' | 'paused' | 'finished' | 'cancelled';
export type RoundStatus = 'pending' | 'countdown' | 'open' | 'closed' | 'revealed' | 'skipped';
export type ScreenState = 'lobby' | 'countdown' | 'question' | 'question_closed' | 'answer_revealed' | 'explanation' | 'ranking' | 'break' | 'podium' | 'finished';

export const EVENT_TYPES = [
  'SESSION_OPENED', 'REGISTRATION_CLOSED', 'GAME_STARTED', 'COUNTDOWN_STARTED', 'QUESTION_OPENED', 'QUESTION_CLOSED',
  'ANSWER_REVEALED', 'EXPLANATION_SHOWN', 'RANKING_SHOWN', 'RANKING_HIDDEN', 'GAME_PAUSED', 'GAME_RESUMED',
  'QUESTION_SKIPPED', 'NEXT_QUESTION', 'PODIUM_SHOWN', 'GAME_FINISHED', 'SCREEN_STATE_CHANGED', 'PARTICIPANT_REMOVED',
] as const;
export type GameEventType = (typeof EVENT_TYPES)[number];

/** Envelope de todo evento Broadcast. O estado oficial vive no Postgres; o evento só avisa (ver README). */
export interface GameEvent<P = Record<string, unknown>> {
  sessionId: string;
  eventId: string;
  eventType: GameEventType;
  serverTimestamp: string;
  version: number;
  payload: P;
  actorId: string | null;
}

// ---------- Visões públicas (nunca contêm is_correct fora da revelação) ----------
export interface PublicOption { id: string; option_key: string; option_text: string; image_url: string | null; option_order: number }
export interface PublicQuestion {
  id: string; statement: string; image_url: string | null; question_type: 'multiple_choice' | 'true_false' | 'image_choice';
  duration_seconds: number; sourceSlide: number | null; chapter: { number: number; title: string } | null; options: PublicOption[];
}
export interface PublicRound { id: string; roundNumber: number; status: RoundStatus; openedAt: string | null; closesAt: string | null; question: PublicQuestion | null }
export interface RankingRow { position: number; participantId: string; fullName: string; department: string | null; correctAnswers: number; correctElapsedMs: number }

interface BaseState {
  kind: 'ok'; version: number; sessionId: string; code: string; title: string; status: SessionStatus; screenState: ScreenState;
  registrationOpen: boolean; registeredCount: number; totalRounds: number; round: PublicRound | null; ranking: RankingRow[] | null;
  pausedAt: string | null;
}
export interface PlayerState extends BaseState {
  participant: { id: string; fullName: string };
  myAnswer: { optionId: string; elapsedMs: number } | null;
  reveal: { correctOptionId: string; explanation: string | null } | null;
  myPosition: number | null;
}
export type PlayerStateResult = PlayerState | { kind: 'no_auth' | 'no_session' | 'not_member' };

export interface ScreenData extends BaseState {
  answersReceived: number;
  reveal: { correctOptionId: string; explanation: string | null; distribution: Record<string, number>; correct: number; wrong: number; unanswered: number } | null;
  nextImage: string | null;
  recentNames: string[];
}
export type ScreenDataResult = ScreenData | { kind: 'no_auth' | 'no_session' | 'forbidden' };

// ---------- Painel do apresentador (o gabarito aparece AQUI e só aqui) ----------
export interface PresenterQuestion extends PublicQuestion { correctOptionId: string | null; explanation: string | null; roundId: string; roundNumber: number }
export interface PresenterParticipant {
  id: string; fullName: string; email: string; employeeNumber: string | null; department: string | null; unitName: string | null;
  joinedAt: string; isDisqualified: boolean; disqualificationReason: string | null; answeredCurrent: boolean; reconnectReleased: boolean;
}
export interface PresenterData extends BaseState {
  showPartialRanking: boolean; answersReceived: number; pendingRounds: number;
  upcoming: PresenterQuestion | null; current: PresenterQuestion | null; participants: PresenterParticipant[];
}
export type PresenterDataResult = PresenterData | { kind: 'no_auth' | 'no_session' | 'forbidden' };
export interface ParticipantAnswerRow { roundNumber: number; statement: string; selected: string | null; correct: string | null; isCorrect: boolean | null; elapsedMs: number | null; answeredAt: string | null; skipped: boolean }
