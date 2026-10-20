'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, Smartphone, Trophy } from 'lucide-react';
import { reconnectSession } from '@/actions/join-actions';
import { submitAnswer } from '@/actions/answer-actions';
import { getPlayerState } from '@/actions/session-state';
import { ConnectionBadge } from '@/components/shared/connection-badge';
import { QuestionImage } from '@/components/shared/question-image';
import { RoundTimer, useRemainingMs } from '@/components/shared/round-timer';
import { PRESENTATION_ASSETS } from '@/data/presentation-assets';
import { usePreloadImages } from '@/hooks/use-preload-images';
import { useServerClock } from '@/hooks/use-server-clock';
import { useSessionSync } from '@/hooks/use-session-sync';
import type { PlayerState } from '@/types/game';
import { OptionButton, type OptionVisual } from './option-button';

const ALL_IMAGES = Object.values(PRESENTATION_ASSETS).map((a) => a.path);
const fmt = (ms: number) => `${(ms / 1000).toFixed(2).replace('.', ',')} s`;

export function PlayerGame({ code }: { code: string }) {
  const router = useRouter();
  const fetcher = useCallback(() => getPlayerState(code), [code]);
  const [presenceKey] = useState(() => crypto.randomUUID());
  const { data, failed, conn, online, refetch, reconnect } = useSessionSync({
    fetcher, role: 'participant', presenceKey, participantId: (r) => (r.kind === 'ok' ? (r as PlayerState).participant.id : undefined),
  });

  // Identidade perdida (cookies limpos): tenta reassumir pelo token; sem token, volta ao cadastro.
  useEffect(() => {
    if (!data || data.kind === 'ok' || data.kind === 'no_session') return;
    void reconnectSession(code).then((r) => (r.ok ? refetch() : router.replace(`/entrar?sala=${code}`)));
  }, [data, code, refetch, router]);

  usePreloadImages(ALL_IMAGES);

  if (!data) return <Centered><Loader2 className="size-8 animate-spin text-brand" aria-label="Carregando" />{failed && <p className="mt-3 text-sm text-slate">Sem conexão. Tentando de novo…</p>}</Centered>;
  if (data.kind === 'no_session') return <Centered><p className="text-lg font-bold">Sala não encontrada.</p><a className="btn-primary mt-4" href="/entrar">Voltar</a></Centered>;
  if (data.kind !== 'ok') return <Centered><Loader2 className="size-8 animate-spin text-brand" aria-label="Reconectando" /><p className="mt-3 text-sm text-slate">Reconectando à sala…</p></Centered>;
  return <PlayerView s={data} conn={conn} online={online} failed={failed} refetch={refetch} reconnect={reconnect} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="grid min-h-dvh place-items-center p-6 text-center"><div className="flex flex-col items-center">{children}</div></main>;
}

interface ViewProps { s: PlayerState; conn: 'connecting' | 'online' | 'offline'; online: number; failed: boolean; refetch: () => Promise<void>; reconnect: () => void }

function PlayerView({ s, conn, online, refetch, reconnect }: ViewProps) {
  const { now } = useServerClock();
  const round = s.round;
  const q = round?.question ?? null;
  const remaining = useRemainingMs(round?.status === 'open' ? round.closesAt : null, now, s.status === 'paused' ? s.pausedAt : null);
  const requestId = useRef<{ round: string; id: string } | null>(null);
  const busy = useRef(false);
  const [local, setLocal] = useState<{ roundId: string; optionId: string; elapsedMs: number } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Rodada nova OU reaberta (reinício/pausa mudam opened_at): zera o estado local; a verdade vem do banco em s.myAnswer.
  useEffect(() => { busy.current = false; setPending(null); setMessage(null); setLocal(null); }, [round?.id, round?.openedAt]);

  const answer = s.myAnswer ?? (local && local.roundId === round?.id ? local : null);
  const finished = s.status === 'finished' || s.screenState === 'podium' || s.screenState === 'finished';
  const timeUp = round?.status === 'open' && remaining <= 0;
  const locked = s.status === 'paused';

  async function choose(optionId: string) {
    if (!round || busy.current || answer || timeUp || locked) return;
    busy.current = true; // bloqueia clique duplo
    setPending(optionId); setMessage(null);
    const id = requestId.current?.round === round.id ? requestId.current.id : crypto.randomUUID();
    requestId.current = { round: round.id, id };
    const r = await submitAnswer({ roundId: round.id, optionId, clientRequestId: id });
    if (r.ok) { setLocal({ roundId: round.id, optionId: r.optionId, elapsedMs: r.elapsedMs }); setPending(null); return; }
    if (r.code === 'EXPIRED' || r.code === 'NOT_OPEN') { setMessage('Tempo encerrado'); setPending(null); void refetch(); return; }
    if (r.code === 'ALREADY') { setPending(null); void refetch(); return; }
    busy.current = false; setPending(null); setMessage('Não foi possível enviar. Toque na alternativa de novo.');
  }

  const header = (
    <header className="flex items-center justify-between gap-2 bg-navy px-4 py-3 text-white">
      <div className="min-w-0">
        <p className="truncate text-xs font-bold uppercase tracking-widest text-accent">{q?.chapter ? `Capítulo ${q.chapter.number}` : 'Desafio da Qualidade'}</p>
        <p className="truncate text-sm font-semibold">{round && round.roundNumber > 0 ? `Pergunta ${round.roundNumber} de ${s.totalRounds}` : s.title}</p>
      </div>
      <ConnectionBadge state={conn} dark compact />
    </header>
  );
  const progress = round && s.totalRounds ? (round.roundNumber / s.totalRounds) * 100 : 0;

  let body: React.ReactNode;
  if (finished) {
    body = <FinalView s={s} />;
  } else if (!round || s.screenState === 'lobby' || round.status === 'pending') {
    body = <Lobby s={s} conn={conn} online={online} reconnect={() => { reconnect(); void refetch(); }} />;
  } else if (round.status === 'countdown' || s.screenState === 'countdown') {
    body = <Notice title="Prepare-se!" text="A próxima pergunta vai começar." />;
  } else if (round.status === 'skipped') {
    body = <Notice title="Pergunta pulada" text="Aguarde a próxima." />;
  } else if (s.screenState === 'ranking' && s.ranking) {
    body = <RankingList s={s} />;
  } else if (q) {
    const open = round.status === 'open';
    const revealed = round.status === 'revealed' && s.reveal;
    const visualOf = (id: string): OptionVisual => {
      if (revealed) return id === s.reveal!.correctOptionId ? 'correct' : answer?.optionId === id ? 'wrong' : 'dim';
      if (answer?.optionId === id || pending === id) return 'selected';
      return answer || timeUp || !open ? 'dim' : 'idle';
    };
    body = (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4">
        {q.image_url && <QuestionImage src={q.image_url} alt="" priority className="aspect-[16/10]" />}
        <h1 className="text-xl font-black leading-snug">{q.statement}</h1>
        {open && !answer && !timeUp && <RoundTimer remainingMs={remaining} durationSeconds={q.duration_seconds} />}
        <div className="flex flex-col gap-3" role="group" aria-label="Alternativas">
          {q.options.map((o) => <OptionButton key={o.id} option={o} visual={visualOf(o.id)} disabled={!open || !!answer || timeUp || locked || pending !== null} onPick={choose} />)}
        </div>
        <div aria-live="polite" className="min-h-14 text-center">
          {answer && !revealed && <p className="font-bold text-brand">Resposta registrada ✓ <span className="font-normal text-slate">enviada em {fmt(answer.elapsedMs)}. Aguarde o encerramento.</span></p>}
          {!answer && (timeUp || round.status === 'closed') && <p className="font-bold text-red-600">Tempo encerrado</p>}
          {message && !answer && <p className="font-semibold text-red-600">{message}</p>}
          {revealed && (
            <div className="card p-4 text-left">
              <p className={`text-lg font-black ${!answer ? 'text-slate' : answer.optionId === s.reveal!.correctOptionId ? 'text-emerald-600' : 'text-red-600'}`}>
                {!answer ? 'Não respondida' : answer.optionId === s.reveal!.correctOptionId ? 'Você acertou!' : 'Não foi dessa vez'}
              </p>
              {s.reveal!.explanation && <p className="mt-1 text-sm text-slate">{s.reveal!.explanation}</p>}
            </div>
          )}
        </div>
      </div>
    );
  } else {
    body = <Notice title="Aguarde" text="Carregando a pergunta…" />;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {header}
      {!finished && round && <div className="h-1.5 bg-mist"><div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} /></div>}
      {s.status === 'paused' && <p role="status" className="bg-accent px-4 py-2 text-center text-sm font-bold text-navy">Jogo pausado pelo apresentador</p>}
      {conn === 'offline' && <p role="alert" className="bg-red-50 px-4 py-2 text-center text-sm font-semibold text-red-700">Conexão instável. Sua pergunta continua aberta; estamos reconectando.</p>}
      <main className="flex-1">{body}</main>
    </div>
  );
}

function Notice({ title, text }: { title: string; text: string }) {
  return <div className="grid min-h-[60vh] place-items-center p-6 text-center"><div><p className="title-caps text-4xl text-brand">{title}</p><p className="mt-2 text-slate">{text}</p></div></div>;
}

function Lobby({ s, conn, online, reconnect }: { s: PlayerState; conn: ViewProps['conn']; online: number; reconnect: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-5 p-6 text-center">
      <Smartphone aria-hidden className="mt-6 size-12 text-brand" />
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-slate">Você entrou como</p>
        <p className="text-2xl font-black">{s.participant.fullName}</p>
      </div>
      <div className="card flex w-full justify-around p-4">
        <div><p className="text-xs font-bold uppercase text-slate">Sala</p><p className="text-3xl font-black tracking-widest text-brand">{s.code}</p></div>
        <div><p className="text-xs font-bold uppercase text-slate">Online</p><p className="text-3xl font-black text-brand">{online}<span className="text-base font-semibold text-slate"> / {s.registeredCount}</span></p></div>
      </div>
      <p className="title-caps text-xl text-navy">Aguardando o apresentador iniciar</p>
      <ConnectionBadge state={conn} />
      <button type="button" onClick={reconnect} className="btn-primary"><RefreshCw aria-hidden className="size-5" />Tentar reconectar</button>
      <ul className="text-sm text-slate">
        <li>Mantenha esta tela aberta e o celular com a tela ligada.</li>
        <li>Se a conexão cair, você volta automaticamente ao ponto certo.</li>
      </ul>
    </div>
  );
}

function RankingList({ s }: { s: PlayerState }) {
  return (
    <div className="mx-auto max-w-md p-4">
      <h2 className="title-caps mb-3 text-2xl text-brand">Ranking parcial</h2>
      <ol className="flex flex-col gap-2">
        {s.ranking!.map((r) => (
          <li key={r.participantId} className={`card flex items-center gap-3 p-3 ${r.participantId === s.participant.id ? 'border-accent' : ''}`}>
            <span className="w-8 text-xl font-black text-accent">{r.position}º</span>
            <span className="flex-1 truncate font-bold">{r.fullName}</span>
            <span className="text-sm text-slate">{r.correctAnswers} acertos</span>
          </li>
        ))}
      </ol>
      {s.myPosition && <p className="mt-3 text-center font-bold text-brand">Sua posição: {s.myPosition}º</p>}
    </div>
  );
}

function FinalView({ s }: { s: PlayerState }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-6 text-center">
      <Trophy aria-hidden className="mt-6 size-14 text-accent" />
      <h2 className="title-caps text-3xl text-brand">Fim do desafio!</h2>
      {s.myPosition && <p className="text-xl font-bold">Você ficou em <span className="text-accent">{s.myPosition}º lugar</span></p>}
      <p className="text-slate">“Qualidade é o que transforma matéria-prima em confiança.”</p>
      <p className="font-black text-navy">Qual escolha de qualidade você fará hoje?</p>
      {s.ranking && <RankingList s={s} />}
    </div>
  );
}
