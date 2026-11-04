/* Leitor RSVP: interface. Depende de Motor (motor.js) e, para PDF, de pdfjsLib. */
'use strict';
(() => {
  const M = Motor;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const limitar = (v, a, b) => Math.min(b, Math.max(a, v));
  const icone = (id) => `<svg class="i"><use href="#i-${id}"/></svg>`;
  const reduzirMov = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ================= Armazenamento =================
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } }
  };

  const BD = (() => {
    let promessa = null;
    const memoria = new Map();
    function abrir() {
      if (promessa) return promessa;
      promessa = new Promise((res) => {
        try {
          const r = indexedDB.open('leitor-rsvp', 1);
          r.onupgradeneeded = () => {
            const db = r.result;
            if (!db.objectStoreNames.contains('textos')) db.createObjectStore('textos');
            if (!db.objectStoreNames.contains('sons')) db.createObjectStore('sons');
          };
          r.onsuccess = () => res(r.result);
          r.onerror = () => res(null);
          r.onblocked = () => res(null);
        } catch (e) { res(null); }
      });
      return promessa;
    }
    async function op(loja, modo, fn) {
      const db = await abrir();
      if (!db) throw new Error('sem banco');
      return new Promise((res, rej) => {
        try {
          const tx = db.transaction(loja, modo);
          const req = fn(tx.objectStore(loja));
          tx.oncomplete = () => res(req ? req.result : undefined);
          tx.onerror = () => rej(tx.error);
          tx.onabort = () => rej(tx.error);
        } catch (e) { rej(e); }
      });
    }
    return {
      async get(loja, k) {
        try { const v = await op(loja, 'readonly', (s) => s.get(k)); return v === undefined ? memoria.get(loja + ':' + k) : v; }
        catch (e) { return memoria.get(loja + ':' + k); }
      },
      async put(loja, k, v) { memoria.set(loja + ':' + k, v); try { await op(loja, 'readwrite', (s) => s.put(v, k)); } catch (e) { /* fica na memória */ } },
      async del(loja, k) { memoria.delete(loja + ':' + k); try { await op(loja, 'readwrite', (s) => s.delete(k)); } catch (e) { /* ok */ } }
    };
  })();

  // ================= Preferências =================
  const PADRAO = {
    ppm: 300, palavrasPorVez: 1, pausaPontuacao: true, palavrasLongas: true, aceleracao: true,
    narracao: false, voz: 'pt-BR', mostrarTexto: true, linhasGuia: true, modo: 'rsvp',
    temaID: 'claro', temaEscuroID: 'escuro', seguirSistema: true, noiteAuto: false,
    fonte: 'serifa', tamanhoPalavra: 64, tamanhoTexto: 18,
    persFundo: '#FFFFFF', persTexto: '#16181D', persFoco: '#2F55D4',
    meta: 15, som: 'rain', somVol: 70, somNome: ''
  };
  const prefs = Object.assign({}, PADRAO, LS.get('rsvp.prefs', {}));
  const salvarPrefs = () => LS.set('rsvp.prefs', prefs);
  const prefsMotor = () => ({ ppm: prefs.ppm, palavrasLongas: prefs.palavrasLongas, pausaPontuacao: prefs.pausaPontuacao, aceleracao: prefs.aceleracao });

  // ================= Temas =================
  const T = (id, nome, desc, c) => ({ id, nome, desc, ...c });
  const TEMAS = [
    T('claro', 'Claro', 'Padrão para o dia.', { fundo: '#F4F5F7', sup: '#FFFFFF', faixa: '#111113', faixaTexto: '#EDEDEF', faixaSuave: '#8A8A92', foco: '#FF8A57', texto: '#16181D', suave: '#4A4F5A', dFundo: '#16181D', dTexto: '#FFFFFF', acento: '#2F55D4', sobre: '#FFFFFF', borda: '#E3E5EA', perigo: '#B42318', escuro: false }),
    T('papel', 'Papel', 'Branco quente, como página de livro.', { fundo: '#FAF8F3', sup: '#FFFFFF', faixa: '#2B2622', faixaTexto: '#F3EEE6', faixaSuave: '#A39A8E', foco: '#E0703A', texto: '#2B2622', suave: '#5F574E', dFundo: '#2B2622', dTexto: '#FFFFFF', acento: '#A54A22', sobre: '#FFFFFF', borda: '#E8E2D8', perigo: '#B42318', escuro: false }),
    T('sepia', 'Sépia', 'Tom de papel envelhecido.', { fundo: '#F3EAD8', sup: '#FBF4E6', faixa: '#E6D8BC', faixaTexto: '#3B2F22', faixaSuave: '#6E5E48', foco: '#A8361A', texto: '#3B2F22', suave: '#5E4F3C', dFundo: '#3B2F22', dTexto: '#FBF4E6', acento: '#8A4B1E', sobre: '#FFFFFF', borda: '#E0D3B8', perigo: '#A8361A', escuro: false }),
    T('cinza', 'Cinza suave', 'Contraste moderado para sessões longas.', { fundo: '#E2E4E0', sup: '#ECEDEA', faixa: '#D3D6D1', faixaTexto: '#2B2F2C', faixaSuave: '#4B524D', foco: '#9A3B1A', texto: '#2B2F2C', suave: '#4B524D', dFundo: '#2B2F2C', dTexto: '#ECEDEA', acento: '#35566F', sobre: '#FFFFFF', borda: '#CDD1CB', perigo: '#9A3B1A', escuro: false }),
    T('verde', 'Verde descanso', 'Fundo verde-claro para muitas horas.', { fundo: '#D9E6D6', sup: '#E5EEE2', faixa: '#C9DAC5', faixaTexto: '#223027', faixaSuave: '#43544A', foco: '#9A3B1A', texto: '#223027', suave: '#43544A', dFundo: '#223027', dTexto: '#E5EEE2', acento: '#2A5E46', sobre: '#FFFFFF', borda: '#C3D3BF', perigo: '#9A3B1A', escuro: false }),
    T('lavanda', 'Lavanda', 'Lilás claro e calmo.', { fundo: '#ECE9F5', sup: '#F6F4FB', faixa: '#2A2440', faixaTexto: '#EEEAF8', faixaSuave: '#9C94B8', foco: '#FF8A6B', texto: '#251F38', suave: '#554C70', dFundo: '#251F38', dTexto: '#F6F4FB', acento: '#5B45B0', sobre: '#FFFFFF', borda: '#DAD4EA', perigo: '#B42318', escuro: false }),
    T('escuro', 'Escuro', 'Cinza-escuro, não preto.', { fundo: '#1E1F23', sup: '#26272C', faixa: '#111113', faixaTexto: '#E3E3E6', faixaSuave: '#8A8A92', foco: '#FF8A57', texto: '#E3E3E6', suave: '#A8A8B0', dFundo: '#E3E3E6', dTexto: '#1E1F23', acento: '#8DA6FF', sobre: '#111113', borda: '#34353B', perigo: '#FF8A80', escuro: true }),
    T('oceano', 'Azul noturno', 'Azul-marinho com foco dourado.', { fundo: '#0F1A2A', sup: '#16233A', faixa: '#0A1220', faixaTexto: '#DCE6F5', faixaSuave: '#7D8DA8', foco: '#FFB45E', texto: '#DCE6F5', suave: '#9AABC6', dFundo: '#DCE6F5', dTexto: '#0F1A2A', acento: '#6FA8FF', sobre: '#0A1220', borda: '#24344F', perigo: '#FF8A80', escuro: true }),
    T('floresta', 'Floresta', 'Verde-escuro e profundo.', { fundo: '#14201A', sup: '#1B2A22', faixa: '#0E1712', faixaTexto: '#DDE8DF', faixaSuave: '#7F9686', foco: '#F2A65A', texto: '#DDE8DF', suave: '#A0B5A6', dFundo: '#DDE8DF', dTexto: '#14201A', acento: '#7FC8A0', sobre: '#0E1712', borda: '#26382E', perigo: '#FF8A80', escuro: true }),
    T('cafe', 'Café', 'Marrom-escuro aconchegante.', { fundo: '#221A15', sup: '#2C221C', faixa: '#17110D', faixaTexto: '#EADBC8', faixaSuave: '#9C8670', foco: '#E8955A', texto: '#EADBC8', suave: '#B9A48C', dFundo: '#EADBC8', dTexto: '#221A15', acento: '#D9A36C', sobre: '#17110D', borda: '#3A2E26', perigo: '#FF8A80', escuro: true }),
    T('noite', 'Noite âmbar', 'Sem luz azul, para antes de dormir.', { fundo: '#140E08', sup: '#1E150C', faixa: '#0C0804', faixaTexto: '#EBC184', faixaSuave: '#A8854F', foco: '#FF7A4D', texto: '#EBC184', suave: '#B8925E', dFundo: '#EBC184', dTexto: '#140E08', acento: '#E09A4A', sobre: '#140E08', borda: '#2E2214', perigo: '#FF7A4D', escuro: true }),
    T('oled', 'Preto OLED', 'Preto absoluto, economiza bateria.', { fundo: '#000000', sup: '#0D0D0D', faixa: '#000000', faixaTexto: '#D6D6D6', faixaSuave: '#8C8C8C', foco: '#FF8A57', texto: '#D6D6D6', suave: '#9E9E9E', dFundo: '#D6D6D6', dTexto: '#000000', acento: '#8DA6FF', sobre: '#000000', borda: '#222222', perigo: '#FF8A80', escuro: true }),
    T('contraste', 'Alto contraste', 'Branco e amarelo sobre preto, máxima legibilidade.', { fundo: '#000000', sup: '#000000', faixa: '#000000', faixaTexto: '#FFFFFF', faixaSuave: '#CFCFCF', foco: '#FFD400', texto: '#FFFFFF', suave: '#E0E0E0', dFundo: '#FFD400', dTexto: '#000000', acento: '#FFD400', sobre: '#000000', borda: '#FFFFFF', perigo: '#FF6B6B', escuro: true })
  ];

  function hexRGB(h) {
    const s = String(h).replace('#', '');
    const v = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16) || 0;
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function luminancia(h) {
    const [r, g, b] = hexRGB(h).map((x) => { const v = x / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contraste(a, b) {
    const la = luminancia(a), lb = luminancia(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  function temaPersonalizado() {
    const f = prefs.persFundo, t = prefs.persTexto, o = prefs.persFoco;
    const mix = (c, p) => `color-mix(in srgb, ${c} ${p}%, ${f})`;
    return T('personalizado', 'Personalizado', 'Suas cores.', {
      fundo: f, sup: mix(t, 4), faixa: mix(t, 7), faixaTexto: t, faixaSuave: mix(t, 70), foco: o, texto: t, suave: mix(t, 72),
      dFundo: t, dTexto: f, acento: o, sobre: luminancia(o) > 0.45 ? '#000000' : '#FFFFFF', borda: mix(t, 18), perigo: '#C0392B', escuro: luminancia(f) < 0.4
    });
  }
  const todosTemas = () => TEMAS.concat([temaPersonalizado()]);
  const temaPorId = (id) => (id === 'personalizado' ? temaPersonalizado() : TEMAS.find((t) => t.id === id) || TEMAS[0]);

  function sistemaEscuro() {
    const dt = document.documentElement.getAttribute('data-theme');
    if (dt === 'dark') return true;
    if (dt === 'light') return false;
    return matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function noiteAtiva() {
    if (!prefs.noiteAuto) return false;
    const h = new Date().getHours();
    return h >= 21 || h < 6;
  }
  function temaAtual() {
    if (noiteAtiva()) return temaPorId('noite');
    return temaPorId(prefs.seguirSistema && sistemaEscuro() ? prefs.temaEscuroID : prefs.temaID);
  }

  const FONTES = {
    serifa: { nome: 'Serifa', css: "'Literata', 'Iowan Old Style', Georgia, serif" },
    sans: { nome: 'Sans', css: "'Atkinson Hyperlegible', 'DM Sans', system-ui, sans-serif" },
    redonda: { nome: 'Redonda', css: "'Nunito', ui-rounded, system-ui, sans-serif" },
    mono: { nome: 'Mono', css: "'JetBrains Mono', ui-monospace, Menlo, monospace" }
  };

  function aplicarTema() {
    const t = temaAtual();
    const s = document.documentElement.style;
    const mapa = { '--fundo': t.fundo, '--sup': t.sup, '--faixa': t.faixa, '--faixa-texto': t.faixaTexto, '--faixa-suave': t.faixaSuave, '--foco': t.foco, '--texto': t.texto, '--suave': t.suave, '--dest-fundo': t.dFundo, '--dest-texto': t.dTexto, '--acento': t.acento, '--sobre-acento': t.sobre, '--borda': t.borda, '--perigo': t.perigo };
    for (const k in mapa) s.setProperty(k, mapa[k]);
    s.setProperty('color-scheme', t.escuro ? 'dark' : 'light');
    s.setProperty('--fonte-leitura', (FONTES[prefs.fonte] || FONTES.serifa).css);
    s.setProperty('--tam-texto', prefs.tamanhoTexto + 'px');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.fundo.startsWith('#') ? t.fundo : prefs.persFundo);
  }

  // ================= Biblioteca =================
  const CORES = ['#2F55D4', '#E07A3F', '#2E8B6E', '#8B5CC7', '#C2415A', '#3F8FB5'];
  const TIPOS = { texto: 'Texto', txt: 'TXT', pdf: 'PDF', epub: 'EPUB', web: 'Web', html: 'HTML' };
  const FILTROS = [['todos', 'Todos'], ['epub', 'EPUB'], ['pdf', 'PDF'], ['outros', 'Outros']];
  let docs = LS.get('rsvp.docs', null);
  const salvarDocs = () => LS.set('rsvp.docs', docs);

  const BOAS_VINDAS = [
    { titulo: 'Como funciona', texto: 'Este é o seu leitor rápido. Em vez de mover os olhos pela linha, você mantém o olhar parado no centro da faixa e as palavras chegam até você, uma de cada vez.\nRepare na letra colorida de cada palavra. Ela marca o ponto de reconhecimento: o lugar onde o olho entende a palavra mais rápido. As linhas verticais acima e abaixo da faixa mostram exatamente onde olhar.\nToque na faixa ou no botão grande para pausar. As setas duplas voltam ou avançam uma frase inteira. Os botões de menos e mais mudam a velocidade, medida em palavras por minuto.' },
    { titulo: 'Modos de leitura', texto: 'O modo RSVP mostra uma palavra por vez. Nos ajustes você pode trocar para blocos de duas ou três palavras, o que deixa a leitura mais natural em textos fáceis.\nO modo guiado mostra o texto inteiro e vai destacando a palavra atual no ritmo escolhido. É bom para textos com listas ou trechos que pedem mais contexto.\nO modo biônico deixa em negrito o começo de cada palavra. Muita gente sente que o olho desliza mais fácil assim.\nEm qualquer modo, tocar numa palavra do texto completo faz a leitura recomeçar dali. O botão Foco esconde tudo e deixa só a palavra na tela.' },
    { titulo: 'Dicas para ler melhor', texto: 'Comece devagar. Uma velocidade entre duzentas e cinquenta e trezentas e cinquenta palavras por minuto já é mais rápida do que a leitura comum para a maioria das pessoas.\nDeixe ligadas as pausas na pontuação. Elas dão ao cérebro um instante para fechar cada frase antes da próxima.\nO botão com a nuvem liga um som de chuva ao fundo. Nos ajustes você escolhe chuva leve, moderada ou forte, ou usa uma gravação sua.\nFaça o teste de compreensão ao fim de cada capítulo. Se acertar quase tudo, o app sugere subir a velocidade. Se errar bastante, sugere descer um pouco.\nPara importar seus próprios textos, toque no botão de mais na biblioteca. Dá para abrir EPUB sem proteção, PDF, TXT e HTML, ou colar qualquer texto.\nBoa leitura.' }
  ];

  async function adicionarDoc(imp, idFixo) {
    const id = idFixo || ('d' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    await BD.put('textos', id, imp.capitulos);
    const doc = {
      id, titulo: imp.titulo, autor: imp.autor || '', tipo: imp.tipo, total: M.contarPalavras(imp.capitulos),
      caps: imp.capitulos.length, pos: 0, marcadores: [], adicionado: Date.now(), ultima: Date.now(), cor: docs.length
    };
    docs.push(doc);
    salvarDocs();
    return doc;
  }

  // ================= Estatísticas =================
  const stats = Object.assign({ sessoes: [], quizzes: [], testes: [] }, LS.get('rsvp.stats', {}));
  const salvarStats = () => {
    if (stats.sessoes.length > 3000) stats.sessoes = stats.sessoes.slice(-3000);
    LS.set('rsvp.stats', stats);
  };
  const diaDe = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  function sequencia() {
    const dias = new Set(stats.sessoes.map((s) => diaDe(s.data)));
    let d = diaDe(Date.now());
    if (!dias.has(d)) { d -= 86400000; if (!dias.has(diaDe(d))) return 0; }
    let n = 0;
    while (dias.has(diaDe(d))) { n++; d -= 86400000; }
    return n;
  }
  function mediaSemana() {
    const lim = Date.now() - 7 * 86400000;
    let p = 0, s = 0;
    for (const x of stats.sessoes) if (x.data >= lim) { p += x.palavras; s += x.segundos; }
    return s > 0 ? p / (s / 60) : 0;
  }
  function ultimosDias(n) {
    const r = [];
    const hoje = diaDe(Date.now());
    for (let k = n - 1; k >= 0; k--) {
      const d = new Date(hoje); d.setDate(d.getDate() - k);
      const ini = d.getTime(), fim = ini + 86400000;
      let p = 0, s = 0;
      for (const x of stats.sessoes) if (x.data >= ini && x.data < fim) { p += x.palavras; s += x.segundos; }
      r.push({ dia: ini, palavras: p, minutos: s / 60, ppm: s > 0 ? p / (s / 60) : 0 });
    }
    return r;
  }
  function minutosHoje() {
    const h = diaDe(Date.now());
    return stats.sessoes.filter((s) => diaDe(s.data) === h).reduce((a, s) => a + s.segundos, 0) / 60;
  }
  function compreensaoMedia() {
    const q = stats.quizzes.slice(-10);
    return q.length ? q.reduce((a, x) => a + x.acertos / x.total, 0) / q.length : null;
  }

  // ================= Estado do leitor =================
  const E = {
    doc: null, t: null, i: 0, tocando: false, timer: 0, lidas: 0, inicioSessao: 0, idxSessao: 0,
    fala: null, wake: null, secao: 'ler', filtro: 'todos', busca: '',
    janela: null, spans: null, destacados: [], parAtual: -1
  };
  const app = $('#app');

  function bloco() {
    if (!E.t) return [0, 0];
    const k = prefs.modo === 'rsvp' ? limitar(prefs.palavrasPorVez, 1, 3) : 1;
    return M.bloco(E.t, E.i, k);
  }

  async function abrirDoc(doc) {
    pausar();
    const caps = (await BD.get('textos', doc.id)) || [];
    E.t = M.processar(caps);
    E.doc = doc;
    E.i = limitar(doc.pos || 0, 0, Math.max(0, E.t.total - 1));
    E.janela = null;
    doc.ultima = Date.now();
    salvarDocs();
    LS.set('rsvp.aberto', doc.id);
    renderLista();
    renderTudo();
  }

  function fecharDoc() {
    pausar();
    E.doc = null; E.t = null; E.i = 0; E.janela = null;
    renderTudo();
  }

  // ---------- reprodução ----------
  function tocar() {
    if (!E.t || !E.t.total || E.tocando) return;
    if (E.i >= E.t.total - 1) E.i = 0;
    E.tocando = true;
    E.lidas = 0;
    E.inicioSessao = Date.now();
    E.idxSessao = E.i;
    pedirTelaAcesa();
    if (prefs.narracao && 'speechSynthesis' in window) falar(E.i);
    else passo();
    atualizarPlay();
  }

  function passo() {
    const [a, b] = bloco();
    const d = M.duracaoBloco(E.t, a, b, prefsMotor(), E.lidas);
    E.timer = setTimeout(() => {
      if (!E.tocando) return;
      E.lidas += b - a;
      if (b >= E.t.total) { E.i = E.t.total - 1; pausar(); atualizarLeitura(); return; }
      E.i = b;
      atualizarLeitura();
      passo();
    }, Math.max(30, d * 1000));
  }

  function pausar() {
    clearTimeout(E.timer);
    E.timer = 0;
    if (E.fala) { E.fala = null; try { speechSynthesis.cancel(); } catch (e) { /* ok */ } }
    if (!E.tocando) return;
    E.tocando = false;
    registrarSessao();
    soltarTelaAcesa();
    atualizarPlay();
  }

  const alternar = () => (E.tocando ? pausar() : tocar());

  function registrarSessao() {
    if (!E.inicioSessao || !E.doc) return;
    const seg = (Date.now() - E.inicioSessao) / 1000;
    const palavras = E.i - E.idxSessao;
    E.inicioSessao = 0;
    if (palavras >= 10 && seg >= 3) {
      stats.sessoes.push({ data: Date.now(), doc: E.doc.id, titulo: E.doc.titulo, palavras, segundos: seg });
      salvarStats();
      renderMini();
    }
    salvarPos();
  }

  function salvarPos() {
    if (!E.doc) return;
    E.doc.pos = E.i;
    E.doc.ultima = Date.now();
    salvarDocs();
  }

  function mover(fn) {
    const estava = E.tocando;
    if (estava) pausar();
    fn();
    atualizarLeitura();
    if (estava) tocar(); else salvarPos();
  }

  const irPara = (i) => { if (E.t && E.t.total) mover(() => { E.i = limitar(i, 0, E.t.total - 1); }); };
  const voltarFrase = () => { if (E.t && E.t.total) mover(() => { E.i = M.fraseAnterior(E.t, E.i); }); };
  const avancarFrase = () => { if (E.t && E.t.total) mover(() => { E.i = M.proximaFrase(E.t, E.i); }); };

  function mudarPPM(v) {
    prefs.ppm = limitar(Math.round(v / 10) * 10, 100, 1200);
    salvarPrefs();
    atualizarVelocidade();
    if (E.tocando && E.fala) mover(() => {});
  }

  // ---------- narração ----------
  function falar(desde) {
    const t = E.t;
    const fim = Math.min(t.total, desde + 80);
    let s = '';
    const offs = [];
    for (let k = desde; k < fim; k++) { if (k > desde) s += ' '; offs.push(s.length); s += t.palavras[k]; }
    const u = new SpeechSynthesisUtterance(s);
    u.lang = prefs.voz;
    try {
      const v = speechSynthesis.getVoices().find((x) => (x.lang || '').replace('_', '-').toLowerCase().startsWith(prefs.voz.toLowerCase()));
      if (v) u.voice = v;
    } catch (e) { /* voz padrão */ }
    u.rate = limitar(prefs.ppm / 180, 0.5, 3);
    u.onboundary = (ev) => {
      if (u !== E.fala || !E.tocando) return;
      if (ev.name && ev.name !== 'word') return;
      let a = 0, b = offs.length - 1, achado = 0;
      while (a <= b) { const m = (a + b) >> 1; if (offs[m] <= ev.charIndex) { achado = m; a = m + 1; } else b = m - 1; }
      E.i = desde + achado;
      atualizarLeitura();
    };
    u.onend = () => {
      if (u !== E.fala || !E.tocando) return;
      if (fim >= t.total) { E.i = t.total - 1; pausar(); atualizarLeitura(); }
      else { E.i = fim; atualizarLeitura(); falar(fim); }
    };
    u.onerror = () => { if (u === E.fala) { E.fala = null; pausar(); avisar('A narração parou. Verifique se o iPad não está no modo silencioso.'); } };
    E.fala = u;
    speechSynthesis.speak(u);
  }

  // ---------- tela acesa ----------
  async function pedirTelaAcesa() {
    try { if ('wakeLock' in navigator && !E.wake) E.wake = await navigator.wakeLock.request('screen'); } catch (e) { E.wake = null; }
  }
  function soltarTelaAcesa() { try { if (E.wake) E.wake.release(); } catch (e) { /* ok */ } E.wake = null; }

  // ================= Som de chuva (gerado no próprio app) =================
  const SOM = { ctx: null, fonte: null, ganho: null, audio: null, url: null, ligado: false, cache: {} };
  const SONS = [['rainL', 'Chuva leve'], ['rain', 'Chuva moderada'], ['rainH', 'Chuva forte'], ['brown', 'Ruído grave (marrom)'], ['white', 'Ruído branco']];
  const volK = () => Math.pow((prefs.somVol || 70) / 70, 2);

  function gerarChuva(ctx, tipo) {
    const sr = ctx.sampleRate, N = Math.round(sr * 24), F = Math.round(sr * 1.5), L = N + F;
    const P = { rainL: { d: 55, bed: 0.55, top: 6500 }, rain: { d: 140, bed: 0.8, top: 8500 }, rainH: { d: 280, bed: 1.1, top: 10500 } }[tipo] || { d: 140, bed: 0.8, top: 8500 };
    const buf = ctx.createBuffer(2, N, sr);
    for (let ch = 0; ch < 2; ch++) {
      const x = new Float32Array(L);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < L; i++) { // ruído rosa
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        x[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
      const a = Math.exp(-2 * Math.PI * 350 / sr), lp = 1 - Math.exp(-2 * Math.PI * P.top / sr);
      let hp = 0, xp = 0, ly = 0, br = 0;
      for (let i = 0; i < L; i++) { // passa-faixa: chiado da chuva
        const v = x[i]; hp = a * (hp + v - xp); xp = v; ly += lp * (hp - ly); br += 0.01 * ((Math.random() * 2 - 1) - br);
        x[i] = ly * P.bed + br * 0.05;
      }
      const nd = Math.round(P.d * L / sr);
      for (let k = 0; k < nd; k++) { // gotas
        const pos = Math.floor(Math.random() * L), amp = Math.exp((Math.random() - 0.5) * 2.4) * 0.1 * (Math.random() < 0.05 ? 3 : 1);
        const tau = sr * (0.0012 + Math.random() * 0.006), len = Math.min(Math.floor(tau * 6), 3000), f = 1800 + Math.random() * 5200, ping = k % 9 === 0;
        let z = 0;
        for (let j = 0; j < len; j++) {
          const env = Math.exp(-j / tau), nz = Math.random() * 2 - 1; z += 0.55 * (nz - z);
          x[(pos + j) % L] += ((nz - z) * amp + (ping ? Math.sin(j * 2 * Math.PI * f / sr) * amp * 0.4 : 0)) * env;
        }
      }
      const c1 = 3 + ch, c2 = 7 + 2 * ch, p1 = Math.random() * 6.28, p2 = Math.random() * 6.28, o = buf.getChannelData(ch);
      for (let i = 0; i < N; i++) { // emenda sem estalo e variação lenta de intensidade
        let v = x[i];
        if (i < F) { const tt = i / F; v = x[i] * Math.sin(tt * Math.PI / 2) + x[N + i] * Math.cos(tt * Math.PI / 2); }
        o[i] = v * (1 + 0.16 * Math.sin(2 * Math.PI * i / N * c1 + p1) + 0.09 * Math.sin(2 * Math.PI * i / N * c2 + p2));
      }
      let ss = 0;
      for (let i = 0; i < N; i += 7) ss += o[i] * o[i];
      const k2 = 0.16 / (Math.sqrt(ss / (N / 7)) || 1);
      for (let i = 0; i < N; i++) o[i] = Math.tanh(o[i] * k2 * 1.4) * 0.8;
    }
    return buf;
  }

  function pararSom() {
    try { if (SOM.fonte) { SOM.fonte.stop(); SOM.fonte.disconnect(); } } catch (e) { /* ok */ }
    SOM.fonte = null; SOM.ganho = null;
    if (SOM.audio) { try { SOM.audio.pause(); } catch (e) { /* ok */ } SOM.audio = null; }
    if (SOM.url) { try { URL.revokeObjectURL(SOM.url); } catch (e) { /* ok */ } SOM.url = null; }
  }

  async function tocarSom() {
    pararSom();
    const tipo = prefs.som;
    if (tipo === 'arquivo') {
      const r = await BD.get('sons', 'meu');
      if (!r || !r.blob) { avisar('Nenhuma gravação guardada. Escolha um arquivo nos ajustes.'); SOM.ligado = false; atualizarBotaoSom(); return; }
      SOM.url = URL.createObjectURL(r.blob);
      SOM.audio = new Audio(SOM.url);
      SOM.audio.loop = true;
      SOM.audio.volume = Math.min(1, volK() * 0.3);
      try { await SOM.audio.play(); } catch (e) { avisar('Não consegui tocar esse arquivo de som.'); SOM.ligado = false; pararSom(); atualizarBotaoSom(); }
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      SOM.ctx = SOM.ctx || new AC();
      if (SOM.ctx.state === 'suspended') await SOM.ctx.resume();
      const ctx = SOM.ctx;
      let buf;
      const chuva = /^rain/.test(tipo);
      if (chuva) buf = SOM.cache[tipo] || (SOM.cache[tipo] = gerarChuva(ctx, tipo));
      else {
        const len = ctx.sampleRate * 3;
        buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        let l = 0;
        for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; if (tipo === 'brown') { l = (l + 0.02 * w) / 1.02; d[i] = l * 3.2; } else d[i] = w * 0.5; }
      }
      const s = ctx.createBufferSource();
      s.buffer = buf; s.loop = true;
      let saida = s;
      if (!chuva) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = tipo === 'white' ? 5000 : 900; s.connect(f); saida = f; }
      const g = ctx.createGain();
      const alvo = (chuva ? 0.2 : 0.1) * volK();
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(alvo, ctx.currentTime + 2);
      saida.connect(g); g.connect(ctx.destination);
      s.start();
      SOM.fonte = s; SOM.ganho = g; SOM.k = chuva ? 0.2 : 0.1;
    } catch (e) {
      avisar('Este navegador não deixou tocar o som.');
      SOM.ligado = false;
      atualizarBotaoSom();
    }
  }

  function alternarSom() {
    SOM.ligado = !SOM.ligado;
    if (SOM.ligado) tocarSom(); else pararSom();
    atualizarBotaoSom();
  }

  function ajustarVolume() {
    if (SOM.ganho && SOM.ctx) {
      const t = SOM.ctx.currentTime;
      SOM.ganho.gain.cancelScheduledValues(t);
      SOM.ganho.gain.setValueAtTime(SOM.ganho.gain.value, t);
      SOM.ganho.gain.linearRampToValueAtTime((SOM.k || 0.2) * volK(), t + 0.15);
    }
    if (SOM.audio) SOM.audio.volume = Math.min(1, volK() * 0.3);
  }

  function atualizarBotaoSom() {
    for (const b of [$('#btSom'), $('#focoSom')]) {
      b.setAttribute('aria-pressed', SOM.ligado ? 'true' : 'false');
      b.setAttribute('aria-label', SOM.ligado ? 'Desligar som de chuva' : 'Ligar som de chuva');
    }
    const bt = $('#btTocarSom');
    if (bt) bt.textContent = SOM.ligado ? 'Desligar som' : 'Tocar som';
  }

  // ================= Renderização =================
  function renderTudo() {
    const temDoc = !!(E.doc && E.t);
    app.classList.toggle('sem-doc', !temDoc);
    $('#vazio').hidden = temDoc;
    aplicarClassesModo();
    $('#titulo').textContent = temDoc ? E.doc.titulo : 'Leitor RSVP';
    renderMarcas();
    renderTexto(true);
    atualizarLeitura();
    atualizarVelocidade();
    atualizarPlay();
    renderPainel();
  }

  function aplicarClassesModo() {
    for (const m of ['rsvp', 'guiada', 'bionica']) app.classList.toggle('modo-' + m, prefs.modo === m);
    app.classList.toggle('so-faixa', prefs.modo === 'rsvp' && !prefs.mostrarTexto);
    app.classList.toggle('sem-guia', !prefs.linhasGuia);
    $$('.modos button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modo === prefs.modo)));
  }

  function atualizarPlay() {
    for (const b of $$('.bt-play')) {
      b.innerHTML = icone(E.tocando ? 'pausa' : 'play');
      b.setAttribute('aria-label', E.tocando ? 'Pausar' : 'Ler');
    }
  }

  function atualizarVelocidade() {
    for (const b of $$('.vel-valor b')) b.textContent = prefs.ppm;
    const r = $('#pPpm'); if (r && document.activeElement !== r) r.value = prefs.ppm;
    const v = $('#vPpm'); if (v) v.textContent = prefs.ppm + ' ppm';
    atualizarSubtitulo();
  }

  function atualizarSubtitulo() {
    if (!E.t || !E.t.total) { $('#subtitulo').textContent = ''; return; }
    const n = M.capituloDe(E.t, E.i);
    const cap = E.t.capitulos[n] ? E.t.capitulos[n].titulo : '';
    const min = Math.ceil(M.minutos(M.fimCapitulo(E.t, n) - E.i, prefsMotor()));
    const resto = min <= 1 ? 'falta 1 min' : `faltam ${min} min`;
    $('#subtitulo').textContent = cap && E.t.capitulos.length > 1 ? `${cap} · ${resto}` : resto;
    $('#focoCap').textContent = cap;
    $('#capRot').textContent = E.t.capitulos.length > 1 ? `Cap. ${n + 1}/${E.t.capitulos.length}` : '';
  }

  const faixas = [
    { raiz: $('#faixaPrincipal'), escala: 1 },
    { raiz: $('#faixaFoco'), escala: 1.4 }
  ].map((f) => ({ ...f, caixa: $('.faixa-palavra', f.raiz), palavra: $('.palavra', f.raiz), esq: $('.esq', f.raiz), foco: $('.foco-letra', f.raiz), dir: $('.dir', f.raiz), ctx: $('.contexto', f.raiz) }));

  function desenharFaixa(f) {
    if (!E.t || !E.t.total) return;
    if (f.raiz.offsetParent === null && f.escala > 1 && $('#foco').hidden) return;
    const [a, b] = bloco();
    const ws = E.t.palavras.slice(a, b);
    const [esq, foco, dir] = M.partesBloco(ws);
    f.esq.textContent = esq; f.foco.textContent = foco; f.dir.textContent = dir;
    const base = prefs.tamanhoPalavra * f.escala;
    const largura = f.palavra.clientWidth || 600;
    const lados = Math.max(Array.from(esq).length, Array.from(dir).length);
    const tam = Math.max(18, Math.min(base, largura / ((2 * lados + 1) * 0.6)));
    f.palavra.style.fontSize = tam + 'px';
    f.caixa.style.height = Math.round(base * 1.35 + 40 * f.escala) + 'px';
    f.caixa.style.setProperty('--tique', Math.round(16 * f.escala) + 'px');
    const antes = M.texto(E.t, Math.max(0, a - 7), a).replace(/\n+/g, ' ');
    const atual = M.texto(E.t, a, b).replace(/\n+/g, ' ');
    const depois = M.texto(E.t, b, Math.min(E.t.total, b + 7)).replace(/\n+/g, ' ');
    f.ctx.innerHTML = (antes ? '…' + esc(antes) + ' ' : '') + '<b>' + esc(atual) + '</b>' + (depois ? ' ' + esc(depois) + '…' : '');
    f.ctx.style.fontSize = Math.round(15 * f.escala) + 'px';
  }

  function atualizarLeitura() {
    if (!E.t || !E.t.total) return;
    for (const f of faixas) desenharFaixa(f);
    atualizarDestaque();
    const pct = E.t.total > 1 ? E.i / (E.t.total - 1) : 0;
    if (!E.arrastando) {
      $('#trilhaCheia').style.width = (pct * 100) + '%';
      $('#trilhaBotao').style.left = (pct * 100) + '%';
      $('#pct').textContent = Math.round(pct * 100) + '%';
    }
    $('#trilha').setAttribute('aria-valuenow', String(Math.round(pct * 100)));
    $('#focoCheia').style.width = (pct * 100) + '%';
    $('#focoPct').textContent = Math.round(pct * 100) + '%';
    const marcado = !!(E.doc && E.doc.marcadores.some((m) => Math.abs(m - E.i) < 15));
    const bm = $('#btMarca');
    bm.setAttribute('aria-pressed', String(marcado));
    bm.setAttribute('aria-label', marcado ? 'Remover marcador' : 'Adicionar marcador');
    atualizarSubtitulo();
    if (!$('#focoPar').hidden) mostrarParagrafoFoco();
  }

  function renderMarcas() {
    const box = $('#marcas');
    if (!E.t || E.t.total < 2) { box.innerHTML = ''; return; }
    box.innerHTML = E.t.capitulos.slice(1).map((c) => `<span class="marca" style="left:${(c.inicio / (E.t.total - 1)) * 100}%"></span>`).join('');
    $('#focoTitulo').textContent = E.doc.titulo;
  }

  // ---------- texto completo (renderiza só uma janela de parágrafos) ----------
  function palavraHTML(w, i) {
    if (prefs.modo !== 'bionica') return `<span data-i="${i}">${esc(w)}</span>`;
    const a = Array.from(w);
    const k = a.length <= 3 ? 1 : Math.ceil(a.length * 0.5);
    return `<span data-i="${i}"><b>${esc(a.slice(0, k).join(''))}</b>${esc(a.slice(k).join(''))}</span>`;
  }

  function renderTexto(forcar) {
    const box = $('#texto');
    if (!E.t || !E.t.total) { box.innerHTML = ''; E.janela = null; return; }
    const p = E.t.parDe[E.i];
    const j = E.janela, n = E.t.paragrafos.length;
    const precisa = forcar || !j || p < j.lo || p >= j.hi || (p < j.lo + 5 && j.lo > 0) || (p >= j.hi - 15 && j.hi < n);
    if (!precisa) return;
    renderJanela(Math.max(0, p - 40), Math.min(n, p + 90));
  }

  function renderJanela(lo, hi) {
    const box = $('#texto');
    const t = E.t;
    const titulos = new Map(t.capitulos.map((c) => [c.par, c.titulo]));
    const partes = [];
    if (lo > 0) partes.push('<button class="bt mais-texto" data-mais="antes">Mostrar trecho anterior</button>');
    for (let k = lo; k < hi; k++) {
      if (titulos.has(k) && t.capitulos.length > 1) partes.push(`<h3>${esc(titulos.get(k))}</h3>`);
      const [a, b] = t.paragrafos[k];
      const ws = [];
      for (let i = a; i < b; i++) ws.push(palavraHTML(t.palavras[i], i));
      partes.push(`<p data-p="${k}">${ws.join(' ')}</p>`);
    }
    if (hi < t.paragrafos.length) partes.push('<button class="bt mais-texto" data-mais="depois">Mostrar mais texto</button>');
    box.innerHTML = partes.join('');
    E.janela = { lo, hi };
    E.spans = new Map();
    for (const s of box.querySelectorAll('span[data-i]')) E.spans.set(+s.dataset.i, s);
    E.paras = new Map();
    for (const el of box.querySelectorAll('p[data-p]')) E.paras.set(+el.dataset.p, el);
    E.destacados = [];
    E.parAtual = -1;
    atualizarDestaque(true);
  }

  function atualizarDestaque(rolarSempre) {
    if (!E.t || !E.t.total || !E.spans) return;
    const p = E.t.parDe[E.i];
    if (E.janela && (p < E.janela.lo || p >= E.janela.hi)) { renderTexto(true); return; }
    renderTexto(false);
    for (const s of E.destacados) s.classList.remove('atual');
    E.destacados = [];
    const [a, b] = bloco();
    for (let i = a; i < b; i++) { const s = E.spans.get(i); if (s) { s.classList.add('atual'); E.destacados.push(s); } }
    if (p !== E.parAtual || rolarSempre) {
      for (const [k, el] of E.paras) el.classList.toggle('lido', k < p);
      E.parAtual = p;
      const el = E.paras.get(p);
      const box = $('#texto');
      if (el && box.offsetParent !== null) {
        const alvo = el.offsetTop - box.clientHeight * 0.25;
        box.scrollTo({ top: Math.max(0, alvo), behavior: rolarSempre || reduzirMov() ? 'auto' : 'smooth' });
      }
    }
  }

  // ---------- biblioteca ----------
  function renderFiltros() {
    $('#filtros').innerHTML = FILTROS.map(([id, nome]) => `<button data-filtro="${id}" aria-pressed="${E.filtro === id}">${nome}</button>`).join('');
  }

  function grupoTipo(t) { return t === 'epub' ? 'epub' : t === 'pdf' ? 'pdf' : 'outros'; }

  function renderLista() {
    const q = E.busca.trim().toLowerCase();
    const lista = docs.slice().sort((a, b) => (b.ultima || b.adicionado) - (a.ultima || a.adicionado))
      .filter((d) => (E.filtro === 'todos' || grupoTipo(d.tipo) === E.filtro) && (!q || d.titulo.toLowerCase().includes(q) || (d.autor || '').toLowerCase().includes(q)));
    const box = $('#lista');
    if (!lista.length) { box.innerHTML = `<p class="lista-vazia">${q ? 'Nenhum resultado.' : 'Nada aqui ainda. Toque em + para importar.'}</p>`; return; }
    box.innerHTML = lista.map((d) => {
      const prog = d.total > 1 ? Math.min(1, d.pos / (d.total - 1)) : 0;
      const resta = Math.max(0, d.total - d.pos);
      const det = [TIPOS[d.tipo] || d.tipo, d.autor, Math.round(prog * 100) + '%', resta > 0 ? Math.max(1, Math.round(resta / 250)) + ' min' : 'lido'].filter(Boolean).join(' · ');
      const aberto = E.doc && E.doc.id === d.id;
      return `<div class="item${aberto ? ' aberto' : ''}">
        <button class="item-abrir" data-abrir="${esc(d.id)}"${aberto ? ' aria-current="true"' : ''}>
          <span class="capa" style="background:${CORES[d.cor % CORES.length]}">${esc((TIPOS[d.tipo] || '').toUpperCase())}</span>
          <span class="item-info"><b>${esc(d.titulo)}</b><small>${esc(det)}</small><span class="barrinha"><i style="width:${prog * 100}%"></i></span></span>
        </button>
        <button class="item-mais" data-opcoes="${esc(d.id)}" aria-label="Opções de ${esc(d.titulo)}">${icone('pontos')}</button>
      </div>`;
    }).join('');
  }

  function renderMini() {
    const s = sequencia();
    $('#miniSeq').textContent = `${s} dia${s === 1 ? '' : 's'}`;
    const m = mediaSemana();
    $('#miniMedia').textContent = m > 0 ? `${Math.round(m)} ppm` : '—';
  }

  // ---------- painel de ajustes ----------
  function sw(id, pref, titulo, detalhe) {
    return `<div class="linha"><label for="${id}">${titulo}${detalhe ? `<small>${detalhe}</small>` : ''}</label><input type="checkbox" role="switch" class="sw" id="${id}" data-pref="${pref}" ${prefs[pref] ? 'checked' : ''}></div>`;
  }
  function seg(pref, opcoes) {
    return `<div class="seg cheio" role="group">${opcoes.map(([v, n]) => `<button data-seg="${pref}" data-valor="${v}" aria-pressed="${String(prefs[pref]) === String(v)}">${n}</button>`).join('')}</div>`;
  }

  function renderPainel() {
    const temas = todosTemas();
    const sel = (t) => (prefs.seguirSistema ? (prefs.temaID === t.id || prefs.temaEscuroID === t.id) : prefs.temaID === t.id);
    const vozes = [['pt-BR', 'Português (Brasil)'], ['pt-PT', 'Português (Portugal)'], ['en-US', 'Inglês'], ['es-ES', 'Espanhol'], ['fr-FR', 'Francês']];
    const sons = SONS.concat(prefs.somNome ? [['arquivo', 'Minha gravação: ' + prefs.somNome]] : []);
    const pers = prefs.temaID === 'personalizado' || prefs.temaEscuroID === 'personalizado';
    const c = contraste(prefs.persFundo, prefs.persTexto);
    $('#painel').innerHTML = `
      <div class="so-folha"><div class="puxador"></div></div>
      <div class="painel-topo"><h2>Ajustes de leitura</h2><button class="ic so-folha" id="fecharFolha" aria-label="Fechar ajustes">${icone('x')}</button></div>
      <div class="grupo">
        <div class="linha"><label for="pPpm">Velocidade</label><span class="valor" id="vPpm">${prefs.ppm} ppm</span></div>
        <input type="range" id="pPpm" min="100" max="1200" step="10" value="${prefs.ppm}">
        <span>Palavras por vez</span>
        ${seg('palavrasPorVez', [[1, '1'], [2, '2'], [3, '3']])}
      </div>
      <div class="grupo">
        <span class="rot">Ritmo</span>
        ${sw('pPausa', 'pausaPontuacao', 'Pausa em pontuação')}
        ${sw('pLongas', 'palavrasLongas', 'Palavras longas mais lentas')}
        ${sw('pAcel', 'aceleracao', 'Aceleração gradual', 'Começa mais devagar a cada play')}
        ${sw('pNarr', 'narracao', 'Narração em voz', 'A voz dita o ritmo das palavras')}
        ${prefs.narracao ? `<div class="linha"><label for="pVoz">Idioma da voz</label><select id="pVoz" data-pref="voz">${vozes.map(([v, n]) => `<option value="${v}" ${prefs.voz === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>` : ''}
      </div>
      <div class="grupo">
        <span class="rot">Som ambiente</span>
        <div class="linha"><label for="pSom">Som</label><select id="pSom" data-pref="som">${sons.map(([v, n]) => `<option value="${v}" ${prefs.som === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
        <div class="linha"><label for="pVol">Volume</label><span class="valor" id="vVol">${prefs.somVol}%</span></div>
        <input type="range" id="pVol" min="5" max="100" step="5" value="${prefs.somVol}">
        <div class="acoes">
          <button class="bt cheio" id="btTocarSom">${SOM.ligado ? 'Desligar som' : 'Tocar som'}</button>
          <button class="bt" id="btArquivoSom">${prefs.somNome ? 'Trocar gravação' : 'Usar gravação minha'}</button>
          ${prefs.somNome ? '<button class="bt perigo" id="btRemoverSom">Remover gravação</button>' : ''}
        </div>
        <span class="nota">O som de chuva é gerado pelo próprio app e funciona sem internet.</span>
      </div>
      <div class="grupo">
        <span class="rot">Aparência</span>
        ${sw('pGuia', 'linhasGuia', 'Linhas guia na letra de foco')}
        ${sw('pTexto', 'mostrarTexto', 'Mostrar texto completo', 'No modo RSVP')}
        <span>Fonte</span>
        ${seg('fonte', Object.entries(FONTES).map(([k, f]) => [k, f.nome]))}
        <div class="linha"><label for="pTamP">Tamanho da palavra</label><span class="valor" id="vTamP">${prefs.tamanhoPalavra}</span></div>
        <input type="range" id="pTamP" min="36" max="120" step="2" value="${prefs.tamanhoPalavra}">
        <div class="linha"><label for="pTamT">Tamanho do texto</label><span class="valor" id="vTamT">${prefs.tamanhoTexto}</span></div>
        <input type="range" id="pTamT" min="14" max="30" step="1" value="${prefs.tamanhoTexto}">
      </div>
      <div class="grupo">
        <span class="rot">Tema</span>
        <div class="temas">${temas.map((t) => `<button class="tema" data-tema="${t.id}" aria-pressed="${sel(t)}"><span class="amostra" style="background:${t.fundo};color:${t.texto}">le<span style="color:${t.foco}">i</span>tura</span><span>${t.nome}</span></button>`).join('')}</div>
        ${sw('pSist', 'seguirSistema', 'Seguir o sistema', 'Um tema claro de dia e um escuro quando o iPad estiver no modo escuro')}
        ${sw('pNoite', 'noiteAuto', 'Noite âmbar automática', 'Entre 21h e 6h, sem luz azul')}
        ${pers ? `<div class="cores">
          <div class="linha"><label for="cFundo">Fundo</label><input type="color" id="cFundo" data-cor="persFundo" value="${prefs.persFundo}"></div>
          <div class="linha"><label for="cTexto">Texto</label><input type="color" id="cTexto" data-cor="persTexto" value="${prefs.persTexto}"></div>
          <div class="linha"><label for="cFoco">Letra de foco</label><input type="color" id="cFoco" data-cor="persFoco" value="${prefs.persFoco}"></div>
          ${c < 4.5 ? `<div class="alerta">Contraste baixo (${c.toFixed(1)}:1). O recomendado é 4,5:1 ou mais.</div>` : ''}
        </div>` : ''}
      </div>
      ${E.doc ? `<div class="ferramentas">
        <button class="bt" id="btResumo">${icone('faisca')}Resumir capítulo</button>
        <button class="bt cheio" id="btQuiz">${icone('check')}Testar compreensão</button>
      </div>` : ''}`;
  }

  function mudouPref(pref) {
    salvarPrefs();
    if (['pausaPontuacao', 'palavrasLongas', 'aceleracao'].includes(pref)) { atualizarSubtitulo(); return; }
    if (pref === 'narracao') { if (E.tocando) mover(() => {}); renderPainel(); return; }
    if (pref === 'voz') { if (E.tocando && E.fala) mover(() => {}); return; }
    if (pref === 'som') { if (SOM.ligado) tocarSom(); return; }
    if (pref === 'seguirSistema' || pref === 'noiteAuto') { aplicarTema(); renderPainel(); return; }
    if (pref === 'fonte' || pref === 'tamanhoTexto') { aplicarTema(); atualizarLeitura(); return; }
    if (pref === 'modo') { aplicarClassesModo(); renderTexto(true); atualizarLeitura(); return; }
    if (pref === 'palavrasPorVez' || pref === 'linhasGuia' || pref === 'mostrarTexto' || pref === 'tamanhoPalavra') {
      aplicarClassesModo();
      atualizarLeitura();
      if (pref === 'mostrarTexto') atualizarDestaque(true);
    }
  }

  // ================= Layout e navegação =================
  const largo = () => innerWidth >= 900 && innerWidth > innerHeight;
  function avaliarLayout() {
    const l = largo();
    app.classList.toggle('largo', l);
    if (l) app.classList.remove('gaveta', 'folha');
    atualizarVeu();
    atualizarLeitura();
  }
  function atualizarVeu() {
    const l = largo();
    $('#veu').hidden = l || !(app.classList.contains('gaveta') || app.classList.contains('folha'));
    $('#btAjustes').setAttribute('aria-pressed', String(l ? !app.classList.contains('sem-painel') : app.classList.contains('folha')));
  }
  function alternarBiblioteca() {
    if (largo()) app.classList.toggle('sem-lib');
    else app.classList.toggle('gaveta');
    atualizarVeu();
    setTimeout(atualizarLeitura, 260);
  }
  function alternarAjustes() {
    if (largo()) app.classList.toggle('sem-painel');
    else { app.classList.toggle('folha'); if (app.classList.contains('folha')) $('#painel').scrollTop = 0; }
    atualizarVeu();
    setTimeout(atualizarLeitura, 260);
  }
  function fecharGavetas() { app.classList.remove('gaveta', 'folha'); atualizarVeu(); }

  function irSecao(s) {
    E.secao = s;
    for (const x of ['ler', 'treino', 'progresso']) app.classList.toggle('secao-' + x, x === s);
    $('#secLer').hidden = s !== 'ler';
    $('#secTreino').hidden = s !== 'treino';
    $('#secProgresso').hidden = s !== 'progresso';
    $$('.nav button').forEach((b) => { if (b.dataset.secao === s) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (s !== 'ler') pausar();
    if (s === 'treino') renderTreino();
    if (s === 'progresso') renderProgresso();
    if (s === 'ler') { renderTexto(true); atualizarLeitura(); }
  }

  function cabSecao(titulo) {
    return `<header class="cab"><button class="ic bt-lib" aria-label="Biblioteca">${icone('lateral')}</button><h2>${titulo}</h2><button class="bt cheio" data-secao-ir="ler">Voltar a ler</button></header>`;
  }

  // ================= Modo foco =================
  function abrirFoco() {
    if (!E.t) return;
    $('#foco').hidden = false;
    try { if (document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); } catch (e) { /* opcional */ }
    renderMarcas();
    atualizarLeitura();
    $('#focoFechar').focus();
  }
  function fecharFoco() {
    $('#foco').hidden = true;
    $('#focoPar').hidden = true;
    try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (e) { /* ok */ }
    salvarPos();
    atualizarDestaque(true);
    $('#btFoco').focus();
  }
  function mostrarParagrafoFoco() {
    if (!E.t) return;
    const p = E.t.parDe[E.i];
    const [a, b] = E.t.paragrafos[p];
    const [x, y] = bloco();
    const ws = [];
    for (let i = a; i < b; i++) ws.push(i >= x && i < y ? `<span class="atual">${esc(E.t.palavras[i])}</span>` : esc(E.t.palavras[i]));
    const box = $('#focoPar');
    box.innerHTML = ws.join(' ');
    box.hidden = false;
  }

  // ================= Janelas =================
  let aoFecharModal = null;
  function abrirModal(titulo, html, aoFechar) {
    $('#modalTitulo').textContent = titulo;
    $('#modalCorpo').innerHTML = html;
    $('#modal').hidden = false;
    aoFecharModal = aoFechar || null;
    const f = $('#modalCorpo').querySelector('input, textarea, button');
    (f || $('#modalFechar')).focus();
  }
  function fecharModal() {
    $('#modal').hidden = true;
    $('#modalCorpo').innerHTML = '';
    if (aoFecharModal) { const f = aoFecharModal; aoFecharModal = null; f(); }
  }

  let avisoTimer = 0;
  function avisar(msg) {
    const a = $('#aviso');
    a.textContent = msg;
    a.hidden = false;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => { a.hidden = true; }, 5000);
  }
  function carregando(msg) {
    $('#carregandoMsg').textContent = msg || '';
    $('#carregando').hidden = !msg;
  }

  function modalColar() {
    abrirModal('Colar texto', `
      <label class="sr" for="colarTitulo">Título</label>
      <input id="colarTitulo" class="campo" placeholder="Título (opcional)">
      <label class="sr" for="colarTexto">Texto</label>
      <textarea id="colarTexto" class="campo" placeholder="Cole ou digite o texto aqui"></textarea>
      <div class="acoes"><button class="bt cheio" id="colarOk">Adicionar à biblioteca</button><button class="bt" data-fechar>Cancelar</button></div>`);
  }

  function modalOpcoes(id) {
    const d = docs.find((x) => x.id === id);
    if (!d) return;
    abrirModal(d.titulo, `
      <label for="novoTitulo">Título</label>
      <input id="novoTitulo" class="campo" value="${esc(d.titulo)}">
      <div class="acoes">
        <button class="bt cheio" data-renomear="${esc(id)}">Salvar título</button>
        <button class="bt" data-recomecar="${esc(id)}">Recomeçar do início</button>
        <button class="bt perigo" data-excluir="${esc(id)}">Excluir</button>
      </div>
      <div id="confirmaExcluir" hidden class="cartao">
        <p>O texto e o progresso de leitura serão apagados deste aparelho.</p>
        <div class="acoes"><button class="bt perigo" data-excluir-sim="${esc(id)}">Excluir de vez</button><button class="bt" data-fechar>Manter</button></div>
      </div>`);
  }

  function trechoAtual() {
    const t = E.t;
    if (!t || !t.total) return '';
    const n = M.capituloDe(t, E.i);
    const ini = t.capitulos.length ? t.capitulos[n].inicio : 0;
    const fimCap = M.fimCapitulo(t, n);
    const fim = E.i - ini >= 150 ? E.i : Math.min(fimCap, ini + 1500);
    return M.texto(t, Math.max(ini, fim - 1500), fim);
  }

  function modalResumo() {
    pausar();
    const frases = M.resumo(trechoAtual(), 6);
    const n = M.capituloDe(E.t, E.i);
    abrirModal('Resumo', `
      <h3 style="margin:0">${esc(E.t.capitulos[n] ? E.t.capitulos[n].titulo : E.doc.titulo)}</h3>
      ${frases.length ? `<ul class="resumo">${frases.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : '<p>Ainda não há texto suficiente para resumir.</p>'}
      <p class="nota">Resumo automático com as frases mais importantes do trecho que você leu, feito no próprio aparelho.</p>`);
  }

  const QUIZ = { perguntas: [], atual: 0, escolha: null, acertos: 0 };
  function modalQuiz() {
    pausar();
    QUIZ.perguntas = M.lacunas(trechoAtual(), 5);
    QUIZ.atual = 0; QUIZ.escolha = null; QUIZ.acertos = 0;
    abrirModal('Compreensão', '<div id="quiz"></div>');
    renderQuiz();
  }
  function renderQuiz() {
    const box = $('#quiz');
    if (!box) return;
    const ps = QUIZ.perguntas;
    if (!ps.length) { box.innerHTML = '<p>Ainda não há texto suficiente para montar perguntas. Leia mais um pouco e tente de novo.</p>'; return; }
    if (QUIZ.atual >= ps.length) {
      const pct = QUIZ.acertos / ps.length;
      const delta = pct >= 0.8 ? 25 : pct < 0.6 ? -25 : 0;
      const novo = limitar(prefs.ppm + delta, 100, 1200);
      box.innerHTML = `<div class="coluna" style="gap:14px;margin:0">
        <h3 style="margin:0;font-size:28px">${QUIZ.acertos} de ${ps.length} acertos</h3>
        <p>${pct >= 0.8 ? 'Ótima compreensão. Dá para acelerar um pouco.' : pct >= 0.6 ? 'Boa compreensão. Mantenha essa velocidade por enquanto.' : 'Muita coisa passou despercebida. Vale reduzir um pouco a velocidade.'}</p>
        ${delta ? `<div class="acoes"><button class="bt cheio" data-ppm="${novo}">Mudar para ${novo} ppm</button></div>` : ''}
      </div>`;
      return;
    }
    const q = ps[QUIZ.atual];
    box.innerHTML = `<div class="coluna" style="gap:12px;margin:0">
      <span class="nota">Pergunta ${QUIZ.atual + 1} de ${ps.length}</span>
      <p style="font-size:18px;font-weight:600">${esc(q.enunciado)}</p>
      <div class="opcoes">${q.opcoes.map((o, i) => {
        let cls = '';
        if (QUIZ.escolha !== null) cls = i === q.correta ? ' certa' : (i === QUIZ.escolha ? ' errada' : '');
        const marca = QUIZ.escolha !== null && i === q.correta ? ' <span aria-label="resposta certa">✓</span>' : (QUIZ.escolha === i && i !== q.correta ? ' <span aria-label="resposta errada">✕</span>' : '');
        return `<button class="opcao${cls}" data-resp="${i}" aria-pressed="${QUIZ.escolha === i}">${esc(o)}${marca}</button>`;
      }).join('')}</div>
      ${QUIZ.escolha !== null ? `<div class="acoes"><button class="bt cheio" data-proxima>${QUIZ.atual + 1 === ps.length ? 'Ver resultado' : 'Próxima'}</button></div>` : ''}
      <p class="nota">Perguntas de completar a frase, tiradas do trecho que você leu.</p>
    </div>`;
  }

  // ================= Treino =================
  const TREINO_TEXTO = [
    'A biblioteca da pequena cidade de Vale Claro abria só depois que o sol se punha. A ideia tinha sido de uma bibliotecária aposentada chamada Lúcia, que percebeu que os moradores trabalhavam o dia inteiro na colheita e nunca conseguiam aparecer no horário comum.',
    'No primeiro mês, quase ninguém foi. As lâmpadas amarelas ficavam acesas sobre mesas vazias, e Lúcia passava as noites organizando fichas e consertando lombadas soltas. Mesmo assim, ela deixava a porta aberta até as onze.',
    'Tudo mudou quando um grupo de crianças descobriu que, nas sextas-feiras, ela lia histórias em voz alta para quem estivesse lá. As crianças começaram a levar os pais, os pais levaram os vizinhos, e em pouco tempo a sala precisou de mais cadeiras.',
    'Hoje a biblioteca noturna tem três voluntários, um clube de leitura às terças e uma regra curiosa: cada pessoa que devolve um livro deixa um bilhete dentro dele para o próximo leitor. Os bilhetes ficam guardados numa caixa de madeira perto da entrada, e Lúcia diz que eles contam a história da cidade melhor do que qualquer jornal.'
  ];
  const TREINO_PERG = [
    { enunciado: 'Por que a biblioteca abria à noite?', opcoes: ['Para economizar energia', 'Porque os moradores trabalhavam de dia', 'Por causa do calor', 'Por ordem da prefeitura'], correta: 1 },
    { enunciado: 'O que fez o movimento aumentar?', opcoes: ['Um anúncio no jornal', 'Livros novos', 'Leituras em voz alta às sextas', 'Um café na entrada'], correta: 2 },
    { enunciado: 'O que cada leitor deixa ao devolver um livro?', opcoes: ['Um bilhete para o próximo leitor', 'Uma moeda', 'Um marcador de página', 'Uma assinatura no caderno'], correta: 0 }
  ];
  const TR = { etapa: 'inicio', inicio: 0, ppm: 0, resp: [null, null, null] };
  const trCompreensao = () => TREINO_PERG.filter((p, i) => TR.resp[i] === p.correta).length / TREINO_PERG.length;
  const trSugerido = () => limitar(Math.round(TR.ppm * (trCompreensao() >= 0.66 ? 1.3 : 1.1) / 10) * 10, 200, 600);

  function renderTreino() {
    let corpo = '';
    if (TR.etapa === 'inicio') {
      corpo = `<div class="cartao"><h3 style="font-size:24px">Teste de velocidade</h3>
        <p>Leia o texto no seu ritmo normal, sem pressa, e toque em Terminei. Depois responda 3 perguntas. Com isso o app calcula sua velocidade atual e sugere um ponto de partida para o leitor rápido.</p>
        <div class="acoes"><button class="bt cheio" data-treino="comecar">Começar</button></div></div>`;
    } else if (TR.etapa === 'lendo') {
      corpo = `<div class="cartao"><div class="leitura-treino">${TREINO_TEXTO.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
        <div class="acoes"><button class="bt cheio" data-treino="terminei">Terminei</button></div></div>`;
    } else if (TR.etapa === 'perguntas') {
      corpo = `<div class="cartao">${TREINO_PERG.map((q, i) => `<div class="grupo"><p style="font-weight:600">${i + 1}. ${esc(q.enunciado)}</p>
        <div class="opcoes">${q.opcoes.map((o, j) => `<button class="opcao" data-tr-p="${i}" data-tr-o="${j}" aria-pressed="${TR.resp[i] === j}">${esc(o)}</button>`).join('')}</div></div>`).join('')}
        <div class="acoes"><button class="bt cheio" data-treino="resultado" ${TR.resp.includes(null) ? 'disabled' : ''}>Ver resultado</button></div></div>`;
    } else {
      const s = trSugerido();
      corpo = `<div class="cartao"><h3 style="font-size:24px">Seu resultado</h3>
        <div class="numeros"><div class="cartao numero"><b>${Math.round(TR.ppm)}</b><small>ppm no ritmo normal</small></div><div class="cartao numero"><b>${Math.round(trCompreensao() * 100)}%</b><small>compreensão</small></div></div>
        <p>Sugestão para começar no leitor rápido: ${s} ppm.</p>
        <div class="acoes"><button class="bt cheio" data-ppm="${s}">Usar ${s} ppm</button><button class="bt" data-treino="refazer">Refazer teste</button></div></div>`;
    }
    const hist = stats.testes.slice(-5).reverse();
    const histHTML = hist.length ? `<div class="cartao"><span class="rot">Testes anteriores</span>${hist.map((t) => `<div class="sessao"><div><b>${new Date(t.data).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}</b></div><div>${Math.round(t.ppm)} ppm · ${Math.round(t.compreensao * 100)}%</div></div>`).join('')}</div>` : '';
    $('#secTreino').innerHTML = cabSecao('Treino') + `<div class="rolagem"><div class="coluna">${corpo}${histHTML}</div></div>`;
  }

  // ================= Progresso =================
  function graficoBarras(dados) {
    const W = 700, H = 230, esq = 52, base = 196, topo = 16;
    const max = Math.max(100, ...dados.map((d) => d.palavras));
    const passo = Math.pow(10, Math.floor(Math.log10(max)));
    const teto = Math.ceil(max / passo) * passo;
    const y = (v) => base - (v / teto) * (base - topo);
    const larg = (W - esq - 10) / dados.length;
    let s = `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Palavras lidas por dia nos últimos 7 dias">`;
    for (const v of [0, teto / 2, teto]) s += `<line x1="${esq}" x2="${W - 10}" y1="${y(v)}" y2="${y(v)}" stroke="var(--borda)" stroke-width="1"/><text x="${esq - 8}" y="${y(v) + 4}" text-anchor="end">${Math.round(v).toLocaleString('pt-BR')}</text>`;
    dados.forEach((d, k) => {
      const x = esq + k * larg + larg * 0.2, w = larg * 0.6, h = base - y(d.palavras);
      if (d.palavras > 0) s += `<rect x="${x}" y="${y(d.palavras)}" width="${w}" height="${Math.max(2, h)}" rx="4" fill="var(--acento)"><title>${d.palavras} palavras</title></rect>`;
      s += `<text x="${x + w / 2}" y="${H - 12}" text-anchor="middle">${new Date(d.dia).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</text>`;
    });
    return s + '</svg>';
  }

  function graficoLinha(dados) {
    const W = 700, H = 210, esq = 52, base = 176, topo = 16;
    const pts = dados.map((d, k) => ({ ...d, k })).filter((d) => d.ppm > 0);
    if (!pts.length) return '<p class="nota">Leia um pouco para ver sua evolução aqui.</p>';
    const max = Math.max(...pts.map((d) => d.ppm)), min = Math.min(...pts.map((d) => d.ppm));
    const lo = Math.max(0, Math.floor((min - 50) / 50) * 50), hi = Math.ceil((max + 50) / 50) * 50;
    const larg = (W - esq - 10) / dados.length;
    const x = (k) => esq + k * larg + larg / 2;
    const y = (v) => base - ((v - lo) / (hi - lo)) * (base - topo);
    let s = `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Velocidade média por dia">`;
    for (const v of [lo, (lo + hi) / 2, hi]) s += `<line x1="${esq}" x2="${W - 10}" y1="${y(v)}" y2="${y(v)}" stroke="var(--borda)" stroke-width="1"/><text x="${esq - 8}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`;
    s += `<polyline fill="none" stroke="var(--acento)" stroke-width="2.5" stroke-linejoin="round" points="${pts.map((d) => `${x(d.k)},${y(d.ppm)}`).join(' ')}"/>`;
    pts.forEach((d, n) => { s += `<circle cx="${x(d.k)}" cy="${y(d.ppm)}" r="${n === pts.length - 1 ? 6 : 4}" fill="var(--acento)"><title>${Math.round(d.ppm)} ppm</title></circle>`; });
    dados.forEach((d, k) => { s += `<text x="${x(k)}" y="${H - 10}" text-anchor="middle">${new Date(d.dia).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</text>`; });
    return s + '</svg>';
  }

  function renderProgresso() {
    const dias = ultimosDias(7);
    const seq = sequencia(), media = mediaSemana(), hoje = minutosHoje(), comp = compreensaoMedia();
    const recentes = stats.sessoes.slice(-12).reverse();
    $('#secProgresso').innerHTML = cabSecao('Progresso') + `<div class="rolagem"><div class="coluna">
      <div class="numeros">
        <div class="cartao numero"><span>Sequência</span><b>${seq}</b><small>dias seguidos</small></div>
        <div class="cartao numero"><span>Média da semana</span><b>${media > 0 ? Math.round(media) : '—'}</b><small>palavras por minuto</small></div>
        <div class="cartao numero"><span>Meta de hoje</span><b>${Math.round(hoje)} / ${prefs.meta}</b><small>minutos</small>
          <span class="barrinha"><i style="width:${Math.min(100, hoje / prefs.meta * 100)}%;background:var(--acento)"></i></span>
          <span class="passo"><button data-meta="-5" aria-label="Diminuir meta">−</button><small>meta diária</small><button data-meta="5" aria-label="Aumentar meta">+</button></span></div>
        <div class="cartao numero"><span>Compreensão</span><b>${comp === null ? '—' : Math.round(comp * 100) + '%'}</b><small>média dos últimos quizzes</small></div>
      </div>
      <div class="cartao"><h3>Palavras lidas por dia</h3>${graficoBarras(dias)}</div>
      <div class="cartao"><h3>Velocidade média por dia (ppm)</h3>${graficoLinha(dias)}</div>
      <div class="cartao"><h3>Sessões recentes</h3>${recentes.length ? recentes.map((s) => `<div class="sessao"><div style="min-width:0"><b>${esc(s.titulo)}</b><small>${new Date(s.data).toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></div><div>${s.palavras} palavras<small>${Math.round(s.palavras / (s.segundos / 60))} ppm · ${Math.max(1, Math.round(s.segundos / 60))} min</small></div></div>`).join('') : '<p class="nota">Nenhuma sessão ainda. As leituras aparecem aqui quando você pausa.</p>'}</div>
    </div></div>`;
  }

  // ================= Importação =================
  function textoDeDocumento(doc, web) {
    let raiz = (web && (doc.querySelector('article') || doc.querySelector('main'))) || doc.body || doc.documentElement;
    if (!raiz) return '';
    raiz = raiz.cloneNode(true);
    raiz.querySelectorAll('script,style,noscript,svg,template,iframe,form,button,select' + (web ? ',nav,header,footer,aside,figure' : '')).forEach((e) => e.remove());
    const BLOCO = /^(P|DIV|SECTION|ARTICLE|H[1-6]|LI|UL|OL|TR|TABLE|BLOCKQUOTE|PRE|DD|DT|MAIN|BR|HR|FIGCAPTION|HEADER|FOOTER)$/;
    const out = [];
    let atual = '';
    const andar = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) atual += c.nodeValue;
        else if (c.nodeType === 1) {
          const b = BLOCO.test(c.tagName.toUpperCase());
          if (b) { out.push(atual); atual = ''; }
          andar(c);
          if (b) { out.push(atual); atual = ''; }
        }
      }
    };
    andar(raiz);
    out.push(atual);
    return out.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  }

  function decodificar(bytes) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (e) { return new TextDecoder('windows-1252').decode(bytes); }
  }

  async function importarEPUB(arquivo) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador não abre EPUB. Atualize o iPadOS para a versão 16.4 ou mais recente.');
    const zip = M.lerZip(await arquivo.arrayBuffer());
    const container = await zip.texto('META-INF/container.xml');
    if (!container) throw new Error('Não encontrei o conteúdo deste EPUB.');
    const m = /full-path\s*=\s*"([^"]+)"/.exec(container);
    if (!m) throw new Error('Não encontrei o conteúdo deste EPUB.');
    const opfCaminho = m[1], base = M.pasta(opfCaminho);
    const opfTexto = await zip.texto(opfCaminho);
    if (zip.entradas.has('META-INF/encryption.xml')) {
      const enc = await zip.texto('META-INF/encryption.xml');
      if (enc && /CipherReference[^>]*URI\s*=\s*"[^"]+\.x?html?"/i.test(enc)) throw new Error('Este EPUB tem proteção (DRM) e não pode ser aberto aqui.');
    }
    const opf = new DOMParser().parseFromString(opfTexto, 'application/xml');
    const porNome = (n) => Array.from(opf.getElementsByTagName('*')).filter((e) => e.localName === n);
    const titulo = (porNome('title')[0] || {}).textContent;
    const autor = (porNome('creator')[0] || {}).textContent;
    const manifesto = new Map();
    for (const it of porNome('item')) manifesto.set(it.getAttribute('id'), { href: it.getAttribute('href') || '', tipo: it.getAttribute('media-type') || '', props: it.getAttribute('properties') || '' });
    const spineEl = porNome('spine')[0];
    const spine = porNome('itemref').filter((r) => r.getAttribute('linear') !== 'no').map((r) => r.getAttribute('idref'));

    const titulos = new Map();
    const registrar = (pastaArq, href, rotulo) => {
      const c = M.resolver(pastaArq, href);
      const r = String(rotulo || '').replace(/\s+/g, ' ').trim();
      if (r && !titulos.has(c)) titulos.set(c, r);
    };
    const nav = [...manifesto.values()].find((x) => /\bnav\b/.test(x.props));
    if (nav) {
      const caminho = M.resolver(base, nav.href);
      const s = await zip.texto(caminho);
      if (s) {
        const d = new DOMParser().parseFromString(s, 'text/html');
        d.querySelectorAll('nav a[href], a[href]').forEach((a) => registrar(M.pasta(caminho), a.getAttribute('href'), a.textContent));
      }
    }
    const tocId = spineEl && spineEl.getAttribute('toc');
    if (tocId && manifesto.has(tocId)) {
      const caminho = M.resolver(base, manifesto.get(tocId).href);
      const s = await zip.texto(caminho);
      if (s) {
        const d = new DOMParser().parseFromString(s, 'application/xml');
        for (const np of Array.from(d.getElementsByTagName('*')).filter((e) => e.localName === 'navPoint')) {
          const txt = Array.from(np.getElementsByTagName('*')).find((e) => e.localName === 'text');
          const ct = Array.from(np.getElementsByTagName('*')).find((e) => e.localName === 'content');
          if (txt && ct) registrar(M.pasta(caminho), ct.getAttribute('src'), txt.textContent);
        }
      }
    }

    const capitulos = [];
    for (const id of spine) {
      const it = manifesto.get(id);
      if (!it || !/html/.test(it.tipo)) continue;
      const caminho = M.resolver(base, it.href);
      const html = await zip.texto(caminho);
      if (!html) continue;
      const d = new DOMParser().parseFromString(html, 'text/html');
      const corpo = textoDeDocumento(d, false);
      if (corpo.split(/\s+/).filter(Boolean).length < 15) continue;
      const h = d.querySelector('h1, h2, h3');
      const tCap = titulos.get(caminho) || (h && h.textContent.replace(/\s+/g, ' ').trim().slice(0, 120)) || `Seção ${capitulos.length + 1}`;
      capitulos.push({ titulo: tCap, texto: corpo });
    }
    if (!capitulos.length) throw new Error('Não encontrei texto neste EPUB. Ele pode estar protegido por DRM.');
    return { titulo: (titulo || '').trim() || arquivo.name.replace(/\.[^.]+$/, ''), autor: (autor || '').trim(), tipo: 'epub', capitulos };
  }

  async function importarPDF(arquivo) {
    const lib = window.pdfjsLib;
    if (!lib) throw new Error('O leitor de PDF não carregou. Verifique a conexão e tente de novo.');
    const pdf = await lib.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
    let titulo = '', autor = '';
    try { const meta = await pdf.getMetadata(); titulo = (meta.info && meta.info.Title) || ''; autor = (meta.info && meta.info.Author) || ''; } catch (e) { /* sem metadados */ }
    const textos = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      carregando(`Lendo página ${n} de ${pdf.numPages}…`);
      const pg = await pdf.getPage(n);
      const tc = await pg.getTextContent();
      let s = '', ultY = null;
      for (const it of tc.items) {
        if (!('str' in it)) continue;
        const y = it.transform ? it.transform[5] : null, h = it.height || 10;
        if (ultY !== null && y !== null && Math.abs(y - ultY) > 1) {
          if (!s.endsWith('\n')) s += '\n';
          if (ultY - y > h * 1.8) s += '\n'; // espaço maior entre linhas: novo parágrafo
        }
        s += it.str;
        if (it.hasEOL && !s.endsWith('\n')) s += '\n';
        if (y !== null) ultY = y;
      }
      textos.push(s);
    }
    const palavras = textos.join(' ').split(/\s+/).filter(Boolean).length;
    if (palavras < Math.max(20, pdf.numPages * 5)) throw new Error('Este PDF parece ser só imagem (escaneado). A versão web ainda não reconhece texto em imagens.');
    let inicios = [];
    try {
      const out = await pdf.getOutline();
      for (const it of out || []) {
        let dest = it.dest;
        if (typeof dest === 'string') dest = await pdf.getDestination(dest);
        if (Array.isArray(dest) && dest[0]) {
          const idx = typeof dest[0] === 'number' ? dest[0] : await pdf.getPageIndex(dest[0]);
          if (idx >= 0 && idx < textos.length) inicios.push([it.title || `Seção ${inicios.length + 1}`, idx]);
        }
      }
      inicios.sort((a, b) => a[1] - b[1]);
    } catch (e) { inicios = []; }
    if (!inicios.length) {
      const passo = textos.length > 20 ? 10 : textos.length;
      for (let k = 0; k < textos.length; k += passo) inicios.push([`Páginas ${k + 1}–${Math.min(k + passo, textos.length)}`, k]);
    } else if (inicios[0][1] > 0) inicios.unshift(['Início', 0]);
    const capitulos = [];
    inicios.forEach(([rot, ini], k) => {
      const fim = k + 1 < inicios.length ? inicios[k + 1][1] : textos.length;
      if (fim <= ini) return;
      const corpo = M.juntarLinhas(textos.slice(ini, fim).join('\n'));
      if (corpo) capitulos.push({ titulo: rot, texto: corpo });
    });
    if (!capitulos.length) throw new Error('Não encontrei texto neste PDF.');
    const tituloUtil = titulo.trim() && !/^(about:blank|untitled|sem t[ií]tulo|document|documento|microsoft word.*|.*\.(docx?|pdf))$/i.test(titulo.trim());
    return { titulo: tituloUtil ? titulo.trim() : arquivo.name.replace(/\.[^.]+$/, ''), autor: autor.trim(), tipo: 'pdf', capitulos };
  }

  async function importarArquivo(arquivo) {
    const ext = (arquivo.name.split('.').pop() || '').toLowerCase();
    const nome = arquivo.name.replace(/\.[^.]+$/, '');
    if (ext === 'epub') return importarEPUB(arquivo);
    if (ext === 'pdf') return importarPDF(arquivo);
    const s = decodificar(new Uint8Array(await arquivo.arrayBuffer()));
    if (['html', 'htm', 'xhtml'].includes(ext)) {
      const d = new DOMParser().parseFromString(s, 'text/html');
      const t = textoDeDocumento(d, true);
      if (!t) throw new Error('Não encontrei texto neste arquivo.');
      return { titulo: (d.title || '').trim() || nome, autor: '', tipo: 'html', capitulos: [{ titulo: nome, texto: t }] };
    }
    if (['txt', 'text', 'md', 'markdown', ''].includes(ext)) {
      if (!s.trim()) throw new Error('O arquivo está vazio.');
      return { titulo: nome, autor: '', tipo: 'txt', capitulos: M.capitulosPorTitulo(s, nome) };
    }
    if (['azw', 'azw3', 'kfx', 'mobi', 'prc'].includes(ext)) throw new Error('Livros do Kindle têm proteção da Amazon e não abrem fora do app deles.');
    throw new Error(`O formato .${ext} ainda não é suportado. Use EPUB, PDF, TXT ou HTML.`);
  }

  async function importarArquivos(lista) {
    for (const arq of lista) {
      carregando(`Importando ${arq.name}…`);
      try {
        const imp = await importarArquivo(arq);
        const doc = await adicionarDoc(imp);
        await abrirDoc(doc);
        irSecao('ler');
        fecharGavetas();
      } catch (e) {
        avisar(e && e.message ? e.message : 'Não consegui importar esse arquivo.');
      }
    }
    carregando('');
  }

  // ================= Backup (levar a biblioteca para outro aparelho) =================
  let backupPronto = null;

  async function prepararBackup() {
    salvarPos();
    carregando('Preparando o backup…');
    try {
      const textos = {};
      for (const d of docs) textos[d.id] = (await BD.get('textos', d.id)) || [];
      const dados = { app: 'leitor-rsvp', versao: 1, exportado: Date.now(), docs, textos, stats };
      const hoje = new Date();
      const data = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
      const nome = `leitor-rsvp-backup-${data}.json`;
      backupPronto = new File([JSON.stringify(dados)], nome, { type: 'application/json' });
      carregando('');
      const mb = backupPronto.size / 1048576;
      abrirModal('Backup da biblioteca', `
        <p>O arquivo tem ${docs.length} texto${docs.length === 1 ? '' : 's'}, a posição de leitura de cada um, os marcadores e suas estatísticas (${mb < 0.1 ? 'menos de 0,1' : mb.toFixed(1).replace('.', ',')} MB).</p>
        <p>Toque em Salvar e escolha <b>Salvar em Arquivos</b>, de preferência numa pasta do iCloud Drive. No outro aparelho, abra o app, toque em + na biblioteca e escolha <b>Restaurar backup</b>.</p>
        <div class="acoes"><button class="bt cheio" id="salvarBackup">Salvar backup</button><button class="bt" data-fechar>Cancelar</button></div>
        <p class="nota">As preferências de tema e velocidade não vão no backup: cada aparelho mantém as suas.</p>`);
    } catch (e) {
      carregando('');
      avisar('Não consegui preparar o backup.');
    }
  }

  async function salvarBackup() {
    const arq = backupPronto;
    if (!arq) return;
    // O compartilhamento precisa ser chamado direto do toque, sem esperar nada antes.
    if (navigator.canShare && navigator.canShare({ files: [arq] })) {
      try {
        await navigator.share({ files: [arq], title: 'Backup do Leitor RSVP' });
        fecharModal();
        avisar('Backup salvo.');
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(arq);
    const a = document.createElement('a');
    a.href = url; a.download = arq.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
    fecharModal();
    avisar('Backup baixado: ' + arq.name);
  }

  async function restaurarBackup(arquivo) {
    carregando('Restaurando o backup…');
    try {
      let dados;
      try { dados = JSON.parse(await arquivo.text()); } catch (e) { throw new Error('Este arquivo não é um backup do Leitor RSVP.'); }
      if (!dados || dados.app !== 'leitor-rsvp' || !Array.isArray(dados.docs)) throw new Error('Este arquivo não é um backup do Leitor RSVP.');
      let novos = 0, atualizados = 0;
      let atualMudou = false;
      const trazidos = new Set();
      const maisRecente = dados.docs.filter((d) => d && d.id).sort((a, b) => (b.ultima || 0) - (a.ultima || 0))[0];
      for (const d of dados.docs) {
        if (!d || !d.id) continue;
        const local = docs.find((x) => x.id === d.id);
        if (!local) {
          const caps = dados.textos && dados.textos[d.id];
          if (!Array.isArray(caps) || !caps.length) continue;
          await BD.put('textos', d.id, caps);
          docs.push(Object.assign({}, d, { cor: typeof d.cor === 'number' ? d.cor : docs.length, marcadores: d.marcadores || [] }));
          novos++;
          trazidos.add(d.id);
        } else if ((d.ultima || 0) > (local.ultima || 0)) {
          local.pos = d.pos || 0;
          local.marcadores = d.marcadores || [];
          local.ultima = d.ultima;
          local.titulo = d.titulo || local.titulo;
          atualizados++;
          trazidos.add(d.id);
          if (E.doc && E.doc.id === local.id) atualMudou = true;
        }
      }
      const juntar = (lista, extra, chave) => {
        const vistos = new Set(lista.map(chave));
        for (const x of extra || []) if (x && !vistos.has(chave(x))) { lista.push(x); vistos.add(chave(x)); }
        lista.sort((a, b) => a.data - b.data);
      };
      const st = dados.stats || {};
      juntar(stats.sessoes, st.sessoes, (s) => s.data + '|' + (s.doc || s.titulo));
      juntar(stats.quizzes, st.quizzes, (q) => q.data + '|' + q.acertos);
      juntar(stats.testes, st.testes, (t) => t.data + '|' + Math.round(t.ppm));
      salvarDocs();
      salvarStats();
      renderLista();
      renderMini();
      // Continua de onde parou: abre o livro lido por último no outro aparelho.
      const alvo = maisRecente && trazidos.has(maisRecente.id) ? docs.find((x) => x.id === maisRecente.id) : null;
      if (alvo) { await abrirDoc(alvo); irSecao('ler'); }
      else if (atualMudou) await abrirDoc(E.doc);
      else if (!E.doc && docs.length) await abrirDoc(docs.slice().sort((a, b) => (b.ultima || 0) - (a.ultima || 0))[0]);
      if (E.secao === 'progresso') renderProgresso();
      carregando('');
      avisar(novos || atualizados
        ? `Backup restaurado: ${novos} texto${novos === 1 ? '' : 's'} novo${novos === 1 ? '' : 's'} e ${atualizados} com a leitura atualizada.`
        : 'Tudo já estava em dia neste aparelho.');
    } catch (e) {
      carregando('');
      avisar(e && e.message ? e.message : 'Não consegui restaurar esse backup.');
    }
  }

  // ================= Eventos =================
  function fecharMenus(exceto) {
    $$('.menu').forEach((m) => { if (m !== exceto) m.hidden = true; });
    $$('[data-menu]').forEach((b) => { if (!exceto || b.dataset.menu !== exceto.id) b.setAttribute('aria-expanded', 'false'); });
  }

  function montarMenuCaps() {
    const m = $('#menuCaps');
    if (!E.t) { m.innerHTML = ''; return; }
    const atual = M.capituloDe(E.t, E.i);
    let h = '<div class="menu-rot">Capítulos</div>' + E.t.capitulos.map((c, n) => `<button role="menuitem" data-cap="${n}" class="${n === atual ? 'atual' : ''}">${esc(c.titulo)}</button>`).join('');
    if (E.doc.marcadores.length) {
      h += '<div class="menu-rot">Marcadores</div>' + E.doc.marcadores.map((p) => {
        const pct = E.t.total > 1 ? Math.round(p / (E.t.total - 1) * 100) : 0;
        return `<button role="menuitem" data-ir="${p}">${pct}% — ${esc(M.texto(E.t, p, Math.min(E.t.total, p + 6)).replace(/\n+/g, ' '))}…</button>`;
      }).join('');
    }
    m.innerHTML = h;
  }

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('button, [data-i], .faixa');
    if (!el) { if (!ev.target.closest('.menu')) fecharMenus(); return; }

    if (el.dataset.menu) {
      const m = document.getElementById(el.dataset.menu);
      const abrir = m.hidden;
      fecharMenus(abrir ? m : null);
      if (abrir && el.dataset.menu === 'menuCaps') montarMenuCaps();
      m.hidden = !abrir;
      el.setAttribute('aria-expanded', String(abrir));
      return;
    }
    if (!ev.target.closest('.menu')) fecharMenus();
    else fecharMenus();

    const d = el.dataset;
    if (d.i !== undefined && el.tagName === 'SPAN') { irPara(+d.i); return; }
    if (el.id === 'faixaPrincipal') { alternar(); return; }
    if (el.classList.contains('bt-play')) return alternar();
    if (el.classList.contains('bt-voltar')) return voltarFrase();
    if (el.classList.contains('bt-avancar')) return avancarFrase();
    if (el.classList.contains('vel-menos')) return mudarPPM(prefs.ppm - 10);
    if (el.classList.contains('vel-mais')) return mudarPPM(prefs.ppm + 10);
    if (el.classList.contains('bt-lib')) return alternarBiblioteca();
    if (d.modo) { prefs.modo = d.modo; return mudouPref('modo'); }
    if (d.acao === 'arquivo') return $('#arquivo').click();
    if (d.acao === 'colar') return modalColar();
    if (d.acao === 'exportar') return prepararBackup();
    if (d.acao === 'restaurar') return $('#arquivoBackup').click();
    if (d.filtro) { E.filtro = d.filtro; renderFiltros(); return renderLista(); }
    if (d.abrir) {
      const doc = docs.find((x) => x.id === d.abrir);
      irSecao('ler');
      fecharGavetas();
      if (doc && (!E.doc || E.doc.id !== doc.id)) abrirDoc(doc);
      return;
    }
    if (d.opcoes) return modalOpcoes(d.opcoes);
    if (d.secao) { irSecao(d.secao); if (!largo()) fecharGavetas(); return; }
    if (d.secaoIr) return irSecao(d.secaoIr);
    if (d.cap !== undefined) return irPara(E.t.capitulos[+d.cap].inicio);
    if (d.ir !== undefined) return irPara(+d.ir);
    if (d.mais) {
      const j = E.janela;
      if (d.mais === 'antes') renderJanela(Math.max(0, j.lo - 60), j.hi);
      else renderJanela(j.lo, Math.min(E.t.paragrafos.length, j.hi + 90));
      return;
    }
    if (d.seg) {
      const v = d.valor;
      prefs[d.seg] = d.seg === 'palavrasPorVez' ? +v : v;
      $$(`[data-seg="${d.seg}"]`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.valor === v)));
      return mudouPref(d.seg);
    }
    if (d.tema) {
      const t = temaPorId(d.tema);
      if (prefs.seguirSistema && t.escuro) prefs.temaEscuroID = t.id; else prefs.temaID = t.id;
      salvarPrefs(); aplicarTema(); renderPainel();
      return;
    }
    if (d.ppm) { mudarPPM(+d.ppm); avisar(`Velocidade ajustada para ${prefs.ppm} ppm.`); if (!$('#modal').hidden) fecharModal(); if (E.secao === 'treino') renderTreino(); return; }
    if (d.meta) { prefs.meta = limitar(prefs.meta + (+d.meta), 5, 240); salvarPrefs(); return renderProgresso(); }
    if (d.treino) {
      if (d.treino === 'comecar') { TR.etapa = 'lendo'; TR.inicio = Date.now(); TR.resp = [null, null, null]; }
      if (d.treino === 'terminei') {
        const min = Math.max((Date.now() - TR.inicio) / 60000, 0.05);
        TR.ppm = TREINO_TEXTO.join(' ').split(/\s+/).length / min;
        TR.etapa = 'perguntas';
      }
      if (d.treino === 'resultado') { stats.testes.push({ data: Date.now(), ppm: TR.ppm, compreensao: trCompreensao() }); salvarStats(); TR.etapa = 'resultado'; }
      if (d.treino === 'refazer') TR.etapa = 'inicio';
      renderTreino();
      $('#secTreino .rolagem').scrollTop = 0;
      return;
    }
    if (d.trP !== undefined) { TR.resp[+d.trP] = +d.trO; return renderTreino(); }
    if (d.resp !== undefined) {
      if (QUIZ.escolha !== null) return;
      QUIZ.escolha = +d.resp;
      if (QUIZ.escolha === QUIZ.perguntas[QUIZ.atual].correta) QUIZ.acertos++;
      return renderQuiz();
    }
    if (d.proxima !== undefined) {
      QUIZ.atual++; QUIZ.escolha = null;
      if (QUIZ.atual >= QUIZ.perguntas.length) { stats.quizzes.push({ data: Date.now(), acertos: QUIZ.acertos, total: QUIZ.perguntas.length, ppm: prefs.ppm }); salvarStats(); }
      return renderQuiz();
    }
    if (d.fechar !== undefined) return fecharModal();
    if (d.renomear) {
      const doc = docs.find((x) => x.id === d.renomear);
      const v = $('#novoTitulo').value.trim();
      if (doc && v) { doc.titulo = v; salvarDocs(); renderLista(); if (E.doc === doc) $('#titulo').textContent = v; }
      return fecharModal();
    }
    if (d.recomecar) {
      const doc = docs.find((x) => x.id === d.recomecar);
      if (doc) { doc.pos = 0; salvarDocs(); if (E.doc === doc) irPara(0); renderLista(); }
      return fecharModal();
    }
    if (d.excluir) { $('#confirmaExcluir').hidden = false; return; }
    if (d.excluirSim) {
      const id = d.excluirSim;
      if (E.doc && E.doc.id === id) { fecharDoc(); LS.set('rsvp.aberto', null); }
      docs = docs.filter((x) => x.id !== id);
      salvarDocs(); BD.del('textos', id); renderLista();
      fecharModal();
      return avisar('Texto excluído.');
    }

    switch (el.id) {
      case 'btSom': case 'focoSom': case 'btTocarSom': return alternarSom();
      case 'btArquivoSom': return $('#arquivoSom').click();
      case 'btRemoverSom':
        BD.del('sons', 'meu'); prefs.somNome = ''; if (prefs.som === 'arquivo') { prefs.som = 'rain'; if (SOM.ligado) tocarSom(); }
        salvarPrefs(); renderPainel(); return avisar('Gravação removida.');
      case 'btMarca':
        if (!E.doc) return;
        { const k = E.doc.marcadores.findIndex((m) => Math.abs(m - E.i) < 15);
          if (k >= 0) E.doc.marcadores.splice(k, 1); else { E.doc.marcadores.push(E.i); E.doc.marcadores.sort((a, b) => a - b); }
          salvarDocs(); atualizarLeitura(); avisar(k >= 0 ? 'Marcador removido.' : 'Marcador adicionado.'); }
        return;
      case 'salvarBackup': return salvarBackup();
      case 'btFoco': return abrirFoco();
      case 'focoFechar': return fecharFoco();
      case 'btAjustes': return alternarAjustes();
      case 'fecharFolha': return alternarAjustes();
      case 'btResumo': if (!largo()) fecharGavetas(); return modalResumo();
      case 'btQuiz': if (!largo()) fecharGavetas(); return modalQuiz();
      case 'modalFechar': return fecharModal();
      case 'colarOk': {
        const txt = $('#colarTexto').value.trim();
        if (!txt) { avisar('Cole ou digite algum texto primeiro.'); return; }
        const tt = $('#colarTitulo').value.trim() || (txt.slice(0, 40) + (txt.length > 40 ? '…' : ''));
        fecharModal();
        adicionarDoc({ titulo: tt, autor: '', tipo: 'texto', capitulos: M.capitulosPorTitulo(txt, tt) }).then((doc) => { abrirDoc(doc); irSecao('ler'); fecharGavetas(); });
        return;
      }
    }
  });

  $('#veu').addEventListener('click', fecharGavetas);
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') fecharModal(); });
  $('#faixaPrincipal').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); alternar(); } });
  $('#busca').addEventListener('input', (e) => { E.busca = e.target.value; renderLista(); });
  $('#arquivo').addEventListener('change', (e) => { const l = Array.from(e.target.files || []); e.target.value = ''; if (l.length) importarArquivos(l); });
  $('#arquivoBackup').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) { fecharGavetas(); restaurarBackup(f); } });
  $('#arquivoSom').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 80 * 1048576) { avisar('Arquivo grande demais (limite de 80 MB).'); return; }
    await BD.put('sons', 'meu', { name: f.name, blob: f });
    prefs.somNome = f.name.replace(/\.[^.]+$/, '').slice(0, 40);
    prefs.som = 'arquivo';
    salvarPrefs(); renderPainel();
    if (SOM.ligado) tocarSom();
    avisar('Gravação guardada: ' + f.name);
  });

  // Ajustes: interruptores, listas, controles deslizantes e cores.
  $('#painel').addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.pref) {
      prefs[el.dataset.pref] = el.type === 'checkbox' ? el.checked : el.value;
      mudouPref(el.dataset.pref);
    }
    if (el.dataset.cor) { prefs[el.dataset.cor] = el.value; salvarPrefs(); aplicarTema(); renderPainel(); }
  });
  $('#painel').addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'pPpm') { mudarPPM(+el.value); }
    if (el.id === 'pVol') { prefs.somVol = +el.value; $('#vVol').textContent = prefs.somVol + '%'; salvarPrefs(); ajustarVolume(); }
    if (el.id === 'pTamP') { prefs.tamanhoPalavra = +el.value; $('#vTamP').textContent = el.value; mudouPref('tamanhoPalavra'); }
    if (el.id === 'pTamT') { prefs.tamanhoTexto = +el.value; $('#vTamT').textContent = el.value; mudouPref('tamanhoTexto'); }
    if (el.dataset.cor) { prefs[el.dataset.cor] = el.value; salvarPrefs(); aplicarTema(); }
  });

  // Barra de progresso arrastável.
  const trilha = $('#trilha');
  const fracaoDe = (ev) => { const r = trilha.getBoundingClientRect(); return limitar((ev.clientX - r.left) / Math.max(r.width, 1), 0, 1); };
  trilha.addEventListener('pointerdown', (ev) => {
    if (!E.t) return;
    E.arrastando = true;
    trilha.classList.add('ativa');
    try { trilha.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ }
    const f = fracaoDe(ev);
    $('#trilhaCheia').style.width = f * 100 + '%'; $('#trilhaBotao').style.left = f * 100 + '%'; $('#pct').textContent = Math.round(f * 100) + '%';
  });
  trilha.addEventListener('pointermove', (ev) => {
    if (!E.arrastando) return;
    const f = fracaoDe(ev);
    $('#trilhaCheia').style.width = f * 100 + '%'; $('#trilhaBotao').style.left = f * 100 + '%'; $('#pct').textContent = Math.round(f * 100) + '%';
  });
  const soltar = (ev) => {
    if (!E.arrastando) return;
    E.arrastando = false;
    trilha.classList.remove('ativa');
    irPara(Math.round(fracaoDe(ev) * (E.t.total - 1)));
  };
  trilha.addEventListener('pointerup', soltar);
  trilha.addEventListener('pointercancel', () => { E.arrastando = false; trilha.classList.remove('ativa'); atualizarLeitura(); });
  trilha.addEventListener('keydown', (e) => {
    if (!E.t) return;
    const passo = Math.max(1, Math.round(E.t.total * 0.02));
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); irPara(E.i + passo); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); irPara(E.i - passo); }
  });

  // Gestos do modo foco: toque, deslizar e segurar.
  const area = $('#focoArea');
  let g = null;
  area.addEventListener('pointerdown', (ev) => {
    g = { x: ev.clientX, y: ev.clientY, ppm: prefs.ppm, modo: null, retomar: false };
    try { area.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ }
    g.t = setTimeout(() => {
      if (g && !g.modo) { g.modo = 'segurar'; g.retomar = E.tocando; pausar(); mostrarParagrafoFoco(); }
    }, 450);
  });
  area.addEventListener('pointermove', (ev) => {
    if (!g) return;
    const dy = ev.clientY - g.y;
    if (!g.modo && Math.abs(dy) > 24) { clearTimeout(g.t); g.modo = 'arrastar'; }
    if (g.modo === 'arrastar') {
      mudarPPM(g.ppm - dy / 3);
      const b = $('#focoBolha');
      b.textContent = prefs.ppm + ' ppm';
      b.hidden = false;
    }
  });
  const fimGesto = (cancelado) => {
    if (!g) return;
    clearTimeout(g.t);
    if (g.modo === 'segurar') { $('#focoPar').hidden = true; if (g.retomar) tocar(); }
    else if (g.modo === 'arrastar') setTimeout(() => { $('#focoBolha').hidden = true; }, 600);
    else if (!cancelado) alternar();
    g = null;
  };
  area.addEventListener('pointerup', () => fimGesto(false));
  area.addEventListener('pointercancel', () => fimGesto(true));

  // Teclado.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('#modal').hidden) { fecharModal(); return; }
      if (!$('#foco').hidden) { fecharFoco(); return; }
      if (!largo() && (app.classList.contains('gaveta') || app.classList.contains('folha'))) { fecharGavetas(); return; }
      fecharMenus();
      return;
    }
    const alvo = e.target;
    if (alvo.closest && alvo.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (!$('#modal').hidden || E.secao !== 'ler' || !E.t) return;
    if (e.key === ' ' && !(alvo.tagName === 'BUTTON' && alvo !== document.body && !alvo.closest('#foco'))) { e.preventDefault(); alternar(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); voltarFrase(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); avancarFrase(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mudarPPM(prefs.ppm + 10); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); mudarPPM(prefs.ppm - 10); }
    else if (e.key === 'f' || e.key === 'F') { if ($('#foco').hidden) abrirFoco(); }
  });

  document.addEventListener('visibilitychange', () => { if (document.hidden) { pausar(); salvarPos(); } });
  addEventListener('pagehide', () => { pausar(); salvarPos(); });
  let tRes = 0;
  addEventListener('resize', () => { clearTimeout(tRes); tRes = setTimeout(avaliarLayout, 120); });
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', aplicarTema); } catch (e) { /* ok */ }
  try { new MutationObserver(aplicarTema).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) { /* ok */ }
  setInterval(() => { if (prefs.noiteAuto) aplicarTema(); }, 60000);

  // ================= Início =================
  async function iniciar() {
    aplicarTema();
    if (!Array.isArray(docs)) {
      docs = [];
      await adicionarDoc({ titulo: 'Bem-vindo ao Leitor RSVP', autor: '', tipo: 'texto', capitulos: BOAS_VINDAS }, 'boas-vindas');
    }
    renderFiltros();
    renderLista();
    renderMini();
    avaliarLayout();
    const ultimo = LS.get('rsvp.aberto', null);
    const doc = docs.find((d) => d.id === ultimo) || docs.slice().sort((a, b) => (b.ultima || 0) - (a.ultima || 0))[0];
    if (doc) await abrirDoc(doc); else renderTudo();
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ok */ }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => atualizarLeitura());
  }
  iniciar();
})();
