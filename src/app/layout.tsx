import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Desafio da Qualidade — A Jornada da Cal',
  description: 'Qualidade que atravessa séculos, produz resultados e transforma o mundo.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#082B4C' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
