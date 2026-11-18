/* Fontes de áudio dos laboratórios de ganho e de compressor/gate.
   Os sons são sintetizados aqui mesmo (nada vem da internet) e normalizados com pico em 0 dBFS.
   São imitações simples, feitas para mostrar nível e dinâmica, não timbre. */
(function () {
  'use strict';

  var ac = null, cache = {};

  function contexto() {
    if (ac) return ac;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ac = new AC({ sampleRate: 48000 }); } catch (e) { ac = new AC(); }
    return ac;
  }

  // Sorteio repetível: o mesmo som toda vez que abrir.
  function sorteio(semente) {
    var s = semente >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function entre(r, a, b) { return a + (b - a) * r(); }

  function normalizar(d) {
    var pico = 0;
    for (var i = 0; i < d.length; i++) { var v = Math.abs(d[i]); if (v > pico) pico = v; }
    if (!pico) return;
    var k = 1 / pico, fade = 480;
    for (var j = 0; j < d.length; j++) {
      d[j] *= k;
      if (j < fade) d[j] *= j / fade;
      if (j > d.length - fade) d[j] *= (d.length - j) / fade;
    }
  }

  /* ---------- Voz (fala e canto) ----------
     Um pulso glotal passando por três ressonâncias (formantes) que mudam a cada sílaba. */
  var VOGAIS = [[800, 1200, 2500], [500, 1800, 2500], [320, 2300, 3000], [500, 900, 2400], [340, 800, 2300]];

  function silabasFala(r, dur) {
    var t = 0.25, lista = [];
    while (t < dur - 0.6) {
      var n = Math.round(entre(r, 6, 12)), forca = entre(r, 0.55, 1);
      for (var i = 0; i < n && t < dur - 0.4; i++) {
        var d = entre(r, 0.11, 0.22), tonica = r() < 0.25;
        var f0 = 135 - 30 * (i / n) + (tonica ? 15 : 0);
        lista.push({ t: t, d: d, f0a: f0, f0b: f0 - 6, v: Math.floor(r() * 5), a: forca * (tonica ? 1 : entre(r, 0.55, 0.85)), c: r() < 0.55 });
        t += d + entre(r, 0.01, 0.035);
      }
      t += entre(r, 0.35, 0.7);
    }
    return lista;
  }

  function silabasCanto(r, dur) {
    // Primeira metade: verso, com voz contida. Segunda metade: refrão, uns 9 dB mais forte e mais agudo.
    var verso = [220, 247, 262, 247, 220, 196, 220, 247], refrao = [330, 349, 392, 349, 330, 294, 330, 392];
    var t = 0.25, lista = [], k = 0;
    while (t < dur - 0.8) {
      var noRefrao = t > dur / 2, notas = noRefrao ? refrao : verso;
      var d = entre(r, 0.38, 0.85), f = notas[k++ % notas.length];
      lista.push({ t: t, d: d, f0a: f, f0b: f, v: Math.floor(r() * 5), a: (noRefrao ? 0.95 : 0.33) * entre(r, 0.85, 1), c: r() < 0.3, canto: true });
      t += d + 0.05;
      if (k % 4 === 0) t += 0.35;
    }
    return lista;
  }

  function voz(fs, dur, cantar) {
    var r = sorteio(cantar ? 77 : 41);
    var n = Math.round(fs * dur), d = new Float32Array(n);
    var sil = cantar ? silabasCanto(r, dur) : silabasFala(r, dur);
    var fase = 0, glote = 0, ruidoAnt = 0;
    var F = [500, 1500, 2500], alvoF = [500, 1500, 2500];
    var y1 = [0, 0, 0], y2 = [0, 0, 0], BW = [90, 110, 160], PESO = [1, 0.55, 0.3];
    var suav = 1 - Math.exp(-1 / (0.015 * fs));
    var s = 0;
    for (var i = 0; i < n; i++) {
      var t = i / fs;
      while (s < sil.length - 1 && t > sil[s].t + sil[s].d + 0.15) s++;
      var cur = sil[s], env = 0, f0 = 120, ruido = 0;
      if (cur && t >= cur.t - 0.04 && t <= cur.t + cur.d + 0.15) {
        var x = t - cur.t, ataque = cur.canto ? 0.06 : 0.025, solta = cur.canto ? 0.12 : 0.05;
        if (x < 0) env = 0;
        else if (x < ataque) env = x / ataque;
        else if (x < cur.d) env = 1;
        else env = Math.max(0, 1 - (x - cur.d) / solta);
        env *= cur.a;
        var p = Math.min(1, Math.max(0, x / cur.d));
        f0 = cur.f0a + (cur.f0b - cur.f0a) * p;
        if (cur.canto && x > 0.25) f0 *= 1 + 0.012 * Math.sin(2 * Math.PI * 5.5 * x);
        alvoF = VOGAIS[cur.v];
        if (cur.c && x > -0.04 && x < 0) { var w = r() * 2 - 1; ruido = (w - ruidoAnt) * 0.35 * cur.a; ruidoAnt = w; }
      }
      fase += f0 / fs; if (fase >= 1) fase -= 1;
      glote += 0.35 * ((2 * fase - 1) - glote);
      var ex = glote * env + ruido + (r() * 2 - 1) * 0.004 * env;
      var soma = 0;
      for (var k = 0; k < 3; k++) {
        F[k] += suav * (alvoF[k] - F[k]);
        var rr = Math.exp(-Math.PI * BW[k] / fs), a1 = 2 * rr * Math.cos(2 * Math.PI * F[k] / fs), a2 = -rr * rr;
        var y = (1 - rr) * ex + a1 * y1[k] + a2 * y2[k];
        y2[k] = y1[k]; y1[k] = y;
        soma += y * PESO[k];
      }
      d[i] = soma;
    }
    normalizar(d);
    return d;
  }

  /* ---------- Bumbo ---------- */
  function bumbo(fs, dur) {
    var r = sorteio(12), n = Math.round(fs * dur), d = new Float32Array(n);
    var bpm = 90, batida = 60 / bpm, padrao = [0, 1, 1.5, 2, 3, 3.5];
    for (var c = 0; c * 4 * batida < dur; c++) {
      padrao.forEach(function (b) {
        var t0 = (c * 4 + b) * batida + 0.1;
        if (t0 > dur - 0.5) return;
        var vel = (b % 2 === 0 ? 1 : 0.7) * entre(r, 0.85, 1);
        var i0 = Math.round(t0 * fs), fase = 0;
        for (var i = 0; i < fs * 0.5 && i0 + i < n; i++) {
          var t = i / fs, f = 48 + 110 * Math.exp(-t / 0.03);
          fase += f / fs;
          var corpo = Math.sin(2 * Math.PI * fase) * Math.exp(-t / 0.28);
          var clique = (r() * 2 - 1) * Math.exp(-t / 0.004) * 0.45;
          d[i0 + i] += vel * (corpo + clique);
        }
      });
    }
    normalizar(d);
    return d;
  }

  /* ---------- Tom com vazamento da bateria (para o gate) ---------- */
  function tom(fs, dur) {
    var r = sorteio(33), n = Math.round(fs * dur), d = new Float32Array(n);
    var batida = 60 / 90, hp = 0, ant = 0;
    // Vazamento: chimbal em colcheias, caixa no 2 e no 4, bumbo no 1 e no 3. Bem mais baixo que o tom.
    for (var b = 0; b * batida < dur; b += 0.5) {
      var t0 = b * batida + 0.1, i0 = Math.round(t0 * fs);
      var caixa = (b % 2 === 1), bumbo = (b % 2 === 0);
      for (var i = 0; i < fs * 0.25 && i0 + i < n; i++) {
        var t = i / fs, w = r() * 2 - 1;
        hp = w - ant; ant = w;
        var v = hp * Math.exp(-t / 0.025) * 0.05;
        if (caixa) v += w * Math.exp(-t / 0.09) * 0.09;
        if (bumbo) v += Math.sin(2 * Math.PI * 60 * t) * Math.exp(-t / 0.12) * 0.07;
        d[i0 + i] += v;
      }
    }
    // Viradas no tom: algumas batidas fortes no fim de cada dois compassos.
    var viradas = [];
    for (var c = 0; c * 4 * batida < dur; c += 2) [6, 6.5, 7, 7.25, 7.5].forEach(function (x) { viradas.push((c * 4 + x) * batida + 0.1); });
    viradas.forEach(function (t0) {
      if (t0 > dur - 0.6) return;
      var i0 = Math.round(t0 * fs), fase = 0, vel = entre(r, 0.8, 1);
      for (var i = 0; i < fs * 0.6 && i0 + i < n; i++) {
        var t = i / fs, f = 112 + 40 * Math.exp(-t / 0.05);
        fase += f / fs;
        d[i0 + i] += vel * (Math.sin(2 * Math.PI * fase) * Math.exp(-t / 0.32) + (r() * 2 - 1) * Math.exp(-t / 0.012) * 0.3);
      }
    });
    normalizar(d);
    return d;
  }

  /* Ruído rosa (filtro de Paul Kellet), para o ruído de fundo. */
  function rosa(fs, dur) {
    var n = Math.round(fs * dur), d = new Float32Array(n), b0 = 0, b1 = 0, b2 = 0;
    for (var i = 0; i < n; i++) {
      var w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = b0 + b1 + b2 + w * 0.1848;
    }
    normalizar(d);
    return d;
  }

  var GERADORES = {
    fala: function (fs) { return voz(fs, 10, false); },
    canto: function (fs) { return voz(fs, 14, true); },
    bumbo: function (fs) { return bumbo(fs, 8.2); },
    tom: function (fs) { return tom(fs, 10.8); },
    rosa: function (fs) { return rosa(fs, 6); }
  };

  function buffer(tipo) {
    var c = contexto();
    if (!c || !GERADORES[tipo]) return null;
    if (!cache[tipo]) {
      var dados = GERADORES[tipo](c.sampleRate);
      var b = c.createBuffer(1, dados.length, c.sampleRate);
      b.getChannelData(0).set(dados);
      cache[tipo] = b;
    }
    return cache[tipo];
  }

  // Abre um arquivo de áudio do computador e deixa o pico em 0 dBFS.
  function carregar(arquivo) {
    var c = contexto();
    if (!c) return Promise.reject(new Error('sem áudio'));
    return arquivo.arrayBuffer().then(function (ab) { return c.decodeAudioData(ab); }).then(function (b) {
      var pico = 0;
      for (var ch = 0; ch < b.numberOfChannels; ch++) {
        var d = b.getChannelData(ch);
        for (var i = 0; i < d.length; i++) { var v = Math.abs(d[i]); if (v > pico) pico = v; }
      }
      if (pico > 0) for (var k = 0; k < b.numberOfChannels; k++) {
        var dd = b.getChannelData(k);
        for (var j = 0; j < dd.length; j++) dd[j] /= pico;
      }
      return b;
    });
  }

  // Medidas de nível em dBFS a partir de um AnalyserNode.
  function nivel(analisador, buf) {
    analisador.getFloatTimeDomainData(buf);
    var pico = 0, soma = 0;
    for (var i = 0; i < buf.length; i++) { var v = buf[i]; soma += v * v; if (Math.abs(v) > pico) pico = Math.abs(v); }
    return { pico: db(pico), rms: db(Math.sqrt(soma / buf.length)) };
  }
  function db(v) { return v > 0.000001 ? 20 * Math.log10(v) : -120; }
  function lin(d) { return Math.pow(10, d / 20); }

  /* Medidor horizontal, como o de um canal: barra de RMS, marca de pico, faixa-alvo e escala em dB.
     opcoes: { min, max, alvo: [de, ate], marcas: [dB...], rotulo, inverso } */
  function medidor(op) {
    var min = op.min, max = op.max;
    function pct(v) { return Math.max(0, Math.min(100, (v - min) / (max - min) * 100)); }
    var raiz = document.createElement('div');
    raiz.className = 'med-bloco';
    var topo = document.createElement('div'); topo.className = 'med-topo';
    var nome = document.createElement('span'); nome.textContent = op.rotulo || '';
    var valor = document.createElement('output'); valor.className = 'med-valor';
    topo.appendChild(nome); topo.appendChild(valor);
    var barra = document.createElement('div'); barra.className = 'med' + (op.inverso ? ' inverso' : '');
    var alvo = null;
    if (op.alvo) {
      alvo = document.createElement('div'); alvo.className = 'med-alvo';
      alvo.style.left = pct(op.alvo[0]) + '%'; alvo.style.width = (pct(op.alvo[1]) - pct(op.alvo[0])) + '%';
      barra.appendChild(alvo);
    }
    var cheio = document.createElement('div'); cheio.className = 'med-cheio';
    var pico = document.createElement('div'); pico.className = 'med-pico';
    var marca = document.createElement('div'); marca.className = 'med-marca'; marca.hidden = true;
    barra.appendChild(cheio); barra.appendChild(pico); barra.appendChild(marca);
    var escala = document.createElement('div'); escala.className = 'med-escala';
    (op.marcas || []).forEach(function (m) {
      var s = document.createElement('span'); s.style.left = pct(m) + '%';
      s.textContent = String(m).replace('-', '−');
      escala.appendChild(s);
    });
    raiz.appendChild(topo); raiz.appendChild(barra); raiz.appendChild(escala);
    return {
      el: raiz,
      // v: valor da barra; p: marca de pico (ou null); txt: texto à direita
      atualizar: function (v, p, txt) {
        var x = pct(v);
        cheio.style.clipPath = op.inverso ? 'inset(0 0 0 ' + x + '%)' : 'inset(0 ' + (100 - x) + '% 0 0)';
        if (p == null) pico.hidden = true; else { pico.hidden = false; pico.style.left = pct(p) + '%'; }
        valor.textContent = txt == null ? '' : txt;
      },
      marca: function (v) { if (v == null) { marca.hidden = true; return; } marca.hidden = false; marca.style.left = pct(v) + '%'; },
      alvo: function (de, ate) { if (!alvo) return; alvo.style.left = pct(de) + '%'; alvo.style.width = (pct(ate) - pct(de)) + '%'; }
    };
  }

  function fmtDb(v, casas) {
    if (v <= -119) return '−∞';
    var s = v.toFixed(casas == null ? 1 : casas).replace('.', ',');
    return s.replace('-', '−') + ' dB';
  }

  window.FontesSom = { contexto: contexto, buffer: buffer, carregar: carregar, nivel: nivel, db: db, lin: lin, medidor: medidor, fmtDb: fmtDb };
})();
