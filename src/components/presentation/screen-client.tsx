'use client';
import { useCallback, useState } from 'react';
import Image from 'next/image';
import { QRCodeSVG } from 'qrcode.react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Users, Wifi } from 'lucide-react';
import { getScreenData } from '@/actions/session-state';
import { ConnectionBadge } from '@/components/shared/connection-badge';
import { QuestionImage } from '@/components/shared/question-image';
import { RoundTimer, useRemainingMs } from '@/components/shared/round-timer';
import { APP_URL } from '@/lib/env';
import { usePreloadImages } from '@/hooks/use-preload-images';
import { useAutoClose } from '@/hooks/use-auto-close';
import { useServerClock } from '@/hooks/use-server-clock';
import { useSessionSync } from '@/hooks/use-session-sync';
import { PRESENTATION_ASSETS } from '@/data/presentation-assets';
import type { RankingRow, ScreenData } from '@/types/game';

const fmt = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;

export function ScreenClient({ code }: { code: string }) {
  const fetcher = useCallback(() => getScreenData(code), [code]);
  const [presenceKey] = useState(() => crypto.randomUUID());
  const { data, conn, online } = useSessionSync({ fetcher, role: 'screen', presenceKey });
  const { now } = useServerClock();
  usePreloadImages([data && data.kind === 'ok' ? data.nextImage : null], 1200);

  if (!data) return <Full><Loader2 className="size-14 animate-spin" aria-label="Carregando" /></Full>;
  if (data.kind === 'no_auth') return <Full><p className="text-3xl font-black">Faça login como apresentador neste computador.</p><a href={`/apresentador?next=/apresentacao/${code}`} className="btn-accent mt-6">Entrar</a></Full>;
  if (data.kind === 'forbidden') return <Full><p className="text-3xl font-black">Sua conta não tem acesso a esta sessão.</p></Full>;
  if (data.kind === 'no_session') return <Full><p className="text-3xl font-black">Sessão não encontrada.</p></Full>;

  return (
    <div className="relative flex min-h-dvh flex-col bg-navy text-white">
      <ScreenBody s={data} online={online} now={now} />
      {conn !== 'online' && <div className="absolute bottom-3 right-4 rounded-full bg-black/40 px-3 py-1"><ConnectionBadge state={conn} dark /></div>}
      {data.status === 'paused' && <div role="status" className="absolute inset-x-0 top-0 bg-accent py-2 text-center text-xl font-black uppercase text-navy">Jogo pausado</div>}
    </div>
  );
}

function Full({ children }: { children: React.ReactNode }) {
  return <main className="grid min-h-dvh place-items-center bg-navy p-8 text-center text-white"><div className="flex flex-col items-center">{children}</div></main>;
}

function ScreenBody({ s, online, now }: { s: ScreenData; online: number; now: () => number }) {
  switch (s.screenState) {
    case 'lobby': return <Lobby s={s} online={online} />;
    case 'countdown': return <Full><p className="title-caps text-3xl text-accent">Prepare-se</p><p className="title-caps mt-2 text-8xl">Pergunta {s.round?.roundNumber ?? 1}</p></Full>;
    case 'break': return <Full><p className="title-caps text-6xl">Intervalo</p><p className="mt-4 text-2xl text-mist">Já voltamos.</p></Full>;
    case 'ranking': return <RankingScreen s={s} title="Ranking parcial" />;
    case 'podium': return <Podium s={s} />;
    case 'finished': return <Closing />;
    default: return <QuestionScreen s={s} online={online} now={now} />;
  }
}

function Lobby({ s, online }: { s: ScreenData; online: number }) {
  const hero = PRESENTATION_ASSETS.abertura;
  const joinUrl = `${APP_URL}/entrar?sala=${s.code}`;
  return (
    <main className="relative isolate flex flex-1 items-center overflow-hidden px-12 py-10">
      <Image src={hero.path} alt="" fill priority sizes="100vw" className="-z-10 object-cover opacity-25" />
      <div className="grid w-full items-center gap-12 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="text-xl font-bold uppercase tracking-[0.25em] text-accent">Dia Mundial da Qualidade</p>
          <h1 className="title-caps mt-3 text-7xl leading-[0.95]">Desafio da<br />Qualidade</h1>
          <p className="mt-2 text-4xl font-light">A Jornada da Cal</p>
          <div className="mt-10 flex gap-8">
            <Stat icon={<Users aria-hidden className="size-8" />} label="Inscritos" value={s.registeredCount} />
            <Stat icon={<Wifi aria-hidden className="size-8" />} label="Online" value={online} />
          </div>
          <div className="mt-8 flex min-h-24 flex-wrap gap-2" aria-live="polite">
            <AnimatePresence>
              {s.recentNames.map((n) => (
                <motion.span key={n} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-full bg-white/15 px-4 py-1.5 text-lg font-semibold">{n}</motion.span>
              ))}
            </AnimatePresence>
          </div>
        </div>
        <div className="card mx-auto flex w-full max-w-md flex-col items-center gap-4 p-8 text-navy">
          <QRCodeSVG value={joinUrl} size={280} level="M" marginSize={1} title="QR Code para entrar no jogo" />
          <p className="text-center text-lg font-semibold text-slate">{joinUrl.replace(/^https?:\/\//, '').split('?')[0]}</p>
          <p className="text-sm font-bold uppercase tracking-widest text-slate">Código da sala</p>
          <p className="text-6xl font-black tracking-[0.25em] text-brand">{s.code}</p>
          <div aria-hidden className="mt-2 w-full rounded-xl bg-mist py-3 text-center font-bold text-slate">Aguardando o apresentador</div>
        </div>
      </div>
    </main>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <div className="flex items-center gap-3 text-accent">{icon}<div><p className="text-sm font-bold uppercase tracking-widest text-mist">{label}</p><p className="text-5xl font-black text-white">{value}</p></div></div>;
}

function QuestionScreen({ s, online, now }: { s: ScreenData; online: number; now: () => number }) {
  const round = s.round;
  const q = round?.question;
  const remaining = useRemainingMs(round?.status === 'open' ? round.closesAt : null, now, s.status === 'paused' ? s.pausedAt : null);
  useAutoClose(round?.id ?? null, round?.status === 'open' && s.status === 'live', remaining);
  if (!round || !q) return <Full><p className="text-3xl">Aguardando a pergunta…</p></Full>;
  const reveal = s.screenState === 'answer_revealed' || s.screenState === 'explanation' ? s.reveal : null;
  const total = Math.max(s.registeredCount, 1);
  const explanationOnly = s.screenState === 'explanation' && reveal;

  return (
    <main className="flex flex-1 flex-col gap-6 p-10">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-lg font-bold uppercase tracking-[0.2em] text-accent">{q.chapter ? `Capítulo ${q.chapter.number} · ${q.chapter.title}` : s.title}</p>
          <p className="text-xl text-mist">Pergunta {round.roundNumber} de {s.totalRounds}{q.sourceSlide && reveal ? ` · Slide ${q.sourceSlide} da apresentação` : ''}</p>
        </div>
        <div className="text-right text-lg text-mist"><p><b className="text-3xl text-white">{s.answersReceived}</b> / {total} respostas</p><p>{online} online</p></div>
      </header>
      <div className="h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full bg-accent" style={{ width: `${(round.roundNumber / Math.max(s.totalRounds, 1)) * 100}%` }} /></div>

      <div className="grid flex-1 gap-8 lg:grid-cols-2">
        {q.image_url && <QuestionImage src={q.image_url} alt="" priority className="min-h-[320px] lg:h-full" />}
        <div className={`flex flex-col gap-4 ${q.image_url ? '' : 'lg:col-span-2'}`}>
          <h1 className="text-4xl font-black leading-tight">{q.statement}</h1>
          {round.status === 'open' && <div className="rounded-2xl bg-white p-4 text-navy"><RoundTimer remainingMs={remaining} durationSeconds={q.duration_seconds} size="xl" /></div>}
          {round.status === 'closed' && <p className="title-caps text-3xl text-accent">Tempo encerrado</p>}
          {explanationOnly ? (
            <div className="rounded-2xl bg-white p-6 text-2xl text-navy"><p className="mb-2 text-sm font-bold uppercase tracking-widest text-accent">Por que?</p>{reveal.explanation}</div>
          ) : (
            <ul className="grid gap-3">
              {q.options.map((o) => {
                const isCorrect = reveal?.correctOptionId === o.id;
                const pct = reveal ? Math.round(((reveal.distribution[o.id] ?? 0) / Math.max(s.answersReceived, 1)) * 100) : null;
                return (
                  <li key={o.id} className={`relative flex items-center gap-4 overflow-hidden rounded-2xl border-4 p-4 text-2xl font-bold ${reveal ? (isCorrect ? 'border-emerald-400 bg-emerald-500/25' : 'border-white/10 bg-white/5 text-white/60') : 'border-white/20 bg-white/10'}`}>
                    <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent text-2xl font-black text-navy">{o.option_key}</span>
                    {o.image_url && <span className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-white/90"><Image src={o.image_url} alt="" fill sizes="96px" className="object-contain" /></span>}
                    <span className="flex-1">{o.option_text}</span>
                    {pct !== null && <span className="text-3xl font-black tabular-nums">{pct}%</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {reveal && !explanationOnly && (
            <div className="mt-2 grid grid-cols-3 gap-3 text-center">
              <Tally label="Acertos" value={reveal.correct} tone="text-emerald-300" />
              <Tally label="Erros" value={reveal.wrong} tone="text-red-300" />
              <Tally label="Sem resposta" value={reveal.unanswered} tone="text-mist" />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Tally({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="rounded-2xl bg-white/10 p-3"><p className={`text-5xl font-black ${tone}`}>{value}</p><p className="text-sm font-bold uppercase tracking-widest text-mist">{label}</p></div>;
}

function RankingScreen({ s, title }: { s: ScreenData; title: string }) {
  const rows = s.ranking ?? [];
  return (
    <main className="mx-auto w-full max-w-4xl p-10">
      <h1 className="title-caps mb-6 text-5xl">{title}</h1>
      <ol className="flex flex-col gap-3">
        {rows.map((r, i) => (
          <motion.li key={r.participantId} initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} className="flex items-center gap-5 rounded-2xl bg-white/10 p-4 text-2xl">
            <span className="w-14 text-4xl font-black text-accent">{r.position}º</span>
            <span className="flex-1 truncate font-bold">{r.fullName}<span className="ml-3 text-base font-normal text-mist">{r.department}</span></span>
            <span className="font-black">{r.correctAnswers} <span className="text-base font-normal text-mist">acertos · {fmt(r.correctElapsedMs)}</span></span>
          </motion.li>
        ))}
        {rows.length === 0 && <li className="text-xl text-mist">Ainda sem pontuação.</li>}
      </ol>
    </main>
  );
}

function Podium({ s }: { s: ScreenData }) {
  const top = (s.ranking ?? []).slice(0, 3);
  const order: (RankingRow | undefined)[] = [top[1], top[0], top[2]]; // 2º · 1º · 3º
  const height = ['h-48', 'h-72', 'h-36'];
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-10 overflow-hidden p-10">
      <h1 className="title-caps text-6xl">Pódio</h1>
      <div className="flex items-end gap-6">
        {order.map((r, i) => r && (
          <motion.div key={r.participantId} initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i === 1 ? 1.2 : i === 0 ? 0.6 : 0, type: 'spring' }} className="flex w-64 flex-col items-center text-center">
            <div aria-hidden className="mb-3 grid size-28 place-items-center rounded-full border-4 border-accent bg-white/10 text-sm text-mist">Foto</div>
            <p className="text-2xl font-black leading-tight">{r.fullName}</p>
            <p className="text-mist">{r.department ?? ''}</p>
            <p className="mt-1 font-bold">{r.correctAnswers} acertos · {fmt(r.correctElapsedMs)}</p>
            <div className={`mt-3 grid w-full place-items-center rounded-t-2xl bg-accent text-6xl font-black text-navy ${height[i]}`}>{r.position}º</div>
          </motion.div>
        ))}
        {top.length === 0 && <p className="text-2xl text-mist">Sem classificados.</p>}
      </div>
    </main>
  );
}

function Closing() {
  return (
    <Full>
      <p className="max-w-4xl text-5xl font-black leading-tight">Qualidade é o que transforma matéria-prima em confiança.</p>
      <p className="title-caps mt-8 text-3xl text-accent">Qual escolha de qualidade você fará hoje?</p>
    </Full>
  );
}
