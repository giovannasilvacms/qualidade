import { Suspense } from 'react';
import { JoinForm } from '@/components/participant/join-form';

export const metadata = { title: 'Entrar no jogo — Desafio da Qualidade' };

export default function EntrarPage() {
  return (
    <main className="mx-auto max-w-md p-5">
      <p className="mt-6 text-sm font-bold uppercase tracking-widest text-accent">Dia Mundial da Qualidade</p>
      <h1 className="title-caps text-3xl text-brand">Entrar no jogo</h1>
      <Suspense><JoinForm /></Suspense>
    </main>
  );
}
