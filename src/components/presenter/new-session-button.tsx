'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSession } from '@/actions/presenter-actions';

export function NewSessionButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function create() {
    if (busy) return;
    setBusy(true); setError(null);
    const r = await createSession();
    if (!r.ok) { setError(r.error); setBusy(false); return; }
    router.push(`/apresentador/sessoes/${r.id}`);
  }
  return <div><button type="button" onClick={create} disabled={busy} className="btn-accent">{busy ? 'Criando…' : 'Criar sessão'}</button>{error && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{error}</p>}</div>;
}
