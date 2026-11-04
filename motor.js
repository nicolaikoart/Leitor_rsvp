/* Motor do Leitor RSVP: lógica pura, sem tela. Também roda no Node para testes. */
'use strict';

const Motor = (() => {
  const FIM_FRASE = new Set(['.', '!', '?', '…']);
  const MEIO_FRASE = new Set([',', ';', ':', '—', '–']);
  const FECHA = new Set(['"', "'", '”', '’', ')', ']', '»', '*']);
  const PAUSA = { NENHUMA: 0, VIRGULA: 1, FRASE: 2, PARAGRAFO: 3 };

  function pausaDe(w) {
    const a = Array.from(w);
    let e = a.length;
    while (e > 0 && FECHA.has(a[e - 1])) e--;
    if (!e) return 0;
    const c = a[e - 1];
    if (FIM_FRASE.has(c)) return 2;
    if (MEIO_FRASE.has(c)) return 1;
    return 0;
  }

  /** Divide capítulos em palavras, parágrafos e marcas de capítulo. */
  function processar(capitulos) {
    const palavras = [], pausas = [], parDe = [], paragrafos = [], caps = [];
    for (const cap of capitulos) {
      const inicioCap = palavras.length, primeiroPar = paragrafos.length;
      for (const linha of String(cap.texto || '').split(/\r\n|\r|\n/)) {
        const ws = linha.split(/\s+/).filter(Boolean);
        if (!ws.length) continue;
        const p = paragrafos.length, ini = palavras.length;
        for (const w of ws) { palavras.push(w); pausas.push(pausaDe(w)); parDe.push(p); }
        pausas[pausas.length - 1] = 3;
        paragrafos.push([ini, palavras.length]);
      }
      if (palavras.length > inicioCap) caps.push({ titulo: cap.titulo, inicio: inicioCap, par: primeiroPar });
    }
    return { palavras, pausas, parDe, paragrafos, capitulos: caps, total: palavras.length };
  }

  function contarPalavras(capitulos) {
    let n = 0;
    for (const c of capitulos) n += String(c.texto || '').split(/\s+/).filter(Boolean).length;
    return n;
  }

  // Letra de foco (ponto de reconhecimento ideal), um pouco à esquerda do meio.
  const ehLetra = (c) => /[\p{L}\p{N}]/u.test(c);

  function orpPos(w) {
    const a = Array.from(w);
    if (!a.length) return 0;
    let i = 0;
    while (i < a.length && !ehLetra(a[i])) i++;
    if (i === a.length) return Math.floor(a.length / 2);
    let f = a.length;
    while (f > i && !ehLetra(a[f - 1])) f--;
    const n = f - i;
    const d = n <= 1 ? 0 : n <= 5 ? 1 : n <= 9 ? 2 : n <= 13 ? 3 : 4;
    return Math.min(i + d, a.length - 1);
  }

  function partes(w) {
    const a = Array.from(w);
    if (!a.length) return ['', '', ''];
    const p = orpPos(w);
    return [a.slice(0, p).join(''), a[p], a.slice(p + 1).join('')];
  }

  function partesBloco(ws) {
    if (!ws.length) return ['', '', ''];
    if (ws.length === 1) return partes(ws[0]);
    const m = Math.floor((ws.length - 1) / 2);
    const [a, o, d] = partes(ws[m]);
    const antes = ws.slice(0, m).join(' '), depois = ws.slice(m + 1).join(' ');
    return [(antes ? antes + ' ' : '') + a, o, d + (depois ? ' ' + depois : '')];
  }

  /** Palavras mostradas juntas (1 a 3), sem atravessar o fim de uma frase. */
  function bloco(t, i, k) {
    if (!t.total) return [0, 0];
    let f = i;
    while (f < t.total && f - i < k) {
      f++;
      if (t.pausas[f - 1] >= 2) break;
    }
    return [i, Math.max(f, Math.min(i + 1, t.total))];
  }

  function duracaoPalavra(w, pausa, p) {
    const base = 60 / Math.max(p.ppm, 50);
    let f = 1;
    if (p.palavrasLongas) {
      const n = Array.from(w).length;
      if (n > 8) f += Math.min((n - 8) * 0.08, 0.6);
      else if (n <= 3) f -= 0.1;
    }
    if (p.pausaPontuacao) f += [0, 0.5, 1.2, 1.8][pausa] || 0;
    return base * f;
  }

  function duracaoBloco(t, ini, fim, p, lidas) {
    let d = 0;
    for (let i = ini; i < fim; i++) d += duracaoPalavra(t.palavras[i], t.pausas[i], p);
    if (fim - ini > 1) d *= 0.9;
    if (p.aceleracao) d /= 0.6 + 0.4 * Math.min(1, lidas / 25);
    return d;
  }

  function minutos(palavras, p) {
    return palavras / Math.max(p.ppm, 50) * (p.pausaPontuacao ? 1.18 : 1);
  }

  function capituloDe(t, i) {
    let r = 0;
    for (let n = 0; n < t.capitulos.length; n++) if (t.capitulos[n].inicio <= i) r = n;
    return r;
  }

  function fimCapitulo(t, n) {
    return n + 1 < t.capitulos.length ? t.capitulos[n + 1].inicio : t.total;
  }

  function inicioFrase(t, i) {
    let j = i;
    while (j > 0 && t.pausas[j - 1] < 2) j--;
    return j;
  }

  function fraseAnterior(t, i) {
    const ini = inicioFrase(t, i);
    return (i - ini <= 2 && ini > 0) ? inicioFrase(t, ini - 1) : ini;
  }

  function proximaFrase(t, i) {
    let j = i;
    while (j < t.total - 1 && t.pausas[j] < 2) j++;
    return Math.min(j + 1, t.total - 1);
  }

  function texto(t, a, b) {
    a = Math.max(0, a); b = Math.min(t.total, b);
    let s = '';
    for (let i = a; i < b; i++) {
      if (i > a) s += t.parDe[i] !== t.parDe[i - 1] ? '\n\n' : ' ';
      s += t.palavras[i];
    }
    return s;
  }

  // ---------- Texto vindo de PDF/OCR/TXT ----------

  function limparLinha(s) {
    return String(s).replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();
  }

  /** Junta linhas quebradas no meio da frase. */
  function juntarLinhas(s) {
    const linhas = String(s).split(/\r\n|\r|\n/).map(limparLinha);
    const comp = linhas.filter(Boolean).map((l) => l.length).sort((a, b) => a - b);
    const tipico = comp.length ? comp[Math.floor(comp.length * 3 / 4)] : 60;
    const pars = [];
    let atual = '';
    for (let n = 0; n < linhas.length; n++) {
      const l = linhas[n];
      if (!l) { if (atual) { pars.push(atual); atual = ''; } continue; }
      if (!atual) atual = l;
      else if (atual.endsWith('-') && /^\p{Ll}/u.test(l)) atual = atual.slice(0, -1) + l;
      else atual += ' ' + l;
      const prox = linhas[n + 1] || '';
      const titulo = l.length < tipico * 0.5 && !/[,;\-]$/.test(l) && /^\p{Lu}/u.test(prox);
      if ((/[.!?:”"]$/.test(l) && l.length < tipico * 0.8) || titulo) { pars.push(atual); atual = ''; }
    }
    if (atual) pars.push(atual);
    return pars.join('\n');
  }

  /** Em TXT/Markdown, linhas como "Capítulo 3" ou "# Título" viram capítulos. */
  function capitulosPorTitulo(s, padrao) {
    const marca = /^(#{1,2} .+|(cap[ií]tulo|chapter|parte|part)\s+[0-9ivxlc]+.*)$/i;
    const caps = [];
    let titulo = padrao, linhas = [];
    const fechar = () => {
      const t = linhas.join('\n').trim();
      if (t) caps.push({ titulo, texto: t });
      linhas = [];
    };
    for (const linha of String(s).split(/\r\n|\r|\n/)) {
      const l = linha.trim();
      if (l.length < 80 && marca.test(l)) { fechar(); titulo = l.replace(/^#+\s*/, ''); }
      else linhas.push(linha);
    }
    fechar();
    return caps.length ? caps : [{ titulo: padrao, texto: s }];
  }

  // ---------- Resumo e perguntas (sem IA) ----------

  const VAZIAS = new Set(('a o as os um uma uns umas de do da dos das em no na nos nas por para pra com sem e ou que se mas mais como quando onde muito ' +
    'ao aos à às é foi ser são era está estão isso isto esse essa este esta ele ela eles elas seu sua seus suas não já também só pelo pela ' +
    'the of and to in is it that for on with as was be by this are or an at from but not have has had they you he she we his her').split(' '));

  const limpar = (w) => String(w).toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

  function frases(s) {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const seg = new Intl.Segmenter('pt', { granularity: 'sentence' });
      return Array.from(seg.segment(s), (x) => x.segment.replace(/\s+/g, ' ').trim()).filter(Boolean);
    }
    return s.replace(/\s+/g, ' ').split(/(?<=[.!?…])\s+/).map((x) => x.trim()).filter(Boolean);
  }

  function resumo(s, max = 5) {
    const todas = frases(s);
    if (todas.length <= max) return todas;
    const freq = new Map();
    for (const w of s.split(/\s+/)) {
      const l = limpar(w);
      if (l.length > 3 && !VAZIAS.has(l)) freq.set(l, (freq.get(l) || 0) + 1);
    }
    const nota = todas.map((f, i) => {
      const ws = f.split(/\s+/).map(limpar);
      const soma = ws.reduce((a, w) => a + (freq.get(w) || 0), 0);
      return [i, soma / Math.max(ws.length, 6)];
    });
    return nota.sort((a, b) => b[1] - a[1]).slice(0, max).map((x) => x[0]).sort((a, b) => a - b).map((i) => todas[i]);
  }

  function embaralhar(a, aleatorio = Math.random) {
    const r = a.slice();
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(aleatorio() * (i + 1));
      [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
  }

  /** Perguntas de completar a frase, tiradas do trecho lido. */
  function lacunas(s, qtd = 5, aleatorio = Math.random) {
    const todas = frases(s).filter((f) => { const n = f.split(' ').length; return n >= 8 && n <= 40; });
    const unicas = [...new Set(s.split(/\s+/).map(limpar).filter((l) => l.length >= 5 && !VAZIAS.has(l) && !/\d/.test(l)))];
    if (unicas.length < 4) return [];
    const r = [];
    for (const f of embaralhar(todas, aleatorio)) {
      if (r.length >= qtd) break;
      const ws = f.split(' ');
      let pos = -1, resp = '';
      ws.forEach((w, i) => { const l = limpar(w); if (l.length >= 5 && !VAZIAS.has(l) && l.length > resp.length) { pos = i; resp = l; } });
      if (pos < 0) continue;
      const distr = embaralhar(unicas.filter((u) => u !== resp && Math.abs(u.length - resp.length) <= 4), aleatorio).slice(0, 3);
      if (distr.length < 3) continue;
      const opcoes = embaralhar([...distr, resp], aleatorio);
      const partesF = ws.slice();
      partesF[pos] = '_____';
      r.push({ enunciado: 'Complete a frase: ' + partesF.join(' '), opcoes, correta: opcoes.indexOf(resp) });
    }
    return r;
  }

  // ---------- ZIP (para EPUB), usando o descompressor do navegador ----------

  async function inflar(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function lerZip(buf) {
    const b = new Uint8Array(buf);
    const u16 = (i) => b[i] | (b[i + 1] << 8);
    const u32 = (i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
      if (u32(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('O arquivo não é um EPUB válido.');
    const qtd = u16(eocd + 10);
    let p = u32(eocd + 16);
    const entradas = new Map();
    const dec = new TextDecoder();
    for (let k = 0; k < qtd; k++) {
      if (u32(p) !== 0x02014b50) throw new Error('O arquivo não é um EPUB válido.');
      const metodo = u16(p + 10), comp = u32(p + 20), orig = u32(p + 24);
      const n = u16(p + 28), extra = u16(p + 30), coment = u16(p + 32), off = u32(p + 42);
      const nome = dec.decode(b.subarray(p + 46, p + 46 + n));
      entradas.set(nome, { nome, metodo, comp, orig, off });
      p += 46 + n + extra + coment;
    }
    const achar = (nome) => {
      if (entradas.has(nome)) return entradas.get(nome);
      let d = nome;
      try { d = decodeURIComponent(nome); } catch (e) { /* nome sem codificação */ }
      if (entradas.has(d)) return entradas.get(d);
      const low = d.toLowerCase();
      for (const e of entradas.values()) if (e.nome.toLowerCase() === low) return e;
      return null;
    };
    async function bytes(nome) {
      const e = achar(nome);
      if (!e) return null;
      const h = e.off;
      if (u32(h) !== 0x04034b50) throw new Error('EPUB corrompido.');
      const ini = h + 30 + u16(h + 26) + u16(h + 28);
      const dados = b.subarray(ini, ini + e.comp);
      if (e.metodo === 0) return dados;
      if (e.metodo === 8) return inflar(dados);
      throw new Error('Compressão não suportada neste EPUB.');
    }
    async function texto(nome) {
      const d = await bytes(nome);
      return d ? new TextDecoder().decode(d) : null;
    }
    return { entradas, bytes, texto };
  }

  function resolver(base, href) {
    let h = String(href).split('#')[0];
    try { h = decodeURIComponent(h); } catch (e) { /* mantém */ }
    const partesR = base ? base.split('/').filter(Boolean) : [];
    for (const p of h.split('/')) {
      if (p === '..') partesR.pop();
      else if (p && p !== '.') partesR.push(p);
    }
    return partesR.join('/');
  }

  function pasta(caminho) {
    const i = caminho.lastIndexOf('/');
    return i < 0 ? '' : caminho.slice(0, i);
  }

  return {
    PAUSA, processar, contarPalavras, orpPos, partes, partesBloco, bloco, duracaoPalavra, duracaoBloco,
    minutos, capituloDe, fimCapitulo, inicioFrase, fraseAnterior, proximaFrase, texto,
    limparLinha, juntarLinhas, capitulosPorTitulo, frases, resumo, lacunas, embaralhar, lerZip, resolver, pasta
  };
})();

if (typeof module !== 'undefined') module.exports = Motor;
