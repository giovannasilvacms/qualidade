'use client';
import { useEffect, useState } from 'react';

/** `pausedAt`: com o jogo pausado o cronômetro congela no instante da pausa (o banco devolve esse tempo ao retomar). */
export function useRemainingMs(closesAt: string | null, now: () => number, pausedAt: string | null = null) {
  const ref = () => (pausedAt ? Date.parse(pausedAt) : now());
  const [ms, setMs] = useState(() => (closesAt ? Math.max(0, Date.parse(closesAt) - ref()) : 0));
  useEffect(() => {
    if (!closesAt) { setMs(0); return; }
    const tick = () => setMs(Math.max(0, Date.parse(closesAt) - (pausedAt ? Date.parse(pausedAt) : now())));
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [closesAt, now, pausedAt]);
  return ms;
}

/** Cronômetro baseado no relógio do servidor (só exibição; o prazo oficial é do banco). */
export function RoundTimer({ remainingMs, durationSeconds, size = 'md' }: { remainingMs: number; durationSeconds: number; size?: 'md' | 'xl' }) {
  const seconds = Math.ceil(remainingMs / 1000);
  const pct = Math.max(0, Math.min(100, (remainingMs / (durationSeconds * 1000)) * 100));
  const low = seconds <= 5;
  return (
    <div role="timer" aria-label={`${seconds} segundos restantes`} className="w-full">
      <div className="flex items-baseline justify-between">
        <span className={`font-black tabular-nums ${size === 'xl' ? 'text-7xl' : 'text-4xl'} ${low ? 'text-red-600' : 'text-brand'}`}>{seconds}s</span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-mist">
        <div className={`h-full rounded-full transition-[width] duration-200 ease-linear ${low ? 'bg-red-500' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
