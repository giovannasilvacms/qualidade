import { PlayerGame } from '@/components/participant/player-game';

export const metadata = { title: 'Jogando — Desafio da Qualidade' };

export default function JogarPage({ params }: { params: { sessionCode: string } }) {
  return <PlayerGame code={params.sessionCode.toUpperCase()} />;
}
