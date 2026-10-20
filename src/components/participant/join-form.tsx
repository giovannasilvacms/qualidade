'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { joinSession } from '@/actions/join-actions';
import { getSupabaseBrowser } from '@/lib/supabase/client';

const FIELDS = [
  { name: 'fullName', label: 'Nome completo', type: 'text', auto: 'name', required: true },
  { name: 'email', label: 'E-mail corporativo', type: 'email', auto: 'email', required: true },
  { name: 'employeeNumber', label: 'Matrícula (opcional)', type: 'text', auto: 'off', required: false },
  { name: 'department', label: 'Área ou setor', type: 'text', auto: 'organization-title', required: true },
  { name: 'unitName', label: 'Unidade', type: 'text', auto: 'organization', required: true },
] as const;

/** O identificador do aparelho serve só para impedir duplicidade. Pontuação e respostas vivem exclusivamente no banco. */
function deviceId() {
  const k = 'dq_device';
  let id = window.localStorage.getItem(k);
  if (!id) { id = crypto.randomUUID(); window.localStorage.setItem(k, id); }
  return id;
}

export function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return; // prevenção de clique duplo
    setBusy(true); setError(null);
    const f = new FormData(e.currentTarget);
    try {
      const sb = getSupabaseBrowser();
      const { data } = await sb.auth.getUser();
      if (!data.user) {
        const { error: authError } = await sb.auth.signInAnonymously();
        if (authError) throw authError;
      }
      const res = await joinSession({
        sessionCode: f.get('sessionCode'), fullName: f.get('fullName'), email: f.get('email'), employeeNumber: f.get('employeeNumber') ?? '',
        department: f.get('department'), unitName: f.get('unitName'), acceptedPrivacy: f.get('acceptedPrivacy') === 'on',
      }, deviceId());
      if (!res.ok) { setError({ field: res.field, text: res.error }); setBusy(false); return; }
      router.push(`/jogar/${res.code}`);
    } catch {
      setError({ text: 'Não foi possível conectar. Verifique a internet e tente de novo.' });
      setBusy(false);
    }
  }

  const input = 'mt-1 w-full rounded-xl border-2 border-mist bg-white px-4 py-3 text-lg focus:border-brand focus:outline-none';
  return (
    <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4" noValidate>
      <label className="block font-bold">Código da sala
        <input name="sessionCode" defaultValue={params.get('sala') ?? ''} required autoCapitalize="characters" autoComplete="off" inputMode="text" maxLength={8}
          className={`${input} text-center text-2xl font-black uppercase tracking-[0.3em]`} aria-invalid={error?.field === 'sessionCode'} />
      </label>
      {FIELDS.map((fl) => (
        <label key={fl.name} className="block font-bold">{fl.label}
          <input name={fl.name} type={fl.type} autoComplete={fl.auto} required={fl.required} className={input} aria-invalid={error?.field === fl.name} />
        </label>
      ))}
      <label className="flex items-start gap-3 text-sm">
        <input name="acceptedPrivacy" type="checkbox" required className="mt-1 size-5" />
        <span>Concordo que meu nome, e-mail, área e unidade sejam usados para identificar minha participação e gerar o ranking deste evento.</span>
      </label>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 font-semibold text-red-700">{error.text}</p>}
      <button type="submit" disabled={busy} className="btn-primary text-lg">{busy ? <Loader2 aria-hidden className="size-5 animate-spin" /> : null}{busy ? 'Entrando…' : 'Entrar'}</button>
    </form>
  );
}
