'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Relógio do servidor: offset medido com a menor latência de 4 amostras, reavaliado a cada 60 s. Só para exibir o cronômetro;
 *  o tempo oficial da resposta é sempre calculado no banco. */
export function useServerClock() {
  const offset = useRef(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    async function sync() {
      const samples: { rtt: number; off: number }[] = [];
      for (let i = 0; i < 4; i++) {
        const t0 = Date.now();
        try {
          const res = await fetch('/api/time', { cache: 'no-store' });
          const { now } = (await res.json()) as { now: number };
          const t1 = Date.now();
          samples.push({ rtt: t1 - t0, off: now + (t1 - t0) / 2 - t1 });
        } catch { /* ignora amostra */ }
      }
      if (!alive || samples.length === 0) return;
      samples.sort((a, b) => a.rtt - b.rtt);
      offset.current = samples[0]!.off;
      setReady(true);
    }
    void sync();
    const id = setInterval(sync, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const now = useCallback(() => Date.now() + offset.current, []);
  return { now, ready };
}
