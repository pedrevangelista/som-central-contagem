/* Laboratório de compressor e gate.
   O processamento é feito amostra por amostra, como num processador de verdade:
   gate (com attack, hold, release, range e hysteresis) → compressor (detecção Peak ou RMS, knee,
   attack e release no ganho, makeup manual) → mix com o som seco (compressão paralela).
   Roda num AudioWorklet; onde o navegador não tem, usa um ScriptProcessor com o mesmo código. */
(function () {
  'use strict';
  var raiz = document.getElementById('dinamica-app');
  var FS = window.FontesSom;
  if (!raiz || !FS) return;

  /* ---------- O processador (texto, para rodar no worklet ou no fallback) ---------- */
  var DSP = String(function criarDSP(fs) {
    var p = { bypass: false, con: true, thr: -20, ratio: 3, att: 10, rel: 120, knee: 6, mk: 0, mix: 100, det: 'peak',
              gon: false, gthr: -40, range: 40, gatt: 0.5, hold: 60, grel: 200 };
    var HYST = 4;                       // o gate fecha 4 dB abaixo de onde abre
    var k = {};
    var ge = 0, gDb = -40, gAberto = false, holdN = 0, gLin = 0.01;
    var ms = 0, gr = 0, env = 0;
    var rep = { n: 0, grMin: 0, det: -120, inPk: 0, outPk: 0, gDb: 0 };
    function coef(ms_) { return ms_ <= 0 ? 0 : Math.exp(-1 / (ms_ / 1000 * fs)); }
    function calc() {
      k.att = coef(p.att); k.rel = coef(p.rel);
      k.rms = coef(10);                 // janela de uns 10 ms para o RMS
      k.ge = coef(4);                   // detector do gate: pega o pico na hora e solta em ~4 ms
      k.holdN = Math.round(p.hold / 1000 * fs);
      var faixa = Math.max(p.range, 0.01);
      k.gSobe = faixa / Math.max(1, p.gatt / 1000 * fs);
      k.gDesce = faixa / Math.max(1, p.grel / 1000 * fs);
      k.mix = p.mix / 100;
    }
    calc();
    function curva(x) {
      var over = x - p.thr, W = p.knee, R = p.ratio;
      if (2 * over < -W) return 0;
      if (W > 0 && 2 * Math.abs(over) <= W) return (1 / R - 1) * Math.pow(over + W / 2, 2) / (2 * W);
      return (1 / R - 1) * over;
    }
    return {
      set: function (q) { for (var key in q) p[key] = q[key]; calc(); if (!p.gon) { gDb = 0; gLin = 1; } },
      // ins/outs: listas de canais (Float32Array). Devolve um relatório a cada ~20 ms.
      process: function (ins, outs) {
        var n = outs[0].length, nIn = ins.length;
        for (var i = 0; i < n; i++) {
          var x = 0;
          for (var c = 0; c < nIn; c++) { var a = ins[c][i]; if (a < 0) a = -a; if (a > x) x = a; }
          if (x > rep.inPk) rep.inPk = x;
          if (p.bypass) {
            for (var b = 0; b < outs.length; b++) outs[b][i] = ins[Math.min(b, nIn - 1)][i];
            continue;
          }
          /* Gate */
          if (p.gon) {
            ge = x > ge ? x : ge * k.ge;
            var gl = ge > 1e-9 ? 20 * Math.log10(ge) : -180;
            if (gl > p.gthr) { gAberto = true; holdN = k.holdN; }
            else if (gl < p.gthr - HYST) { if (holdN > 0) holdN--; else gAberto = false; }
            else if (gAberto) holdN = k.holdN;
            var alvo = gAberto ? 0 : -p.range, antes = gDb;
            if (gDb < alvo) gDb = Math.min(alvo, gDb + k.gSobe);
            else if (gDb > alvo) gDb = Math.max(alvo, gDb - k.gDesce);
            if (gDb !== antes) gLin = Math.pow(10, gDb / 20);
          } else gLin = 1;
          /* Compressor */
          // Peak: o detector agarra o pico na hora e solta no tempo do release. Assim ele não cai a zero a cada
          // ciclo da onda, e o attack muda só a velocidade da compressão, não a quantidade.
          // RMS: média de uns 10 ms; aí attack e release agem os dois sobre o ganho.
          var s = x * gLin, nivel, g;
          if (p.det === 'rms') {
            ms = k.rms * ms + (1 - k.rms) * s * s;
            nivel = ms > 1e-18 ? 10 * Math.log10(ms) + 3.01 : -180;
            g = p.con ? curva(nivel) : 0;
            gr = g < gr ? k.att * gr + (1 - k.att) * g : k.rel * gr + (1 - k.rel) * g;
          } else {
            env = s > env ? s : env * k.rel;
            nivel = env > 1e-9 ? 20 * Math.log10(env) : -180;
            g = p.con ? curva(nivel) : 0;
            gr = g < gr ? k.att * gr + (1 - k.att) * g : g;
          }
          var molhado = p.con ? Math.pow(10, (gr + p.mk) / 20) : 1, mix = p.con ? k.mix : 1;
          var ganho = gLin * (mix * molhado + (1 - mix));
          var pk = 0;
          for (var o = 0; o < outs.length; o++) {
            var y = ins[Math.min(o, nIn - 1)][i] * ganho;
            outs[o][i] = y;
            if (y < 0) y = -y; if (y > pk) pk = y;
          }
          if (pk > rep.outPk) rep.outPk = pk;
          if (gr < rep.grMin) rep.grMin = gr;
          if (nivel > rep.det) rep.det = nivel;
        }
        rep.n += n;
        if (rep.n >= fs * 0.02) {
          var r = { gr: p.con && !p.bypass ? rep.grMin : 0, det: rep.det, inPk: rep.inPk, outPk: rep.outPk, gDb: p.gon && !p.bypass ? gDb : 0, gAberto: gAberto };
          rep.n = 0; rep.grMin = 0; rep.det = -180; rep.inPk = 0; rep.outPk = 0;
          return r;
        }
        return null;
      }
    };
  });

  var FONTES = [
    { id: 'canto', nome: 'Voz cantando' },
    { id: 'fala', nome: 'Fala do pastor' },
    { id: 'bumbo', nome: 'Bumbo' },
    { id: 'tom', nome: 'Tom com vazamento' },
    { id: 'arquivo', nome: 'Seu arquivo' }
  ];

  // Controles: [id, rótulo, mín, máx, passo, formato]
  var COMP = [
    ['thr', 'Threshold', -60, 0, 0.5, 'db'],
    ['ratio', 'Ratio', 1, 20, 0.1, 'ratio'],
    ['att', 'Attack', 0.1, 120, 0.1, 'ms'],
    ['rel', 'Release', 10, 2000, 1, 'ms'],
    ['knee', 'Knee', 0, 20, 0.5, 'db'],
    ['mk', 'Makeup', 0, 24, 0.5, 'db'],
    ['mix', 'Mix', 0, 100, 1, 'pct']
  ];
  var GATE = [
    ['gthr', 'Threshold', -80, 0, 0.5, 'db'],
    ['range', 'Range', 0, 80, 1, 'db'],
    ['gatt', 'Attack', 0.1, 50, 0.1, 'ms'],
    ['hold', 'Hold', 0, 1000, 1, 'ms'],
    ['grel', 'Release', 5, 2000, 1, 'ms']
  ];
  var LOG = { att: 1, rel: 1, gatt: 1, grel: 1 };

  var PRESETS = [
    { id: 'voz', nome: 'Voz cantada', fonte: 'canto', c: { con: true, det: 'peak', thr: -15, ratio: 3, att: 8, rel: 150, knee: 6, mk: 4, mix: 100 }, g: { gon: false },
      txt: 'Compressão firme mas natural. O refrão é segurado e o verso quase não é tocado. Olhe a redução: de 3 a 6 dB nas partes fortes, perto de zero nas fracas.' },
    { id: 'fala', nome: 'Fala do pastor', fonte: 'fala', c: { con: true, det: 'rms', thr: -22, ratio: 2.5, att: 20, rel: 250, knee: 10, mk: 4, mix: 100 }, g: { gon: false },
      txt: 'Detecção RMS, ratio mais baixo e release longo: o compressor acompanha o volume médio da fala, não cada sílaba. Sem gate: em microfone de fala, o gate come o começo e o fim das palavras.' },
    { id: 'bumbo', nome: 'Bumbo', fonte: 'bumbo', c: { con: true, det: 'peak', thr: -18, ratio: 4, att: 25, rel: 80, knee: 2, mk: 4, mix: 100 }, g: { gon: false },
      txt: 'Attack de uns 25 ms deixa o clique da batida passar antes de o compressor agir, e o release curto solta antes da próxima. No histórico, repare que a redução começa logo depois do pico.' },
    { id: 'tom', nome: 'Tom com gate', fonte: 'tom', c: { con: false, det: 'peak', thr: -20, ratio: 3, att: 10, rel: 120, knee: 6, mk: 0, mix: 100 }, g: { gon: true, gthr: -20, range: 30, gatt: 0.3, hold: 120, grel: 250 },
      txt: 'Entre as viradas, o microfone do tom só capta o resto da bateria vazando. O gate fecha nessas horas e abre a cada batida no tom. A faixa azul do histórico mostra quando ele está aberto.' },
    { id: 'paralela', nome: 'Paralela (bus 12)', fonte: 'bumbo', c: { con: true, det: 'peak', thr: -36, ratio: 10, att: 1, rel: 120, knee: 0, mk: 16, mix: 35 }, g: { gon: false },
      txt: 'Uma cópia comprimida com força, somada ao som original pelo controle Mix. É a ideia do bus 12: corpo e sustentação sem perder o impacto da batida. Puxe o Mix para 100% e ouça o exagero.' },
    { id: 'errado', nome: 'Exagerado (errado)', fonte: 'canto', c: { con: true, det: 'peak', thr: -45, ratio: 20, att: 0.1, rel: 25, knee: 0, mk: 22, mix: 100 }, g: { gon: false },
      txt: 'Para ouvir o erro: tudo fica no mesmo volume, sem respiro, e o som "bombeia". Repare que a redução nunca volta a zero. Quando ouvir isso na mesa, é compressão demais.' }
  ];

  var st = {
    fonte: 'canto', tocando: false, ab: false, arquivo: null,
    c: { con: true, det: 'peak', thr: -15, ratio: 3, att: 8, rel: 150, knee: 6, mk: 4, mix: 100 },
    g: { gon: false, gthr: -40, range: 40, gatt: 0.5, hold: 60, grel: 200 },
    det: null, grAgora: 0, hist: []
  };

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (key) {
      if (key === 'text') e.textContent = attrs[key]; else if (key === 'class') e.className = attrs[key]; else e.setAttribute(key, attrs[key]);
    });
    (kids || []).forEach(function (kid) { if (kid) e.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid); });
    return e;
  }
  function formatar(v, f) {
    if (f === 'db') return FS.fmtDb(v);
    if (f === 'ratio') return v >= 19.95 ? '∞ : 1 (limiter)' : String(Math.round(v * 10) / 10).replace('.', ',') + ' : 1';
    if (f === 'ms') return (v < 10 ? String(Math.round(v * 10) / 10).replace('.', ',') : String(Math.round(v))) + ' ms';
    return Math.round(v) + '%';
  }
  function paraSlider(def, v) { if (!LOG[def[0]]) return v; return Math.log(v / def[2]) / Math.log(def[3] / def[2]) * 1000; }
  function doSlider(def, s) { if (!LOG[def[0]]) return +s; return def[2] * Math.pow(def[3] / def[2], s / 1000); }

  /* ---------- Interface ---------- */
  var presetChips = el('div', { class: 'pick small', role: 'group', 'aria-label': 'Pontos de partida' });
  PRESETS.forEach(function (pr) { presetChips.appendChild(el('button', { type: 'button', 'aria-pressed': 'false', 'data-p': pr.id, text: pr.nome })); });
  var presetTxt = el('p', { class: 'eq-regiao' });

  var fonteChips = el('div', { class: 'pick small', role: 'group', 'aria-label': 'O que tocar' });
  FONTES.forEach(function (f) {
    var b = el('button', { type: 'button', 'aria-pressed': String(f.id === st.fonte), 'data-f': f.id, text: f.nome });
    if (f.id === 'arquivo') b.setAttribute('disabled', '');
    fonteChips.appendChild(b);
  });
  var inputArq = el('input', { type: 'file', id: 'din-arquivo', accept: 'audio/*', class: 'eq-file' });
  var labelArq = el('label', { class: 'btn', for: 'din-arquivo', text: 'Escolher arquivo de áudio' });
  var nomeArq = el('span', { class: 'eq-mini' });
  var btnPlay = el('button', { type: 'button', class: 'btn primario', id: 'din-play', text: 'Tocar' });
  var chkAB = el('input', { type: 'checkbox', id: 'din-ab' });
  var vol = el('input', { type: 'range', id: 'din-vol', min: '0', max: '100', step: '1', value: '35' });
  var audioMsg = el('p', { class: 'eq-mini', 'aria-live': 'polite' });

  var canvas = el('canvas', { class: 'din-canvas', role: 'img', 'aria-label': 'Curva do compressor: nível que entra no eixo de baixo, nível que sai no eixo do lado.' });
  var cx = canvas.getContext('2d');
  var hist = el('canvas', { class: 'din-hist', role: 'img', 'aria-label': 'Histórico dos últimos segundos: entrada, saída, redução do compressor e gate aberto.' });
  var hx = hist.getContext('2d');

  var medIn = FS.medidor({ min: -60, max: 0, marcas: [-60, -48, -36, -24, -12, 0], rotulo: 'Entrada' });
  var medGR = FS.medidor({ min: -20, max: 0, marcas: [-20, -15, -10, -6, -3, 0], rotulo: 'Redução do compressor (GR)', inverso: true });
  var medGate = FS.medidor({ min: -40, max: 0, marcas: [-40, -30, -20, -10, 0], rotulo: 'Redução do gate', inverso: true });
  var medOut = FS.medidor({ min: -60, max: 0, marcas: [-60, -48, -36, -24, -12, 0], rotulo: 'Saída' });
  var gateLed = el('span', { class: 'gate-led', text: 'GATE' });

  var ctl = {};
  var detChips = el('div', { class: 'pick small', role: 'group', 'aria-label': 'Detecção' }, [
    el('button', { type: 'button', 'data-det': 'peak', 'aria-pressed': 'true', text: 'Peak' }),
    el('button', { type: 'button', 'data-det': 'rms', 'aria-pressed': 'false', text: 'RMS' })
  ]);
  function bloco(titulo, idOn, defs, grupo, extra) {
    var on = el('input', { type: 'checkbox', id: 'din-' + idOn });
    ctl[idOn] = on;
    var linhas = defs.map(function (d) {
      var r = el('input', { type: 'range', id: 'din-' + d[0], min: LOG[d[0]] ? '0' : String(d[2]), max: LOG[d[0]] ? '1000' : String(d[3]), step: LOG[d[0]] ? '1' : String(d[4]) });
      var o = el('output', { for: 'din-' + d[0] });
      ctl[d[0]] = { r: r, o: o, def: d, grupo: grupo };
      return el('label', { class: 'eq-linha', for: 'din-' + d[0] }, [el('span', { text: d[1] }), r, o]);
    });
    return el('div', { class: 'eq-ctl' }, [
      el('div', { class: 'eq-ctl-head' }, [
        el('strong', { class: 'eq-ctl-titulo', text: titulo }),
        el('label', { class: 'eq-toggle', for: 'din-' + idOn }, [on, el('span', { text: 'Ligado' })])
      ])
    ].concat(extra || []).concat(linhas));
  }
  var blocoComp = bloco('Compressor', 'con', COMP, 'c', [el('div', { class: 'din-det' }, [el('span', { class: 'eq-mini', text: 'Detecção' }), detChips])]);
  var blocoGate = bloco('Gate', 'gon', GATE, 'g', [el('p', { class: 'eq-mini', text: 'Abre quando o som passa do threshold e só fecha 4 dB abaixo dele (hysteresis), para não ficar abrindo e fechando no limite.' })]);
  blocoGate.querySelector('.eq-ctl-head').appendChild(gateLed);

  raiz.appendChild(el('div', { class: 'eq-editor' }, [
    el('div', { class: 'din-presets' }, [el('span', { class: 'rotulo', text: 'Pontos de partida' }), presetChips, presetTxt]),
    el('div', { class: 'din-topo' }, [
      el('div', { class: 'din-curva' }, [canvas]),
      el('div', { class: 'din-meds' }, [medIn.el, medGate.el, medGR.el, medOut.el])
    ]),
    el('div', { class: 'din-hist-wrap' }, [
      el('div', { class: 'din-legenda' }, [
        el('span', { class: 'lg-in', text: 'Entrada' }), el('span', { class: 'lg-out', text: 'Saída' }),
        el('span', { class: 'lg-gr', text: 'Redução (GR)' }), el('span', { class: 'lg-gate', text: 'Gate aberto' })
      ]),
      hist
    ]),
    el('div', { class: 'eq-lados' }, [blocoComp, blocoGate]),
    el('div', { class: 'eq-audio' }, [
      el('div', { class: 'eq-audio-row' }, [btnPlay, el('label', { class: 'eq-toggle', for: 'din-ab' }, [chkAB, el('span', { text: 'Ouvir sem processamento' })])]),
      fonteChips,
      el('div', { class: 'eq-audio-row' }, [labelArq, inputArq, nomeArq]),
      el('label', { class: 'eq-linha', for: 'din-vol' }, [el('span', { text: 'Volume' }), vol, el('span')]),
      audioMsg,
      el('p', { class: 'note', text: 'Comece com o volume baixo. Os sons de bumbo, tom e voz são sintetizados aqui mesmo: servem para mostrar a dinâmica, não o timbre. Para ouvir de verdade, use um arquivo seu, de preferência um canal só (uma voz ou um tambor).' })
    ])
  ]));

  /* ---------- Áudio ---------- */
  var ac = null, nos = null, fonteNo = null, inBuf = new Float32Array(2048), outBuf = new Float32Array(2048);
  var pronto = null;

  function montar() {
    if (pronto) return pronto;
    ac = FS.contexto();
    if (!ac) { audioMsg.textContent = 'Este navegador não toca áudio. Use o Chrome ou o Edge.'; return Promise.reject(); }
    nos = { trim: ac.createGain(), medIn: ac.createAnalyser(), saida: ac.createGain(), medOut: ac.createAnalyser(), vol: ac.createGain(), prot: ac.createDynamicsCompressor() };
    nos.trim.gain.value = FS.lin(-6);           // picos da fonte chegam em −6 dBFS
    nos.medIn.fftSize = 2048; nos.medOut.fftSize = 2048;
    // Proteção dos ouvidos: só age se a saída passar de −3 dBFS.
    nos.prot.threshold.value = -3; nos.prot.ratio.value = 20; nos.prot.knee.value = 0; nos.prot.attack.value = 0.001; nos.prot.release.value = 0.1;
    nos.trim.connect(nos.medIn);
    nos.saida.connect(nos.medOut); nos.saida.connect(nos.vol);
    nos.vol.connect(nos.prot); nos.prot.connect(ac.destination);

    function comFallback() {
      var criar = new Function(DSP + '; return criarDSP;')();
      var d = criar(ac.sampleRate);
      var sp = ac.createScriptProcessor(1024, 2, 2);
      sp.onaudioprocess = function (e) {
        var ins = [], outs = [];
        for (var c = 0; c < e.inputBuffer.numberOfChannels; c++) ins.push(e.inputBuffer.getChannelData(c));
        for (var o = 0; o < e.outputBuffer.numberOfChannels; o++) outs.push(e.outputBuffer.getChannelData(o));
        var r = d.process(ins, outs);
        if (r) relatorio(r);
      };
      nos.dsp = sp;
      nos.enviar = function (q) { d.set(q); };
    }
    function comWorklet() {
      var codigo = DSP + '\nclass Lab extends AudioWorkletProcessor {\n' +
        '  constructor() { super(); this.d = criarDSP(sampleRate); this.port.onmessage = (e) => this.d.set(e.data); }\n' +
        '  process(ins, outs) { const i = ins[0], o = outs[0]; if (!i || !i.length) { for (const c of o) c.fill(0); return true; }\n' +
        '    const r = this.d.process(i, o); if (r) this.port.postMessage(r); return true; }\n' +
        '}\nregisterProcessor("dinamica-lab", Lab);';
      var url = URL.createObjectURL(new Blob([codigo], { type: 'application/javascript' }));
      return ac.audioWorklet.addModule(url).then(function () {
        var w = new AudioWorkletNode(ac, 'dinamica-lab', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
        w.port.onmessage = function (e) { relatorio(e.data); };
        nos.dsp = w;
        nos.enviar = function (q) { w.port.postMessage(q); };
      });
    }
    var p = (ac.audioWorklet && window.AudioWorkletNode) ? comWorklet().catch(comFallback) : Promise.resolve().then(comFallback);
    pronto = p.then(function () {
      nos.trim.connect(nos.dsp); nos.dsp.connect(nos.saida);
      aplicar();
    });
    return pronto;
  }

  function parametros() {
    var q = { bypass: st.ab };
    Object.keys(st.c).forEach(function (key) { q[key] = st.c[key]; });
    Object.keys(st.g).forEach(function (key) { q[key] = st.g[key]; });
    return q;
  }

  function aplicar() {
    Object.keys(ctl).forEach(function (key) {
      var c = ctl[key];
      if (c.def) c.o.textContent = formatar(st[c.grupo][key], c.def[5]);
    });
    ctl.con.checked = st.c.con; ctl.gon.checked = st.g.gon;
    detChips.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-det') === st.c.det)); });
    blocoComp.classList.toggle('desligado', !st.c.con);
    blocoGate.classList.toggle('desligado', !st.g.gon);
    desenhar();
    if (!nos || !nos.enviar) return;
    nos.enviar(parametros());
    var v = +vol.value / 100;
    nos.vol.gain.setTargetAtTime(v * v, ac.currentTime, 0.02);
  }

  function sincronizarSliders() {
    Object.keys(ctl).forEach(function (key) {
      var c = ctl[key];
      if (c.def) c.r.value = String(paraSlider(c.def, st[c.grupo][key]));
    });
  }

  function tocar() {
    montar().then(function () {
      if (ac.state === 'suspended') ac.resume();
      pararFonte();
      var buf = st.fonte === 'arquivo' ? st.arquivo : FS.buffer(st.fonte);
      if (!buf) return;
      fonteNo = ac.createBufferSource(); fonteNo.buffer = buf; fonteNo.loop = true;
      fonteNo.connect(nos.trim); fonteNo.start();
      st.tocando = true; st.hist = [];
      btnPlay.textContent = 'Parar';
      audioMsg.textContent = 'Tocando: ' + FONTES.filter(function (f) { return f.id === st.fonte; })[0].nome + (st.fonte === 'arquivo' ? ' (' + nomeArq.textContent + ')' : '') + '.';
      if (!anim) { anim = true; setTimeout(loop, 16); }
    }).catch(function () {});
  }
  function pararFonte() { if (fonteNo) { try { fonteNo.stop(); } catch (e) {} fonteNo.disconnect(); fonteNo = null; } }
  function parar() {
    pararFonte();
    st.tocando = false;
    btnPlay.textContent = 'Tocar';
    audioMsg.textContent = '';
    medIn.atualizar(-120, null, ''); medOut.atualizar(-120, null, ''); medGR.atualizar(0, null, ''); medGate.atualizar(0, null, '');
    gateLed.classList.remove('on', 'fechado'); gateLed.textContent = 'GATE';
    st.det = null; desenhar();
  }

  /* ---------- Relatórios do processador (a cada ~20 ms) ---------- */
  function relatorio(r) {
    if (!st.tocando) return;
    st.grAgora = r.gr;
    st.det = r.det > -100 ? r.det : null;
    st.gDb = r.gDb; st.gAberto = r.gAberto;
    st.hist.push({ t: performance.now(), inp: FS.db(r.inPk), out: FS.db(r.outPk), gr: r.gr, gate: r.gAberto });
    while (st.hist.length && st.hist[0].t < performance.now() - 6000) st.hist.shift();
  }

  /* ---------- Medidores e desenho (a cada quadro) ---------- */
  var anim = false;
  function loop() {
    if (!st.tocando) { anim = false; return; }
    var ni = FS.nivel(nos.medIn, inBuf), no = FS.nivel(nos.medOut, outBuf);
    medIn.atualizar(ni.rms, ni.pico, FS.fmtDb(ni.pico));
    medOut.atualizar(no.rms, no.pico, FS.fmtDb(no.pico));
    var gr = st.c.con && !st.ab ? st.grAgora : 0;
    medGR.atualizar(gr, null, gr < -0.05 ? FS.fmtDb(gr) : '0 dB');
    var gd = st.g.gon && !st.ab ? (st.gDb || 0) : 0;
    medGate.atualizar(gd, null, gd < -0.05 ? FS.fmtDb(gd) : '0 dB');
    if (st.g.gon && !st.ab) {
      gateLed.classList.toggle('on', !!st.gAberto);
      gateLed.classList.toggle('fechado', !st.gAberto);
      gateLed.textContent = st.gAberto ? 'ABERTO' : 'FECHADO';
    } else { gateLed.classList.remove('on', 'fechado'); gateLed.textContent = 'GATE'; }
    desenhar();
    desenharHist();
    setTimeout(loop, 16);
  }

  /* ---------- Curva do compressor ---------- */
  function curvaComp(x) {
    var c = st.c;
    if (!c.con) return 0;
    var over = x - c.thr, W = c.knee, R = c.ratio;
    if (2 * over < -W) return 0;
    if (W > 0 && 2 * Math.abs(over) <= W) return (1 / R - 1) * Math.pow(over + W / 2, 2) / (2 * W);
    return (1 / R - 1) * over;
  }
  function saidaEstatica(x) {
    var y = x;
    if (st.g.gon && x < st.g.gthr) y -= st.g.range;
    var xg = y;
    if (st.c.con) {
      var m = st.c.mix / 100, wet = FS.lin(xg + curvaComp(xg) + st.c.mk), dry = FS.lin(xg);
      y = 20 * Math.log10(m * wet + (1 - m) * dry);
    }
    return y;
  }
  function cor(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888'; }

  function ajustar(cv) {
    var r = cv.getBoundingClientRect();
    if (!r.width) return null;
    var dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) {
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    }
    return { w: r.width, h: r.height, dpr: dpr };
  }

  function desenhar() {
    var m = ajustar(canvas);
    if (!m) return;
    var w = m.w, h = m.h, L = 34, B = 22, T = 8, R = 8, MIN = -60, MAX = 6;
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
    if (st.c.con) { cx.strokeStyle = 'rgba(255,176,46,.45)'; cx.beginPath(); cx.moveTo(X(st.c.thr), Y(MAX)); cx.lineTo(X(st.c.thr), Y(MIN)); cx.stroke(); }
    if (st.g.gon) { cx.strokeStyle = 'rgba(79,179,255,.55)'; cx.beginPath(); cx.moveTo(X(st.g.gthr), Y(MAX)); cx.lineTo(X(st.g.gthr), Y(MIN)); cx.stroke(); }
    cx.save();
    cx.beginPath(); cx.rect(X(MIN), Y(MAX), X(MAX) - X(MIN), Y(MIN) - Y(MAX)); cx.clip();
    cx.strokeStyle = cor('--accent'); cx.lineWidth = 2.5; cx.beginPath();
    for (var x = MIN; x <= MAX; x += 0.25) { var y = saidaEstatica(x); if (x === MIN) cx.moveTo(X(x), Y(y)); else cx.lineTo(X(x), Y(y)); }
    cx.stroke();
    // Ponto: o nível que o detector vê agora e a saída com a redução que está de fato aplicada (com attack e release).
    if (st.det != null && st.tocando) {
      var xi = Math.max(MIN, Math.min(MAX, st.det));
      var yo = st.c.con ? (function () { var mm = st.c.mix / 100; return 20 * Math.log10(mm * FS.lin(xi + st.grAgora + st.c.mk) + (1 - mm) * FS.lin(xi)); })() : xi;
      cx.fillStyle = '#fff'; cx.shadowColor = cor('--accent'); cx.shadowBlur = 10;
      cx.beginPath(); cx.arc(X(xi), Y(yo), 5, 0, Math.PI * 2); cx.fill(); cx.shadowBlur = 0;
    }
    cx.restore();
    cx.fillStyle = cor('--muted'); cx.textAlign = 'left'; cx.fillText('sai', 4, T + 6);
    cx.textAlign = 'right'; cx.fillText('entra', w - R - 4, Y(MIN) - 10);
  }

  function desenharHist() {
    var m = ajustar(hist);
    if (!m) return;
    var w = m.w, h = m.h, L = 34, R = 8, JAN = 6000, agora = performance.now();
    var topoGR = 6, altGR = Math.round(h * 0.32), topoNiv = altGR + 26, baseNiv = h - 10;
    function X(t) { return L + (1 - (agora - t) / JAN) * (w - L - R); }
    function Yn(v) { return topoNiv + (0 - Math.max(-60, Math.min(0, v))) / 60 * (baseNiv - topoNiv); }
    function Yg(v) { return topoGR + (0 - Math.max(-20, Math.min(0, v))) / 20 * altGR; }
    hx.setTransform(m.dpr, 0, 0, m.dpr, 0, 0);
    hx.fillStyle = cor('--eq-bg'); hx.fillRect(0, 0, w, h);
    hx.font = '10px ' + cor('--mono'); hx.textBaseline = 'middle'; hx.textAlign = 'right'; hx.fillStyle = cor('--muted');
    [0, -10, -20].forEach(function (v) { hx.strokeStyle = 'rgba(255,255,255,.06)'; hx.beginPath(); hx.moveTo(L, Yg(v)); hx.lineTo(w - R, Yg(v)); hx.stroke(); hx.fillText(String(v).replace('-', '−'), L - 5, Yg(v)); });
    [0, -24, -48].forEach(function (v) { hx.strokeStyle = 'rgba(255,255,255,.06)'; hx.beginPath(); hx.moveTo(L, Yn(v)); hx.lineTo(w - R, Yn(v)); hx.stroke(); hx.fillText(String(v).replace('-', '−'), L - 5, Yn(v)); });
    var H = st.hist;
    if (!H.length) return;
    // Gate aberto: faixa azul no pé
    hx.fillStyle = 'rgba(79,179,255,.22)';
    if (st.g.gon) H.forEach(function (p, i) { if (p.gate && i) hx.fillRect(X(H[i - 1].t), topoNiv, X(p.t) - X(H[i - 1].t) + 0.5, baseNiv - topoNiv); });
    // Entrada (área cinza) e saída (linha âmbar)
    hx.fillStyle = 'rgba(200,210,220,.22)'; hx.beginPath(); hx.moveTo(X(H[0].t), Yn(-60));
    H.forEach(function (p) { hx.lineTo(X(p.t), Yn(p.inp)); });
    hx.lineTo(X(H[H.length - 1].t), Yn(-60)); hx.closePath(); hx.fill();
    hx.strokeStyle = cor('--accent'); hx.lineWidth = 1.6; hx.beginPath();
    H.forEach(function (p, i) { if (i) hx.lineTo(X(p.t), Yn(p.out)); else hx.moveTo(X(p.t), Yn(p.out)); });
    hx.stroke();
    // Redução: barras vermelhas descendo do topo
    hx.fillStyle = 'rgba(255,90,82,.75)'; hx.beginPath(); hx.moveTo(X(H[0].t), Yg(0));
    H.forEach(function (p) { hx.lineTo(X(p.t), Yg(p.gr)); });
    hx.lineTo(X(H[H.length - 1].t), Yg(0)); hx.closePath(); hx.fill();
  }

  /* ---------- Eventos ---------- */
  function usarPreset(id) {
    var pr = PRESETS.filter(function (x) { return x.id === id; })[0];
    if (!pr) return;
    Object.keys(pr.c).forEach(function (key) { st.c[key] = pr.c[key]; });
    Object.keys(pr.g).forEach(function (key) { st.g[key] = pr.g[key]; });
    presetChips.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-p') === id)); });
    presetTxt.textContent = pr.txt;
    sincronizarSliders();
    escolherFonte(pr.fonte);
    aplicar();
  }
  function escolherFonte(id) {
    var b = fonteChips.querySelector('[data-f="' + id + '"]');
    if (!b || b.disabled) return;
    var mudou = st.fonte !== id;
    st.fonte = id;
    fonteChips.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    if (mudou && st.tocando) tocar();
  }
  function semPreset() { presetChips.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); }); }

  presetChips.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) usarPreset(b.getAttribute('data-p')); });
  fonteChips.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b && !b.disabled) escolherFonte(b.getAttribute('data-f')); });
  detChips.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; st.c.det = b.getAttribute('data-det'); semPreset(); aplicar(); });
  Object.keys(ctl).forEach(function (key) {
    var c = ctl[key];
    if (c.def) c.r.addEventListener('input', function () { st[c.grupo][key] = doSlider(c.def, c.r.value); semPreset(); aplicar(); });
  });
  ctl.con.addEventListener('change', function () { st.c.con = ctl.con.checked; aplicar(); });
  ctl.gon.addEventListener('change', function () { st.g.gon = ctl.gon.checked; aplicar(); });
  chkAB.addEventListener('change', function () { st.ab = chkAB.checked; aplicar(); });
  vol.addEventListener('input', aplicar);
  btnPlay.addEventListener('click', function () { if (st.tocando) parar(); else tocar(); });
  inputArq.addEventListener('change', function () {
    var arq = inputArq.files && inputArq.files[0];
    if (!arq) return;
    nomeArq.textContent = 'Carregando...';
    FS.carregar(arq).then(function (b) {
      st.arquivo = b;
      nomeArq.textContent = arq.name;
      fonteChips.querySelector('[data-f="arquivo"]').removeAttribute('disabled');
      escolherFonte('arquivo');
      if (!st.tocando) tocar();
    }).catch(function () { nomeArq.textContent = 'Não consegui abrir esse arquivo. Tente um MP3 ou WAV.'; });
  });
  window.addEventListener('hashchange', function () {
    if (location.hash !== '#dinamica' && st.tocando) parar();
    if (location.hash === '#dinamica') setTimeout(function () { desenhar(); desenharHist(); }, 0);
  });
  window.addEventListener('resize', function () { desenhar(); desenharHist(); });

  usarPreset('voz');
  medIn.atualizar(-120, null, ''); medOut.atualizar(-120, null, ''); medGR.atualizar(0, null, ''); medGate.atualizar(0, null, '');
  setTimeout(function () { desenhar(); desenharHist(); }, 0);
})();
