import type { Config } from 'tailwindcss';

// Paleta extraída da identidade da apresentação "Dia da Qualidade rev.03".
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#082B4C',      // azul-escuro institucional
        brand: '#005596',     // azul principal
        slate: '#31566F',     // azul-cinza (textos secundários)
        mist: '#DDEAF2',      // azul-claro
        paper: '#F5F8FA',     // fundo cinza muito claro
        accent: '#D98E32',    // laranja de destaque
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'Calibri', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '1.25rem' },
    },
  },
  plugins: [],
};
export default config;
