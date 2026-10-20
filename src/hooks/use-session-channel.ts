'use client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import type { GameEvent } from '@/types/game';

export type ConnState = 'connecting' | 'online' | 'offline';
export type PresenceRole = 'participant' | 'screen' | 'presenter';
interface Options { sessionId: string | null; role: PresenceRole; presenceKey: string; participantId?: string; onEvent: (e: GameEvent) => void }
interface PresenceMeta { role?: PresenceRole; pid?: string }

/** Canal privado `session:{id}`: Broadcast (eventos) + Presence (quem está online). Reconecta sozinho se o WebSocket cair. */
export function useSessionChannel({ sessionId, role, presenceKey, participantId, onEvent }: Options) {
  const [conn, setConn] = useState<ConnState>('connecting');
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!sessionId) return;
    const sb = getSupabaseBrowser();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let channel: RealtimeChannel | undefined;

    void (async () => {
      await sb.realtime.setAuth();
      if (cancelled) return;
      const ch = sb.channel(`session:${sessionId}`, { config: { private: true, presence: { key: presenceKey } } });
      channel = ch;
      ch.on('broadcast', { event: 'game_event' }, ({ payload }) => handler.current(payload as GameEvent))
        .on('presence', { event: 'sync' }, () => {
          const state = ch.presenceState() as Record<string, PresenceMeta[]>;
          const ids = new Set<string>();
          Object.entries(state).forEach(([key, metas]) => {
            metas.forEach((m) => { if (m.role === 'participant') ids.add(m.pid ?? key); });
          });
          setOnlineIds([...ids]);
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setConn('online');
            void ch.track({ role, pid: participantId });
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            if (cancelled) return;
            setConn('offline');
            timer = setTimeout(() => setAttempt((a) => a + 1), 2000 + Math.random() * 2000);
          }
        });
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (channel) void sb.removeChannel(channel);
    };
  }, [sessionId, role, presenceKey, participantId, attempt]);

  return { conn, online: onlineIds.length, onlineIds, reconnect: () => setAttempt((a) => a + 1) };
}
