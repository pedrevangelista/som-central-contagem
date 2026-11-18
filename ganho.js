/* Laboratório de estrutura de ganho.
   Caminho do som: fonte (nível do microfone) → ganho do pré → conversor (estoura em 0 dBFS) → ruído de fundo
   → medidor do canal → fader automático (o que seria preciso para o canal aparecer na mix) → fone. */
(function () {
  'use strict';
  var raiz = document.getElementById('ganho-app');
  var FS = window.FontesSom;
  if (!raiz || !FS) return;

  // Nível de pico de cada fonte com o ganho em 0 dB (em dBFS), como chega de um microfone ou DI.
  var FONTES = [
    { id: 'fala', nome: 'Fala do pastor', mic: -50, txt: 'Fala varia muito: frases baixas, frases fortes. Deixe folga para quando ele se empolgar.' },
    { id: 'canto', nome: 'Voz cantando', mic: -42, txt: 'O verso vem contido e o refrão chega uns 9 dB mais forte. Ajuste pelo refrão, não pelo verso.' },
    { id: 'bumbo', nome: 'Bumbo', mic: -24, txt: 'Bateria chega forte no microfone. Precisa de pouco ganho, e o pico é curto: olhe a marca de pico, não a barra.' },
    { id: 'arquivo', nome: 'Seu arquivo', mic: -36, txt: 'O arquivo entra como se fosse um microfone. Use uma gravação de um canal só para treinar.' }
  ];
  var ALVO = [-18, -6], MIX_RMS = -28, RUIDO = -72;

  var st = { fonte: 'fala', ganho: 20, tocando: false, empolgou: 0, hist: [], clipAte: 0, rmsRel: {}, arquivo: null };

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (k) { if (k) e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k); });
    return e;
  }
  function fonteAtual() { return FONTES.filter(function (f) { return f.id === st.fonte; })[0]; }
  function fmt(v) { return FS.fmtDb(v); }
  function sinal(v) { return (v > 0 ? '+' : '') + fmt(v); }

  /* ---------- Interface ---------- */
  var chips = el('div', { class: 'pick small', role: 'group', 'aria-label': 'O que tocar' });
  FONTES.forEach(function (f) {
    var b = el('button', { type: 'button', 'aria-pressed': String(f.id === st.fonte), 'data-f': f.id, text: f.nome });
    if (f.id === 'arquivo') b.setAttribute('disabled', '');
    chips.appendChild(b);
  });
  var inputArq = el('input', { type: 'file', id: 'ganho-arquivo', accept: 'audio/*', class: 'eq-file' });
  var labelArq = el('label', { class: 'btn', for: 'ganho-arquivo', text: 'Escolher arquivo de áudio' });
  var nomeArq = el('span', { class: 'eq-mini' });
  var btnPlay = el('button', { type: 'button', class: 'btn primario', id: 'ganho-play', text: 'Tocar' });
  var btnEmp = el('button', { type: 'button', class: 'btn', id: 'ganho-emp', text: 'Ficou mais forte (+8 dB)' });
  var fonteTxt = el('p', { class: 'eq-mini' });

  var medCanal = FS.medidor({ min: -60, max: 0, alvo: ALVO, marcas: [-60, -48, -36, -24, -18, -12, -6, 0], rotulo: 'Medidor do canal (depois do ganho)' });
  var clip = el('span', { class: 'clip-led', text: 'CLIP' });
  medCanal.el.querySelector('.med-topo').insertBefore(clip, medCanal.el.querySelector('.med-valor'));
  var medFader = FS.medidor({ min: -40, max: 10, marcas: [-40, -30, -20, -10, 0, 10], rotulo: 'Fader que o canal precisaria na mix' });

  var estado = el('div', { class: 'ganho-estado', 'aria-live': 'polite' }, [el('strong'), el('p')]);

  var ctlG = el('input', { type: 'range', id: 'ganho-g', min: '0', max: '60', step: '0.5', value: String(st.ganho) });
  var outG = el('output', { for: 'ganho-g' });
  var vol = el('input', { type: 'range', id: 'ganho-vol', min: '0', max: '100', step: '1', value: '35' });
  var picoTxt = el('output'), folgaTxt = el('output'), faderTxt = el('output');

  var controles = el('div', { class: 'eq-ctl' }, [
    el('strong', { class: 'eq-ctl-titulo', text: 'Ganho do pré' }),
    el('label', { class: 'eq-linha grande', for: 'ganho-g' }, [el('span', { text: 'Ganho' }), ctlG, outG]),
    el('p', { class: 'eq-mini', text: 'Ajuste até os picos ficarem na faixa verde do medidor, entre −18 e −6 dB.' }),
    el('dl', { class: 'teclas leitura' }, [
      el('dt', { text: 'Pico' }), el('dd', null, [picoTxt]),
      el('dt', { text: 'Folga' }), el('dd', null, [folgaTxt]),
      el('dt', { text: 'Fader' }), el('dd', null, [faderTxt])
    ])
  ]);
  var audioBox = el('div', { class: 'eq-audio' }, [
    el('div', { class: 'eq-audio-row' }, [btnPlay, btnEmp]),
    chips,
    el('div', { class: 'eq-audio-row' }, [labelArq, inputArq, nomeArq]),
    fonteTxt,
    el('label', { class: 'eq-linha', for: 'ganho-vol' }, [el('span', { text: 'Volume' }), vol, el('span')]),
    el('p', { class: 'note', text: 'Comece com o volume baixo. O ruído de fundo foi exagerado de propósito, para dar para ouvir o que acontece com pouco ganho.' })
  ]);

  raiz.appendChild(el('div', { class: 'eq-editor' }, [
    medCanal.el, estado, medFader.el,
    el('div', { class: 'eq-lados' }, [controles, audioBox])
  ]));

  /* ---------- Áudio ---------- */
  var ac = null, nos = null, fonteNo = null, ruidoNo = null, buf = null;

  function rmsRelativo(b) {
    // Média do RMS das partes com som, em relação ao pico (que é 0 dBFS).
    var d = b.getChannelData(0), bloco = Math.round(b.sampleRate * 0.05), soma = 0, n = 0;
    for (var i = 0; i + bloco <= d.length; i += bloco) {
      var s = 0;
      for (var j = i; j < i + bloco; j++) s += d[j] * d[j];
      var r = Math.sqrt(s / bloco);
      if (r > 0.01) { soma += r * r; n++; }
    }
    return n ? 10 * Math.log10(soma / n) : -20;
  }

  function criar() {
    if (nos) return true;
    ac = FS.contexto();
    if (!ac) { fonteTxt.textContent = 'Este navegador não toca áudio. Use o Chrome ou o Edge.'; return false; }
    nos = {
      mic: ac.createGain(), pre: ac.createGain(), conv: ac.createWaveShaper(), soma: ac.createGain(),
      ruido: ac.createGain(), med: ac.createAnalyser(), fader: ac.createGain(), vol: ac.createGain(), prot: ac.createDynamicsCompressor()
    };
    // Conversor: acima de 0 dBFS não existe número; o som é cortado (clip).
    var curva = new Float32Array(2049);
    for (var i = 0; i < curva.length; i++) curva[i] = i / 1024 - 1;
    nos.conv.curve = curva;
    nos.med.fftSize = 2048;
    nos.ruido.gain.value = FS.lin(RUIDO);
    // Proteção dos ouvidos na saída: só age se algo passar muito do normal.
    nos.prot.threshold.value = -6; nos.prot.ratio.value = 20; nos.prot.knee.value = 0; nos.prot.attack.value = 0.001; nos.prot.release.value = 0.1;
    nos.mic.connect(nos.pre); nos.pre.connect(nos.conv); nos.conv.connect(nos.soma);
    nos.ruido.connect(nos.soma);
    nos.soma.connect(nos.med); nos.soma.connect(nos.fader);
    nos.fader.connect(nos.vol); nos.vol.connect(nos.prot); nos.prot.connect(ac.destination);
    aplicar();
    return true;
  }

  function faderNecessario() {
    var f = fonteAtual(), rel = st.rmsRel[f.id] == null ? -14 : st.rmsRel[f.id];
    return MIX_RMS - (f.mic + rel + st.ganho);
  }

  function aplicar() {
    outG.textContent = '+' + fmt(st.ganho);
    var f = faderNecessario(), fReal = Math.max(-40, Math.min(10, f));
    medFader.atualizar(fReal, null, f > 10 ? 'acima de +10' : sinal(fReal));
    faderTxt.textContent = f > 10 ? 'não alcança (precisaria de ' + sinal(f) + ')' : f < -30 ? sinal(f) + ', quase no fim do curso' : sinal(fReal);
    faderTxt.className = f > 10 || f < -30 ? 'ruim' : '';
    if (!nos) return;
    var t = ac.currentTime;
    nos.mic.gain.setTargetAtTime(FS.lin(fonteAtual().mic + st.empolgou), t, 0.05);
    nos.pre.gain.setTargetAtTime(FS.lin(st.ganho), t, 0.02);
    nos.fader.gain.setTargetAtTime(FS.lin(fReal), t, 0.25);
    var v = +vol.value / 100;
    nos.vol.gain.setTargetAtTime(v * v, t, 0.02);
  }

  function tocar() {
    if (!criar()) return;
    if (ac.state === 'suspended') ac.resume();
    pararFontes();
    buf = st.fonte === 'arquivo' ? st.arquivo : FS.buffer(st.fonte);
    if (!buf) return;
    if (st.rmsRel[st.fonte] == null) st.rmsRel[st.fonte] = rmsRelativo(buf);
    fonteNo = ac.createBufferSource(); fonteNo.buffer = buf; fonteNo.loop = true; fonteNo.connect(nos.mic); fonteNo.start();
    ruidoNo = ac.createBufferSource(); ruidoNo.buffer = FS.buffer('rosa'); ruidoNo.loop = true; ruidoNo.connect(nos.ruido); ruidoNo.start();
    st.tocando = true; st.hist = [];
    btnPlay.textContent = 'Parar';
    aplicar();
    if (!anim) { anim = true; setTimeout(loop, 16); }
  }
  function pararFontes() {
    [fonteNo, ruidoNo].forEach(function (n) { if (n) { try { n.stop(); } catch (e) {} n.disconnect(); } });
    fonteNo = ruidoNo = null;
  }
  function parar() {
    pararFontes();
    st.tocando = false;
    btnPlay.textContent = 'Tocar';
    medCanal.atualizar(-120, null, '');
    mostrarEstado(null);
  }

  /* ---------- Medição ---------- */
  var anim = false, amostra = new Float32Array(2048);
  function loop() {
    if (!st.tocando) { anim = false; return; }
    var agora = performance.now(), m = FS.nivel(nos.med, amostra);
    st.hist.push({ t: agora, p: m.pico });
    while (st.hist.length && agora - st.hist[0].t > 3000) st.hist.shift();
    var hold = st.hist.reduce(function (a, h) { return Math.max(a, h.p); }, -120);
    if (m.pico >= -0.05) st.clipAte = agora + 1500;
    clip.classList.toggle('on', agora < st.clipAte);
    medCanal.atualizar(m.rms, m.pico, 'pico ' + fmt(hold));
    picoTxt.textContent = fmt(hold);
    var folga = -hold;
    folgaTxt.textContent = hold >= -0.05 ? 'nenhuma: estourou' : fmt(folga) + ' até estourar';
    folgaTxt.className = folga < 6 ? 'ruim' : '';
    mostrarEstado(agora < st.clipAte ? 99 : hold);
    setTimeout(loop, 16);
  }

  var ultimo = '';
  function mostrarEstado(hold) {
    var tipo, titulo, txt;
    var f = faderNecessario();
    if (hold == null) { tipo = 'info'; titulo = 'Toque o som para medir'; txt = 'Escolha a fonte, aperte Tocar e ajuste o ganho olhando o medidor.'; }
    else if (hold === 99) { tipo = 'stop'; titulo = 'CLIP: estourou'; txt = 'O sinal passou de 0 dB e foi cortado. Essa distorção já entra estragada na mesa: nenhum fader, EQ ou compressor conserta. Abaixe o ganho.'; }
    else if (hold > ALVO[1]) { tipo = 'warn'; titulo = 'Quente demais'; txt = 'Está passando agora, mas sobra pouca folga. Quando o som ficar mais forte, vai estourar. Abaixe o ganho até os picos ficarem abaixo de −6.'; }
    else if (hold >= ALVO[0]) { tipo = 'ok'; titulo = 'No ponto'; txt = 'Picos na faixa certa, com folga para o som ficar mais forte. A partir daqui, o volume na mix é com o fader.'; }
    else if (hold >= -30) { tipo = 'warn'; titulo = 'Baixo'; txt = 'O canal vai pedir fader alto para aparecer na mix, e o ruído de fundo sobe junto. Suba o ganho.'; }
    else { tipo = 'stop'; titulo = 'Fraco demais'; txt = f > 10 ? 'Nem com o fader no máximo o canal aparece na mix, e o que você ouve é ruído. Suba o ganho.' : 'Quase não há sinal. Suba o ganho.'; }
    var chave = tipo + titulo;
    if (chave === ultimo) return;
    ultimo = chave;
    estado.setAttribute('data-tipo', tipo);
    estado.firstChild.textContent = titulo;
    estado.lastChild.textContent = txt;
  }

  /* ---------- Eventos ---------- */
  btnPlay.addEventListener('click', function () { if (st.tocando) parar(); else tocar(); });
  ctlG.addEventListener('input', function () { st.ganho = +ctlG.value; aplicar(); });
  vol.addEventListener('input', aplicar);
  chips.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b || b.disabled) return;
    st.fonte = b.getAttribute('data-f');
    chips.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    fonteTxt.textContent = fonteAtual().txt;
    aplicar();
    if (st.tocando) tocar();
  });
  btnEmp.addEventListener('click', function () {
    st.empolgou = 8; aplicar();
    btnEmp.disabled = true;
    setTimeout(function () { st.empolgou = 0; aplicar(); btnEmp.disabled = false; }, 4000);
  });
  inputArq.addEventListener('change', function () {
    var arq = inputArq.files && inputArq.files[0];
    if (!arq) return;
    nomeArq.textContent = 'Carregando...';
    FS.carregar(arq).then(function (b) {
      st.arquivo = b; st.rmsRel.arquivo = rmsRelativo(b);
      nomeArq.textContent = arq.name;
      var bt = chips.querySelector('[data-f="arquivo"]');
      bt.removeAttribute('disabled'); bt.click();
      if (!st.tocando) tocar();
    }).catch(function () { nomeArq.textContent = 'Não consegui abrir esse arquivo. Tente um MP3 ou WAV.'; });
  });
  window.addEventListener('hashchange', function () { if (location.hash !== '#ganho' && st.tocando) parar(); });

  fonteTxt.textContent = fonteAtual().txt;
  aplicar();
  mostrarEstado(null);
  medCanal.atualizar(-120, null, '');
})();
