import { redirect } from 'next/navigation';
import { PresenterPanel } from '@/components/presenter/presenter-panel';
import { createSupabaseServer } from '@/lib/supabase/server';

export const metadata = { title: 'Controle remoto — Desafio da Qualidade' };
export const dynamic = 'force-dynamic';

export default async function PainelPage({ params }: { params: { sessionId: string } }) {
  const { data } = await createSupabaseServer().auth.getUser();
  if (!data.user || data.user.is_anonymous) redirect(`/apresentador?next=/apresentador/sessoes/${params.sessionId}`);
  return <PresenterPanel sessionId={params.sessionId} />;
}
