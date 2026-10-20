import Image from 'next/image';
import { Check } from 'lucide-react';
import type { PublicOption } from '@/types/game';

export type OptionVisual = 'idle' | 'selected' | 'correct' | 'wrong' | 'dim';
const STYLE: Record<OptionVisual, string> = {
  idle: 'border-mist bg-white text-navy active:bg-mist',
  selected: 'border-brand bg-brand text-white',
  correct: 'border-emerald-600 bg-emerald-50 text-navy',
  wrong: 'border-red-500 bg-red-50 text-navy',
  dim: 'border-mist bg-white/60 text-slate',
};

export function OptionButton({ option, visual, disabled, onPick }: { option: PublicOption; visual: OptionVisual; disabled: boolean; onPick: (id: string) => void }) {
  return (
    <button type="button" disabled={disabled} onClick={() => onPick(option.id)} aria-pressed={visual === 'selected'}
      className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 p-3 text-left text-lg font-bold transition disabled:cursor-not-allowed ${STYLE[visual]}`}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-navy text-lg font-black text-white">{option.option_key}</span>
      {option.image_url && (
        <span className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-mist">
          <Image src={option.image_url} alt="" fill sizes="80px" className="object-contain" />
        </span>
      )}
      <span className="flex-1">{option.option_text}</span>
      {visual === 'correct' && <Check aria-label="Resposta correta" className="size-6 text-emerald-600" />}
    </button>
  );
}
