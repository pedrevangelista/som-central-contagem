/* Transmissão e LUFS: régua de referências e medidor de loudness para uma gravação.
   A medição segue a norma ITU-R BS.1770 (filtro K, blocos de 400 ms, gates de −70 LUFS e −10 LU).
   O pico mostrado é o pico de amostra, que pode ficar um pouco abaixo do pico verdadeiro (true peak). */
(function () {
  'use strict';
  var regua = document.getElementById('lufs-regua');
  var raiz = document.getElementById('lufs-app');
  if (!regua || !raiz) return;

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (k) { if (k) e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k); });
    return e;
  }
  function num(v, casas) { return v.toFixed(casas == null ? 1 : casas).replace('.', ',').replace('-', '−'); }

  /* ---------- Régua ---------- */
  var RMIN = -30, RMAX = -6;
  function pct(v) { return (v - RMIN) / (RMAX - RMIN) * 100; }
  var REFS = [
    { v: -23, t: 'TV (norma europeia)', lado: 'baixo' },
    { v: -16, t: 'Podcasts', lado: 'cima' },
    { v: -14, t: 'YouTube e Spotify', lado: 'baixo', alvo: true },
    { v: -9, t: 'Música muito comprimida', lado: 'cima' }
  ];
  var barra = el('div', { class: 'regua-barra' }, [el('div', { class: 'regua-alvo', style: 'left:' + pct(-15) + '%;width:' + (pct(-13) - pct(-15)) + '%' })]);
  REFS.forEach(function (r) {
    barra.appendChild(el('div', { class: 'regua-ref ' + r.lado + (r.alvo ? ' alvo' : ''), style: 'left:' + pct(r.v) + '%' }, [
      el('b', { text: num(r.v, 0) }), el('span', { text: r.t })
    ]));
  });
  var escala = el('div', { class: 'med-escala' });
  for (var v = RMIN; v <= RMAX; v += 6) escala.appendChild(el('span', { style: 'left:' + pct(v) + '%', text: num(v, 0) }));
  regua.appendChild(el('div', { class: 'regua' }, [
    el('div', { class: 'regua-lados' }, [el('span', { text: 'mais baixo' }), el('span', { text: 'mais alto' })]),
    barra, escala
  ]));

  /* ---------- Medidor de gravação ---------- */
  var input = el('input', { type: 'file', id: 'lufs-arquivo', accept: 'audio/*', class: 'eq-file' });
  var label = el('label', { class: 'btn primario', for: 'lufs-arquivo', text: 'Escolher gravação' });
  var msg = el('p', { class: 'eq-mini', 'aria-live': 'polite', text: 'Use um trecho de até uns 20 minutos, em MP3 ou WAV. O arquivo é lido só neste aparelho.' });
  var res = el('dl', { class: 'lufs-res' });
  var veredito = el('div', { class: 'ganho-estado', hidden: '' }, [el('strong'), el('p')]);
  var canvas = el('canvas', { class: 'lufs-canvas', role: 'img', 'aria-label': 'Volume de curto prazo ao longo da gravação, com a linha de −14 LUFS.' });
  canvas.hidden = true;
  raiz.appendChild(el('div', { class: 'eq-editor' }, [
    el('div', { class: 'eq-audio-row' }, [label, input]),
    msg, res, veredito, canvas
  ]));

  function coefK(fs) {
    // Filtro K da BS.1770: realce de agudos (estágio 1) e corte de graves (estágio 2).
    var G = 3.999843853973347, f0 = 1681.974450955533, Q = 0.7071752369554196;
    var K = Math.tan(Math.PI * f0 / fs), Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
    var a0 = 1 + K / Q + K * K;
    var s1 = { b0: (Vh + Vb * K / Q + K * K) / a0, b1: 2 * (K * K - Vh) / a0, b2: (Vh - Vb * K / Q + K * K) / a0, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q + K * K) / a0 };
    var f1 = 38.13547087602444, Q1 = 0.5003270373238773, K1 = Math.tan(Math.PI * f1 / fs), d = 1 + K1 / Q1 + K1 * K1;
    var s2 = { b0: 1, b1: -2, b2: 1, a1: 2 * (K1 * K1 - 1) / d, a2: (1 - K1 / Q1 + K1 * K1) / d };
    return [s1, s2];
  }

  function medir(buf) {
    var fs = buf.sampleRate, passo = Math.round(fs * 0.1), nSub = Math.floor(buf.length / passo);
    var sub = new Float64Array(nSub), pico = 0, k = coefK(fs);
    for (var ch = 0; ch < Math.min(2, buf.numberOfChannels); ch++) {
      var d = buf.getChannelData(ch);
      var x1 = 0, x2 = 0, y1 = 0, y2 = 0, u1 = 0, u2 = 0, z1 = 0, z2 = 0;
      for (var i = 0; i < nSub * passo; i++) {
        var x = d[i], ax = x < 0 ? -x : x;
        if (ax > pico) pico = ax;
        var y = k[0].b0 * x + k[0].b1 * x1 + k[0].b2 * x2 - k[0].a1 * y1 - k[0].a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        var z = y - 2 * u1 + u2 - k[1].a1 * z1 - k[1].a2 * z2;
        u2 = u1; u1 = y; z2 = z1; z1 = z;
        sub[(i / passo) | 0] += z * z;
      }
    }
    function lufs(ms) { return ms > 0 ? -0.691 + 10 * Math.log10(ms) : -120; }
    // Blocos de 400 ms com passo de 100 ms
    var blocos = [];
    for (var b = 0; b + 4 <= nSub; b++) blocos.push((sub[b] + sub[b + 1] + sub[b + 2] + sub[b + 3]) / (4 * passo));
    var abs = blocos.filter(function (m) { return lufs(m) > -70; });
    var integrado = -120;
    if (abs.length) {
      var rel = lufs(abs.reduce(function (a, m) { return a + m; }, 0) / abs.length) - 10;
      var ok = abs.filter(function (m) { return lufs(m) > rel; });
      if (ok.length) integrado = lufs(ok.reduce(function (a, m) { return a + m; }, 0) / ok.length);
    }
    // Curto prazo: janelas de 3 s, uma a cada 0,5 s
    var curto = [], maxCurto = -120;
    for (var c = 0; c + 30 <= nSub; c += 5) {
      var s = 0;
      for (var j = c; j < c + 30; j++) s += sub[j];
      var l = lufs(s / (30 * passo));
      curto.push({ t: (c + 30) * 0.1, l: l });
      if (l > maxCurto) maxCurto = l;
    }
    return { integrado: integrado, maxCurto: maxCurto, pico: pico > 0 ? 20 * Math.log10(pico) : -120, curto: curto, dur: buf.duration };
  }

  function tempo(s) { var m = Math.floor(s / 60), r = Math.round(s % 60); return m + ':' + (r < 10 ? '0' : '') + r; }

  function mostrar(r, nome) {
    res.textContent = '';
    [['Integrado', r.integrado > -100 ? num(r.integrado) + ' LUFS' : 'sem som'],
     ['Curto prazo máximo', r.maxCurto > -100 ? num(r.maxCurto) + ' LUFS' : '—'],
     ['Pico de amostra', num(r.pico) + ' dBFS'],
     ['Duração', tempo(r.dur)]].forEach(function (p) { res.appendChild(el('div', null, [el('dt', { text: p[0] }), el('dd', { text: p[1] })])); });
    var I = r.integrado, tipo, titulo, txt;
    if (I < -100) { tipo = 'stop'; titulo = 'Não há som suficiente para medir'; txt = 'O arquivo parece estar em silêncio.'; }
    else if (I < -15.5) { tipo = 'warn'; titulo = 'Abaixo do YouTube (' + num(I + 14) + ' LU)'; txt = 'O YouTube não sobe o volume de quem está baixo. A live vai soar mais baixa que os outros vídeos, e quem assiste aumenta o volume do celular e reclama.'; }
    else if (I > -12.5) { tipo = 'warn'; titulo = 'Acima do YouTube (+' + num(I + 14).replace('−', '') + ' LU)'; txt = 'O YouTube vai abaixar uns ' + num(I + 14).replace('−', '') + ' dB. O volume final fica igual ao dos outros, mas o som perde dinâmica à toa e pode distorcer.'; }
    else { tipo = 'ok'; titulo = 'Na medida do YouTube'; txt = 'Perto de −14 LUFS. É o volume que os vídeos do YouTube costumam ter.'; }
    if (r.pico > -1) txt += ' O pico passou de −1 dB: na conversão do YouTube isso pode virar distorção. Quem resolve é o limiter do Mastering, não o operador durante o culto.';
    veredito.hidden = false;
    veredito.setAttribute('data-tipo', tipo);
    veredito.firstChild.textContent = titulo;
    veredito.lastChild.textContent = txt;
    msg.textContent = nome;
    canvas.hidden = false;
    grafico(r);
  }

  function cor(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888'; }
  var ultimo = null;
  function grafico(r) {
    ultimo = r;
    var re = canvas.getBoundingClientRect();
    if (!re.width) return;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(re.width * dpr); canvas.height = Math.round(re.height * dpr);
    var c = canvas.getContext('2d'), w = re.width, h = re.height, L = 40, R = 10, T = 10, B = 22;
    var MIN = -40, MAX = -4, dur = Math.max(r.dur, 1);
    function X(t) { return L + t / dur * (w - L - R); }
    function Y(v) { return T + (MAX - Math.max(MIN, Math.min(MAX, v))) / (MAX - MIN) * (h - T - B); }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = cor('--eq-bg'); c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(61,220,132,.10)'; c.fillRect(L, Y(-13), w - L - R, Y(-15) - Y(-13));
    c.font = '11px ' + cor('--mono'); c.textBaseline = 'middle'; c.textAlign = 'right';
    for (var g = -40; g <= -4; g += 6) {
      c.strokeStyle = 'rgba(255,255,255,.07)'; c.beginPath(); c.moveTo(L, Y(g)); c.lineTo(w - R, Y(g)); c.stroke();
      c.fillStyle = cor('--muted'); c.fillText(String(g).replace('-', '−'), L - 6, Y(g));
    }
    c.strokeStyle = cor('--ok'); c.setLineDash([5, 4]); c.beginPath(); c.moveTo(L, Y(-14)); c.lineTo(w - R, Y(-14)); c.stroke(); c.setLineDash([]);
    c.textAlign = 'center';
    var passoT = dur > 900 ? 300 : dur > 300 ? 60 : dur > 60 ? 15 : 5;
    for (var t = 0; t <= dur; t += passoT) {
      c.fillStyle = cor('--muted');
      c.textAlign = X(t) > w - R - 20 ? 'right' : 'center';
      c.fillText(tempo(t), Math.min(X(t), w - R), h - B / 2 + 2);
    }
    c.strokeStyle = cor('--accent'); c.lineWidth = 2; c.beginPath();
    var comecou = false;
    r.curto.forEach(function (p) {
      if (p.l < -60) { comecou = false; return; }
      if (!comecou) { c.moveTo(X(p.t), Y(p.l)); comecou = true; } else c.lineTo(X(p.t), Y(p.l));
    });
    c.stroke();
    if (r.integrado > -100) {
      c.strokeStyle = 'rgba(255,255,255,.5)'; c.setLineDash([2, 3]);
      c.beginPath(); c.moveTo(L, Y(r.integrado)); c.lineTo(w - R, Y(r.integrado)); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#fff'; c.textAlign = 'left'; c.fillText('integrado ' + num(r.integrado), L + 6, Y(r.integrado) - 9);
    }
    c.fillStyle = cor('--ok'); c.textAlign = 'right'; c.fillText('−14', w - R - 2, Y(-14) - 9);
  }
  window.addEventListener('resize', function () { if (ultimo && !canvas.hidden) grafico(ultimo); });
  window.addEventListener('hashchange', function () { if (location.hash === '#transmissao' && ultimo) setTimeout(function () { grafico(ultimo); }, 0); });

  input.addEventListener('change', function () {
    var arq = input.files && input.files[0];
    if (!arq) return;
    if (arq.size > 80 * 1024 * 1024) { msg.textContent = 'Esse arquivo é grande demais para abrir no navegador (' + Math.round(arq.size / 1048576) + ' MB). Corte um trecho de uns 20 minutos e tente de novo.'; return; }
    var ac = window.FontesSom && window.FontesSom.contexto();
    if (!ac) { msg.textContent = 'Este navegador não consegue abrir áudio. Use o Chrome ou o Edge.'; return; }
    msg.textContent = 'Lendo ' + arq.name + '...';
    res.textContent = ''; veredito.hidden = true; canvas.hidden = true;
    arq.arrayBuffer().then(function (ab) { return ac.decodeAudioData(ab); }).then(function (buf) {
      msg.textContent = 'Medindo...';
      setTimeout(function () { mostrar(medir(buf), arq.name); }, 30);
    }).catch(function () { msg.textContent = 'Não consegui abrir esse arquivo. Tente um MP3 ou WAV.'; });
  });
})();
