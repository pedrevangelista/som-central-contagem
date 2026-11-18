// Aba "EQ": laboratório de equalização.
// A curva é calculada com as mesmas fórmulas de filtro que o navegador usa no áudio
// (Web Audio, baseadas no Audio EQ Cookbook), então o desenho e o som batem.
(function () {
  'use strict';

  var raiz = document.getElementById('eq-app');
  if (!raiz) return;

  var FS = 48000, FMIN = 20, FMAX = 20000, GMAX = 18, GLIM = 15;
  var LOGMIN = Math.log10(FMIN), LOGSPAN = Math.log10(FMAX) - LOGMIN;

  /* ---------- Dados ---------- */
  var BANDAS = [
    { id: 'lc', rot: 'LC', nome: 'Corte de graves', tipo: 'highpass', f: 80, g: 0, q: 0.7071, on: false },
    { id: 'low', rot: 'L', nome: 'LOW (prateleira de graves)', tipo: 'lowshelf', f: 100, g: 0, q: 0.7071, on: true },
    { id: 'p1', rot: '1', nome: 'PEQ 1', tipo: 'peaking', f: 250, g: 0, q: 1.4, on: true },
    { id: 'p2', rot: '2', nome: 'PEQ 2', tipo: 'peaking', f: 800, g: 0, q: 1.4, on: true },
    { id: 'p3', rot: '3', nome: 'PEQ 3', tipo: 'peaking', f: 2500, g: 0, q: 1.4, on: true },
    { id: 'p4', rot: '4', nome: 'PEQ 4', tipo: 'peaking', f: 6000, g: 0, q: 1.4, on: true },
    { id: 'high', rot: 'H', nome: 'HIGH (prateleira de agudos)', tipo: 'highshelf', f: 10000, g: 0, q: 0.7071, on: true }
  ];
  var PADRAO = BANDAS.map(function (b) { return { f: b.f, g: b.g, q: b.q, on: b.on }; });
  var porId = {};
  BANDAS.forEach(function (b) { porId[b.id] = b; });

  var REGIOES = [
    { lo: 20, hi: 80, nome: 'Subgrave', txt: 'Peso do bumbo e do baixo. Em voz e violão é só ruído.' },
    { lo: 80, hi: 250, nome: 'Grave', txt: 'Corpo. Em excesso, o som fica embolado e sem definição.' },
    { lo: 250, hi: 500, nome: 'Médio-grave', txt: 'Som de caixa de papelão. É onde a mixagem costuma embolar.' },
    { lo: 500, hi: 2000, nome: 'Médio', txt: 'Presença dos instrumentos. Em excesso, soa anasalado, como telefone.' },
    { lo: 2000, hi: 5000, nome: 'Médio-agudo', txt: 'Clareza da voz. Em excesso, cansa e machuca o ouvido.' },
    { lo: 5000, hi: 10000, nome: 'Agudo', txt: 'Brilho e definição. Também é onde mora o "s" chiado.' },
    { lo: 10000, hi: 20001, nome: 'Ar', txt: 'Sensação de abertura. Pouca coisa resolve.' }
  ];

  var PRESETS = [
    { id: 'fala', nome: 'Fala (pastores)', canais: 'Canais 19 e 20',
      b: { lc: [100], p1: [250, -3, 1.4], p3: [3000, 2, 1], high: [10000, 1] },
      porque: [['lc', 'Tira ronco, batida no microfone e o grave do palco que vaza.'],
        ['p1', 'Tira o abafado que aparece quando a pessoa fala muito perto do microfone.'],
        ['p3', 'Realça as consoantes: a fala fica mais fácil de entender.'],
        ['high', 'Um pouco de ar. Se começar a chiar ou apitar, tire.']],
      nota: 'Na fala, entender vale mais que soar bonito. Fala também dispensa reverb e delay.' },
    { id: 'canto', nome: 'Voz cantada', canais: 'Canais 21 a 24',
      b: { lc: [110], p1: [300, -2, 1.4], p3: [3500, 2, 1], p4: [7000, -2, 4], high: [12000, 2] },
      porque: [['lc', 'Mesma ideia da fala. Voz masculina grave pode pedir o corte um pouco mais baixo.'],
        ['p1', 'Limpa o médio-grave onde a voz briga com violão e teclado.'],
        ['p3', 'Presença: a voz vem para a frente da banda.'],
        ['p4', 'Corte estreito no "s" chiado. Cada cantor tem o seu ponto: ache varrendo.'],
        ['high', 'Ar e brilho. Com cuidado, por causa da microfonia.']] },
    { id: 'bumbo', nome: 'Bumbo', canais: 'Canal 1',
      b: { lc: [35], p1: [60, 3, 1.4], p2: [350, -5, 1.5], p3: [3500, 3, 1.4] },
      porque: [['lc', 'Tira o subgrave que só gasta energia das caixas.'],
        ['p1', 'Peso: o "tum" que se sente no peito.'],
        ['p2', 'Tira o som de caixa de papelão. É o corte mais importante do bumbo.'],
        ['p3', 'Ataque: o clique da batida. Ajuda o bumbo a aparecer em caixa pequena e na transmissão.']] },
    { id: 'snare', nome: 'Caixa (snare top)', canais: 'Canal 3',
      b: { lc: [90], p1: [200, 2, 1.4], p2: [900, -2, 2], p3: [4500, 3, 1], high: [10000, 1] },
      porque: [['lc', 'Tira o bumbo que vaza no microfone da caixa.'],
        ['p1', 'Corpo da batida.'],
        ['p2', 'Som de lata, a ressonância que fica tocando. Ache o ponto exato varrendo.'],
        ['p3', 'Estalo da batida.'],
        ['high', 'Esteira e brilho.']] },
    { id: 'snareb', nome: 'Caixa de baixo (snare bottom)', canais: 'Canal 4',
      b: { lc: [200], p2: [500, -3, 1.4], p4: [6000, 2, 1] },
      porque: [['lc', 'Este microfone serve só para a esteira. O grave vem do microfone de cima.'],
        ['p2', 'Tira o corpo que já vem do microfone de cima.'],
        ['p4', 'O chiado da esteira, que é o motivo de ele existir.']],
      nota: 'Este microfone fica virado ao contrário do de cima, então normalmente a polaridade dele vai invertida (INVERT, na etapa INPUT). Sem isso, a caixa perde corpo quando os dois somam.' },
    { id: 'tons', nome: 'Tom e surdo', canais: 'Canais 5 e 6',
      b: { lc: [60], p1: [110, 2, 1.4], p2: [400, -4, 1.5], p3: [4000, 2, 1.4] },
      porque: [['lc', 'No surdo, desça para uns 45 Hz.'],
        ['p1', 'Corpo. No surdo, perto de 80 Hz.'],
        ['p2', 'Tira o som de papelão, como no bumbo.'],
        ['p3', 'Ataque da baqueta.']] },
    { id: 'hihat', nome: 'Hi-hat', canais: 'Canal 7',
      b: { lc: [300], p2: [1000, -2, 1.4], high: [10000, 1] },
      porque: [['lc', 'Hi-hat não tem grave útil. O que tem é caixa e bumbo vazando.'],
        ['p2', 'Tira o som de lata grossa.'],
        ['high', 'Brilho. O hi-hat costuma já vir alto: muitas vezes o certo é baixar o fader.']] },
    { id: 'overs', nome: 'Overs', canais: 'Canais 8 e 9',
      b: { lc: [150], p2: [400, -2, 1.4], high: [10000, 2] },
      porque: [['lc', 'Os overs são para pratos e para o conjunto. Bumbo e tons já têm microfones próprios.'],
        ['p2', 'Limpa o embolado da sala.'],
        ['high', 'Brilho dos pratos. Prato estridente: corte entre 3 e 5 kHz em vez de reforçar aqui.']] },
    { id: 'baixo', nome: 'Baixo', canais: 'Canal 10',
      b: { lc: [35], p1: [80, 2, 1.2], p2: [250, -3, 1.4], p3: [800, 2, 1.4] },
      porque: [['lc', 'Tira o subgrave que embola e não é nota.'],
        ['p1', 'Peso. Para não brigar com o bumbo, deixe um em 60 Hz e o outro entre 80 e 100 Hz.'],
        ['p2', 'Tira o embolado.'],
        ['p3', 'Definição: as notas aparecem em caixa pequena, celular e fone.']] },
    { id: 'cello', nome: 'Cello', canais: 'Canal 11',
      b: { lc: [60], p1: [250, -2, 1.4], p3: [2500, -2, 2], high: [10000, 1] },
      porque: [['lc', 'Abaixo da nota mais grave do cello só tem ruído e batida.'],
        ['p1', 'Tira o embolado.'],
        ['p3', 'Suaviza o som áspero do arco.'],
        ['high', 'Ar.']] },
    { id: 'violao', nome: 'Violão', canais: 'Canal 12',
      b: { lc: [100], p1: [200, -3, 1.2], p3: [3000, 1, 1], high: [10000, 2] },
      porque: [['lc', 'Tira o grave do corpo e o ronco do captador.'],
        ['p1', 'Tira o grave que faz o violão estourar e embolar com o baixo.'],
        ['p3', 'Ataque das cordas.'],
        ['high', 'Brilho das cordas.']],
      nota: 'Violão com captador é campeão de microfonia no grave, entre 100 e 250 Hz. Se começar a roncar, é ali.' },
    { id: 'guitarra', nome: 'Guitarra', canais: 'Canais 13 e 14',
      b: { lc: [90], p1: [300, -2, 1.4], p3: [2500, 1, 1.2], high: [7000, -2] },
      porque: [['lc', 'O baixo cuida do grave.'],
        ['p1', 'Limpa o embolado.'],
        ['p3', 'Presença.'],
        ['high', 'Tira o chiado do amplificador ou do pedal.']] },
    { id: 'teclado', nome: 'Teclado', canais: 'Canais 15 e 16',
      b: { lc: [40], p2: [300, -2, 1.4] },
      porque: [['lc', 'Só o subgrave. Piano tem nota grave de verdade.'],
        ['p2', 'Limpa o embolado quando o teclado toca junto com violão e guitarra.']],
      nota: 'Timbre de teclado já vem pronto. Mexa pouco e converse com o tecladista: às vezes o certo é trocar o timbre no instrumento.' },
    { id: 'vs', nome: 'VS (playback)', canais: 'Canal 17', b: {}, porque: [],
      nota: 'Playback já vem mixado. Deixe o EQ plano e cuide só do volume.' }
  ];

  var PROBLEMAS = [
    { nome: 'Embolado, sem definição', banda: 'p1', f: 300, g: -4, q: 1.4,
      txt: 'Excesso de médio-grave. Corte e varra entre 200 e 400 Hz até o som clarear.' },
    { nome: 'Som de caixa de papelão', banda: 'p2', f: 450, g: -4, q: 1.8,
      txt: 'Ressonância entre 350 e 600 Hz. Comum em bumbo, tons e voz muito perto do microfone.' },
    { nome: 'Anasalado, som de telefone', banda: 'p2', f: 1000, g: -3, q: 1.4,
      txt: 'Médio em excesso, perto de 1 kHz.' },
    { nome: 'Estridente, machuca o ouvido', banda: 'p3', f: 3500, g: -3, q: 2,
      txt: 'Médio-agudo em excesso. Corte pequeno entre 2,5 e 5 kHz. Também é região de microfonia em voz.' },
    { nome: 'Chiado no "s"', banda: 'p4', f: 7000, g: -3, q: 4,
      txt: 'Sibilância. Corte estreito entre 5 e 9 kHz, no ponto exato de cada cantor.' },
    { nome: 'Magro, sem corpo', banda: 'p1', f: 180, g: 3, q: 0.9,
      txt: 'Falta de grave. Reforço largo e pequeno. Antes, confira se o corte de graves não está alto demais.' },
    { nome: 'Voz sem clareza', banda: 'p3', f: 3000, g: 2, q: 1,
      txt: 'Reforço largo perto de 3 kHz. Antes, tente cortar o embolado: muitas vezes resolve sozinho.' },
    { nome: 'Ronco, grave do palco vazando', banda: 'lc', f: 120,
      txt: 'Suba o corte de graves até o ronco sumir, sem a voz ficar fina.' },
    { nome: 'Abafado, sem brilho', banda: 'high', f: 8000, g: 3,
      txt: 'Prateleira de agudos. Se o som continua abafado, confira o microfone e a posição dele.' }
  ];

  // fund = notas (fundamental), harm = harmônicos e ataque
  var INSTRUMENTOS = [
    { nome: 'Bumbo', fund: [40, 100], harm: [1500, 5000] },
    { nome: 'Caixa', fund: [150, 300], harm: [2000, 10000] },
    { nome: 'Tom', fund: [80, 250], harm: [2000, 6000] },
    { nome: 'Surdo', fund: [50, 150], harm: [1500, 5000] },
    { nome: 'Hi-hat', fund: null, harm: [3000, 16000] },
    { nome: 'Pratos', fund: [300, 2000], harm: [2000, 16000] },
    { nome: 'Baixo', fund: [41, 400], harm: [400, 3000] },
    { nome: 'Cello', fund: [65, 1000], harm: [1000, 8000] },
    { nome: 'Violão', fund: [82, 1000], harm: [1000, 10000] },
    { nome: 'Guitarra', fund: [82, 1200], harm: [1200, 5000] },
    { nome: 'Teclado', fund: [27, 4200], harm: [4200, 12000] },
    { nome: 'Voz masculina', fund: [85, 400], harm: [400, 8000] },
    { nome: 'Voz feminina', fund: [165, 1000], harm: [1000, 10000] }
  ];

  var PROBLEMA_FREQS = [200, 315, 500, 800, 1250, 2000, 3150, 5000];

  /* ---------- Estado ---------- */
  var st = {
    sel: 'p1', drag: null, tocando: false, bypass: false, solo: false, rta: true,
    fonte: 'ruido', inst: null, varre: null, problema: null, preset: null, problemaMsg: ''
  };

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
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function fmtF(f) {
    if (f >= 1000) { var k = f / 1000; return String(parseFloat(k.toFixed(k >= 10 ? 1 : 2))).replace('.', ',') + ' kHz'; }
    return Math.round(f) + ' Hz';
  }
  function fmtG(g) { var s = (Math.round(g * 10) / 10).toFixed(1).replace('.', ','); return (g > 0 ? '+' : g < 0 ? '−' : '') + s.replace('-', '') + ' dB'; }
  function regiao(f) { for (var i = 0; i < REGIOES.length; i++) if (f >= REGIOES[i].lo && f < REGIOES[i].hi) return REGIOES[i]; return REGIOES[REGIOES.length - 1]; }
  function cor(nome) { return getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || '#888'; }

  /* ---------- Filtros (mesmas fórmulas da especificação Web Audio) ---------- */
  function coef(t, f, g, q) {
    var A = Math.pow(10, g / 40), w = 2 * Math.PI * f / FS, c = Math.cos(w), s = Math.sin(w);
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
  function magDb(k, f) {
    var w = 2 * Math.PI * f / FS, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    var nr = k[0] + k[1] * c1 + k[2] * c2, ni = -(k[1] * s1 + k[2] * s2);
    var dr = 1 + k[3] * c1 + k[4] * c2, di = -(k[3] * s1 + k[4] * s2);
    return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
  }
  function ativa(b) { return b.on && (b.tipo === 'highpass' || Math.abs(b.g) > 0.01); }
  function coefBanda(b) { return coef(b.tipo, b.f, b.g, b.q); }

  /* ---------- Estrutura da página ---------- */
  var chips = el('div', { class: 'eq-bandas', role: 'group', 'aria-label': 'Bandas' });
  var chipEls = {};
  BANDAS.forEach(function (b) {
    var c = el('button', { type: 'button', class: 'eq-chip', 'data-b': b.id, title: b.nome }, [b.rot]);
    c.addEventListener('click', function () { st.sel = b.id; atualizar(); });
    chips.appendChild(c);
    chipEls[b.id] = c;
  });

  var canvas = el('canvas', { class: 'eq-canvas', role: 'img', 'aria-label': 'Curva do equalizador. Arraste os pontos para ajustar.' });
  var ctx = canvas.getContext('2d');
  var canvasWrap = el('div', { class: 'eq-canvas-wrap' }, [canvas]);

  // Controles da banda selecionada
  var ctlTitulo = el('strong', { class: 'eq-ctl-titulo' });
  var ctlOn = el('input', { type: 'checkbox', id: 'eq-on' });
  var ctlF = el('input', { type: 'range', id: 'eq-f', min: '0', max: '1000', step: '1' });
  var ctlG = el('input', { type: 'range', id: 'eq-g', min: String(-GLIM), max: String(GLIM), step: '0.5' });
  var ctlQ = el('input', { type: 'range', id: 'eq-q', min: '0', max: '1000', step: '1' });
  var outF = el('output', { for: 'eq-f' }), outG = el('output', { for: 'eq-g' }), outQ = el('output', { for: 'eq-q' });
  var linhaG = el('label', { class: 'eq-linha', for: 'eq-g' }, [el('span', { text: 'Ganho' }), ctlG, outG]);
  var linhaQ = el('label', { class: 'eq-linha', for: 'eq-q' }, [el('span', { text: 'Largura (Q)' }), ctlQ, outQ]);
  var notaQ = el('p', { class: 'eq-mini' });
  var regiaoTxt = el('p', { class: 'eq-regiao' });
  var btnZeraBanda = el('button', { type: 'button', class: 'btn', text: 'Zerar banda' });
  var btnZeraTudo = el('button', { type: 'button', class: 'btn', text: 'Zerar tudo' });

  var controles = el('div', { class: 'eq-ctl' }, [
    el('div', { class: 'eq-ctl-head' }, [ctlTitulo, el('label', { class: 'eq-toggle', for: 'eq-on' }, [ctlOn, el('span', { text: 'Ligada' })])]),
    el('label', { class: 'eq-linha', for: 'eq-f' }, [el('span', { text: 'Frequência' }), ctlF, outF]),
    linhaG, linhaQ, notaQ, regiaoTxt,
    el('div', { class: 'eq-botoes' }, [btnZeraBanda, btnZeraTudo])
  ]);

  // Áudio
  var btnPlay = el('button', { type: 'button', class: 'btn primario', id: 'eq-play', text: 'Tocar' });
  var fonteChips = el('div', { class: 'pick small', role: 'group', 'aria-label': 'O que tocar' });
  var fRuido = el('button', { type: 'button', 'aria-pressed': 'true', 'data-fonte': 'ruido', text: 'Ruído rosa' });
  var fArq = el('button', { type: 'button', 'aria-pressed': 'false', 'data-fonte': 'arquivo', text: 'Seu arquivo', disabled: '' });
  fonteChips.appendChild(fRuido); fonteChips.appendChild(fArq);
  var inputArq = el('input', { type: 'file', id: 'eq-arquivo', accept: 'audio/*', class: 'eq-file' });
  var labelArq = el('label', { class: 'btn', for: 'eq-arquivo', text: 'Escolher arquivo de áudio' });
  var nomeArq = el('span', { class: 'eq-mini' });
  var chkBypass = el('input', { type: 'checkbox', id: 'eq-bypass' });
  var chkSolo = el('input', { type: 'checkbox', id: 'eq-solo' });
  var chkRta = el('input', { type: 'checkbox', id: 'eq-rta' });
  chkRta.checked = true;
  var vol = el('input', { type: 'range', id: 'eq-vol', min: '0', max: '100', step: '1', value: '30' });
  var audioMsg = el('p', { class: 'eq-mini', 'aria-live': 'polite' });

  var audioBox = el('div', { class: 'eq-audio' }, [
    el('div', { class: 'eq-audio-row' }, [btnPlay, fonteChips]),
    el('div', { class: 'eq-audio-row' }, [labelArq, inputArq, nomeArq]),
    el('div', { class: 'eq-audio-row checks' }, [
      el('label', { class: 'eq-toggle', for: 'eq-bypass' }, [chkBypass, el('span', { text: 'Ouvir sem EQ' })]),
      el('label', { class: 'eq-toggle', for: 'eq-solo' }, [chkSolo, el('span', { text: 'Ouvir só a banda (band solo)' })]),
      el('label', { class: 'eq-toggle', for: 'eq-rta' }, [chkRta, el('span', { text: 'Analisador (RTA)' })])
    ]),
    el('label', { class: 'eq-linha', for: 'eq-vol' }, [el('span', { text: 'Volume' }), vol, el('span')]),
    audioMsg,
    el('p', { class: 'note', text: 'Comece com o volume baixo, principalmente de fone. O seu arquivo fica só neste computador: pode ser uma gravação multipista da banda ou uma música de referência.' })
  ]);

  var editor = el('div', { class: 'eq-editor' }, [chips, canvasWrap, el('div', { class: 'eq-lados' }, [controles, audioBox])]);

  // Seções de baixo
  var presetChips = el('div', { class: 'pick', role: 'group', 'aria-label': 'Pontos de partida' });
  var presetInfo = el('div', { class: 'eq-preset-info' });
  PRESETS.forEach(function (p) {
    presetChips.appendChild(el('button', { type: 'button', 'aria-pressed': 'false', 'data-p': p.id, text: p.nome }));
  });

  var probLista = el('div', { class: 'eq-probs' });
  var probMsg = el('p', { class: 'eq-regiao', 'aria-live': 'polite' });
  PROBLEMAS.forEach(function (p, i) {
    var b = el('button', { type: 'button', class: 'eq-prob', 'data-i': String(i) }, [
      el('strong', { text: p.nome }), el('small', { text: p.txt })
    ]);
    probLista.appendChild(b);
  });

  var btnVarre = el('button', { type: 'button', class: 'btn primario', text: 'Demonstrar a varredura' });
  var varreMsg = el('p', { class: 'eq-regiao', 'aria-live': 'polite' });
  var btnProb = el('button', { type: 'button', class: 'btn primario', text: 'Criar um problema' });
  var btnRevela = el('button', { type: 'button', class: 'btn', text: 'Revelar', disabled: '' });
  var btnTiraProb = el('button', { type: 'button', class: 'btn', text: 'Tirar o problema', disabled: '' });
  var exMsg = el('p', { class: 'eq-regiao', 'aria-live': 'polite' });

  var instBox = el('div', { class: 'inst' });

  function secao(titulo, lead, kids) {
    return el('section', { class: 'eq-sec' }, [el('h3', { text: titulo }), lead ? el('p', { class: 'lead', text: lead }) : null].concat(kids));
  }

  raiz.appendChild(editor);
  raiz.appendChild(secao('Pontos de partida por canal',
    'Uma curva inicial para cada canal da cena BASE A, com o porquê de cada ajuste. É ponto de partida, não receita: cada microfone, instrumento e músico pede ajuste fino de ouvido.',
    [presetChips, presetInfo]));
  raiz.appendChild(secao('Problemas comuns',
    'Toque no que você está ouvindo. O ajuste vai para a banda certa e você termina de achar o ponto exato varrendo a frequência.',
    [probLista, probMsg]));
  raiz.appendChild(secao('Treino de ouvido: a varredura',
    'A técnica mais usada para achar uma frequência ruim: reforce muito uma banda estreita, varra devagar até o som ficar feio de verdade, e então corte ali.',
    [
      el('ol', { class: 'chain' }, [
        el('li', null, [el('span', null, [el('strong', { text: 'Reforce' }), el('small', { text: 'Uma PEQ com +10 dB e largura estreita (Q entre 4 e 6).' })])]),
        el('li', null, [el('span', null, [el('strong', { text: 'Varra' }), el('small', { text: 'Arraste a frequência devagar. Em algum ponto o problema salta e fica insuportável.' })])]),
        el('li', null, [el('span', null, [el('strong', { text: 'Corte' }), el('small', { text: 'Puxe o ganho para baixo nesse ponto. Comece com −3 a −6 dB e abra um pouco a largura.' })])])
      ]),
      el('p', { class: 'note', text: 'Durante o culto, varra com o canal em SOLO no seu fone, nunca reforçando no salão. Reforço estreito no P.A. é pedido de microfonia.' }),
      el('div', { class: 'eq-botoes' }, [btnVarre]), varreMsg,
      el('h4', { class: 'eq-h4', text: 'Exercício: ache o problema' }),
      el('p', { text: 'O laboratório esconde uma ressonância no som. Use a PEQ 2 com a varredura para achar o ponto e corte. Desligue o analisador para treinar só o ouvido, e ligue para conferir. Nada é registrado.' }),
      el('div', { class: 'eq-botoes' }, [btnProb, btnRevela, btnTiraProb]), exMsg
    ]));
  raiz.appendChild(secao('Onde cada instrumento vive',
    'A parte cheia é a faixa das notas; a parte clara são os harmônicos e o ataque. Onde dois instrumentos se sobrepõem, eles brigam: corte um para o outro aparecer. Toque em um instrumento para ver a faixa dele no gráfico.',
    [instBox]));
  raiz.appendChild(secao('Mapa das frequências', null, [mapaFreq()]));
  raiz.appendChild(secao('Regras de quem já errou muito', null, [el('ul', { class: 'eq-regras' }, [
    el('li', { text: 'Corte antes de reforçar. Tirar o que incomoda quase sempre soa melhor do que aumentar o que falta.' }),
    el('li', { text: 'Equalize ouvindo a banda toda. Um canal que soa magro sozinho pode estar perfeito no conjunto.' }),
    el('li', { text: 'Volume engana: o mais alto sempre parece melhor. Ao comparar com e sem EQ, deixe os dois no mesmo volume.' }),
    el('li', { text: 'Mais de 6 dB em uma banda indica problema em outro lugar: microfone, posição, instrumento ou timbre.' }),
    el('li', { text: 'Cortes estreitos, reforços largos e suaves.' }),
    el('li', { text: 'O EQ do canal vale para o salão e para todos os fones. Reforço grande em voz aproxima a microfonia.' })
  ])]));
  raiz.appendChild(secao('Na Wing', null, [el('ul', { class: 'eq-regras' }, [
    el('li', { text: 'A tela do EQ tem as bandas LOW, PEQ 1 a 4 e HIGH, como aqui. O corte de graves fica na etapa FILTER, antes do EQ.' }),
    el('li', { text: 'Para ajustar: SELECT no canal, abra o EQ e use os botões abaixo da tela, ou os botões físicos do Channel Equalizer.' }),
    el('li', { text: 'O BAND SOLO da tela faz o mesmo que "Ouvir só a banda" daqui: você ouve no fone só a região da banda escolhida.' }),
    el('li', { text: 'O analisador atrás da curva, na tela, mostra o que está soando no canal, como o RTA daqui.' }),
    el('li', { text: 'A Wing tem vários modelos de EQ. Não troque o modelo de um canal: os ajustes mudam de comportamento.' }),
    el('li', { text: 'O laboratório usa a mesma ideia de bandas, mas não reproduz exatamente o som da Wing.' })
  ])]));

  function mapaFreq() {
    var d = el('div', { class: 'freq' });
    REGIOES.forEach(function (r) {
      var faixa = r.hi > 20000 ? 'Acima de 10 kHz' : fmtF(r.lo).replace(' Hz', '').replace(' kHz', 'k') + '–' + fmtF(r.hi);
      d.appendChild(el('div', null, [el('b', { text: faixa }), el('span', null, [r.nome, el('small', { text: r.txt })])]));
    });
    return d;
  }

  /* ---------- Gráfico ---------- */
  var G = { w: 0, h: 0, L: 38, R: 10, T: 12, B: 24, dpr: 1 };
  function xOf(f) { return G.L + (Math.log10(f) - LOGMIN) / LOGSPAN * (G.w - G.L - G.R); }
  function fOf(x) { return Math.pow(10, LOGMIN + (x - G.L) / (G.w - G.L - G.R) * LOGSPAN); }
  function yOf(g) { return G.T + (GMAX - g) / (2 * GMAX) * (G.h - G.T - G.B); }
  function gOf(y) { return GMAX - (y - G.T) / (G.h - G.T - G.B) * 2 * GMAX; }

  function medir() {
    var r = canvas.getBoundingClientRect();
    if (!r.width) return false;
    G.dpr = window.devicePixelRatio || 1;
    G.w = r.width; G.h = r.height;
    canvas.width = Math.round(r.width * G.dpr);
    canvas.height = Math.round(r.height * G.dpr);
    return true;
  }

  var rtaDados = null;

  function desenhar() {
    if (!G.w && !medir()) return;
    var c = {
      bg: cor('--eq-bg'), grid: cor('--line'), txt: cor('--muted'), fg: cor('--fg'),
      acc: cor('--accent'), stop: cor('--stop'), ok: cor('--ok'), rta: cor('--eq-rta'), inst: cor('--eq-inst')
    };
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    ctx.clearRect(0, 0, G.w, G.h);
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, G.w, G.h);
    var x0 = G.L, x1 = G.w - G.R, y0 = G.T, y1 = G.h - G.B;

    // Faixa do instrumento escolhido
    if (st.inst) {
      var it = st.inst;
      ctx.globalAlpha = 0.22; ctx.fillStyle = c.inst;
      if (it.fund) ctx.fillRect(xOf(it.fund[0]), y0, xOf(it.fund[1]) - xOf(it.fund[0]), y1 - y0);
      ctx.globalAlpha = 0.09;
      ctx.fillRect(xOf(it.harm[0]), y0, xOf(it.harm[1]) - xOf(it.harm[0]), y1 - y0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = c.inst; ctx.font = '600 11px ' + cor('--font');
      ctx.fillText(it.nome, xOf(it.fund ? it.fund[0] : it.harm[0]) + 4, y0 + 12);
    }

    // Grade
    ctx.lineWidth = 1; ctx.strokeStyle = c.grid; ctx.fillStyle = c.txt;
    ctx.font = '11px ' + cor('--mono');
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].forEach(function (f) {
      var x = Math.round(xOf(f)) + 0.5;
      ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); ctx.globalAlpha = 1;
      var lab = f >= 1000 ? (f / 1000) + 'k' : String(f);
      if (G.w < 480 && (f === 20 || f === 20000 || f === 50 || f === 5000)) return;
      ctx.fillText(lab, clamp(x, x0 + 8, x1 - 10), y1 + 6);
    });
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    [-12, -6, 0, 6, 12].forEach(function (g) {
      var y = Math.round(yOf(g)) + 0.5;
      ctx.globalAlpha = g === 0 ? 1 : 0.6;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillText((g > 0 ? '+' : '') + g, x0 - 6, y);
    });

    // RTA
    if (st.tocando && st.rta && rtaDados && nos.analisador) {
      nos.analisador.getFloatFrequencyData(rtaDados);
      var hz = ac.sampleRate / nos.analisador.fftSize;
      ctx.beginPath(); ctx.moveTo(x0, y1);
      for (var x = x0; x <= x1; x += 2) {
        var fa = fOf(x), fb = fOf(x + 2);
        var i0 = Math.max(1, Math.floor(fa / hz)), i1 = Math.max(i0, Math.floor(fb / hz));
        var v = -200;
        for (var i = i0; i <= i1 && i < rtaDados.length; i++) v = Math.max(v, rtaDados[i]);
        v += 10 * Math.log10(fa / 1000); // compensa a queda do ruído rosa: rosa aparece reto
        var y = y1 - clamp((v + 95) / 70, 0, 1) * (y1 - y0);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(x1, y1); ctx.closePath();
      ctx.globalAlpha = 0.35; ctx.fillStyle = c.rta; ctx.fill(); ctx.globalAlpha = 1;
    }

    // Bandas individuais (sombras) e curva total
    var ks = BANDAS.map(function (b) { return ativa(b) ? coefBanda(b) : null; });
    var sel = porId[st.sel];
    ks.forEach(function (k, idx) {
      if (!k) return;
      var b = BANDAS[idx];
      ctx.beginPath();
      for (var x = x0; x <= x1; x += 2) {
        var y = yOf(clamp(magDb(k, fOf(x)), -GMAX - 4, GMAX + 4));
        if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineTo(x1, yOf(0)); ctx.lineTo(x0, yOf(0)); ctx.closePath();
      ctx.globalAlpha = b === sel ? 0.25 : 0.08; ctx.fillStyle = c.acc; ctx.fill(); ctx.globalAlpha = 1;
    });

    // Varredura (curva tracejada)
    if (st.varre && st.varre.k) {
      ctx.setLineDash([5, 4]); ctx.strokeStyle = c.ok; ctx.lineWidth = 1.5; ctx.beginPath();
      for (var xv = x0; xv <= x1; xv += 2) {
        var yv = yOf(clamp(magDb(st.varre.k, fOf(xv)), -GMAX, GMAX));
        if (xv === x0) ctx.moveTo(xv, yv); else ctx.lineTo(xv, yv);
      }
      ctx.stroke(); ctx.setLineDash([]);
    }

    ctx.beginPath(); ctx.lineWidth = 2.5; ctx.strokeStyle = st.bypass ? c.txt : c.acc;
    for (var x2 = x0; x2 <= x1; x2 += 1.5) {
      var f = fOf(x2), t = 0;
      ks.forEach(function (k) { if (k) t += magDb(k, f); });
      var y2 = yOf(clamp(t, -GMAX - 4, GMAX + 4));
      if (x2 === x0) ctx.moveTo(x2, y2); else ctx.lineTo(x2, y2);
    }
    ctx.stroke();

    // Problema revelado
    if (st.problema && st.problema.revelado) {
      var xp = xOf(st.problema.f);
      ctx.strokeStyle = c.stop; ctx.lineWidth = 2; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(xp, y0); ctx.lineTo(xp, y1); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = c.stop; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = '600 11px ' + cor('--font');
      ctx.fillText('problema ' + fmtF(st.problema.f), clamp(xp, x0 + 50, x1 - 50), y0 + 2);
    }

    // Pontos das bandas
    BANDAS.forEach(function (b) {
      var hx = xOf(b.f), hy = yOf(b.tipo === 'highpass' ? 0 : b.g);
      var r = b.id === st.sel ? 13 : 11;
      ctx.beginPath(); ctx.arc(hx, hy, r, 0, Math.PI * 2);
      ctx.fillStyle = b.on ? (b.id === st.sel ? c.acc : c.bg) : c.bg;
      ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = b.on ? c.acc : c.txt;
      if (!b.on) ctx.setLineDash([3, 3]);
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = b.id === st.sel && b.on ? cor('--accent-fg') : (b.on ? c.fg : c.txt);
      ctx.font = '700 11px ' + cor('--mono'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.rot, hx, hy + 0.5);
    });
  }

  /* ---------- Arrastar os pontos ---------- */
  function pos(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  canvas.addEventListener('pointerdown', function (e) {
    var p = pos(e), melhor = null, dist = 26;
    BANDAS.forEach(function (b) {
      var d = Math.hypot(xOf(b.f) - p.x, yOf(b.tipo === 'highpass' ? 0 : b.g) - p.y);
      if (d < dist) { dist = d; melhor = b; }
    });
    if (!melhor) return;
    e.preventDefault();
    st.sel = melhor.id; st.drag = melhor;
    if (!melhor.on) melhor.on = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    atualizar();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!st.drag) {
      var p0 = pos(e), perto = BANDAS.some(function (b) { return Math.hypot(xOf(b.f) - p0.x, yOf(b.tipo === 'highpass' ? 0 : b.g) - p0.y) < 26; });
      canvas.style.cursor = perto ? 'grab' : 'default';
      return;
    }
    var p = pos(e), b = st.drag;
    b.f = clamp(fOf(p.x), FMIN, FMAX);
    if (b.tipo !== 'highpass') {
      var g = clamp(gOf(p.y), -GLIM, GLIM);
      b.g = Math.abs(g) < 0.4 ? 0 : Math.round(g * 2) / 2;
    }
    st.preset = null;
    atualizar();
  });
  function soltar() { st.drag = null; }
  canvas.addEventListener('pointerup', soltar);
  canvas.addEventListener('pointercancel', soltar);

  /* ---------- Controles ---------- */
  function fToSlider(f) { return Math.round((Math.log10(f) - LOGMIN) / LOGSPAN * 1000); }
  function sliderToF(v) { return Math.pow(10, LOGMIN + v / 1000 * LOGSPAN); }
  var QMIN = 0.3, QMAX = 10;
  function qToSlider(q) { return Math.round(Math.log(q / QMIN) / Math.log(QMAX / QMIN) * 1000); }
  function sliderToQ(v) { return QMIN * Math.pow(QMAX / QMIN, v / 1000); }

  ctlOn.addEventListener('change', function () { porId[st.sel].on = ctlOn.checked; st.preset = null; atualizar(); });
  ctlF.addEventListener('input', function () { porId[st.sel].f = sliderToF(+ctlF.value); st.preset = null; atualizar(); });
  ctlG.addEventListener('input', function () { var b = porId[st.sel]; b.g = +ctlG.value; b.on = true; st.preset = null; atualizar(); });
  ctlQ.addEventListener('input', function () { porId[st.sel].q = sliderToQ(+ctlQ.value); st.preset = null; atualizar(); });
  btnZeraBanda.addEventListener('click', function () { zerarBanda(porId[st.sel]); st.preset = null; atualizar(); });
  btnZeraTudo.addEventListener('click', function () { BANDAS.forEach(zerarBanda); st.preset = null; marcarPreset(); atualizar(); });

  function zerarBanda(b) {
    var d = PADRAO[BANDAS.indexOf(b)];
    b.f = d.f; b.g = d.g; b.q = d.q; b.on = d.on;
  }

  function sincronizar() {
    var b = porId[st.sel];
    BANDAS.forEach(function (x) {
      chipEls[x.id].setAttribute('aria-pressed', String(x.id === st.sel));
      chipEls[x.id].classList.toggle('off', !x.on);
      chipEls[x.id].classList.toggle('mexida', ativa(x));
    });
    ctlTitulo.textContent = b.nome;
    ctlOn.checked = b.on;
    ctlF.value = fToSlider(b.f); outF.textContent = fmtF(b.f);
    var corte = b.tipo === 'highpass';
    linhaG.hidden = corte;
    ctlG.value = b.g; outG.textContent = fmtG(b.g);
    linhaQ.hidden = b.tipo !== 'peaking';
    ctlQ.value = qToSlider(b.q); outQ.textContent = b.q.toFixed(1).replace('.', ',');
    if (corte) notaQ.textContent = 'Corta tudo abaixo da frequência, 12 dB por oitava. Na Wing, fica na etapa FILTER.';
    else if (b.tipo === 'peaking') notaQ.textContent = b.q >= 4 ? 'Largura estreita: bom para cortar um problema pontual.' : b.q <= 1 ? 'Largura larga: bom para reforços suaves.' : 'Largura média.';
    else notaQ.textContent = b.tipo === 'lowshelf' ? 'Sobe ou desce tudo abaixo da frequência, como um botão de grave.' : 'Sobe ou desce tudo acima da frequência, como um botão de agudo.';
    var r = regiao(b.f);
    regiaoTxt.textContent = '';
    regiaoTxt.appendChild(el('strong', { text: fmtF(b.f) + ' · ' + r.nome + '. ' }));
    regiaoTxt.appendChild(document.createTextNode(corte ? 'Tudo abaixo daqui está sendo cortado.' : r.txt));
  }

  /* ---------- Áudio ---------- */
  var ac = null, nos = {}, fonteNo = null, buffers = { ruido: null, arquivo: null };

  function criarAudio() {
    if (ac) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { audioMsg.textContent = 'Este navegador não toca áudio. Use o Chrome ou o Edge.'; return false; }
    try { ac = new AC({ sampleRate: 48000 }); } catch (e) { ac = new AC(); }
    FS = ac.sampleRate;
    nos.entrada = ac.createGain();
    nos.problema = ac.createBiquadFilter(); nos.problema.type = 'peaking'; nos.problema.gain.value = 0;
    nos.filtros = BANDAS.map(function () { return ac.createBiquadFilter(); });
    nos.varre = ac.createBiquadFilter(); nos.varre.type = 'peaking'; nos.varre.gain.value = 0;
    nos.solo = ac.createBiquadFilter();
    nos.seco = ac.createGain(); nos.molhado = ac.createGain(); nos.soloG = ac.createGain();
    nos.master = ac.createGain();
    nos.analisador = ac.createAnalyser(); nos.analisador.fftSize = 8192; nos.analisador.smoothingTimeConstant = 0.82;
    rtaDados = new Float32Array(nos.analisador.frequencyBinCount);

    nos.entrada.connect(nos.problema);
    nos.problema.connect(nos.seco);
    nos.problema.connect(nos.filtros[0]);
    for (var i = 0; i < nos.filtros.length - 1; i++) nos.filtros[i].connect(nos.filtros[i + 1]);
    nos.filtros[nos.filtros.length - 1].connect(nos.varre);
    nos.varre.connect(nos.molhado);
    nos.problema.connect(nos.solo);
    nos.solo.connect(nos.soloG);
    [nos.seco, nos.molhado, nos.soloG].forEach(function (n) { n.connect(nos.master); });
    nos.master.connect(nos.analisador);
    nos.analisador.connect(ac.destination);

    buffers.ruido = ruidoRosa();
    aplicarAudio();
    return true;
  }

  function ruidoRosa() {
    var n = FS * 6, buf = ac.createBuffer(1, n, FS), d = buf.getChannelData(0);
    var b0 = 0, b1 = 0, b2 = 0, pico = 0;
    for (var i = 0; i < n; i++) {
      var w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      d[i] = b0 + b1 + b2 + w * 0.1848;
      pico = Math.max(pico, Math.abs(d[i]));
    }
    var esc = 0.5 / pico, fade = 2400;
    for (var j = 0; j < n; j++) {
      d[j] *= esc;
      if (j < fade) d[j] *= j / fade;
      if (j > n - fade) d[j] *= (n - j) / fade;
    }
    return buf;
  }

  function alvo(param, v) {
    if (!ac) return;
    param.setTargetAtTime(v, ac.currentTime, 0.015);
  }

  function aplicarAudio() {
    if (!ac) return;
    BANDAS.forEach(function (b, i) {
      var n = nos.filtros[i];
      if (n.type !== b.tipo) n.type = b.tipo;
      if (b.tipo === 'highpass') {
        alvo(n.frequency, b.on ? b.f : 1);
        n.Q.value = 20 * Math.log10(b.q); // passa-alta: Q em dB na especificação
      } else {
        alvo(n.frequency, b.f);
        alvo(n.gain, b.on ? b.g : 0);
        if (b.tipo === 'peaking') alvo(n.Q, b.q);
      }
    });
    var s = porId[st.sel];
    if (s.tipo === 'highpass' || s.tipo === 'lowshelf') { nos.solo.type = 'lowpass'; nos.solo.Q.value = 0; }
    else if (s.tipo === 'highshelf') { nos.solo.type = 'highpass'; nos.solo.Q.value = 0; }
    else { nos.solo.type = 'bandpass'; alvo(nos.solo.Q, Math.max(s.q, 1)); }
    alvo(nos.solo.frequency, s.f);

    alvo(nos.molhado.gain, st.solo || st.bypass ? 0 : 1);
    alvo(nos.seco.gain, !st.solo && st.bypass ? 1 : 0);
    alvo(nos.soloG.gain, st.solo ? 1 : 0);
    var v = +vol.value / 100;
    alvo(nos.master.gain, v * v);

    if (st.problema) {
      alvo(nos.problema.frequency, st.problema.f);
      alvo(nos.problema.gain, st.problema.ativo ? 10 : 0);
      nos.problema.Q.value = 4.5;
    }
  }

  function tocar() {
    if (!criarAudio()) return;
    if (ac.state === 'suspended') ac.resume();
    pararFonte();
    var buf = st.fonte === 'arquivo' && buffers.arquivo ? buffers.arquivo : buffers.ruido;
    fonteNo = ac.createBufferSource();
    fonteNo.buffer = buf; fonteNo.loop = true;
    fonteNo.connect(nos.entrada);
    fonteNo.start();
    st.tocando = true;
    btnPlay.textContent = 'Parar';
    audioMsg.textContent = 'Tocando: ' + (buf === buffers.ruido ? 'ruído rosa' : nomeArq.textContent) + '.';
    loop();
  }
  function pararFonte() {
    if (fonteNo) { try { fonteNo.stop(); } catch (e) {} fonteNo.disconnect(); fonteNo = null; }
  }
  function parar() {
    pararFonte();
    st.tocando = false;
    btnPlay.textContent = 'Tocar';
    audioMsg.textContent = '';
    if (st.varre) pararVarredura();
    desenhar();
  }

  btnPlay.addEventListener('click', function () { if (st.tocando) parar(); else tocar(); });
  fonteChips.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b || b.disabled) return;
    st.fonte = b.getAttribute('data-fonte');
    fonteChips.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    if (st.tocando) tocar();
  });
  inputArq.addEventListener('change', function () {
    var arq = inputArq.files && inputArq.files[0];
    if (!arq || !criarAudio()) return;
    nomeArq.textContent = 'Carregando...';
    arq.arrayBuffer().then(function (ab) { return ac.decodeAudioData(ab); }).then(function (buf) {
      buffers.arquivo = buf;
      nomeArq.textContent = arq.name;
      fArq.removeAttribute('disabled');
      fArq.click();
      if (!st.tocando) tocar();
    }).catch(function () {
      nomeArq.textContent = 'Não consegui abrir esse arquivo. Tente um MP3 ou WAV.';
    });
  });
  chkBypass.addEventListener('change', function () { st.bypass = chkBypass.checked; aplicarAudio(); desenhar(); });
  chkSolo.addEventListener('change', function () { st.solo = chkSolo.checked; aplicarAudio(); });
  chkRta.addEventListener('change', function () { st.rta = chkRta.checked; desenhar(); });
  vol.addEventListener('input', aplicarAudio);

  var animando = false;
  function loop() {
    if (animando) return;
    animando = true;
    (function quadro() {
      if (!st.tocando && !st.varre) { animando = false; return; }
      if (st.varre) passoVarredura();
      desenhar();
      requestAnimationFrame(quadro);
    })();
  }

  /* ---------- Varredura ---------- */
  function iniciarVarredura() {
    if (!st.tocando) tocar();
    if (!ac) return;
    st.varre = { t0: performance.now(), dur: 14000, k: null };
    nos.varre.Q.value = 4;
    btnVarre.textContent = 'Parar a varredura';
    loop();
  }
  function passoVarredura() {
    var p = (performance.now() - st.varre.t0) / st.varre.dur;
    if (p >= 1) { pararVarredura(); return; }
    var f = 60 * Math.pow(10000 / 60, p);
    st.varre.k = coef('peaking', f, 12, 4);
    nos.varre.frequency.setTargetAtTime(f, ac.currentTime, 0.01);
    nos.varre.gain.setTargetAtTime(12, ac.currentTime, 0.02);
    var r = regiao(f);
    varreMsg.textContent = '';
    varreMsg.appendChild(el('strong', { text: 'Reforço de +12 dB em ' + fmtF(f) + ' · ' + r.nome + '. ' }));
    varreMsg.appendChild(document.createTextNode(r.txt));
  }
  function pararVarredura() {
    st.varre = null;
    if (ac) nos.varre.gain.setTargetAtTime(0, ac.currentTime, 0.02);
    btnVarre.textContent = 'Demonstrar a varredura';
    varreMsg.textContent = 'Repare como cada região muda o caráter do som. Use o seu arquivo de áudio para ouvir isso numa música.';
    desenhar();
  }
  btnVarre.addEventListener('click', function () { if (st.varre) pararVarredura(); else iniciarVarredura(); });

  /* ---------- Exercício ---------- */
  btnProb.addEventListener('click', function () {
    var anterior = st.problema ? st.problema.f : null, f;
    do { f = PROBLEMA_FREQS[Math.floor(Math.random() * PROBLEMA_FREQS.length)]; } while (f === anterior);
    st.problema = { f: f, ativo: true, revelado: false };
    // A PEQ 2 começa em 100 Hz, a mais de uma oitava de qualquer problema possível.
    var p2 = porId.p2; p2.on = true; p2.g = 10; p2.q = 5; p2.f = 100;
    st.sel = 'p2';
    if (!st.tocando || st.fonte !== 'ruido') {
      st.fonte = 'ruido';
      fonteChips.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-fonte') === 'ruido')); });
      tocar();
    }
    aplicarAudio();
    btnRevela.disabled = false; btnTiraProb.disabled = false;
    exMsg.textContent = 'Problema criado. A PEQ 2 já está com +10 dB e largura estreita: arraste o ponto 2 para os lados até o som ficar feio de verdade. Achou? Puxe o ganho para baixo e toque em Revelar.';
    atualizar();
  });
  btnRevela.addEventListener('click', function () {
    if (!st.problema) return;
    st.problema.revelado = true;
    var p2 = porId.p2, oit = Math.abs(Math.log2(p2.f / st.problema.f));
    var msg = 'O problema estava em ' + fmtF(st.problema.f) + '. A sua PEQ 2 está em ' + fmtF(p2.f) + ' com ' + fmtG(p2.g) + '. ';
    if (oit <= 0.34 && p2.g < -2) msg += 'Achou e cortou no lugar certo.';
    else if (oit <= 0.34) msg += 'A frequência está certa. Agora puxe o ganho para baixo.';
    else if (oit <= 1) msg += 'Perto: menos de uma oitava de distância. Varra mais devagar nessa região.';
    else msg += 'Ainda longe. Ouça com "Ouvir sem EQ" ligado e desligado para lembrar como é o som do problema.';
    exMsg.textContent = msg;
    desenhar();
  });
  btnTiraProb.addEventListener('click', function () {
    if (!st.problema) return;
    st.problema.ativo = false;
    aplicarAudio();
    st.problema = null;
    btnRevela.disabled = true; btnTiraProb.disabled = true;
    exMsg.textContent = 'Problema removido.';
    desenhar();
  });

  /* ---------- Pontos de partida ---------- */
  function marcarPreset() {
    presetChips.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-p') === st.preset)); });
    presetInfo.textContent = '';
    var p = PRESETS.filter(function (x) { return x.id === st.preset; })[0];
    if (!p) return;
    presetInfo.appendChild(el('p', { class: 'eq-mini', text: p.canais + ' da cena BASE A' }));
    if (p.porque.length) {
      var dl = el('dl', { class: 'teclas' });
      p.porque.forEach(function (par) {
        var b = porId[par[0]];
        var val = b.tipo === 'highpass' ? 'corte em ' + fmtF(b.f) : fmtG(b.g) + ' em ' + fmtF(b.f);
        dl.appendChild(el('dt', { text: b.rot + ' · ' + val }));
        dl.appendChild(el('dd', { text: par[1] }));
      });
      presetInfo.appendChild(dl);
    }
    if (p.nota) presetInfo.appendChild(el('p', { class: 'note', text: p.nota }));
  }
  presetChips.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var p = PRESETS.filter(function (x) { return x.id === b.getAttribute('data-p'); })[0];
    BANDAS.forEach(function (banda) {
      zerarBanda(banda);
      var v = p.b[banda.id];
      if (!v) { if (banda.tipo === 'highpass') banda.on = false; return; }
      banda.on = true;
      banda.f = v[0];
      if (v.length > 1) banda.g = v[1];
      if (v.length > 2) banda.q = v[2];
    });
    st.preset = p.id;
    var primeira = p.porque.length ? p.porque[0][0] : 'p1';
    st.sel = primeira;
    marcarPreset();
    atualizar();
  });

  /* ---------- Problemas ---------- */
  probLista.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var p = PROBLEMAS[+b.getAttribute('data-i')], banda = porId[p.banda];
    banda.on = true; banda.f = p.f;
    if (p.g !== undefined) banda.g = p.g;
    if (p.q !== undefined) banda.q = p.q;
    st.sel = banda.id; st.preset = null;
    marcarPreset();
    probLista.querySelectorAll('button').forEach(function (x) { x.classList.toggle('sel', x === b); });
    probMsg.textContent = 'Aplicado na banda ' + banda.rot + ': ' + (banda.tipo === 'highpass' ? 'corte em ' + fmtF(banda.f) : fmtG(banda.g) + ' em ' + fmtF(banda.f)) + '. Toque o som e ajuste a frequência até achar o ponto exato.';
    atualizar();
    editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ---------- Instrumentos ---------- */
  (function () {
    var eixo = el('div', { class: 'inst-row eixo' }, [el('span'), el('div', { class: 'inst-track' })]);
    [50, 100, 200, 500, 1000, 2000, 5000, 10000].forEach(function (f) {
      var pct = (Math.log10(f) - LOGMIN) / LOGSPAN * 100;
      eixo.lastChild.appendChild(el('i', { style: 'left:' + pct + '%', text: f >= 1000 ? f / 1000 + 'k' : String(f) }));
    });
    INSTRUMENTOS.forEach(function (it) {
      var track = el('div', { class: 'inst-track' });
      function seg(par, cls) {
        if (!par) return;
        var a = (Math.log10(par[0]) - LOGMIN) / LOGSPAN * 100, z = (Math.log10(par[1]) - LOGMIN) / LOGSPAN * 100;
        track.appendChild(el('b', { class: cls, style: 'left:' + a + '%;width:' + (z - a) + '%' }));
      }
      seg(it.harm, 'harm'); seg(it.fund, 'fund');
      var row = el('button', { type: 'button', class: 'inst-row', 'aria-pressed': 'false' }, [el('span', { text: it.nome }), track]);
      row.addEventListener('click', function () {
        st.inst = st.inst === it ? null : it;
        instBox.querySelectorAll('.inst-row[aria-pressed]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === row && !!st.inst)); });
        desenhar();
        if (st.inst) canvasWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      instBox.appendChild(row);
    });
    instBox.appendChild(eixo);
  })();

  /* ---------- Ciclo ---------- */
  function atualizar() { sincronizar(); aplicarAudio(); desenhar(); }

  if (window.ResizeObserver) {
    new ResizeObserver(function () { if (medir()) desenhar(); }).observe(canvas);
  }
  window.addEventListener('resize', function () { if (medir()) desenhar(); });
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', desenhar);
  } catch (e) {}
  window.addEventListener('hashchange', function () {
    if (location.hash !== '#eq' && st.tocando) parar();
    if (location.hash === '#eq' && medir()) desenhar();
  });

  sincronizar();
  if (medir()) desenhar();
})();
