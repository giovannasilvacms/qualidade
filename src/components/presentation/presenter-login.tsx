'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/client';

export function PresenterLogin({ next }: { next: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    const f = new FormData(e.currentTarget);
    const { error: err } = await getSupabaseBrowser().auth.signInWithPassword({ email: String(f.get('email')), password: String(f.get('password')) });
    if (err) { setError('E-mail ou senha inválidos.'); setBusy(false); return; }
    router.push(next); router.refresh();
  }
  const input = 'mt-1 w-full rounded-xl border-2 border-mist bg-white px-4 py-3 text-lg focus:border-brand focus:outline-none';
  return (
    <form onSubmit={onSubmit} className="card mt-6 flex flex-col gap-4 p-6">
      <label className="font-bold">E-mail<input name="email" type="email" autoComplete="username" required className={input} /></label>
      <label className="font-bold">Senha<input name="password" type="password" autoComplete="current-password" required className={input} /></label>
      {error && <p role="alert" className="font-semibold text-red-700">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Entrando…' : 'Entrar'}</button>
    </form>
  );
}
