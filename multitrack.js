/* Laboratório de bateria (multitrack).
   Uma mesa virtual só com os canais da bateria da cena BASE A (1 a 9).
   Cada canal tem a mesma cadeia da Wing: ganho → polaridade → gate → EQ de 7 bandas → compressor → fader.
   O gate e o compressor são o mesmo processador do laboratório de compressor e gate (amostra por amostra),
   e o EQ usa as mesmas bandas e fórmulas do laboratório de EQ.
   Os canais vão para o bus 11 (Bateria LR, com compressão leve), que vai para o Main.
   Há envios para o bus 12 (compressão paralela) e para o FX Bateria Hall.
   Os arquivos são lidos só neste aparelho. */
(function () {
  'use strict';
  var raiz = document.getElementById('multitrack-app');
  var FS = window.FontesSom;
  if (!raiz || !FS) return;

  /* ---------- Utilidades ---------- */
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (k) { if (k) e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k); });
    return e;
  }
  function num(v, c) { return v.toFixed(c === undefined ? 1 : c).replace('-', '−').replace('.', ','); }
  function fmtDb(v) { return v <= -89 ? '−∞' : (v > 0.05 ? '+' : '') + num(v); }
  function tempo(s) { s = Math.max(0, s); var m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + (r < 10 ? '0' : '') + r; }
  function lin(d) { return d <= -89 ? 0 : Math.pow(10, d / 20); }
  function db(v) { return v > 1e-6 ? 20 * Math.log10(v) : -120; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function cor(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888'; }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function semAcento(s) { return s.normalize ? s.normalize('NFD').replace(/[̀-ͯ]/g, '') : s; }

  /* Fader como o de uma mesa: 0 dB a 3/4 do curso, +10 no topo. */
  function posParaDb(p) {
    if (p <= 0.01) return -90;
    if (p >= 0.5) return (p - 0.75) * 40;
    if (p >= 0.25) return -10 + (p - 0.5) * 80;
    return -30 + (p - 0.25) * 240;
  }
  function dbParaPos(d) {
    if (d <= -89) return 0;
    if (d >= -10) return d / 40 + 0.75;
    if (d >= -30) return (d + 10) / 80 + 0.5;
    return Math.max(0.011, (d + 30) / 240 + 0.25);
  }

  /* ---------- EQ: as mesmas bandas e fórmulas do laboratório de EQ ---------- */
  var FMIN = 20, FMAX = 20000, GMAX = 18, GLIM = 15, LOGMIN = Math.log10(FMIN), LOGSPAN = Math.log10(FMAX) - LOGMIN;
  var BANDAS = [
    { id: 'lc', rot: 'LC', nome: 'Corte de graves', tipo: 'highpass', f: 80, g: 0, q: 0.7071, on: false },
    { id: 'low', rot: 'L', nome: 'LOW (prateleira de graves)', tipo: 'lowshelf', f: 100, g: 0, q: 0.7071, on: true },
    { id: 'p1', rot: '1', nome: 'PEQ 1', tipo: 'peaking', f: 250, g: 0, q: 1.4, on: true },
    { id: 'p2', rot: '2', nome: 'PEQ 2', tipo: 'peaking', f: 800, g: 0, q: 1.4, on: true },
    { id: 'p3', rot: '3', nome: 'PEQ 3', tipo: 'peaking', f: 2500, g: 0, q: 1.4, on: true },
    { id: 'p4', rot: '4', nome: 'PEQ 4', tipo: 'peaking', f: 6000, g: 0, q: 1.4, on: true },
    { id: 'high', rot: 'H', nome: 'HIGH (prateleira de agudos)', tipo: 'highshelf', f: 10000, g: 0, q: 0.7071, on: true }
  ];
  function eqPadrao() { return BANDAS.map(function (b) { return { f: b.f, g: b.g, q: b.q, on: b.on }; }); }
  function coef(t, f, g, q, fs) {
    var A = Math.pow(10, g / 40), w = 2 * Math.PI * f / fs, c = Math.cos(w), s = Math.sin(w);
    var b0, b1, b2, a0, a1, a2, al;
    if (t === 'highpass') {
      al = s / (2 * q);
      b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al;
    } else if (t === 'peaking') {
      al = s / (2 * q);
      b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A;
    } else {
      var sq = Math.sqrt(A), as = s / 2 * Math.SQRT2;
      if (t === 'lowshelf') {
        b0 = A * ((A + 1) - (A - 1) * c + 2 * as * sq); b1 = 2 * A * ((A - 1) - (A + 1) * c); b2 = A * ((A + 1) - (A - 1) * c - 2 * as * sq);
        a0 = (A + 1) + (A - 1) * c + 2 * as * sq; a1 = -2 * ((A - 1) + (A + 1) * c); a2 = (A + 1) + (A - 1) * c - 2 * as * sq;
      } else {
        b0 = A * ((A + 1) + (A - 1) * c + 2 * as * sq); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - 2 * as * sq);
        a0 = (A + 1) - (A - 1) * c + 2 * as * sq; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - 2 * as * sq;
      }
    }
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }
  function magDb(k, f, fs) {
    var w = 2 * Math.PI * f / fs, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    var nr = k[0] + k[1] * c1 + k[2] * c2, ni = -(k[1] * s1 + k[2] * s2);
    var dr = 1 + k[3] * c1 + k[4] * c2, di = -(k[3] * s1 + k[4] * s2);
    return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
  }
  function ativa(b, i) { return b.on && (BANDAS[i].tipo === 'highpass' || Math.abs(b.g) > 0.01); }
  function fmtF(f) { return f >= 1000 ? num(f / 1000, f >= 10000 ? 1 : 2).replace(/,?0+$/, '') + ' kHz' : Math.round(f) + ' Hz'; }

  /* ---------- Gate e compressor: os controles do laboratório de compressor e gate ---------- */
  var COMP = [
    ['thr', 'Threshold', -60, 0, 0.5, 'db'], ['ratio', 'Ratio', 1, 20, 0.1, 'ratio'], ['att', 'Attack', 0.1, 120, 0.1, 'ms'],
    ['rel', 'Release', 10, 2000, 1, 'ms'], ['knee', 'Knee', 0, 20, 0.5, 'db'], ['mk', 'Makeup', 0, 24, 0.5, 'db'], ['mix', 'Mix', 0, 100, 1, 'pct']
  ];
  var GATE = [
    ['gthr', 'Threshold', -80, 0, 0.5, 'db'], ['range', 'Range', 0, 80, 1, 'dbp'], ['gatt', 'Attack', 0.1, 50, 0.1, 'ms'],
    ['hold', 'Hold', 0, 1000, 1, 'ms'], ['grel', 'Release', 5, 2000, 1, 'ms']
  ];
  var LOG = { att: 1, rel: 1, gatt: 1, grel: 1 };
  function formatar(v, f) {
    if (f === 'db') return (v > 0.05 ? '+' : '') + num(v) + ' dB';
    if (f === 'dbp') return num(v, 0) + ' dB';
    if (f === 'ratio') return v >= 19.95 ? '∞ : 1' : num(v) + ' : 1';
    if (f === 'ms') return (v < 10 ? num(v) : String(Math.round(v))) + ' ms';
    return Math.round(v) + '%';
  }
  function paraSlider(d, v) { return LOG[d[0]] ? Math.log(v / d[2]) / Math.log(d[3] / d[2]) * 1000 : v; }
  function doSlider(d, s) { return LOG[d[0]] ? d[2] * Math.pow(d[3] / d[2], s / 1000) : +s; }
  function gatePadrao() { return { gon: false, gthr: -40, range: 40, gatt: 0.5, hold: 60, grel: 200 }; }
  function compPadrao() { return { con: false, det: 'peak', thr: -20, ratio: 3, att: 10, rel: 120, knee: 6, mk: 0, mix: 100 }; }

  /* ---------- Sugestões de ajuste para cada peça (pontos de partida, não regras) ---------- */
  function eqCom(m) { var e = eqPadrao(); Object.keys(m).forEach(function (i) { Object.keys(m[i]).forEach(function (k) { e[i][k] = m[i][k]; }); }); return e; }
  var SUGESTAO = {
    1: { txt: 'Bumbo out: corte o "papelão" por volta de 350 Hz e realce o ataque perto de 3,5 kHz. O gate limpa o vazamento da caixa e dos tons. Attack de 25 ms no compressor deixa o clique passar.',
         g: { gon: true, gthr: -32, range: 20, gatt: 0.3, hold: 40, grel: 150 },
         eq: eqCom({ 0: { on: true, f: 35 }, 1: { f: 70, g: 2 }, 2: { f: 350, g: -5, q: 1.6 }, 4: { f: 3500, g: 4, q: 1.4 } }),
         c: { con: true, det: 'peak', thr: -18, ratio: 4, att: 25, rel: 80, knee: 2, mk: 3, mix: 100 }, par: 0 },
    2: { txt: 'Bumbo in: fica mutado na cena. Se for usar, ele traz o clique da batida para somar com o bumbo out.',
         g: { gon: true, gthr: -30, range: 30, gatt: 0.3, hold: 30, grel: 120 },
         eq: eqCom({ 0: { on: true, f: 50 }, 2: { f: 400, g: -6, q: 1.8 }, 4: { f: 4000, g: 4 } }),
         c: { con: true, det: 'peak', thr: -18, ratio: 4, att: 20, rel: 80, knee: 2, mk: 2, mix: 100 } },
    3: { txt: 'Caixa de cima: corte de graves em 90 Hz, um pouco de corpo em 200 Hz, menos "caixote" em 600 Hz e brilho em 5 kHz. Sem gate: a caixa tem toques fracos (ghost notes) que o gate cortaria.',
         eq: eqCom({ 0: { on: true, f: 90 }, 2: { f: 200, g: 2, q: 1.2 }, 3: { f: 600, g: -3, q: 1.6 }, 5: { f: 5000, g: 3 } }),
         c: { con: true, det: 'peak', thr: -16, ratio: 3, att: 10, rel: 100, knee: 4, mk: 2, mix: 100 }, par: 0 },
    4: { txt: 'Caixa de baixo: o microfone está virado para o lado oposto, então a onda chega invertida. Ligue a polaridade (Ø) e ouça o corpo da caixa voltar. Corte os graves alto: este microfone serve só para a esteira.',
         pol: true, g: { gon: true, gthr: -30, range: 25, gatt: 0.3, hold: 60, grel: 120 },
         eq: eqCom({ 0: { on: true, f: 250 }, 5: { f: 6000, g: 2 } }) },
    5: { txt: 'Tom: entre as viradas, o microfone só capta o resto da bateria. O gate fecha nessas horas. Corte o "papelão" em 400 Hz e realce o ataque em 3 kHz.',
         g: { gon: true, gthr: -24, range: 30, gatt: 0.3, hold: 120, grel: 250 },
         eq: eqCom({ 0: { on: true, f: 60 }, 2: { f: 400, g: -4, q: 2 }, 4: { f: 3000, g: 3 } }),
         c: { con: true, det: 'peak', thr: -15, ratio: 3, att: 15, rel: 120, knee: 4, mk: 1, mix: 100 }, par: 0 },
    6: { txt: 'Surdo: como o tom, mas com mais corpo. Release do gate mais longo, para o som do surdo terminar sem ser cortado.',
         g: { gon: true, gthr: -24, range: 30, gatt: 0.3, hold: 150, grel: 350 },
         eq: eqCom({ 0: { on: true, f: 40 }, 1: { f: 90, g: 2 }, 2: { f: 350, g: -4, q: 1.8 }, 4: { f: 3000, g: 2 } }),
         c: { con: true, det: 'peak', thr: -15, ratio: 3, att: 15, rel: 150, knee: 4, mk: 1, mix: 100 }, par: 0 },
    7: { txt: 'Hi-hat: corte os graves bem alto (300 Hz), porque o que vem de grave aqui é vazamento da caixa e do bumbo. Sem gate e sem compressor.',
         eq: eqCom({ 0: { on: true, f: 300 }, 3: { f: 800, g: -2, q: 1.2 } }) },
    8: { txt: 'Overs: são a foto da bateria inteira, com os pratos. Corte os graves em 200 a 250 Hz (bumbo e tons já têm seus canais) e abra um pouco os agudos. Abra o pan, um para cada lado.',
         eq: eqCom({ 0: { on: true, f: 220 }, 3: { f: 900, g: -2, q: 1 }, 6: { f: 10000, g: 2 } }), pan: -70 },
    9: { txt: 'Overs: são a foto da bateria inteira, com os pratos. Corte os graves em 200 a 250 Hz (bumbo e tons já têm seus canais) e abra um pouco os agudos. Abra o pan, um para cada lado.',
         eq: eqCom({ 0: { on: true, f: 220 }, 3: { f: 900, g: -2, q: 1 }, 6: { f: 10000, g: 2 } }), pan: 70 },
    b11: { txt: 'Bus 11 (Bateria LR): compressão leve, só para "colar" a bateria. Ratio baixo, attack lento para não matar as batidas e 1 a 3 dB de redução.',
           c: { con: true, det: 'peak', thr: -14, ratio: 2, att: 30, rel: 150, knee: 6, mk: 1.5, mix: 100 } },
    b12: { txt: 'Bus 12 (paralela): compressão pesada de propósito. Sozinho soa esmagado; o fader do bus 12 mistura isso por baixo da bateria normal, dando corpo sem perder o impacto.',
           c: { con: true, det: 'peak', thr: -30, ratio: 10, att: 1, rel: 120, knee: 0, mk: 12, mix: 100 } }
  };

  /* ---------- Canais da bateria e reconhecimento dos arquivos ---------- */
  var G = null, CANAIS = [];
  var REGRAS = [
    { t: /(bumbo|kick|bd)\s*(in|dentro)\b/, n: [2] },
    { t: /\b(bumbo|kick|bd|kik)\b|bumbo|kick/, n: [1, 2] },
    { t: /(snare|caixa|sn)\s*(bot|bottom|baixo|under|down|b)\b/, n: [4] },
    { t: /\b(snare|caixa|sn|sd)\b|snare|caixa/, n: [3, 4] },
    { t: /\b(surdo|floor|ft)\b|surdo/, n: [6] },
    { t: /\b(tom|toms|rack|tm)\b/, n: [5, 6] },
    { t: /\b(hi ?hat|hh|hat|chimbal|chimbau)\b|hihat/, n: [7] },
    { t: /\b(over|overhead|oh|ovh)\w*\s*(r|right|dir|direito)\b/, n: [9] },
    { t: /\b(over|overhead|oh|ovh|room|ambiente)\w*/, n: [8, 9] }
  ];
  function limparNome(nome) {
    return semAcento(nome.replace(/\.[a-z0-9]+$/i, '')).toLowerCase().replace(/[_\-.()[\]]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function canalCena(n) { for (var i = 0; i < CANAIS.length; i++) if (CANAIS[i].n === n) return CANAIS[i]; return null; }
  function reconhecer(nome, ocupados) {
    var s = limparNome(nome);
    for (var i = 0; i < REGRAS.length; i++) {
      if (!REGRAS[i].t.test(s)) continue;
      var livres = REGRAS[i].n.filter(function (n) { return !ocupados[n]; });
      if (livres.length) return livres[0];
    }
    var m = s.match(/^(?:ch|canal|in|input|trk|track|faixa)?\s*0*(\d{1,2})(?!\d)/);
    if (m && +m[1] >= 1 && +m[1] <= 9 && !ocupados[+m[1]]) return +m[1];
    return null;
  }

  /* ---------- Áudio: nós comuns ---------- */
  var ac = null, A = null, pronto = null, DSP = window.LabDinamica && window.LabDinamica.DSP;
  var canais = [], b11 = null, b12 = null, fx = { db: -8 }, main = { db: 0 };
  var sel = null, aba = 'gate';
  var trans = { tocando: false, inicio: 0, offset: 0, dur: 0, repetir: true };

  function impulso(c, seg) {
    var n = Math.round(c.sampleRate * seg), b = c.createBuffer(2, n, c.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = b.getChannelData(ch), lp = 0;
      for (var i = 0; i < n; i++) {
        var t = i / c.sampleRate, w = Math.random() * 2 - 1;
        lp += (0.35 + 0.5 * Math.exp(-t / 0.5)) * (w - lp);
        d[i] = lp * Math.exp(-t * 6.9 / seg) * (t < 0.015 ? 0 : 0.6);
      }
    }
    return b;
  }

  /* Um processador de dinâmica (gate ou compressor). Usa AudioWorklet; sem ele, ScriptProcessor com o mesmo código. */
  function carregarModulo() {
    if (ac._mtModulo) return ac._mtModulo;
    if (!(ac.audioWorklet && window.AudioWorkletNode)) return (ac._mtModulo = Promise.resolve(false));
    var codigo = DSP + '\nclass MtDsp extends AudioWorkletProcessor {\n' +
      '  constructor() { super(); this.d = criarDSP(sampleRate); this.port.onmessage = (e) => this.d.set(e.data); }\n' +
      '  process(ins, outs) { const i = ins[0], o = outs[0]; if (!i || !i.length) { for (const c of o) c.fill(0); return true; }\n' +
      '    const r = this.d.process(i, o); if (r) this.port.postMessage(r); return true; }\n' +
      '}\nregisterProcessor("mt-dsp", MtDsp);';
    var url = URL.createObjectURL(new Blob([codigo], { type: 'application/javascript' }));
    ac._mtModulo = ac.audioWorklet.addModule(url).then(function () { return true; }, function () { return false; });
    return ac._mtModulo;
  }
  var criarFallback = null;
  function novoDsp(canaisSaida, aoRelatorio) {
    if (A.worklet) {
      var w = new AudioWorkletNode(ac, 'mt-dsp', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [canaisSaida] });
      w.port.onmessage = function (e) { aoRelatorio(e.data); };
      return { no: w, set: function (q) { w.port.postMessage(q); } };
    }
    if (!criarFallback) criarFallback = new Function(DSP + '; return criarDSP;')();
    var d = criarFallback(ac.sampleRate), sp = ac.createScriptProcessor(1024, canaisSaida, canaisSaida);
    sp.onaudioprocess = function (e) {
      var ins = [], outs = [];
      for (var c = 0; c < e.inputBuffer.numberOfChannels; c++) ins.push(e.inputBuffer.getChannelData(c));
      for (var o = 0; o < e.outputBuffer.numberOfChannels; o++) outs.push(e.outputBuffer.getChannelData(o));
      var r = d.process(ins, outs);
      if (r) aoRelatorio(r);
    };
    return { no: sp, set: function (q) { d.set(q); } };
  }

  function montarAudio() {
    if (pronto) return pronto;
    ac = FS.contexto();
    if (!ac || !DSP) return Promise.reject(new Error('sem áudio'));
    pronto = carregarModulo().then(function (ok) {
      A = { worklet: ok };
      A.mainSum = ac.createGain();
      A.mainFader = ac.createGain();
      A.split = ac.createChannelSplitter(2);
      A.anL = ac.createAnalyser(); A.anR = ac.createAnalyser(); A.anL.fftSize = A.anR.fftSize = 2048;
      A.mainSum.connect(A.mainFader); A.mainFader.connect(A.split);
      A.split.connect(A.anL, 0); A.split.connect(A.anR, 1);
      // FX Bateria Hall
      A.fxIn = ac.createGain(); A.conv = ac.createConvolver(); A.conv.buffer = impulso(ac, 1.8); A.fxRet = ac.createGain();
      A.fxIn.connect(A.conv); A.conv.connect(A.fxRet); A.fxRet.connect(A.mainSum);
      // Solo (AFL): vai só para o que o operador ouve
      A.soloSum = ac.createGain();
      A.monMain = ac.createGain(); A.monSolo = ac.createGain(); A.mon = ac.createGain();
      A.mainFader.connect(A.monMain); A.soloSum.connect(A.monSolo);
      A.monMain.connect(A.mon); A.monSolo.connect(A.mon);
      // Proteção dos ouvidos: só age acima de −1 dBFS
      A.prot = ac.createDynamicsCompressor();
      A.prot.threshold.value = -1; A.prot.ratio.value = 20; A.prot.knee.value = 0; A.prot.attack.value = 0.001; A.prot.release.value = 0.1;
      A.mon.connect(A.prot); A.prot.connect(ac.destination);
      b11 = novoBus('b11', 11);
      b12 = novoBus('b12', 12);
      b12.db = -8;
      aplicarBus(b11); aplicarBus(b12); aplicarGeral();
    });
    return pronto;
  }

  function relatorioDe(alvo, chave) {
    return function (r) {
      alvo[chave] = r;
      if (alvo === sel && chave === 'rc' && trans.tocando) {
        var g = alvo.rg || { inPk: r.inPk, gAberto: false };
        alvo.hist.push({ t: performance.now(), inp: db(alvo.tipo === 'canal' ? g.inPk : r.inPk), out: db(r.outPk), gr: r.gr, gate: !!g.gAberto });
        var lim = performance.now() - 6000;
        while (alvo.hist.length && alvo.hist[0].t < lim) alvo.hist.shift();
      }
    };
  }

  function novoBus(id, n) {
    var bus = (G.cena.buses || []).filter(function (b) { return b.n === n; })[0] || { nome: 'Bus ' + n };
    var b = { tipo: 'bus', id: id, n: n, nome: bus.nome, cor: bus.cor, icone: bus.icone, c: compPadrao(), db: 0, mute: false, bypass: false, hist: [], rc: null, pk: -120 };
    b.entrada = ac.createGain();
    b.comp = novoDsp(2, relatorioDe(b, 'rc'));
    b.an = ac.createAnalyser(); b.an.fftSize = 1024; b.buf8 = new Float32Array(1024);
    b.muteG = ac.createGain(); b.fader = ac.createGain();
    b.entrada.connect(b.comp.no); b.comp.no.connect(b.an); b.comp.no.connect(b.muteG);
    b.muteG.connect(b.fader); b.fader.connect(A.mainSum);
    return b;
  }

  function novoCanal(buf, nome, n) {
    var s = {
      tipo: 'canal', buf: buf, arquivo: nome, n: n, fonte: null,
      ganho: 0, pol: false, bypass: false, g: gatePadrao(), eq: eqPadrao(), c: compPadrao(),
      pan: 0, db: 0, mute: n === 2, solo: false, par: -90, fx: -90,
      hist: [], rg: null, rc: null, pk: -120, eqSel: 'low'
    };
    s.trim = ac.createGain();
    s.polG = ac.createGain();
    s.anIn = ac.createAnalyser(); s.anIn.fftSize = 2048; s.bufIn = new Float32Array(2048);
    s.gate = novoDsp(1, relatorioDe(s, 'rg'));
    s.filtros = BANDAS.map(function (b) { var f = ac.createBiquadFilter(); f.type = b.tipo; return f; });
    s.comp = novoDsp(1, relatorioDe(s, 'rc'));
    s.an = ac.createAnalyser(); s.an.fftSize = 1024; s.buf8 = new Float32Array(1024);
    s.rta = ac.createAnalyser(); s.rta.fftSize = 8192; s.rta.smoothingTimeConstant = 0.82;
    s.muteG = ac.createGain(); s.fader = ac.createGain();
    s.panN = ac.createStereoPanner();
    s.parG = ac.createGain(); s.fxG = ac.createGain(); s.soloG = ac.createGain(); s.soloG.gain.value = 0;
    s.trim.connect(s.polG); s.polG.connect(s.anIn); s.polG.connect(s.gate.no);
    var ant = s.gate.no;
    s.filtros.forEach(function (f) { ant.connect(f); ant = f; });
    ant.connect(s.comp.no);
    s.comp.no.connect(s.an); s.comp.no.connect(s.rta); s.comp.no.connect(s.muteG);
    s.muteG.connect(s.fader); s.fader.connect(s.panN);
    s.panN.connect(b11.entrada);
    s.panN.connect(s.parG); s.parG.connect(b12.entrada);
    s.panN.connect(s.fxG); s.fxG.connect(A.fxIn);
    s.panN.connect(s.soloG); s.soloG.connect(A.soloSum);
    return s;
  }

  function alvoP(p, v) { p.setTargetAtTime(v, ac.currentTime, 0.015); }
  function aplicarCanal(s) {
    var q = { bypass: s.bypass, con: false };
    Object.keys(s.g).forEach(function (k) { q[k] = s.g[k]; });
    s.gate.set(q);
    var qc = { bypass: s.bypass, gon: false };
    Object.keys(s.c).forEach(function (k) { qc[k] = s.c[k]; });
    s.comp.set(qc);
    s.eq.forEach(function (b, i) {
      var f = s.filtros[i], t = BANDAS[i].tipo, on = b.on && !s.bypass;
      if (t === 'highpass') { alvoP(f.frequency, on ? b.f : 1); f.Q.value = 20 * Math.log10(b.q); }
      else { alvoP(f.frequency, b.f); alvoP(f.gain, on ? b.g : 0); if (t === 'peaking') alvoP(f.Q, b.q); }
    });
    alvoP(s.trim.gain, lin(s.ganho));
    alvoP(s.polG.gain, s.pol && !s.bypass ? -1 : 1);
    alvoP(s.muteG.gain, s.mute ? 0 : 1);
    alvoP(s.fader.gain, lin(s.db));
    alvoP(s.panN.pan, s.pan / 100);
    alvoP(s.parG.gain, lin(s.par));
    alvoP(s.fxG.gain, lin(s.fx));
  }
  function aplicarBus(b) {
    var qc = { bypass: b.bypass, gon: false };
    Object.keys(b.c).forEach(function (k) { qc[k] = b.c[k]; });
    b.comp.set(qc);
    alvoP(b.muteG.gain, b.mute ? 0 : 1);
    alvoP(b.fader.gain, lin(b.db));
  }
  function aplicar(x) { if (x.tipo === 'bus') aplicarBus(x); else aplicarCanal(x); }
  function algumSolo() { return canais.some(function (s) { return s.solo; }); }
  function aplicarGeral() {
    if (!A) return;
    var solo = algumSolo();
    canais.forEach(function (s) { alvoP(s.soloG.gain, s.solo ? 1 : 0); });
    alvoP(A.monSolo.gain, solo ? 1 : 0);
    alvoP(A.monMain.gain, solo ? 0 : 1);
    alvoP(A.mainFader.gain, lin(main.db));
    alvoP(A.fxRet.gain, lin(fx.db));
  }

  /* ---------- Transporte ---------- */
  function posicao() { return trans.tocando ? trans.offset + (ac.currentTime - trans.inicio) : trans.offset; }
  function pararFontes() {
    canais.forEach(function (s) { if (s.fonte) { try { s.fonte.stop(); } catch (e) {} s.fonte.disconnect(); s.fonte = null; } });
  }
  function tocar(desde) {
    if (!canais.length || !A) return;
    if (ac.state === 'suspended') ac.resume();
    pararFontes();
    trans.offset = clamp(desde, 0, Math.max(0, trans.dur - 0.05));
    var quando = ac.currentTime + 0.06;
    canais.forEach(function (s) {
      if (trans.offset >= s.buf.duration) return;
      var f = ac.createBufferSource(); f.buffer = s.buf; f.connect(s.trim);
      f.start(quando, trans.offset); s.fonte = f;
    });
    trans.inicio = quando; trans.tocando = true;
    ui.play.textContent = 'Pausar'; ui.play.setAttribute('aria-pressed', 'true');
    loop();
  }
  function pausar() {
    if (!trans.tocando) return;
    trans.offset = posicao(); trans.tocando = false;
    pararFontes();
    ui.play.textContent = 'Tocar'; ui.play.setAttribute('aria-pressed', 'false');
  }

  /* ---------- Bateria de demonstração, com vazamento entre os microfones ---------- */
  function demo(fs) {
    var bpm = 96, bt = 60 / bpm, compassos = 8, dur = compassos * 4 * bt + 2, n = Math.round(fs * dur);
    var sd = 11; function r() { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; }
    function at(t) { return Math.round((t + 0.15) * fs); }
    function nova() { return new Float32Array(n); }
    // Fontes (o som de cada peça, antes de chegar nos microfones)
    var P = { corpo: nova(), clique: nova(), pele: nova(), esteira: nova(), hat: nova(), tom: nova(), surdo: nova(), prato: nova() };
    function bumbo(t, v) {
      var i0 = at(t), f = 0;
      for (var i = 0; i < fs * 0.5 && i0 + i < n; i++) {
        var x = i / fs; f += (48 + 110 * Math.exp(-x / 0.03)) / fs;
        P.corpo[i0 + i] += v * Math.sin(2 * Math.PI * f) * Math.exp(-x / 0.25);
        P.clique[i0 + i] += v * (r() * 2 - 1) * Math.exp(-x / 0.004);
      }
    }
    function caixa(t, v) {
      var i0 = at(t), f = 0, ant = 0, bp = 0;
      for (var i = 0; i < fs * 0.4 && i0 + i < n; i++) {
        var x = i / fs, w = r() * 2 - 1; f += (190 + 40 * Math.exp(-x / 0.01)) / fs;
        P.pele[i0 + i] += v * (Math.sin(2 * Math.PI * f) * Math.exp(-x / 0.06) + 0.5 * Math.sin(2 * Math.PI * f * 1.6) * Math.exp(-x / 0.03));
        bp = w - ant; ant = w;
        P.esteira[i0 + i] += v * bp * Math.exp(-x / 0.14) * 0.8;
      }
    }
    function hat(t, v, aberto) {
      var i0 = at(t), ant = 0, dec = aberto ? 0.3 : 0.03;
      for (var i = 0; i < fs * (aberto ? 0.6 : 0.12) && i0 + i < n; i++) {
        var x = i / fs, w = r() * 2 - 1, h = w - ant; ant = w;
        P.hat[i0 + i] += v * (h + 0.3 * Math.sign(Math.sin(2 * Math.PI * 7100 * x)) * (r() - 0.5)) * Math.exp(-x / dec);
      }
    }
    function pele(dest, f0, t, v) {
      var i0 = at(t), f = 0;
      for (var i = 0; i < fs * 0.9 && i0 + i < n; i++) {
        var x = i / fs; f += (f0 + f0 * 0.35 * Math.exp(-x / 0.04)) / fs;
        dest[i0 + i] += v * (Math.sin(2 * Math.PI * f) * Math.exp(-x / 0.35) + (r() * 2 - 1) * Math.exp(-x / 0.008) * 0.35);
      }
    }
    function prato(t, v) {
      var i0 = at(t), ant = 0, ant2 = 0;
      for (var i = 0; i < fs * 2.5 && i0 + i < n; i++) {
        var x = i / fs, w = r() * 2 - 1, h = w - ant; ant = w; var h2 = h - ant2; ant2 = h;
        P.prato[i0 + i] += v * h2 * 0.5 * Math.exp(-x / 0.9) * Math.min(1, x / 0.002);
      }
    }
    for (var c = 0; c < compassos; c++) {
      var b0 = c * 4 * bt, virada = c === 3 || c === 7;
      [0, 1.5, 2].forEach(function (b) { bumbo(b0 + b * bt, (b === 0 ? 1 : 0.85) * (0.9 + 0.1 * r())); });
      if (!virada) bumbo(b0 + 3.5 * bt, 0.7);
      caixa(b0 + bt, 0.95 + 0.05 * r());
      if (!virada) caixa(b0 + 3 * bt, 0.95 + 0.05 * r());
      caixa(b0 + 2.75 * bt, 0.18);                              // ghost note
      for (var e = 0; e < (virada ? 4 : 8); e++) hat(b0 + e * bt / 2, e % 2 ? 0.55 : 0.9, !virada && e === 7 && c % 2 === 1);
      if (c === 0 || c === 4) prato(b0, 1);
      if (virada) {
        for (var k = 0; k < 4; k++) pele(P.tom, 150, b0 + (2 + k / 4) * bt, 0.8 + 0.2 * r());
        for (k = 0; k < 4; k++) pele(P.surdo, 88, b0 + (3 + k / 4) * bt, 0.8 + 0.2 * r());
      }
    }
    prato(compassos * 4 * bt, 1); bumbo(compassos * 4 * bt, 1);
    // Normaliza cada fonte para pico 1
    Object.keys(P).forEach(function (k) {
      var d = P[k], pk = 0; for (var i = 0; i < n; i++) { var a = Math.abs(d[i]); if (a > pk) pk = a; }
      if (pk) for (i = 0; i < n; i++) d[i] /= pk;
    });
    // Cada microfone: [fonte, ganho, atraso em ms]. Ganho negativo = onda invertida.
    var MICS = [
      ['01 Bumbo out.wav', -9, [['corpo', 1, 0], ['clique', 0.25, 0.3], ['pele', 0.05, 2], ['esteira', 0.03, 2], ['tom', 0.06, 2.5], ['surdo', 0.08, 2], ['hat', 0.01, 3], ['prato', 0.02, 3]]],
      ['02 Bumbo in.wav', -7, [['clique', 1, 0], ['corpo', 0.6, 0], ['pele', 0.03, 2], ['tom', 0.03, 2.5], ['surdo', 0.04, 2]]],
      ['03 Snare top.wav', -6, [['pele', 1, 0], ['esteira', 0.45, 0.4], ['hat', 0.3, 0.6], ['corpo', 0.1, 1.5], ['clique', 0.05, 1.5], ['tom', 0.12, 1.2], ['surdo', 0.1, 1.8], ['prato', 0.08, 2]]],
      ['04 Snare bottom.wav', -14, [['esteira', -1, 0], ['pele', -0.5, 0.2], ['corpo', 0.08, 1.2], ['hat', 0.06, 1], ['surdo', 0.06, 1.6]]],
      ['05 Tom.wav', -10, [['tom', 1, 0], ['pele', 0.11, 1], ['hat', 0.06, 1.2], ['corpo', 0.07, 1.5], ['surdo', 0.1, 1.5], ['prato', 0.09, 1.5], ['esteira', 0.05, 1]]],
      ['06 Surdo.wav', -10, [['surdo', 1, 0], ['pele', 0.09, 1.6], ['corpo', 0.09, 1.4], ['tom', 0.09, 1.5], ['prato', 0.07, 2], ['hat', 0.03, 2]]],
      ['07 Hi-hat.wav', -16, [['hat', 1, 0], ['pele', 0.4, 0.7], ['esteira', 0.15, 0.7], ['corpo', 0.05, 2], ['prato', 0.2, 1.5], ['tom', 0.06, 1.4]]],
      ['08 Over left.wav', -14, [['prato', 0.9, 0], ['hat', 0.55, 0.5], ['pele', 0.5, 2.6], ['esteira', 0.2, 2.6], ['tom', 0.45, 2.4], ['surdo', 0.22, 3.4], ['corpo', 0.2, 3.5], ['clique', 0.05, 3.5]]],
      ['09 Over right.wav', -14, [['prato', 0.65, 0.4], ['hat', 0.25, 1.4], ['pele', 0.45, 2.8], ['esteira', 0.2, 2.8], ['tom', 0.28, 2.6], ['surdo', 0.5, 2.2], ['corpo', 0.2, 3.5], ['clique', 0.05, 3.5]]]
    ];
    return MICS.map(function (m) {
      var d = nova();
      m[2].forEach(function (p) {
        var src = P[p[0]], g = p[1], atraso = Math.round(p[2] / 1000 * fs);
        for (var i = atraso; i < n; i++) d[i] += g * src[i - atraso];
      });
      var pk = 0; for (var i = 0; i < n; i++) { var a = Math.abs(d[i]); if (a > pk) pk = a; }
      var esc = pk ? lin(m[1]) / pk : 0, ruido = lin(-66);
      for (i = 0; i < n; i++) d[i] = d[i] * esc + (r() * 2 - 1) * ruido;
      var b = ac.createBuffer(1, n, fs); b.getChannelData(0).set(d);
      return { nome: m[0], buf: b };
    });
  }

  /* ---------- Abrir faixas ---------- */
  function montarCanais(lista) {
    pausar(); pararFontes();
    canais.forEach(function (s) { try { s.trim.disconnect(); s.panN.disconnect(); s.parG.disconnect(); s.fxG.disconnect(); s.soloG.disconnect(); } catch (e) {} });
    canais = []; trans.offset = 0;
    var ocupados = {}, fora = [];
    lista.forEach(function (f) {
      var n = reconhecer(f.nome, ocupados);
      if (!n) { fora.push(f.nome); return; }
      ocupados[n] = true;
      var s = novoCanal(f.buf, f.nome, n);
      aplicarCanal(s);
      canais.push(s);
    });
    canais.sort(function (a, b) { return a.n - b.n; });
    trans.dur = canais.reduce(function (m, s) { return Math.max(m, s.buf.duration); }, 0);
    sel = canais[0] || null;
    if (sel) sel.hist = [];
    ui.seek.max = String(Math.round(trans.dur * 10));
    ui.corpo.hidden = !canais.length;
    aplicarGeral();
    desenharMesa(); atualizarTempo();
    return fora;
  }

  function abrirArquivos(files) {
    files = Array.prototype.filter.call(files, function (f) { return /^audio\//.test(f.type) || /\.(wav|mp3|flac|aif+|m4a|ogg|opus)$/i.test(f.name); });
    if (!files.length) return;
    // Só abre o que é da bateria: o resto nem é lido, para poupar memória
    var ocupados = {}, usar = [], ignorados = [];
    files.forEach(function (f) { var n = reconhecer(f.name, ocupados); if (n) { ocupados[n] = true; usar.push(f); } else ignorados.push(f.name); });
    if (!usar.length) { msg('Nenhum arquivo foi reconhecido como peça da bateria. Use nomes como "Bumbo", "Caixa", "Tom", "Surdo", "Hi-hat" e "Over", ou o número do canal (01 a 09) no começo.'); return; }
    montarAudio().then(function () {
      msg('Abrindo ' + usar.length + ' faixas da bateria…');
      var lista = [], erros = [];
      return usar.reduce(function (p, f) {
        return p.then(function () {
          return f.arrayBuffer().then(function (ab) { return ac.decodeAudioData(ab); })
            .then(function (b) { lista.push({ nome: f.name, buf: b }); }, function () { erros.push(f.name); })
            .then(function () { msg('Abrindo faixas… ' + (lista.length + erros.length) + ' de ' + usar.length); });
        });
      }, Promise.resolve()).then(function () {
        if (!lista.length) { msg('Não consegui abrir os arquivos. Use WAV ou MP3.'); return; }
        montarCanais(lista);
        var t = lista.length + ' canais da bateria abertos, ' + tempo(trans.dur) + ' de música.';
        if (ignorados.length) t += ' Ficaram de fora (não são da bateria): ' + ignorados.length + ' arquivos.';
        if (erros.length) t += ' Não abriram: ' + erros.join(', ') + '.';
        msg(t);
      });
    }).catch(function () { msg('Este navegador não tem o áudio necessário. Use o Chrome ou o Edge atualizados.'); });
  }

  /* ---------- Interface ---------- */
  var ui = {};
  function msg(t) { ui.msg.textContent = t; }
  function iconeSvg(cor_, icone, preto) {
    var box = el('span', { class: 'ico' + (preto ? ' inv' : ''), 'aria-hidden': 'true' });
    if (cor_ && G.CORES[cor_]) box.style.setProperty('--c', G.CORES[cor_]);
    box.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (G.ICONES[icone] || '') + '</svg>';
    return box;
  }
  function nomeDe(x) { if (x.tipo === 'bus') return x.nome; var c = canalCena(x.n); return c ? c.nome : limparNome(x.arquivo); }
  function iconeDe(x) { if (x.tipo === 'bus') return iconeSvg(x.cor, x.icone); var c = canalCena(x.n) || {}; return iconeSvg(c.cor || 'verde', c.icone); }

  function construir() {
    raiz.textContent = '';
    var input = el('input', { type: 'file', id: 'mt-arquivos', accept: 'audio/*,.wav,.mp3,.flac,.aif,.aiff', multiple: '', class: 'eq-file' });
    var label = el('label', { class: 'btn primario', for: 'mt-arquivos', text: 'Abrir faixas da bateria' });
    var bDemo = el('button', { type: 'button', class: 'btn', text: 'Usar bateria de demonstração' });
    ui.msg = el('p', { class: 'eq-mini', 'aria-live': 'polite', text: 'Escolha os arquivos da bateria de uma vez (pode selecionar todos os arquivos do ensaio: o que não for bateria fica de fora). Os arquivos são lidos só neste aparelho.' });
    input.addEventListener('change', function () { abrirArquivos(input.files); input.value = ''; });
    bDemo.addEventListener('click', function () {
      msg('Montando a bateria de demonstração…');
      montarAudio().then(function () {
        setTimeout(function () {
          montarCanais(demo(ac.sampleRate));
          msg('Bateria de demonstração: 9 microfones, com o vazamento de uma peça nos microfones das outras, como numa bateria de verdade. Tudo começa sem processamento.');
        }, 30);
      }).catch(function () { msg('Este navegador não tem o áudio necessário. Use o Chrome ou o Edge atualizados.'); });
    });
    var topo = el('div', { class: 'eq-editor mt-topo' }, [el('div', { class: 'eq-audio-row' }, [label, input, bDemo]), ui.msg]);
    ['dragover', 'dragenter'].forEach(function (ev) { topo.addEventListener(ev, function (e) { e.preventDefault(); topo.classList.add('arrastando'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { topo.addEventListener(ev, function () { topo.classList.remove('arrastando'); }); });
    topo.addEventListener('drop', function (e) { e.preventDefault(); abrirArquivos(e.dataTransfer.files); });
    raiz.appendChild(topo);

    ui.play = el('button', { type: 'button', class: 'btn primario', 'aria-pressed': 'false', text: 'Tocar' });
    var bVolta = el('button', { type: 'button', class: 'btn', text: 'Do começo' });
    var rep = el('input', { type: 'checkbox', checked: '' });
    ui.tempo = el('output', { class: 'mt-tempo', text: '0:00 / 0:00' });
    ui.seek = el('input', { type: 'range', min: '0', max: '0', value: '0', step: '1', 'aria-label': 'Posição na música', class: 'mt-seek' });
    ui.play.addEventListener('click', function () { trans.tocando ? pausar() : tocar(trans.offset >= trans.dur - 0.1 ? 0 : trans.offset); });
    bVolta.addEventListener('click', function () { var t = trans.tocando; pausar(); trans.offset = 0; if (t) tocar(0); atualizarTempo(); });
    rep.addEventListener('change', function () { trans.repetir = rep.checked; });
    ui.seek.addEventListener('input', function () { var t = +ui.seek.value / 10; if (trans.tocando) tocar(t); else { trans.offset = t; atualizarTempo(); } });
    var bSug = el('button', { type: 'button', class: 'btn', text: 'Aplicar sugestão em tudo' });
    var bZerar = el('button', { type: 'button', class: 'btn', text: 'Zerar a mesa' });
    bSug.addEventListener('click', function () { canais.concat([b11, b12]).forEach(sugerir); desenharMesa(); });
    bZerar.addEventListener('click', function () { canais.concat([b11, b12]).forEach(zerar); desenharMesa(); });

    ui.mesa = el('div', { class: 'mt-mesa', role: 'group', 'aria-label': 'Canais da bateria' });
    ui.det = el('div', { class: 'mt-det' });
    ui.corpo = el('div', { class: 'eq-editor mt-transp', hidden: '' }, [
      el('div', { class: 'eq-audio-row' }, [ui.play, bVolta, el('label', { class: 'eq-toggle' }, [rep, el('span', { text: 'Repetir' })]), ui.tempo]),
      ui.seek,
      el('div', { class: 'eq-audio-row' }, [bSug, bZerar]),
      el('p', { class: 'eq-mini', text: 'Caminho do som: canais → bus 11 (Bateria LR) → Main. Os envios mandam cópias para o bus 12 (paralela) e para o FX Bateria Hall, que também voltam no Main.' }),
      ui.mesa, ui.det
    ]);
    raiz.appendChild(ui.corpo);
  }

  function sugerir(x) {
    var s = SUGESTAO[x.tipo === 'bus' ? x.id : x.n];
    if (!s) return;
    if (x.tipo === 'canal') {
      x.g = s.g ? copia(s.g) : gatePadrao(); x.eq = s.eq ? copia(s.eq) : eqPadrao(); x.c = s.c ? copia(s.c) : compPadrao();
      x.pol = !!s.pol; if (s.pan !== undefined) x.pan = s.pan; x.par = s.par !== undefined ? s.par : -90;
    } else x.c = copia(s.c);
    aplicar(x);
  }
  function zerar(x) {
    if (x.tipo === 'canal') { x.g = gatePadrao(); x.eq = eqPadrao(); x.c = compPadrao(); x.pol = false; x.pan = 0; x.par = -90; x.fx = -90; x.ganho = 0; }
    else x.c = compPadrao();
    x.bypass = false;
    aplicar(x);
  }

  function atualizarTempo() {
    var p = posicao();
    ui.tempo.textContent = tempo(p) + ' / ' + tempo(trans.dur);
    if (document.activeElement !== ui.seek) ui.seek.value = String(Math.round(p * 10));
  }

  /* Tiras da mesa */
  function fader(valor, rotulo, onDb) {
    var f = el('input', { type: 'range', class: 'mt-fader', min: '0', max: '1000', step: '1', value: String(Math.round(dbParaPos(valor) * 1000)), 'aria-label': rotulo, title: 'Dois cliques: 0 dB' });
    var out = el('output', { class: 'mt-db', text: fmtDb(valor) });
    f.addEventListener('input', function () { var d = posParaDb(+f.value / 1000); if (Math.abs(d) < 0.6) d = 0; out.textContent = fmtDb(d); onDb(d); });
    f.addEventListener('dblclick', function () { f.value = String(Math.round(dbParaPos(0) * 1000)); out.textContent = fmtDb(0); onDb(0); });
    return { f: f, out: out };
  }
  function medidorV() { return el('div', { class: 'mt-med' }, [el('div', { class: 'mt-med-cheio' }), el('div', { class: 'mt-med-pico' })]); }
  function pintarMed(m, v, p) {
    var pct = function (x) { return clamp((x + 60) / 60 * 100, 0, 100); };
    m.firstChild.style.clipPath = 'inset(' + (100 - pct(v)) + '% 0 0 0)';
    m.lastChild.style.bottom = pct(p) + '%';
    m.classList.toggle('clip', p > -0.5);
  }

  function tira(x) {
    var t = el('div', { class: 'mt-strip' + (x.tipo === 'bus' ? ' bus' : '') + (sel === x ? ' sel' : '') });
    var c = x.tipo === 'bus' ? x : canalCena(x.n) || {};
    t.style.setProperty('--c', G.CORES[c.cor] || '#6b7280');
    var nome = el('button', { type: 'button', class: 'mt-nome', 'aria-pressed': String(sel === x), title: x.arquivo || x.nome }, [
      el('span', { class: 'mt-n', text: x.tipo === 'bus' ? 'BUS ' + x.n : String(x.n) }), iconeDe(x), el('span', { class: 'mt-txt', text: nomeDe(x) })
    ]);
    nome.addEventListener('click', function () { if (sel !== x) { sel = x; x.hist = []; desenharMesa(); } });
    t.appendChild(nome);
    x._led = el('span', { class: 'mt-led' + (x.tipo === 'canal' && x.g.gon ? '' : ' off'), text: 'G', title: 'Gate: aceso quando está aberto' });
    x._gr = el('span', { class: 'mt-gr', title: 'Redução do compressor' });
    t.appendChild(el('div', { class: 'mt-status' }, [x._led, x._gr]));
    if (x.tipo === 'canal') {
      var pan = el('input', { type: 'range', class: 'mt-pan', min: '-100', max: '100', step: '5', value: String(x.pan), 'aria-label': 'Pan de ' + nomeDe(x), title: 'Pan. Dois cliques: centro' });
      pan.addEventListener('input', function () { x.pan = +pan.value; aplicar(x); });
      pan.addEventListener('dblclick', function () { pan.value = '0'; x.pan = 0; aplicar(x); });
      x._pan = pan;
      t.appendChild(el('div', { class: 'mt-pan-wrap' }, [pan]));
    } else t.appendChild(el('div', { class: 'mt-pan-wrap' }));
    var bM = el('button', { type: 'button', class: 'mt-btn m', 'aria-pressed': String(x.mute), text: 'M', 'aria-label': 'Mute de ' + nomeDe(x) });
    bM.addEventListener('click', function () { x.mute = !x.mute; bM.setAttribute('aria-pressed', String(x.mute)); aplicar(x); });
    var btns = [bM];
    if (x.tipo === 'canal') {
      var bS = el('button', { type: 'button', class: 'mt-btn s', 'aria-pressed': String(x.solo), text: 'S', 'aria-label': 'Solo de ' + nomeDe(x) });
      bS.addEventListener('click', function () { x.solo = !x.solo; bS.setAttribute('aria-pressed', String(x.solo)); aplicarGeral(); });
      btns.push(bS);
    }
    t.appendChild(el('div', { class: 'mt-btns' }, btns));
    var fd = fader(x.db, 'Fader de ' + nomeDe(x), function (d) { x.db = d; aplicar(x); });
    x._med = medidorV();
    t.appendChild(el('div', { class: 'mt-fd' }, [fd.f, x._med]));
    t.appendChild(el('div', { class: 'mt-pe' }, [fd.out]));
    return t;
  }
  function tiraSimples(rot, nome, cor_, valor, onDb, meds) {
    var t = el('div', { class: 'mt-strip ' + (rot === 'LR' ? 'main' : 'fx') });
    t.style.setProperty('--c', cor_);
    t.appendChild(el('div', { class: 'mt-nome' }, [el('span', { class: 'mt-n', text: rot }), el('span', { class: 'mt-txt', text: nome })]));
    t.appendChild(el('div', { class: 'mt-status' })); t.appendChild(el('div', { class: 'mt-pan-wrap' })); t.appendChild(el('div', { class: 'mt-btns' }));
    var fd = fader(valor, 'Fader de ' + nome, onDb);
    t.appendChild(el('div', { class: 'mt-fd' }, [fd.f].concat(meds || [])));
    t.appendChild(el('div', { class: 'mt-pe' }, [fd.out]));
    return t;
  }

  function desenharMesa() {
    ui.mesa.textContent = '';
    canais.forEach(function (s) { ui.mesa.appendChild(tira(s)); });
    if (!canais.length) return;
    ui.mesa.appendChild(el('div', { class: 'mt-sep', 'aria-hidden': 'true' }));
    ui.mesa.appendChild(tira(b11));
    ui.mesa.appendChild(tira(b12));
    ui.mesa.appendChild(tiraSimples('FX 14', 'Bateria Hall (volta)', G.CORES.roxo, fx.db, function (v) { fx.db = v; aplicarGeral(); }));
    ui.medL = medidorV(); ui.medR = medidorV();
    ui.mesa.appendChild(tiraSimples('LR', 'Main', cor('--accent'), main.db, function (v) { main.db = v; aplicarGeral(); }, [ui.medL, ui.medR]));
    desenharDetalhe();
  }

  /* ---------- Painel do canal selecionado ---------- */
  function linhaCtl(def, obj, aoMudar) {
    var r = el('input', { type: 'range', min: LOG[def[0]] ? '0' : String(def[2]), max: LOG[def[0]] ? '1000' : String(def[3]), step: LOG[def[0]] ? '1' : String(def[4]), value: String(paraSlider(def, obj[def[0]])), 'aria-label': def[1] });
    var o = el('output', { text: formatar(obj[def[0]], def[5]) });
    r.addEventListener('input', function () { obj[def[0]] = doSlider(def, r.value); o.textContent = formatar(obj[def[0]], def[5]); aoMudar(); });
    return el('label', { class: 'eq-linha' }, [el('span', { text: def[1] }), r, o]);
  }
  function chave(rotulo, valor, onV) {
    var c = el('input', { type: 'checkbox' }); c.checked = valor;
    c.addEventListener('change', function () { onV(c.checked); });
    return el('label', { class: 'eq-toggle' }, [c, el('span', { text: rotulo })]);
  }
  function linhaDb(rotulo, min, max, valor, onV) {
    var r = el('input', { type: 'range', min: String(min), max: String(max), step: '0.5', value: String(Math.max(min, valor)), 'aria-label': rotulo });
    var f = function (v) { return v <= min ? '−∞' : (v > 0 ? '+' : '') + num(v) + ' dB'; };
    var o = el('output', { text: f(Math.max(min, valor)) });
    r.addEventListener('input', function () { o.textContent = f(+r.value); onV(+r.value <= min ? -90 : +r.value); });
    return el('label', { class: 'eq-linha' }, [el('span', { text: rotulo }), r, o]);
  }

  function desenharDetalhe() {
    ui.det.textContent = '';
    var x = sel;
    if (!x) return;
    var re = function () { aplicar(x); };
    var abas = x.tipo === 'canal' ? [['gate', 'Gate'], ['eq', 'EQ'], ['comp', 'Compressor'], ['envios', 'Pan e envios']] : [['comp', 'Compressor']];
    var abaAtual = abas.some(function (a) { return a[0] === aba; }) ? aba : abas[0][0];
    var chips = el('div', { class: 'pick small', role: 'group', 'aria-label': 'Seção do canal' });
    abas.forEach(function (a) {
      var b = el('button', { type: 'button', 'aria-pressed': String(a[0] === abaAtual), text: a[1] });
      b.addEventListener('click', function () { aba = a[0]; desenharDetalhe(); });
      chips.appendChild(b);
    });
    var sug = SUGESTAO[x.tipo === 'bus' ? x.id : x.n];
    var bSug = el('button', { type: 'button', class: 'btn', text: 'Aplicar sugestão' });
    var bZ = el('button', { type: 'button', class: 'btn', text: 'Zerar canal' });
    bSug.addEventListener('click', function () { sugerir(x); mostrarSug = true; desenharMesa(); });
    bZ.addEventListener('click', function () { zerar(x); desenharMesa(); });
    var sugTxt = el('p', { class: 'eq-regiao mt-sug', text: sug ? sug.txt : '' });
    sugTxt.hidden = !mostrarSug;
    mostrarSug = false;

    var topo = [chave('Ouvir sem processamento', x.bypass, function (v) { x.bypass = v; re(); desenharEq(); })];
    if (x.tipo === 'canal') topo.unshift(chave('Polaridade (Ø)', x.pol, function (v) { x.pol = v; re(); }));
    var corpo = [
      el('div', { class: 'eq-ctl-head' }, [
        el('strong', { class: 'mt-det-nome' }, [iconeDe(x), el('span', { text: (x.tipo === 'bus' ? 'Bus ' + x.n : x.n) + ' · ' + nomeDe(x) })]),
        el('div', { class: 'eq-botoes' }, sug ? [bSug, bZ] : [bZ])
      ]),
      sugTxt
    ];
    if (x.tipo === 'canal') {
      ui.medIn = FS.medidor({ min: -60, max: 0, alvo: [-18, -6], marcas: [-60, -48, -36, -24, -18, -12, -6, 0], rotulo: 'Entrada depois do ganho (pico)' });
      corpo.push(el('div', { class: 'mt-ganho' }, [
        linhaDb('Ganho', -24, 24, x.ganho, function (v) { x.ganho = v <= -24 ? -24 : v; re(); }),
        ui.medIn.el
      ]));
    } else ui.medIn = null;
    corpo.push(el('div', { class: 'eq-audio-row' }, topo));
    corpo.push(chips);
    var area = el('div', { class: 'mt-aba' });
    corpo.push(area);
    ui.det.appendChild(el('div', { class: 'eq-editor' }, corpo));
    ui.cv = ui.hv = ui.ecv = ui.medGR = ui.gateLed = null;

    if (abaAtual === 'gate' || abaAtual === 'comp') {
      var eGate = abaAtual === 'gate';
      var defs = eGate ? GATE : COMP, obj = eGate ? x.g : x.c, chaveOn = eGate ? 'gon' : 'con';
      var linhas = defs.map(function (d) { return linhaCtl(d, obj, re); });
      var cab = [el('strong', { class: 'eq-ctl-titulo', text: eGate ? 'Gate' : 'Compressor' }), chave('Ligado', obj[chaveOn], function (v) { obj[chaveOn] = v; re(); })];
      var extra = [];
      if (!eGate) {
        var det = el('div', { class: 'pick small', role: 'group', 'aria-label': 'Detecção' });
        ['peak', 'rms'].forEach(function (d) {
          var b = el('button', { type: 'button', 'aria-pressed': String(obj.det === d), text: d === 'peak' ? 'Peak' : 'RMS' });
          b.addEventListener('click', function () { obj.det = d; det.querySelectorAll('button').forEach(function (z) { z.setAttribute('aria-pressed', String(z === b)); }); re(); });
          det.appendChild(b);
        });
        extra.push(el('div', { class: 'din-det' }, [el('span', { class: 'eq-mini', text: 'Detecção' }), det]));
      } else {
        ui.gateLed = el('span', { class: 'gate-led', text: 'GATE' });
        cab.push(ui.gateLed);
        extra.push(el('p', { class: 'eq-mini', text: 'Abre quando o som passa do threshold e só fecha 4 dB abaixo dele. O range diz quanto o som cai com o gate fechado.' }));
      }
      ui.cv = el('canvas', { class: 'din-canvas', role: 'img', 'aria-label': 'Curva de entrada e saída do gate e do compressor deste canal.' });
      ui.hv = el('canvas', { class: 'din-hist', role: 'img', 'aria-label': 'Histórico dos últimos 6 segundos deste canal.' });
      ui.medGR = FS.medidor({ min: eGate ? -40 : -20, max: 0, marcas: eGate ? [-40, -30, -20, -10, 0] : [-20, -15, -10, -6, -3, 0], rotulo: eGate ? 'Redução do gate' : 'Redução do compressor (GR)', inverso: true });
      ui.medGR.gate = eGate;
      area.appendChild(el('div', { class: 'din-topo' }, [
        el('div', { class: 'din-curva' }, [ui.cv]),
        el('div', { class: 'eq-ctl' }, [el('div', { class: 'eq-ctl-head' }, cab)].concat(extra).concat(linhas).concat([ui.medGR.el]))
      ]));
      area.appendChild(el('div', { class: 'din-hist-wrap' }, [
        el('div', { class: 'din-legenda' }, [
          el('span', { class: 'lg-in', text: 'Entrada' }), el('span', { class: 'lg-out', text: 'Saída' }),
          el('span', { class: 'lg-gr', text: 'Redução do compressor' }), x.tipo === 'canal' ? el('span', { class: 'lg-gate', text: 'Gate aberto' }) : null
        ]), ui.hv
      ]));
    } else if (abaAtual === 'eq') {
      area.appendChild(painelEq(x));
    } else {
      var rPan = el('input', { type: 'range', min: '-100', max: '100', step: '5', value: String(x.pan), 'aria-label': 'Pan' });
      var oPan = el('output', { text: panTxt(x.pan) });
      rPan.addEventListener('input', function () { x.pan = +rPan.value; if (x._pan) x._pan.value = rPan.value; oPan.textContent = panTxt(x.pan); re(); });
      area.appendChild(el('div', { class: 'eq-ctl' }, [
        el('label', { class: 'eq-linha' }, [el('span', { text: 'Pan' }), rPan, oPan]),
        linhaDb('Bus 12 (paralela)', -60, 10, x.par, function (v) { x.par = v; re(); }),
        linhaDb('FX Bateria Hall', -60, 10, x.fx, function (v) { x.fx = v; re(); }),
        el('p', { class: 'eq-mini', text: 'Os envios saem depois do fader (pós-fader): se você abaixar o canal, o que vai para a paralela e para o reverb abaixa junto.' })
      ]));
    }
    ui.abaAtual = abaAtual;
    requestAnimationFrame(function () { desenharCurva(); desenharHist(); desenharEq(); });
  }
  var mostrarSug = false;
  function panTxt(p) { return p === 0 ? 'Centro' : (p < 0 ? 'E ' : 'D ') + Math.abs(p); }

  /* EQ do canal: curva com pontos de arrastar, como no laboratório de EQ */
  function painelEq(x) {
    ui.ecv = el('canvas', { class: 'eq-canvas', role: 'img', 'aria-label': 'Curva do EQ deste canal. Arraste os pontos para ajustar.' });
    var chips = el('div', { class: 'eq-bandas', role: 'group', 'aria-label': 'Bandas' });
    var chipEls = {};
    BANDAS.forEach(function (b) {
      var c = el('button', { type: 'button', class: 'eq-chip', title: b.nome, text: b.rot });
      c.addEventListener('click', function () { x.eqSel = b.id; sinc(); desenharEq(); });
      chips.appendChild(c); chipEls[b.id] = c;
    });
    var titulo = el('strong', { class: 'eq-ctl-titulo' });
    var on = el('input', { type: 'checkbox' });
    var rF = el('input', { type: 'range', min: '0', max: '1000', step: '1', 'aria-label': 'Frequência' }), oF = el('output');
    var rG = el('input', { type: 'range', min: String(-GLIM), max: String(GLIM), step: '0.5', 'aria-label': 'Ganho da banda' }), oG = el('output');
    var rQ = el('input', { type: 'range', min: '0', max: '1000', step: '1', 'aria-label': 'Q' }), oQ = el('output');
    var lG = el('label', { class: 'eq-linha' }, [el('span', { text: 'Ganho' }), rG, oG]);
    var lQ = el('label', { class: 'eq-linha' }, [el('span', { text: 'Q (largura)' }), rQ, oQ]);
    var QMIN = 0.3, QMAX = 10;
    function idx() { for (var i = 0; i < BANDAS.length; i++) if (BANDAS[i].id === x.eqSel) return i; return 1; }
    function sinc() {
      var i = idx(), b = x.eq[i], t = BANDAS[i].tipo;
      titulo.textContent = BANDAS[i].nome;
      on.checked = b.on;
      rF.value = String(Math.round((Math.log10(b.f) - LOGMIN) / LOGSPAN * 1000)); oF.textContent = fmtF(b.f);
      rG.value = String(b.g); oG.textContent = (b.g > 0 ? '+' : '') + num(b.g) + ' dB';
      rQ.value = String(Math.round(Math.log(b.q / QMIN) / Math.log(QMAX / QMIN) * 1000)); oQ.textContent = num(b.q, 2);
      lG.hidden = t === 'highpass'; lQ.hidden = t !== 'peaking';
      BANDAS.forEach(function (bb, j) {
        var c = chipEls[bb.id];
        c.setAttribute('aria-pressed', String(bb.id === x.eqSel));
        c.classList.toggle('off', !x.eq[j].on);
        c.classList.toggle('mexida', ativa(x.eq[j], j));
      });
    }
    function mudou() { aplicar(x); sinc(); desenharEq(); }
    on.addEventListener('change', function () { x.eq[idx()].on = on.checked; mudou(); });
    rF.addEventListener('input', function () { x.eq[idx()].f = Math.pow(10, LOGMIN + rF.value / 1000 * LOGSPAN); mudou(); });
    rG.addEventListener('input', function () { var b = x.eq[idx()]; b.g = +rG.value; b.on = true; mudou(); });
    rQ.addEventListener('input', function () { x.eq[idx()].q = QMIN * Math.pow(QMAX / QMIN, rQ.value / 1000); mudou(); });
    var bZ = el('button', { type: 'button', class: 'btn', text: 'Zerar EQ' });
    bZ.addEventListener('click', function () { x.eq = eqPadrao(); mudou(); });
    var arrasto = null;
    function pos(e) { var r = ui.ecv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function pontoY(i) { return EG.yOf(BANDAS[i].tipo === 'highpass' ? 0 : x.eq[i].g); }
    ui.ecv.addEventListener('pointerdown', function (e) {
      var p = pos(e), melhor = -1, dist = 26;
      x.eq.forEach(function (b, i) { var d = Math.hypot(EG.xOf(b.f) - p.x, pontoY(i) - p.y); if (d < dist) { dist = d; melhor = i; } });
      if (melhor < 0) return;
      e.preventDefault();
      x.eqSel = BANDAS[melhor].id; arrasto = melhor; x.eq[melhor].on = true;
      try { ui.ecv.setPointerCapture(e.pointerId); } catch (err) {}
      mudou();
    });
    ui.ecv.addEventListener('pointermove', function (e) {
      if (arrasto === null) return;
      var p = pos(e), b = x.eq[arrasto];
      b.f = clamp(EG.fOf(p.x), FMIN, FMAX);
      if (BANDAS[arrasto].tipo !== 'highpass') { var g = clamp(EG.gOf(p.y), -GLIM, GLIM); b.g = Math.abs(g) < 0.4 ? 0 : Math.round(g * 2) / 2; }
      mudou();
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) { ui.ecv.addEventListener(ev, function () { arrasto = null; }); });
    sinc();
    return el('div', { class: 'mt-eq' }, [
      el('div', { class: 'eq-canvas-wrap' }, [ui.ecv]),
      el('div', { class: 'eq-ctl' }, [
        el('div', { class: 'eq-ctl-head' }, [chips, bZ]),
        el('div', { class: 'eq-ctl-head' }, [titulo, el('label', { class: 'eq-toggle' }, [on, el('span', { text: 'Ligada' })])]),
        el('label', { class: 'eq-linha' }, [el('span', { text: 'Frequência' }), rF, oF]), lG, lQ,
        el('p', { class: 'eq-mini', text: 'A área azul é o som deste canal depois do EQ, em tempo real. Arraste os pontos na curva ou use os controles.' })
      ])
    ]);
  }

  function ajustar(cv) {
    if (!cv || !cv.isConnected) return null;
    var r = cv.getBoundingClientRect();
    if (!r.width) return null;
    var dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    return { w: r.width, h: r.height, dpr: dpr };
  }

  var EG = { L: 38, R: 10, T: 12, B: 24, w: 0, h: 0 };
  EG.xOf = function (f) { return EG.L + (Math.log10(f) - LOGMIN) / LOGSPAN * (EG.w - EG.L - EG.R); };
  EG.fOf = function (x) { return Math.pow(10, LOGMIN + (x - EG.L) / (EG.w - EG.L - EG.R) * LOGSPAN); };
  EG.yOf = function (g) { return EG.T + (GMAX - g) / (2 * GMAX) * (EG.h - EG.T - EG.B); };
  EG.gOf = function (y) { return GMAX - (y - EG.T) / (EG.h - EG.T - EG.B) * 2 * GMAX; };
  var rtaDados = null;
  function desenharEq() {
    var x = sel, m = ajustar(ui.ecv);
    if (!m || !x || x.tipo !== 'canal') return;
    var fs = ac ? ac.sampleRate : 48000, cx = ui.ecv.getContext('2d');
    EG.w = m.w; EG.h = m.h;
    cx.setTransform(m.dpr, 0, 0, m.dpr, 0, 0);
    cx.fillStyle = cor('--eq-bg'); cx.fillRect(0, 0, m.w, m.h);
    var x0 = EG.L, x1 = m.w - EG.R, y0 = EG.T, y1 = m.h - EG.B;
    cx.lineWidth = 1; cx.strokeStyle = cor('--line'); cx.fillStyle = cor('--muted'); cx.font = '11px ' + cor('--mono');
    cx.textAlign = 'center'; cx.textBaseline = 'top';
    [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].forEach(function (f) {
      var xx = Math.round(EG.xOf(f)) + 0.5;
      cx.globalAlpha = 0.6; cx.beginPath(); cx.moveTo(xx, y0); cx.lineTo(xx, y1); cx.stroke(); cx.globalAlpha = 1;
      if (m.w < 480 && (f === 20 || f === 20000 || f === 50 || f === 5000)) return;
      cx.fillText(f >= 1000 ? (f / 1000) + 'k' : String(f), clamp(xx, x0 + 8, x1 - 10), y1 + 6);
    });
    cx.textAlign = 'right'; cx.textBaseline = 'middle';
    [-12, -6, 0, 6, 12].forEach(function (g) {
      var y = Math.round(EG.yOf(g)) + 0.5;
      cx.globalAlpha = g === 0 ? 1 : 0.6; cx.beginPath(); cx.moveTo(x0, y); cx.lineTo(x1, y); cx.stroke(); cx.globalAlpha = 1;
      cx.fillText((g > 0 ? '+' : '') + g, x0 - 6, y);
    });
    if (trans.tocando && x.rta) {
      if (!rtaDados || rtaDados.length !== x.rta.frequencyBinCount) rtaDados = new Float32Array(x.rta.frequencyBinCount);
      x.rta.getFloatFrequencyData(rtaDados);
      var hz = fs / x.rta.fftSize;
      cx.beginPath(); cx.moveTo(x0, y1);
      for (var xx = x0; xx <= x1; xx += 2) {
        var fa = EG.fOf(xx), fb = EG.fOf(xx + 2), i0 = Math.max(1, Math.floor(fa / hz)), i1 = Math.max(i0, Math.floor(fb / hz)), v = -200;
        for (var i = i0; i <= i1 && i < rtaDados.length; i++) v = Math.max(v, rtaDados[i]);
        v += 10 * Math.log10(fa / 1000);
        cx.lineTo(xx, y1 - clamp((v + 95) / 70, 0, 1) * (y1 - y0));
      }
      cx.lineTo(x1, y1); cx.closePath();
      cx.globalAlpha = 0.35; cx.fillStyle = cor('--eq-rta'); cx.fill(); cx.globalAlpha = 1;
    }
    var ks = x.eq.map(function (b, i) { return ativa(b, i) ? coef(BANDAS[i].tipo, b.f, b.g, b.q, fs) : null; });
    var acc = cor('--accent');
    ks.forEach(function (k, i) {
      if (!k) return;
      cx.beginPath();
      for (var xx = x0; xx <= x1; xx += 2) { var y = EG.yOf(clamp(magDb(k, EG.fOf(xx), fs), -GMAX - 4, GMAX + 4)); if (xx === x0) cx.moveTo(xx, y); else cx.lineTo(xx, y); }
      cx.lineTo(x1, EG.yOf(0)); cx.lineTo(x0, EG.yOf(0)); cx.closePath();
      cx.globalAlpha = BANDAS[i].id === x.eqSel ? 0.25 : 0.08; cx.fillStyle = acc; cx.fill(); cx.globalAlpha = 1;
    });
    cx.beginPath(); cx.lineWidth = 2.5; cx.strokeStyle = x.bypass ? cor('--muted') : acc;
    for (var x2 = x0; x2 <= x1; x2 += 1.5) {
      var f = EG.fOf(x2), t = 0;
      ks.forEach(function (k) { if (k) t += magDb(k, f, fs); });
      var y2 = EG.yOf(clamp(t, -GMAX - 4, GMAX + 4));
      if (x2 === x0) cx.moveTo(x2, y2); else cx.lineTo(x2, y2);
    }
    cx.stroke();
    x.eq.forEach(function (b, i) {
      var hx = EG.xOf(b.f), hy = EG.yOf(BANDAS[i].tipo === 'highpass' ? 0 : b.g), eh = BANDAS[i].id === x.eqSel;
      cx.beginPath(); cx.arc(hx, hy, eh ? 13 : 11, 0, Math.PI * 2);
      cx.fillStyle = b.on && eh ? acc : cor('--eq-bg'); cx.fill();
      cx.lineWidth = 2; cx.strokeStyle = b.on ? acc : cor('--muted');
      if (!b.on) cx.setLineDash([3, 3]);
      cx.stroke(); cx.setLineDash([]);
      cx.fillStyle = eh && b.on ? cor('--accent-fg') : (b.on ? cor('--fg') : cor('--muted'));
      cx.font = '700 11px ' + cor('--mono'); cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillText(BANDAS[i].rot, hx, hy + 0.5);
    });
  }

  /* Curva de transferência (gate + compressor), igual à do laboratório de compressor e gate */
  function curvaComp(c, xdb) {
    if (!c.con) return 0;
    var over = xdb - c.thr, W = c.knee, R = c.ratio;
    if (2 * over < -W) return 0;
    if (W > 0 && 2 * Math.abs(over) <= W) return (1 / R - 1) * Math.pow(over + W / 2, 2) / (2 * W);
    return (1 / R - 1) * over;
  }
  function saidaEstatica(x, v) {
    var y = v;
    if (x.tipo === 'canal' && x.g.gon && v < x.g.gthr) y -= x.g.range;
    if (x.c.con) { var mm = x.c.mix / 100; y = 20 * Math.log10(mm * lin(y + curvaComp(x.c, y) + x.c.mk) + (1 - mm) * lin(y)); }
    return y;
  }
  function desenharCurva() {
    var x = sel, m = ajustar(ui.cv);
    if (!m || !x) return;
    var cx = ui.cv.getContext('2d'), w = m.w, h = m.h, L = 34, B = 22, T = 8, R = 8, MIN = -60, MAX = 6;
    function X(v) { return L + (v - MIN) / (MAX - MIN) * (w - L - R); }
    function Y(v) { return T + (MAX - v) / (MAX - MIN) * (h - T - B); }
    cx.setTransform(m.dpr, 0, 0, m.dpr, 0, 0);
    cx.fillStyle = cor('--eq-bg'); cx.fillRect(0, 0, w, h);
    cx.font = '11px ' + cor('--mono'); cx.textBaseline = 'middle';
    for (var g = -60; g <= 0; g += 12) {
      cx.strokeStyle = g === 0 ? 'rgba(255,90,82,.35)' : 'rgba(255,255,255,.07)'; cx.lineWidth = 1;
      cx.beginPath(); cx.moveTo(X(g), Y(MAX)); cx.lineTo(X(g), Y(MIN)); cx.stroke();
      cx.beginPath(); cx.moveTo(X(MIN), Y(g)); cx.lineTo(X(MAX), Y(g)); cx.stroke();
      cx.fillStyle = cor('--muted'); cx.textAlign = 'right'; cx.fillText(String(g).replace('-', '−'), L - 5, Y(g));
      cx.textAlign = 'center'; cx.fillText(String(g).replace('-', '−'), X(g), h - B / 2 + 2);
    }
    cx.setLineDash([4, 4]); cx.strokeStyle = 'rgba(255,255,255,.25)';
    cx.beginPath(); cx.moveTo(X(MIN), Y(MIN)); cx.lineTo(X(MAX), Y(MAX)); cx.stroke(); cx.setLineDash([]);
    if (x.c.con) { cx.strokeStyle = 'rgba(255,176,46,.45)'; cx.beginPath(); cx.moveTo(X(x.c.thr), Y(MAX)); cx.lineTo(X(x.c.thr), Y(MIN)); cx.stroke(); }
    if (x.tipo === 'canal' && x.g.gon) { cx.strokeStyle = 'rgba(79,179,255,.55)'; cx.beginPath(); cx.moveTo(X(x.g.gthr), Y(MAX)); cx.lineTo(X(x.g.gthr), Y(MIN)); cx.stroke(); }
    cx.save(); cx.beginPath(); cx.rect(X(MIN), Y(MAX), X(MAX) - X(MIN), Y(MIN) - Y(MAX)); cx.clip();
    cx.strokeStyle = cor('--accent'); cx.lineWidth = 2.5; cx.beginPath();
    for (var v = MIN; v <= MAX; v += 0.25) { var y = saidaEstatica(x, v); if (v === MIN) cx.moveTo(X(v), Y(y)); else cx.lineTo(X(v), Y(y)); }
    cx.stroke();
    // Ponto: o nível que o detector do compressor vê agora e a saída com a redução aplicada de fato
    var r = x.rc;
    if (r && trans.tocando && r.det > -100 && !x.bypass) {
      var xi = clamp(r.det, MIN, MAX);
      var yo = x.c.con ? 20 * Math.log10((x.c.mix / 100) * lin(xi + r.gr + x.c.mk) + (1 - x.c.mix / 100) * lin(xi)) : xi;
      cx.fillStyle = '#fff'; cx.shadowColor = cor('--accent'); cx.shadowBlur = 10;
      cx.beginPath(); cx.arc(X(xi), Y(yo), 5, 0, Math.PI * 2); cx.fill(); cx.shadowBlur = 0;
    }
    cx.restore();
    cx.fillStyle = cor('--muted'); cx.textAlign = 'left'; cx.fillText('sai', 4, T + 6);
    cx.textAlign = 'right'; cx.fillText('entra', w - R - 4, Y(MIN) - 10);
  }

  function desenharHist() {
    var x = sel, m = ajustar(ui.hv);
    if (!m || !x) return;
    var hx = ui.hv.getContext('2d'), w = m.w, h = m.h, L = 34, R = 8, JAN = 6000, agora = performance.now();
    var topoGR = 6, altGR = Math.round(h * 0.32), topoNiv = altGR + 26, baseNiv = h - 10;
    function X(t) { return L + (1 - (agora - t) / JAN) * (w - L - R); }
    function Yn(v) { return topoNiv + (0 - clamp(v, -60, 0)) / 60 * (baseNiv - topoNiv); }
    function Yg(v) { return topoGR + (0 - clamp(v, -20, 0)) / 20 * altGR; }
    hx.setTransform(m.dpr, 0, 0, m.dpr, 0, 0);
    hx.fillStyle = cor('--eq-bg'); hx.fillRect(0, 0, w, h);
    hx.font = '10px ' + cor('--mono'); hx.textBaseline = 'middle'; hx.textAlign = 'right'; hx.fillStyle = cor('--muted');
    [0, -10, -20].forEach(function (v) { hx.strokeStyle = 'rgba(255,255,255,.06)'; hx.beginPath(); hx.moveTo(L, Yg(v)); hx.lineTo(w - R, Yg(v)); hx.stroke(); hx.fillText(String(v).replace('-', '−'), L - 5, Yg(v)); });
    [0, -24, -48].forEach(function (v) { hx.strokeStyle = 'rgba(255,255,255,.06)'; hx.beginPath(); hx.moveTo(L, Yn(v)); hx.lineTo(w - R, Yn(v)); hx.stroke(); hx.fillText(String(v).replace('-', '−'), L - 5, Yn(v)); });
    var H = x.hist;
    if (!H.length) return;
    hx.fillStyle = 'rgba(79,179,255,.22)';
    if (x.tipo === 'canal' && x.g.gon) H.forEach(function (p, i) { if (p.gate && i) hx.fillRect(X(H[i - 1].t), topoNiv, X(p.t) - X(H[i - 1].t) + 0.5, baseNiv - topoNiv); });
    hx.fillStyle = 'rgba(200,210,220,.22)'; hx.beginPath(); hx.moveTo(X(H[0].t), Yn(-60));
    H.forEach(function (p) { hx.lineTo(X(p.t), Yn(p.inp)); });
    hx.lineTo(X(H[H.length - 1].t), Yn(-60)); hx.closePath(); hx.fill();
    hx.strokeStyle = cor('--accent'); hx.lineWidth = 1.6; hx.beginPath();
    H.forEach(function (p, i) { if (i) hx.lineTo(X(p.t), Yn(p.out)); else hx.moveTo(X(p.t), Yn(p.out)); });
    hx.stroke();
    hx.fillStyle = 'rgba(255,90,82,.75)'; hx.beginPath(); hx.moveTo(X(H[0].t), Yg(0));
    H.forEach(function (p) { hx.lineTo(X(p.t), Yg(p.gr)); });
    hx.lineTo(X(H[H.length - 1].t), Yg(0)); hx.closePath(); hx.fill();
  }

  /* ---------- Medidores (a cada ~30 ms) ---------- */
  var bufL = new Float32Array(2048), bufR = new Float32Array(2048), pkMain = -120, rodando = false;
  function picoDe(an, b) {
    an.getFloatTimeDomainData(b);
    var p = 0; for (var i = 0; i < b.length; i++) { var a = b[i] < 0 ? -b[i] : b[i]; if (a > p) p = a; }
    return db(p);
  }
  function loop() {
    if (rodando) return;
    rodando = true;
    (function passo() {
      if (!A || document.getElementById('v-multitrack').hidden) { rodando = false; return; }
      if (trans.tocando && posicao() >= trans.dur) { if (trans.repetir) tocar(0); else { pausar(); trans.offset = trans.dur; } }
      atualizarTempo();
      var toca = trans.tocando;
      canais.concat(b11 ? [b11, b12] : []).forEach(function (x) {
        var v = toca ? picoDe(x.an, x.buf8) : -120;
        x.pk = Math.max(v, x.pk - 1.2);
        if (x._med && x._med.isConnected) pintarMed(x._med, v, x.pk);
        var gr = toca && x.rc && x.c.con && !x.bypass ? x.rc.gr : 0;
        if (x._gr) x._gr.textContent = gr < -0.5 ? num(gr, 0) : '';
        if (x._led) {
          var gOn = x.tipo === 'canal' && x.g.gon && !x.bypass;
          x._led.classList.toggle('off', !gOn);
          x._led.classList.toggle('aberto', !!(gOn && toca && x.rg && x.rg.gAberto));
        }
      });
      var x = sel;
      if (x) {
        if (x.tipo === 'canal' && ui.medIn && ui.medIn.el.isConnected) {
          var vi = toca ? picoDe(x.anIn, x.bufIn) : -120;
          x.pkIn = Math.max(vi, (x.pkIn || -120) - 0.4);
          ui.medIn.atualizar(Math.max(-60, vi), Math.max(-60, x.pkIn), x.pkIn > -100 ? num(x.pkIn) + ' dBFS' : '—');
        }
        if (ui.medGR && ui.medGR.el.isConnected) {
          var red = ui.medGR.gate ? (toca && x.rg && x.g.gon && !x.bypass ? x.rg.gDb : 0) : (toca && x.rc && x.c.con && !x.bypass ? x.rc.gr : 0);
          ui.medGR.atualizar(red, null, red < -0.05 ? num(red) + ' dB' : '0 dB');
        }
        if (ui.gateLed && ui.gateLed.isConnected) {
          var on = x.g.gon && !x.bypass && toca && x.rg;
          ui.gateLed.classList.toggle('on', !!(on && x.rg.gAberto));
          ui.gateLed.classList.toggle('fechado', !!(on && !x.rg.gAberto));
          ui.gateLed.textContent = on ? (x.rg.gAberto ? 'ABERTO' : 'FECHADO') : 'GATE';
        }
        desenharCurva(); desenharHist();
        if (toca) desenharEq();
      }
      if (ui.medL && ui.medL.isConnected) {
        var l = toca ? picoDe(A.anL, bufL) : -120, rr = toca ? picoDe(A.anR, bufR) : -120;
        pkMain = Math.max(l, rr, pkMain - 1.2);
        pintarMed(ui.medL, l, pkMain); pintarMed(ui.medR, rr, pkMain);
      }
      setTimeout(passo, 30);
    })();
  }

  window.addEventListener('hashchange', function () {
    if (location.hash === '#multitrack') { if (A) { loop(); setTimeout(function () { desenharCurva(); desenharHist(); desenharEq(); }, 0); } }
    else pausar();
  });
  window.addEventListener('resize', function () { desenharCurva(); desenharHist(); desenharEq(); });

  function iniciar() {
    if (G) return;
    G = window.GuiaCena;
    G.cena.paginas.forEach(function (p) { (p.canais || []).forEach(function (c) { if (c.n >= 1 && c.n <= 9) CANAIS.push(c); }); });
    construir();
  }
  if (window.GuiaCena) iniciar();
  else document.addEventListener('guia-cena', iniciar);
})();
