/**
 * Mapa das imagens extraídas de "Apresentação - Dia da Qualidade rev.03.pptx".
 * Só existem 13 imagens no arquivo; slides sem imagem própria (ex.: siderurgia, mineração,
 * saneamento, vidro, papel e celulose) NÃO têm asset: use o card tipográfico, não imagem externa.
 * `origin` é uma classificação preliminar feita pela aparência: CONFIRMAR com quem produziu o PPTX.
 */
export type AssetOrigin = 'real' | 'conceitual' | 'ilustracao_ia';
export type AssetCategory = 'apresentacao' | 'processo' | 'produtos' | 'aplicacoes' | 'historia';

export interface PresentationAsset {
  slide: number;
  key: string;
  path: string;
  category: AssetCategory;
  description: string;
  alt: string;
  origin: AssetOrigin;
  width: number;
  height: number;
}

export const PRESENTATION_ASSETS = {
  abertura: { slide: 1, key: 'abertura', path: '/images/apresentacao/abertura-jornada.jpg', category: 'apresentacao', description: 'Abertura: blocos de calcário e forno de cal em gravura', alt: 'Gravura de blocos de calcário diante de um forno de cal', origin: 'ilustracao_ia', width: 1672, height: 941 },
  origemCal: { slide: 3, key: 'origemCal', path: '/images/historia/origem-cal-fogo.jpg', category: 'historia', description: 'Origem da cal: comunidades antigas preparando cal ao fogo', alt: 'Ilustração de comunidades antigas queimando calcário e preparando reboco de cal', origin: 'ilustracao_ia', width: 1536, height: 1024 },
  romaPozolana: { slide: 4, key: 'romaPozolana', path: '/images/historia/roma-cal-pozolana.jpg', category: 'historia', description: 'Roma: obras com cal e pozolana (aquedutos, porto)', alt: 'Ilustração de obra romana com aqueduto, porto e trabalhadores', origin: 'ilustracao_ia', width: 1536, height: 1024 },
  industrializacao: { slide: 5, key: 'industrializacao', path: '/images/historia/industrializacao-forno-rotativo.jpg', category: 'historia', description: 'Industrialização: pedreira e forno rotativo', alt: 'Ilustração de pedreira e forno rotativo industrial', origin: 'ilustracao_ia', width: 1536, height: 1024 },
  extracao: { slide: 10, key: 'extracao', path: '/images/processo/extracao-jazida.jpg', category: 'processo', description: 'Extração: escavadeira e caminhão fora de estrada na jazida', alt: 'Escavadeira carregando caminhão em uma jazida de calcário', origin: 'conceitual', width: 1536, height: 1024 },
  britagem: { slide: 10, key: 'britagem', path: '/images/processo/britagem.jpg', category: 'processo', description: 'Britagem: britador de mandíbulas processando rocha', alt: 'Britador azul reduzindo blocos de calcário', origin: 'conceitual', width: 1536, height: 1024 },
  classificacao: { slide: 10, key: 'classificacao', path: '/images/processo/classificacao.jpg', category: 'processo', description: 'Classificação: peneiras e correias separando faixas granulométricas', alt: 'Peneira e correias transportadoras separando brita por tamanho', origin: 'conceitual', width: 1536, height: 1024 },
  estoque: { slide: 10, key: 'estoque', path: '/images/processo/estoque.jpg', category: 'processo', description: 'Estoque: pilhas de material classificado', alt: 'Pilhas cônicas de calcário britado no pátio de estoque', origin: 'conceitual', width: 1536, height: 1024 },
  calEmPo: { slide: 12, key: 'calEmPo', path: '/images/produtos/cal-em-po.jpg', category: 'produtos', description: 'Rotas de produção: mãos enluvadas segurando cal em pó', alt: 'Mãos com luvas segurando cal em pó branco', origin: 'conceitual', width: 1536, height: 1024 },
  neutramol: { slide: 14, key: 'neutramol', path: '/images/produtos/neutramol.jpg', category: 'produtos', description: 'Peça de divulgação NEUTRAMOL (suspensão de hidróxido de cálcio)', alt: 'Peça publicitária do NEUTRAMOL com gota de suspensão branca', origin: 'real', width: 1600, height: 900 },
  soilSelafilCitros: { slide: 15, key: 'soilSelafilCitros', path: '/images/aplicacoes/soil-selafil-citros.jpg', category: 'aplicacoes', description: 'Base comum SOIL-A/SELAFIL: tanques de suspensão em pomar de citros', alt: 'Tanques com suspensão mineral ao lado de um pomar de laranjas', origin: 'conceitual', width: 1536, height: 1024 },
  selafil: { slide: 16, key: 'selafil', path: '/images/produtos/selafil.jpg', category: 'produtos', description: 'Peça de divulgação SELAFIL (proteção solar em frutas)', alt: 'Peça publicitária do SELAFIL com laranja em primeiro plano', origin: 'real', width: 1600, height: 900 },
  soilA: { slide: 17, key: 'soilA', path: '/images/produtos/soil-a.jpg', category: 'produtos', description: 'Peça de divulgação SOIL-A (cálcio, magnésio e enxofre)', alt: 'Peça publicitária do SOIL-A com muda e símbolos Ca, Mg e S', origin: 'real', width: 1600, height: 900 },
} as const satisfies Record<string, PresentationAsset>;

export type AssetKey = keyof typeof PRESENTATION_ASSETS;
