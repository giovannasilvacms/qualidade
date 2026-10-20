'use client';
import { useEffect, useRef, useState } from 'react';

/** Miniatura AO VIVO do telão: é a própria rota /apresentacao/[código] embutida e reduzida, então mostra exatamente o que está projetado. */
export function PreviewFrame({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(e?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="relative w-full overflow-hidden rounded-xl bg-navy" style={{ height: (w * 9) / 16 }}>
      <iframe src={`/apresentacao/${code}`} title="Pré-visualização do telão" tabIndex={-1} aria-hidden="true"
        className="absolute left-0 top-0 border-0" style={{ width: 1280, height: 720, transform: `scale(${w / 1280})`, transformOrigin: '0 0', pointerEvents: 'none' }} />
    </div>
  );
}
