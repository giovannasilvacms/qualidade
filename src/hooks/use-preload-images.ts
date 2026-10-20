'use client';
import { useEffect } from 'react';

/** Aquece o cache de imagens (via otimizador do Next) para a próxima pergunta abrir sem atraso. Melhor esforço. */
export function usePreloadImages(paths: (string | null | undefined)[], width = 828) {
  const key = paths.filter(Boolean).join('|');
  useEffect(() => {
    key.split('|').filter(Boolean).forEach((p) => {
      const img = new window.Image();
      img.src = `/_next/image?url=${encodeURIComponent(p)}&w=${width}&q=75`;
    });
  }, [key, width]);
}
