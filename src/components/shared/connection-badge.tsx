import { Wifi, WifiOff } from 'lucide-react';
import type { ConnState } from '@/hooks/use-session-channel';

const LABEL: Record<ConnState, string> = { online: 'Conectado', connecting: 'Conectando…', offline: 'Sem conexão — reconectando' };

export function ConnectionBadge({ state, dark = false, compact = false }: { state: ConnState; dark?: boolean; compact?: boolean }) {
  const Icon = state === 'offline' ? WifiOff : Wifi;
  const color = state === 'online' ? 'text-emerald-600' : state === 'connecting' ? 'text-slate' : 'text-red-600';
  return (
    <span role="status" aria-live="polite" className={`inline-flex items-center gap-1.5 text-sm font-semibold ${dark ? 'text-white/90' : color}`}>
      <Icon aria-hidden className="size-4" />
      {!compact || state !== 'online' ? LABEL[state] : null}
    </span>
  );
}
