import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NewSessionButton } from '@/components/presenter/new-session-button';
import { createSupabaseServer } from '@/lib/supabase/server';

export const metadata = { title: 'Sessões — Desafio da Qualidade' };
export const dynamic = 'force-dynamic';

interface Row { id: string; session_code: string; title: string; status: string }
const STATUS: Record<string, string> = { draft: 'Rascunho', registration_open: 'Inscrições abertas', registration_closed: 'Inscrições fechadas', live: 'Em andamento', paused: 'Pausado', finished: 'Encerrado', cancelled: 'Cancelado', countdown: 'Contagem' };

export default async function SessoesPage() {
  const supabase = createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || auth.user.is_anonymous) redirect('/apresentador?next=/apresentador/sessoes');
  const { data: isAdmin } = await supabase.rpc('current_user_is_admin');
  const { data } = await supabase.from('game_sessions').select('id,session_code,title,status').order('created_at', { ascending: false });
  const sessions = (data ?? []) as Row[];
  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mt-4 flex items-start justify-between gap-3">
        <h1 className="title-caps text-3xl text-brand">Sessões</h1>
        {isAdmin === true && <NewSessionButton />}
      </div>
      {sessions.length === 0 && <p className="mt-6 text-slate">Nenhuma sessão atribuída a esta conta.{isAdmin === true ? '' : ' Peça a um administrador para atribuir ou criar uma.'}</p>}
      <ul className="mt-5 flex flex-col gap-3">
        {sessions.map((s) => (
          <li key={s.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div><p className="font-black">{s.title}</p><p className="text-sm text-slate">Sala {s.session_code} · {STATUS[s.status] ?? s.status}</p></div>
            <div className="flex gap-2">
              <Link href={`/apresentador/sessoes/${s.id}`} className="btn-primary">Controlar</Link>
              <Link href={`/apresentacao/${s.session_code}`} target="_blank" className="btn border-2 border-mist">Telão</Link>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
