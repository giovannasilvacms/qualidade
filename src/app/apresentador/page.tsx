import { redirect } from 'next/navigation';
import { PresenterLogin } from '@/components/presentation/presenter-login';
import { createSupabaseServer } from '@/lib/supabase/server';

export const metadata = { title: 'Apresentador — Desafio da Qualidade' };
export const dynamic = 'force-dynamic';

export default async function ApresentadorPage({ searchParams }: { searchParams: { next?: string } }) {
  const next = searchParams.next?.startsWith('/') && !searchParams.next.startsWith('//') ? searchParams.next : '/apresentador/sessoes';
  const { data } = await createSupabaseServer().auth.getUser();
  // Usuário anônimo é participante, não apresentador: mostra o login.
  if (data.user && !data.user.is_anonymous) redirect(next);
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="title-caps mt-6 text-3xl text-brand">Acesso do apresentador</h1>
      <PresenterLogin next={next} />
    </main>
  );
}
