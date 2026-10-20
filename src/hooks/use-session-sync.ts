'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameEvent } from '@/types/game';
import { useSessionChannel, type PresenceRole } from './use-session-channel';

interface Options<R> { fetcher: () => Promise<R>; role: PresenceRole; presenceKey: string; participantId?: (r: R) => string | undefined }

/**
 * Banco = fonte oficial. O Broadcast só avisa: ao receber um evento com versão maior que a conhecida, busca o estado de novo.
 * Eventos duplicados são ignorados. Se o canal cair, vira polling (4 s); com canal ok, polling de segurança (20 s).
 * Ao voltar o foco/internet, busca imediatamente.
 */
export function useSessionSync<R extends { kind: string }>({ fetcher, role, presenceKey, participantId }: Options<R>) {
  const [data, setData] = useState<R | null>(null);
  const [failed, setFailed] = useState(false);
  const version = useRef(-1);
  const seen = useRef<string[]>([]);
  const inflight = useRef(false);
  const queued = useRef(false);

  const refetch = useCallback(async () => {
    if (inflight.current) { queued.current = true; return; }
    inflight.current = true;
    try {
      const r = await fetcher();
      setFailed(false);
      const v = (r as unknown as { version?: number }).version;
      if (r.kind === 'ok' && typeof v === 'number') version.current = v;
      setData(r);
    } catch {
      setFailed(true);
    } finally {
      inflight.current = false;
      if (queued.current) { queued.current = false; void refetch(); }
    }
  }, [fetcher]);

  const sessionId = data && data.kind === 'ok' ? (data as unknown as { sessionId: string }).sessionId : null;
  const pid = data && data.kind === 'ok' ? participantId?.(data) : undefined;

  const { conn, online, onlineIds, reconnect } = useSessionChannel({
    sessionId, role, presenceKey, participantId: pid,
    onEvent: (e: GameEvent) => {
      if (seen.current.includes(e.eventId)) return;
      seen.current = [...seen.current.slice(-199), e.eventId];
      if (e.version > version.current || e.eventType === 'PARTICIPANT_REMOVED') void refetch();
    },
  });

  useEffect(() => { void refetch(); }, [refetch]);
  useEffect(() => {
    const id = setInterval(() => void refetch(), conn === 'online' ? 20_000 : 4_000);
    const wake = () => { if (document.visibilityState === 'visible') void refetch(); };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', wake); window.removeEventListener('online', wake); };
  }, [refetch, conn]);

  return { data, failed, conn: failed ? ('offline' as const) : conn, online, onlineIds, refetch, reconnect };
}
