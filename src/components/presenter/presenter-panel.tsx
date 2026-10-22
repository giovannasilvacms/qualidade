'use client';
import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { getPresenterData, runPresenterAction } from '@/actions/presenter-actions';
import { ConnectionBadge } from '@/components/shared/connection-badge';
import { useRemainingMs } from '@/components/shared/round-timer';
import { useAutoClose } from '@/hooks/use-auto-close';
import { useServerClock } from '@/hooks/use-server-clock';
import { useSessionSync } from '@/hooks/use-session-sync';
import { ACTION_LABEL, CONFIRM_TEXT, CRITICAL, canRun, type MachineContext, type PresenterActionName } from '@/lib/presenter/state-machine';
import { APP_URL } from '@/lib/env';
import type { PresenterData, SessionStatus } from '@/types/game';
import { ConfirmModal } from './modal';
import { ParticipantsPanel } from './participants-panel';
import { PreviewFrame } from './preview-frame';
import { UpcomingQuestion } from './upcoming-question';

const STATUS_LABEL: Record<SessionStatus, string> = {
  draft: 'Rascunho', registration_open: 'Inscrições abertas', registration_closed: 'Inscrições fechadas', countdown: 'Contagem', live: 'Em andamento', paused: 'Pausado', finished: 'Encerrado', cancelled: 'Cancelado',
};
const SCREEN_LABEL: Record<string, string> = {
  lobby: 'Sala de espera', countdown: 'Contagem regressiva', question: 'Pergunta aberta', question_closed: 'Pergunta encerrada', answer_revealed: 'Resposta revelada',
  explanation: 'Explicação', ranking: 'Ranking', break: 'Intervalo', podium: 'Pódio', finished: 'Encerrado',
};
const GROUPS: { title: string; actions: PresenterActionName[] }[] = [
  { title: 'Sala', actions: ['open_registration', 'close_registration', 'start_game'] },
  { title: 'Pergunta', actions: ['next_question', 'start_countdown', 'open_question', 'close_question', 'reveal_answer', 'show_explanation', 'skip_question'] },
  { title: 'Ranking e final', actions: ['show_ranking', 'hide_ranking', 'show_podium', 'finish_game'] },
  { title: 'Jogo', actions: ['pause', 'resume', 'restart_round', 'reset_ranking'] },
];

function suggested(c: MachineContext): PresenterActionName | null {
  if (c.status === 'draft') return 'open_registration';
  if (c.status === 'registration_open' || c.status === 'registration_closed') return 'start_game';
  if (c.status === 'paused') return 'resume';
  if (c.status !== 'live') return null;
  switch (c.roundStatus) {
    case 'pending': return 'start_countdown';
    case 'countdown': return 'open_question';
    case 'open': return 'close_question';
    case 'closed': return 'reveal_answer';
    case 'revealed': case 'skipped': case null: return c.pendingRounds > 0 ? 'next_question' : 'show_podium';
  }
}

const mmss = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function PresenterPanel({ sessionId }: { sessionId: string }) {
  const fetcher = useCallback(() => getPresenterData(sessionId), [sessionId]);
  const [presenceKey] = useState(() => crypto.randomUUID());
  const { data, conn, onlineIds, refetch, reconnect } = useSessionSync({ fetcher, role: 'presenter', presenceKey });

  if (!data) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Loader2 aria-label="Carregando" className="size-10 animate-spin text-brand" />
      </div>
    );
  }

  if (data.kind !== 'ok') {
    switch (data.kind) {
      case 'no_auth':
        return <Msg text="Faça login como apresentador." href="/apresentador" label="Entrar" />;
      case 'forbidden':
        return <Msg text="Sua conta não tem acesso a esta sessão." href="/apresentador/sessoes" label="Voltar" />;
      case 'no_session':
        return <Msg text="Sessão não encontrada." href="/apresentador/sessoes" label="Voltar" />;
    }
  }

  return <Panel d={data} sessionId={sessionId} conn={conn} onlineIds={onlineIds} refetch={refetch} reconnect={reconnect} />;
}

function Msg({ text, href, label }: { text: string; href: string; label: string }) {
  return <main className="grid min-h-dvh place-items-center p-6 text-center"><div><p className="text-xl font-bold">{text}</p><a href={href} className="btn-primary mt-4">{label}</a></div></main>;
}

interface PanelProps { d: PresenterData; sessionId: string; conn: 'connecting' | 'online' | 'offline'; onlineIds: string[]; refetch: () => Promise<void>; reconnect: () => void }

function Panel({ d, sessionId, conn, onlineIds, refetch, reconnect }: PanelProps) {
  const { now } = useServerClock();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ action: PresenterActionName; extra: { participantId?: string } } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [clock, setClock] = useState('');
  useEffect(() => { const t = () => setClock(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })); t(); const id = setInterval(t, 1000); return () => clearInterval(id); }, []);

  const round = d.round;
  const remaining = useRemainingMs(round?.status === 'open' ? round.closesAt : null, now, d.status === 'paused' ? d.pausedAt : null);
  useAutoClose(round?.id ?? null, round?.status === 'open' && d.status === 'live', remaining);

  const ctx: MachineContext = { status: d.status, screenState: d.screenState, roundStatus: round?.status ?? null, pendingRounds: d.pendingRounds };
  const next = suggested(ctx);
  const online = onlineIds.length;
  const registered = d.registeredCount;
  const pct = registered ? Math.round((d.answersReceived / registered) * 100) : 0;

  async function run(action: PresenterActionName, extra: { participantId?: string; reason?: string } = {}) {
    if (busy) return; // anti clique duplo
    setBusy(true); setError(null);
    const r = await runPresenterAction({ sessionId, action, ...extra });
    if (!r.ok) setError(r.error);
    await refetch();
    setBusy(false);
  }
  function request(action: PresenterActionName, extra: { participantId?: string } = {}) {
    if (CRITICAL.has(action)) setConfirm({ action, extra }); else void run(action, extra);
  }
  async function copy(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000); } catch { setError('Não foi possível copiar. Copie o endereço manualmente.'); }
  }

  const screenUrl = `${APP_URL}/apresentacao/${d.code}`;
  const joinUrl = `${APP_URL}/entrar?sala=${d.code}`;
  const metric = (label: string, value: React.ReactNode, hint?: string) => (
    <div className="rounded-xl bg-mist/60 p-3"><p className="text-xs font-bold uppercase tracking-widest text-slate">{label}</p><p className="text-2xl font-black text-navy">{value}</p>{hint && <p className="text-xs text-slate">{hint}</p>}</div>
  );
  const canEditUpcoming = !!d.upcoming && d.upcoming.roundId !== '' && !(round?.id === d.upcoming.roundId && round.status === 'countdown');
  const cfg = confirm ? CONFIRM_TEXT[confirm.action] : undefined;

  return (
    <div className="mx-auto max-w-7xl p-4">
      <header className="card flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-accent">Controle remoto</p>
          <h1 className="text-2xl font-black leading-tight">{d.title}</h1>
          <p className="text-slate">Sala <b className="tracking-widest text-brand">{d.code}</b> · <b>{STATUS_LABEL[d.status]}</b> · {clock}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConnectionBadge state={conn} />
          {conn === 'offline' && <button type="button" className="btn border-2 border-mist px-3 py-1.5 text-sm" onClick={reconnect}>Reconectar</button>}
          <button type="button" className="btn border-2 border-mist px-3 py-2 text-sm" onClick={() => void copy(screenUrl, 'tela')}>{copied === 'tela' ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}Link do telão</button>
          <button type="button" className="btn border-2 border-mist px-3 py-2 text-sm" onClick={() => void copy(joinUrl, 'join')}>{copied === 'join' ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}Link dos participantes</button>
          <a href={`/apresentacao/${d.code}`} target="_blank" rel="noreferrer" className="btn-primary px-3 py-2 text-sm"><ExternalLink aria-hidden className="size-4" />Abrir telão</a>
        </div>
      </header>

      {d.status === 'paused' && <p role="status" className="mt-3 rounded-xl bg-accent p-3 text-center font-black text-navy">JOGO PAUSADO — o cronômetro está congelado</p>}
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 font-semibold text-red-700">{error}</p>}

      <section aria-label="Monitoramento" className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {metric('Cadastrados', registered)}
        {metric('Online', online)}
        {metric('Desconectados', Math.max(0, registered - online))}
        {metric('Respostas', `${d.answersReceived}/${registered}`, `${pct}%`)}
        {metric('Tempo restante', round?.status === 'open' ? mmss(remaining) : '—')}
        {metric('Pergunta', `${round && round.roundNumber > 0 ? round.roundNumber : 0}/${d.totalRounds}`)}
        {metric('Estado do telão', <span className="text-base">{SCREEN_LABEL[d.screenState] ?? d.screenState}</span>)}
        {metric('Ranking parcial', d.showPartialRanking ? 'Visível' : 'Oculto')}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section aria-label="Controles" className="card flex flex-col gap-4 p-4">
          <div className="flex items-baseline justify-between"><h2 className="title-caps text-lg text-brand">Controles</h2>{busy && <Loader2 aria-label="Executando" className="size-5 animate-spin text-brand" />}</div>
          {GROUPS.map((g) => (
            <div key={g.title}>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-slate">{g.title}</p>
              <div className="flex flex-wrap gap-2">
                {g.actions.map((a) => {
                  const ok = canRun(a, ctx);
                  const isNext = a === next && ok;
                  const danger = CRITICAL.has(a);
                  return (
                    <button key={a} type="button" disabled={!ok || busy} onClick={() => request(a)} aria-label={ACTION_LABEL[a]}
                      title={!ok ? 'Indisponível no estado atual' : undefined}
                      className={`btn min-h-12 px-4 py-2 text-sm ${isNext ? 'bg-accent text-navy ring-4 ring-accent/40' : danger ? 'border-2 border-red-200 text-red-700' : 'border-2 border-mist bg-white text-navy hover:bg-mist/50'}`}>
                      {ACTION_LABEL[a]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="text-xs text-slate">O botão em laranja é o próximo passo sugerido. Ações críticas pedem confirmação.</p>
        </section>

        <section aria-label="Pré-visualização" className="card p-4">
          <h2 className="title-caps mb-3 text-lg text-brand">O que o telão está mostrando</h2>
          <PreviewFrame code={d.code} />
        </section>

        <section aria-label="Próxima pergunta" className="card p-4">
          <h2 className="title-caps mb-3 text-lg text-brand">Próxima pergunta (só no painel)</h2>
          <UpcomingQuestion key={d.upcoming?.roundId + (d.upcoming?.statement ?? '')} q={d.upcoming} canEdit={canEditUpcoming} onSaved={() => void refetch()} />
        </section>

        <section aria-label="Participantes" className="card p-4">
          <h2 className="title-caps mb-3 text-lg text-brand">Participantes ({d.participants.length})</h2>
          <ParticipantsPanel sessionId={sessionId} participants={d.participants} onlineIds={onlineIds} busy={busy}
            onRun={(a, extra) => run(a, extra)} onRequest={(a, extra) => request(a, extra)} />
        </section>
      </div>

      {confirm && cfg && (
        <ConfirmModal title={cfg.title} text={cfg.text} confirmLabel={cfg.confirm} busy={busy} onClose={() => setConfirm(null)}
          onConfirm={() => { const c = confirm; setConfirm(null); void run(c.action, c.extra); }} />
      )}
    </div>
  );
}
