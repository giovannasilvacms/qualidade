import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, MonitorPlay, Smartphone, SlidersHorizontal } from 'lucide-react';
import { PRESENTATION_ASSETS } from '@/data/presentation-assets';

const CHAPTERS = [
  { n: '01', t: 'Qualidade que atravessa séculos', d: 'Origem • Roma • industrialização' },
  { n: '02', t: 'Qualidade que produz resultados', d: 'Jazida • calcinação • hidratação • controle' },
  { n: '03', t: 'Qualidade que transforma o mundo', d: 'Indústria • água • ambiente • agro' },
];

const STEPS = [
  { Icon: Smartphone, t: 'Participante', d: 'Entra pelo celular com o código da sala e responde a cada pergunta.' },
  { Icon: MonitorPlay, t: 'Telão', d: 'Mostra pergunta, cronômetro, resposta e pódio, sincronizado em tempo real.' },
  { Icon: SlidersHorizontal, t: 'Apresentador', d: 'Controla todo o jogo remotamente, de qualquer lugar.' },
];

export default function HomePage() {
  const hero = PRESENTATION_ASSETS.abertura;
  return (
    <main>
      <section className="relative isolate overflow-hidden bg-navy text-white">
        <Image src={hero.path} alt={hero.alt} width={hero.width} height={hero.height} priority sizes="100vw"
               className="absolute inset-0 -z-10 h-full w-full object-cover opacity-35" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-navy via-navy/85 to-navy/30" />
        <div className="mx-auto flex min-h-[88vh] max-w-6xl flex-col justify-center gap-6 px-6 py-16">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-accent">Dia Mundial da Qualidade • Carmeuse Brasil</p>
          <h1 className="title-caps text-5xl leading-[0.95] sm:text-7xl">
            Desafio da<br />Qualidade
          </h1>
          <p className="text-3xl font-light sm:text-4xl">A Jornada da Cal</p>
          <p className="max-w-xl text-lg text-mist">“Qualidade que atravessa séculos, produz resultados e transforma o mundo.”</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/entrar" className="btn-accent">Entrar no jogo <ArrowRight aria-hidden className="size-5" /></Link>
            <Link href="/apresentador" className="btn-ghost">Acesso do apresentador</Link>
            <a href="#como-funciona" className="btn-ghost">Como funciona</a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <h2 className="title-caps mb-8 text-2xl text-brand">A jornada em três capítulos</h2>
        <ol className="grid gap-5 md:grid-cols-3">
          {CHAPTERS.map((c) => (
            <li key={c.n} className="card p-6">
              <span className="text-6xl font-black text-accent">{c.n}</span>
              <h3 className="title-caps mt-2 text-lg leading-tight">{c.t}</h3>
              <p className="mt-2 text-sm text-slate">{c.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="como-funciona" className="bg-mist/60 px-6 py-14">
        <div className="mx-auto max-w-6xl">
          <h2 className="title-caps mb-8 text-2xl text-brand">Como funciona</h2>
          <div className="grid gap-5 md:grid-cols-3">
            {STEPS.map(({ Icon, t, d }) => (
              <div key={t} className="card p-6">
                <Icon aria-hidden className="size-8 text-brand" />
                <h3 className="title-caps mt-3 text-lg">{t}</h3>
                <p className="mt-1 text-sm text-slate">{d}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-lg font-semibold text-navy">Qual escolha de qualidade você fará hoje?</p>
        </div>
      </section>
    </main>
  );
}
