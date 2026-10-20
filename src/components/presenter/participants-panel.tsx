'use client';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { getParticipantAnswers } from '@/actions/presenter-actions';
import type { ParticipantAnswerRow, PresenterParticipant } from '@/types/game';
import type { PresenterActionName } from '@/lib/presenter/state-machine';
import { Modal } from './modal';

interface Props {
  sessionId: string; participants: PresenterParticipant[]; onlineIds: string[]; busy: boolean;
  onRun: (a: PresenterActionName, extra: { participantId: string; reason?: string }) => Promise<void>;
  onRequest: (a: PresenterActionName, extra: { participantId: string }) => void;
}
const time = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function ParticipantsPanel({ sessionId, participants, onlineIds, busy, onRun, onRequest }: Props) {
  const [q, setQ] = useState('');
  const [answersOf, setAnswersOf] = useState<{ p: PresenterParticipant; rows: ParticipantAnswerRow[] | null } | null>(null);
  const [dq, setDq] = useState<PresenterParticipant | null>(null);
  const [reason, setReason] = useState('');
  const online = useMemo(() => new Set(onlineIds), [onlineIds]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? participants.filter((p) => [p.fullName, p.email, p.department, p.unitName, p.employeeNumber].some((v) => v?.toLowerCase().includes(t))) : participants;
  }, [participants, q]);

  async function openAnswers(p: PresenterParticipant) {
    setAnswersOf({ p, rows: null });
    setAnswersOf({ p, rows: await getParticipantAnswers(sessionId, p.id) });
  }
  const small = 'btn border-2 border-mist px-3 py-1.5 text-sm';

  return (
    <div>
      <label className="relative block"><span className="sr-only">Pesquisar participante</span>
        <Search aria-hidden className="absolute left-3 top-3.5 size-5 text-slate" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, e-mail, área, unidade ou matrícula" className="w-full rounded-xl border-2 border-mist py-3 pl-10 pr-3" />
      </label>
      <ul className="mt-3 flex max-h-[28rem] flex-col gap-2 overflow-auto">
        {list.map((p) => {
          const status = p.isDisqualified ? { t: 'Desclassificado', c: 'bg-red-100 text-red-800' } : online.has(p.id) ? { t: 'Online', c: 'bg-emerald-100 text-emerald-800' } : { t: 'Offline', c: 'bg-mist text-slate' };
          return (
            <li key={p.id} className="rounded-xl border border-mist p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{p.fullName}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${status.c}`}>{status.t}</span>
                {p.answeredCurrent && <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">Respondeu</span>}
                {p.reconnectReleased && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-navy">Reconexão liberada</span>}
              </div>
              <p className="text-sm text-slate">{p.email} · {[p.department, p.unitName].filter(Boolean).join(' · ')}{p.employeeNumber ? ` · mat. ${p.employeeNumber}` : ''} · entrou às {time(p.joinedAt)}</p>
              {p.isDisqualified && <p className="text-sm text-red-700">Motivo: {p.disqualificationReason}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className={small} onClick={() => void openAnswers(p)}>Respostas</button>
                {!p.isDisqualified && <button type="button" disabled={busy} className={small} onClick={() => void onRun('release_participant', { participantId: p.id })}>Liberar reconexão</button>}
                {!p.isDisqualified && <button type="button" disabled={busy} className={small} onClick={() => { setReason(''); setDq(p); }}>Desclassificar</button>}
                <button type="button" disabled={busy} className={`${small} text-red-700`} onClick={() => onRequest('remove_participant', { participantId: p.id })}>Remover</button>
              </div>
            </li>
          );
        })}
        {list.length === 0 && <li className="text-slate">Nenhum participante encontrado.</li>}
      </ul>

      {dq && (
        <Modal title={`Desclassificar ${dq.fullName}`} onClose={() => setDq(null)}>
          <p className="text-sm text-slate">O participante sai do ranking e perde o acesso à sala. A justificativa fica na auditoria.</p>
          <label className="mt-3 block text-sm font-bold">Justificativa
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} className="mt-1 w-full rounded-xl border-2 border-mist p-3 font-normal" />
          </label>
          <div className="mt-4 flex justify-end gap-3">
            <button type="button" className="btn border-2 border-mist" onClick={() => setDq(null)}>Cancelar</button>
            <button type="button" disabled={busy || reason.trim().length < 3} className="btn bg-red-600 text-white" onClick={() => { void onRun('disqualify_participant', { participantId: dq.id, reason: reason.trim() }); setDq(null); }}>Desclassificar</button>
          </div>
        </Modal>
      )}

      {answersOf && (
        <Modal title={`Respostas de ${answersOf.p.fullName}`} onClose={() => setAnswersOf(null)}>
          {!answersOf.rows ? <p className="text-slate">Carregando…</p> : answersOf.rows.length === 0 ? <p className="text-slate">Ainda não há perguntas liberadas.</p> : (
            <ul className="flex flex-col gap-2">
              {answersOf.rows.map((r) => (
                <li key={r.roundNumber} className="rounded-xl border border-mist p-3 text-sm">
                  <p className="font-bold">{r.roundNumber}. {r.statement}</p>
                  {r.skipped ? <p className="text-slate">Pergunta pulada.</p> : r.selected === null ? <p className="text-slate">Não respondeu.</p> : (
                    <p className={r.isCorrect ? 'text-emerald-700' : 'text-red-700'}>{r.selected} — {r.isCorrect ? 'acertou' : 'errou'} em {((r.elapsedMs ?? 0) / 1000).toFixed(2).replace('.', ',')} s{!r.isCorrect && r.correct ? ` (correta: ${r.correct})` : ''}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 text-right"><button type="button" className="btn-primary" onClick={() => setAnswersOf(null)}>Fechar</button></div>
        </Modal>
      )}
    </div>
  );
}
