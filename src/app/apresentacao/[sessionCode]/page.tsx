import { ScreenClient } from '@/components/presentation/screen-client';

export const metadata = { title: 'Telão — Desafio da Qualidade' };

/** Sem botões administrativos: o telão só exibe. O acesso exige login de apresentador/admin (verificado em getScreenData + RLS). */
export default function ApresentacaoPage({ params }: { params: { sessionCode: string } }) {
  return <ScreenClient code={params.sessionCode.toUpperCase()} />;
}
