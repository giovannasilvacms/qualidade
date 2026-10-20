'use client';
import { useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import { editUpcomingQuestion } from '@/actions/presenter-actions';
import { QuestionImage } from '@/components/shared/question-image';
import type { PresenterQuestion } from '@/types/game';

/** Só o apresentador vê isto: enunciado, imagem, alternativas, GABARITO, explicação e duração. */
export function UpcomingQuestion({ q, canEdit, onSaved }: { q: PresenterQuestion | null; canEdit: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!q) return <p className="text-slate">Não há próxima pergunta pendente.</p>;

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !q) return;
    setBusy(true); setError(null);
    const f = new FormData(e.currentTarget);
    const r = await editUpcomingQuestion({
      roundId: q.roundId, statement: String(f.get('statement')), durationSeconds: Number(f.get('duration')),
      explanation: String(f.get('explanation') ?? ''), correctOptionId: String(f.get('correct')),
    });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? 'Não foi possível salvar.'); return; }
    setEditing(false); onSaved();
  }

  const field = 'mt-1 w-full rounded-xl border-2 border-mist bg-white px-3 py-2';
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-bold uppercase tracking-widest text-accent">Pergunta {q.roundNumber}{q.chapter ? ` · Capítulo ${q.chapter.number}` : ''} · {q.duration_seconds} s{q.sourceSlide ? ` · slide ${q.sourceSlide}` : ''}</p>
        {canEdit && !editing && <button type="button" className="btn border-2 border-mist px-3 py-1.5 text-sm" onClick={() => setEditing(true)}><Pencil aria-hidden className="size-4" />Editar</button>}
      </div>
      {!editing ? (
        <>
          {q.image_url && <QuestionImage src={q.image_url} alt="" className="aspect-[16/8]" />}
          <p className="text-lg font-black leading-snug">{q.statement}</p>
          <ul className="flex flex-col gap-2">
            {q.options.map((o) => (
              <li key={o.id} className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 ${o.id === q.correctOptionId ? 'border-emerald-500 bg-emerald-50' : 'border-mist'}`}>
                <span className="grid size-7 place-items-center rounded-lg bg-navy text-sm font-black text-white">{o.option_key}</span>
                <span className="flex-1">{o.option_text}</span>
                {o.id === q.correctOptionId && <span className="flex items-center gap-1 text-sm font-bold text-emerald-700"><Check aria-hidden className="size-4" />Correta</span>}
              </li>
            ))}
          </ul>
          {q.explanation && <p className="rounded-xl bg-mist/60 p-3 text-sm text-slate"><b className="text-navy">Explicação: </b>{q.explanation}</p>}
          {!canEdit && <p className="text-xs text-slate">A edição fica disponível depois de iniciar o jogo e antes de liberar a pergunta.</p>}
        </>
      ) : (
        <form onSubmit={save} className="flex flex-col gap-3">
          <label className="text-sm font-bold">Enunciado<textarea name="statement" required minLength={5} maxLength={300} defaultValue={q.statement} rows={3} className={field} /></label>
          <label className="text-sm font-bold">Duração (5 a 180 s)<input name="duration" type="number" min={5} max={180} required defaultValue={q.duration_seconds} className={field} /></label>
          <fieldset className="text-sm font-bold"><legend>Resposta correta</legend>
            {q.options.map((o) => (
              <label key={o.id} className="mt-1 flex items-center gap-2 font-normal"><input type="radio" name="correct" value={o.id} defaultChecked={o.id === q.correctOptionId} required />{o.option_key}. {o.option_text}</label>
            ))}
          </fieldset>
          <label className="text-sm font-bold">Explicação (até 300 caracteres)<textarea name="explanation" maxLength={300} defaultValue={q.explanation ?? ''} rows={3} className={field} /></label>
          <p className="text-xs text-slate">Atenção: a edição altera a pergunta do quiz e vale também para sessões futuras. Fica registrada na auditoria.</p>
          {error && <p role="alert" className="font-semibold text-red-700">{error}</p>}
          <div className="flex gap-3"><button type="submit" disabled={busy} className="btn-primary">Salvar</button><button type="button" className="btn border-2 border-mist" onClick={() => setEditing(false)}>Cancelar</button></div>
        </form>
      )}
    </div>
  );
}
