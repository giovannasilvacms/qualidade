'use client';
import { useEffect } from 'react';
import { closeIfExpired } from '@/actions/presenter-actions';

/** Quando o cronômetro zera, pede ao banco para fechar a rodada. Idempotente: o banco só fecha se o prazo realmente passou
 *  (por isso insistimos a cada 2,5 s enquanto a rodada seguir aberta). Telão e painel chamam; não depende de o apresentador estar online. */
export function useAutoClose(roundId: string | null, enabled: boolean, remainingMs: number) {
  const expired = remainingMs <= 0;
  useEffect(() => {
    if (!roundId || !enabled || !expired) return;
    const attempt = () => { void closeIfExpired(roundId).catch(() => false); };
    const first = setTimeout(attempt, 400); // margem: o relógio local pode estar um pouco adiantado
    const again = setInterval(attempt, 2500);
    return () => { clearTimeout(first); clearInterval(again); };
  }, [roundId, enabled, expired]);
}
