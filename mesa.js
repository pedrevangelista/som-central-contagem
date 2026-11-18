// Aba "Mesa": foto da Wing com áreas clicáveis, filtro por nível e roteiros guiados.
// As áreas usam coordenadas em pixels da foto original (1200 x 868).
(function () {
  'use strict';

  var W = 1200, H = 868;

  var NIVEIS = {
    ok: 'Pode mexer',
    warn: 'Com critério',
    stop: 'Não mexe',
    info: 'Só olhar'
  };

  var AREAS = [
    { id: 'tela', nome: 'Tela sensível ao toque', box: [288, 32, 612, 230], nivel: 'info',
      texto: [
        'Mostra os detalhes do que está selecionado: EQ, gate, compressor, envios e efeitos. Quando você aperta SELECT em um canal ou bus, a tela passa a mostrar aquele canal.',
        'Toque nos itens para escolher o que ajustar e use os seis botões giratórios logo abaixo da tela.'
      ],
      dica: 'Antes de mexer, leia o nome no topo da tela. É ele que diz qual canal você vai alterar.' },

    { id: 'encoders', nome: 'Botões abaixo da tela', box: [298, 244, 650, 278], nivel: 'warn',
      texto: [
        'Ajustam o que aparece na linha de baixo da tela, na mesma posição. No EQ, por exemplo, são o ganho, a frequência e a largura da banda escolhida.'
      ],
      ver: ['eq', 'Laboratório de EQ'] },

    { id: 'clr-solo', nome: 'CLR SOLO', box: [614, 34, 644, 54], nivel: 'ok',
      texto: [
        'Desliga todos os SOLOs de uma vez. Use quando o seu fone estiver tocando algo estranho ou quando você não lembrar o que deixou em solo.',
        'Não muda nada no salão nem na transmissão.'
      ] },

    { id: 'botoes-tela', nome: 'Botões ao lado da tela', box: [236, 32, 274, 228], nivel: 'warn',
      texto: ['Escolhem o que a tela mostra.'],
      lista: [
        ['HOME', 'Volta para a tela do canal selecionado.'],
        ['EFFECTS', 'Os efeitos da mesa: os reverbs e o delay dos buses 13 a 16, o Mastering da transmissão e o Combinator.'],
        ['METERS', 'Todos os medidores numa tela só. Bom para achar microfonia e canal sem sinal.'],
        ['ROUTING', 'O caminho do sinal. Não mexe.'],
        ['SETUP', 'Configuração da mesa. Não mexe.'],
        ['LIBRARY', 'As cenas. É aqui que se carrega a BASE A. Carregar pode; salvar por cima, nunca.'],
        ['UTILITY', 'Funções extras da tela que está aberta.']
      ],
      ver: ['processamento', 'Mastering e Combinator'] },

    { id: 'usb', nome: 'USB', box: [30, 157, 220, 204], nivel: 'info',
      texto: ['Entrada para pendrive: gravação, reprodução de áudio e cópia de cenas. Durante o culto, não tire nem coloque pendrive.'] },

    { id: 'monitor', nome: 'Fone do técnico e talkback', box: [30, 205, 220, 290], nivel: 'ok',
      texto: ['Tudo aqui muda só o que você ouve. O salão não muda.'],
      lista: [
        ['PHONES LEVEL', 'Volume do seu fone. As saídas de fone ficam no alto da mesa, à esquerda e à direita.'],
        ['MONITOR LEVEL', 'Volume da monitoração do técnico.'],
        ['TALK A e TALK B', 'Segure para falar. Antes, escolha no VIEW da seção para onde cada um vai: um ou mais buses, o main ou uma matrix. TALK LEVEL é o volume da sua voz.'],
        ['DIM', 'Abaixa a monitoração de uma vez, sem perder o ajuste.'],
        ['MONO', 'Soma os dois lados. Ajuda a perceber como o som fica num celular.']
      ],
      dica: 'Para ouvir um canal sozinho no fone, aperte o SOLO dele.',
      ver: ['buses', 'Como usar o talkback'] },

    { id: 'fone', nome: 'Saída de fone', box: [34, 6, 104, 26], nivel: 'ok',
      texto: ['Onde você liga o seu fone. Tem uma igual do lado direito. O volume é o PHONES LEVEL.'] },

    { id: 'resumo', nome: 'Resumo do canal', box: [666, 62, 1000, 124], nivel: 'info',
      texto: [
        'Mostra em miniatura o canal selecionado: ganho, filtro, EQ, gate, compressor, envios para os buses e grupos.',
        'Serve para conferir rápido o que está ligado no canal sem abrir cada tela.'
      ] },

    { id: 'processamento', nome: 'Processamento do canal', box: [666, 126, 1000, 206], nivel: 'warn',
      texto: [
        'As etapas do canal selecionado, na ordem em que o som passa por elas. Apertar um botão abre a etapa na tela; segurar liga e desliga. O botão giratório de cima ajusta o principal de cada etapa.'
      ],
      lista: [
        ['INPUT', 'Ganho de entrada. Muda o canal no salão e em todos os fones ao mesmo tempo.'],
        ['FILTER', 'Corte de graves e de agudos.'],
        ['GATE', 'Fecha o canal quando o som é fraco. Usado na bateria.'],
        ['COMP', 'Compressor do canal.'],
        ['INSERT', 'Efeito colocado direto no canal.'],
        ['MAIN', 'Envio do canal para o main e o pan.']
      ],
      ver: ['processamento', 'Gate e compressão'] },

    { id: 'equalizador', nome: 'Channel Equalizer', box: [666, 207, 1000, 292], nivel: 'warn',
      texto: [
        'O EQ do canal selecionado nos botões físicos, sem precisar da tela. Os botões giratórios ajustam as bandas e os botões de baixo escolhem se você mexe no ganho, na largura ou na frequência.',
        'Ao girar, a tela mostra qual banda e qual parâmetro está mudando. Confira antes de continuar.'
      ],
      dica: 'Na tela do EQ existe o BAND SOLO: ele deixa você ouvir no fone só a região da banda, para achar o problema.',
      ver: ['eq', 'Laboratório de EQ'] },

    { id: 'rapidos', nome: 'Atalhos do canal', box: [1034, 100, 1172, 292], nivel: 'warn',
      texto: [
        'Os botões de cima (ganho, gate, compressor, filtro, pan) escolhem o que aparece no display, e os quatro botões giratórios abaixo ajustam.',
        'É um jeito rápido de mexer sem trocar a tela principal. Vale a mesma regra: confira o nome do canal antes.'
      ] },

    { id: 'paginas', nome: 'Páginas da esquerda', box: [26, 394, 62, 626], nivel: 'ok',
      texto: ['Escolhem o que aparece nos 12 faders da esquerda. Trocar de página não muda o som, só o que aparece nos faders.'],
      lista: [
        ['1-12', 'Página 1: bateria, baixo, cello e violão.'],
        ['13-24', 'Página 2: guitarras, teclados, VS e os microfones.'],
        ['25-36 e 37-40', 'Páginas 3 e 4: DMs, PC, projeção. Ainda não levantadas.'],
        ['BUS MASTER', 'Os 16 buses: retornos, grupo da bateria e efeitos.'],
        ['USER 1 e 2', 'Camadas montadas pela equipe.'],
        ['Setas', 'Andam entre as camadas.']
      ],
      ver: ['canais', 'Lista de canais'] },

    { id: 'nomes', nome: 'Telas dos canais', box: [62, 306, 486, 362], nivel: 'info',
      texto: [
        'Nome, número e cor de cada canal da página atual. A barra colorida em cima ajuda a achar o canal de longe.',
        'Sempre confira o nome aqui antes de mexer no fader.'
      ] },

    { id: 'select-solo', nome: 'SELECT e SOLO', box: [62, 382, 486, 426], nivel: 'ok',
      texto: [
        'SELECT escolhe o canal que aparece na tela e nos controles de processamento. Não muda o som.',
        'SOLO manda o canal sozinho para o seu fone. Também não muda o salão. Desligue depois, ou use o CLR SOLO.'
      ] },

    { id: 'medidores', nome: 'Medidores', box: [62, 430, 486, 482], nivel: 'info',
      texto: [
        'Mostram o nível de cada canal. Verde é normal, amarelo é forte, vermelho é demais.',
        'A pessoa fala e o medidor não mexe: o problema é antes da mesa. O medidor está alto e parado sem ninguém tocar: pode ser microfonia.'
      ],
      ver: ['emergencia', 'Emergência'] },

    { id: 'mute', nome: 'MUTE', box: [62, 484, 486, 504], nivel: 'ok',
      texto: [
        'Desliga o canal. Botão aceso é canal desligado.',
        'Mute os microfones sem uso e abra antes de a pessoa falar. O bumbo in (canal 2) fica sempre mutado.'
      ] },

    { id: 'faders', nome: 'Faders', box: [62, 528, 486, 704], nivel: 'ok',
      texto: [
        'Volume de cada canal no salão. Com SENDS ON FADER ligado, viram o envio para o bus selecionado.',
        'Mexa aos poucos. A marca 0 é o ponto normal: abaixo dela você está abaixando o canal.'
      ] },

    { id: 'sof', nome: 'SOF FLIP (sends on faders)', box: [500, 392, 534, 416], nivel: 'ok',
      texto: [
        'Troca a função dos faders. Aceso: os faders mostram quanto de cada canal vai para o bus selecionado (um fone ou um efeito). Apagado: os faders são o volume do salão.',
        'Olhe este botão antes de mexer em qualquer fader.'
      ],
      ver: ['buses', 'Como mixar um bus'] },

    { id: 'camadas-centro', nome: 'Camadas do centro', box: [500, 420, 534, 626], nivel: 'ok',
      texto: ['Escolhem o que aparece nos 8 faders do centro.'],
      lista: [
        ['DCA', 'Os 8 DCAs da cena: Bateria, Cordas, Guitarras, Teclados, VS, Vocais, Lead e Banda. Cada um sobe e desce vários canais juntos; o MUTE dele muta todos de uma vez.'],
        ['MAIN MATRIX', 'Os mains e as matrizes.'],
        ['BUS IN', 'Entradas de bus.'],
        ['BUS MASTER', 'Os buses. É o jeito mais prático de selecionar um retorno para mixar.'],
        ['USER 1 e 2', 'Camadas montadas pela equipe.']
      ],
      dica: 'Canal baixo mesmo com o fader em cima: confira os DCAs.',
      ver: ['canais', 'O que é DCA'] },

    { id: 'centro', nome: 'Faders do centro', box: [538, 306, 812, 704], nivel: 'ok',
      texto: [
        'Oito faders com SELECT, SOLO, medidores e MUTE, iguais aos da esquerda. Mostram a camada escolhida nos botões ao lado.',
        'Deixar os buses aqui e os canais na esquerda permite mixar um retorno sem trocar de página.'
      ] },

    { id: 'custom', nome: 'Controles customizados', box: [822, 306, 1000, 622], nivel: 'warn',
      texto: [
        'Botões e botões giratórios que a equipe programa: tempo do delay, tamanho do reverb, liga e desliga de efeitos. O display mostra o que cada um faz.',
        'MUTE GROUPS mostra os grupos de mute. Um grupo acionado muta vários canais de uma vez: se ficou tudo mudo, olhe aqui.',
        'Quais funções estão programadas aí ainda falta levantar.'
      ] },

    { id: 'roda', nome: 'Setas e roda', box: [822, 624, 1000, 722], nivel: 'info',
      texto: ['Navegação na tela. As setas andam entre os itens e a roda grande muda o valor que está selecionado.'] },

    { id: 'camadas-direita', nome: 'Camadas da direita', box: [1000, 394, 1032, 626], nivel: 'info',
      texto: ['Escolhem o que aparece nos 4 faders da direita: MAIN MATRIX, DCA, INPUTS, AUX IN, BUS MASTER, USER 1 e 2. Normalmente ficam nos mains.'] },

    { id: 'mains', nome: 'Mains', box: [1034, 306, 1172, 704], nivel: 'warn',
      texto: [
        'O main é o som que vai para o P.A. e para a transmissão. Mexer aqui muda tudo de uma vez.',
        'Só em emergência (microfonia forte, susto) ou com orientação. Para ajustar um instrumento, mexa no canal dele.'
      ] }
  ];

  var ROTEIROS = [
    { id: 'achar', nome: 'Achar e ajustar um canal', passos: [
      ['paginas', 'Na esquerda, aperte 1-12 para ver a página 1 ou 13-24 para ver a página 2.'],
      ['nomes', 'Ache o canal pelo nome e pela cor na tela de cima.'],
      ['sof', 'Confira que o SOF está apagado. Aceso, o fader mexeria no fone de alguém.'],
      ['medidores', 'Veja se o medidor do canal mexe quando a pessoa toca ou fala.'],
      ['faders', 'Ajuste o fader aos poucos, ouvindo o salão.']
    ] },
    { id: 'fone', nome: 'Mixar o fone de um músico', passos: [
      ['camadas-centro', 'No centro, aperte BUS MASTER para os buses aparecerem nos faders do centro.'],
      ['centro', 'Aperte SELECT no bus da pessoa. Exemplo: bus 6, fone do mic verde.'],
      ['sof', 'Aperte SOF. O botão acende.'],
      ['paginas', 'Na esquerda, vá para a página do canal que a pessoa quer ouvir.'],
      ['faders', 'Suba aos poucos o fader desse canal. Agora ele é o fone da pessoa, não o salão. Pergunte se melhorou.'],
      ['sof', 'Aperte SOF de novo para sair. Os faders voltam para o salão.']
    ] },
    { id: 'talk', nome: 'Falar com um músico', passos: [
      ['monitor', 'Aperte o VIEW da seção de monitoração. A tela mostra os destinos do TALK A e do TALK B.'],
      ['tela', 'Na tela, marque para onde a voz vai: o bus de quem precisa ouvir (só o baixo: bus 1), vários buses, o main ou uma matrix.'],
      ['tela', 'Desmarque o que não deve ouvir, principalmente o main: marcado, a igreja e a transmissão ouvem você.'],
      ['monitor', 'Segure o TALK que você configurou e fale perto do microfone, dizendo com quem fala: "Baixo, vou subir o seu fone".'],
      ['monitor', 'Solte. O botão precisa apagar; se ficar aceso, aperte de novo.'],
      ['select-solo', 'Para ouvir a resposta, aperte SOLO no microfone do músico e escute no seu fone.'],
      ['clr-solo', 'Terminou: CLR SOLO para limpar o solo.']
    ] },
    { id: 'dca', nome: 'Subir um grupo pelo DCA', passos: [
      ['camadas-centro', 'No centro, aperte DCA. Os faders do centro passam a ser os DCAs.'],
      ['centro', 'Ache o DCA pelo nome na tela de cima: Bateria, Cordas, Guitarras, Teclados, VS, Vocais, Lead ou Banda.'],
      ['centro', 'Suba ou desça o fader do DCA: todos os canais dele mudam juntos, mantendo o equilíbrio.'],
      ['centro', 'O MUTE do DCA, embaixo do medidor dele, muta todos os canais dele. Confira que ficou apagado quando precisar deles.']
    ] },
    { id: 'microfonia', nome: 'Deu microfonia', passos: [
      ['faders', 'Baixe o fader do último canal que você subiu. Na dúvida, baixe os microfones de voz, um de cada vez.'],
      ['medidores', 'Procure o medidor alto e parado mesmo sem ninguém falar.'],
      ['mute', 'Mute os microfones que ninguém está usando.'],
      ['camadas-centro', 'Se o apito vem do palco, é o retorno de chão: BUS MASTER no centro, SELECT no bus 9.'],
      ['sof', 'Com o SOF aceso, baixe o microfone que está apitando. Depois saia do SOF.']
    ] },
    { id: 'eq', nome: 'Ajustar o EQ de um canal', passos: [
      ['select-solo', 'Aperte SELECT no canal. Se quiser ouvir só ele no fone, aperte SOLO também.'],
      ['tela', 'Confira o nome no topo da tela e abra o EQ.'],
      ['encoders', 'Escolha a banda e ajuste com os botões abaixo da tela. Corte antes de reforçar.'],
      ['equalizador', 'Ou use os botões físicos do Channel Equalizer. A tela mostra o que está mudando.'],
      ['clr-solo', 'Terminou: desligue o solo. O CLR SOLO apaga todos.']
    ] },
    { id: 'inicio', nome: 'Começo do culto', passos: [
      ['botoes-tela', 'Aperte LIBRARY e carregue a cena BASE A. Não salve nada.'],
      ['mute', 'Confira que o bumbo in (canal 2) está mutado.'],
      ['sof', 'Confira que o SOF está apagado.'],
      ['medidores', 'Teste os microfones pela cor, olhando os medidores.'],
      ['monitor', 'Ouça cada um no fone com SOLO. Depois use o CLR SOLO.']
    ] }
  ];

  var porId = {};
  AREAS.forEach(function (a) { porId[a.id] = a; });

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (k) { if (k) e.appendChild(k); });
    return e;
  }

  var raiz = document.getElementById('mesa-app');
  if (!raiz) return;

  var estado = { area: null, filtro: 'todos', roteiro: null, passo: 0, zoom: false };

  /* ---------- Estrutura ---------- */
  var chipsRot = el('div', { class: 'pick', role: 'group', 'aria-label': 'Roteiros' });
  var btnLivre = el('button', { type: 'button', 'aria-pressed': 'true', text: 'Explorar livre' });
  chipsRot.appendChild(btnLivre);
  ROTEIROS.forEach(function (r) {
    chipsRot.appendChild(el('button', { type: 'button', 'aria-pressed': 'false', 'data-r': r.id, text: r.nome }));
  });

  var chipsFiltro = el('div', { class: 'pick small', role: 'group', 'aria-label': 'Destacar por nível' });
  [['todos', 'Todas as áreas'], ['ok', NIVEIS.ok], ['warn', NIVEIS.warn], ['stop', NIVEIS.stop], ['info', NIVEIS.info]].forEach(function (f) {
    var b = el('button', { type: 'button', 'aria-pressed': f[0] === 'todos' ? 'true' : 'false', 'data-f': f[0] }, [
      f[0] !== 'todos' ? el('span', { class: 'lvl-dot lvl-' + f[0] }) : null,
      el('span', { text: f[1] })
    ]);
    chipsFiltro.appendChild(b);
  });

  var passoCard = el('div', { class: 'passo', hidden: '' });
  var palco = el('div', { class: 'palco' });
  var foto = el('img', { src: 'img/wing.png', alt: 'Behringer Wing vista de cima', width: String(W), height: String(H) });
  palco.appendChild(foto);
  var scroller = el('div', { class: 'palco-scroll' }, [palco]);
  var btnZoom = el('button', { type: 'button', class: 'btn', text: 'Ampliar a foto' });
  var painel = el('div', { class: 'painel', 'aria-live': 'polite' });
  var lista = el('div', { class: 'areas' });

  raiz.appendChild(el('div', { class: 'group' }, [el('h3', { text: 'Destacar' }), chipsFiltro]));
  raiz.appendChild(el('div', { class: 'group' }, [el('h3', { text: 'Roteiros' }), chipsRot]));
  raiz.appendChild(passoCard);
  raiz.appendChild(el('div', { class: 'group' }, [scroller, btnZoom]));
  raiz.appendChild(painel);
  raiz.appendChild(el('div', { class: 'group' }, [el('h3', { text: 'Todas as áreas' }), lista]));

  /* ---------- Áreas sobre a foto ---------- */
  var hs = {};
  var itens = {};
  AREAS.forEach(function (a) {
    var b = a.box;
    var h = el('button', {
      type: 'button', class: 'hs lvl-' + a.nivel, 'aria-label': a.nome, title: a.nome,
      style: 'left:' + (b[0] / W * 100) + '%;top:' + (b[1] / H * 100) + '%;width:' + ((b[2] - b[0]) / W * 100) + '%;height:' + ((b[3] - b[1]) / H * 100) + '%'
    });
    h.addEventListener('click', function () { escolher(a.id, false); });
    palco.appendChild(h);
    hs[a.id] = h;

    var item = el('button', { type: 'button', class: 'area-item' }, [
      el('span', { class: 'lvl-dot lvl-' + a.nivel }), el('span', { text: a.nome })
    ]);
    item.addEventListener('click', function () { escolher(a.id, true); });
    lista.appendChild(item);
    itens[a.id] = item;
  });

  function escolher(id, rolar) {
    estado.area = id;
    Object.keys(hs).forEach(function (k) {
      hs[k].classList.toggle('sel', k === id);
      itens[k].classList.toggle('sel', k === id);
    });
    renderPainel();
    if (rolar && hs[id]) {
      try { hs[id].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); } catch (e) { hs[id].scrollIntoView(); }
    }
  }

  function renderPainel() {
    painel.textContent = '';
    var a = porId[estado.area];
    if (!a) {
      painel.appendChild(el('p', { class: 'lead', text: 'Toque em uma área da foto ou na lista abaixo para ver o que ela faz.' }));
      return;
    }
    painel.appendChild(el('div', { class: 'painel-head' }, [
      el('h3', { class: 'painel-titulo', text: a.nome }),
      el('span', { class: 'nivel-chip lvl-' + a.nivel, text: NIVEIS[a.nivel] })
    ]));
    a.texto.forEach(function (t) { painel.appendChild(el('p', { text: t })); });
    if (a.lista) {
      var dl = el('dl', { class: 'teclas' });
      a.lista.forEach(function (par) {
        dl.appendChild(el('dt', { text: par[0] }));
        dl.appendChild(el('dd', { text: par[1] }));
      });
      painel.appendChild(dl);
    }
    if (a.dica) painel.appendChild(el('p', { class: 'note', text: a.dica }));
    if (a.ver) painel.appendChild(el('a', { class: 'ver', href: '#' + a.ver[0], text: 'Ver mais: ' + a.ver[1] }));
  }

  /* ---------- Filtro ---------- */
  chipsFiltro.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    estado.filtro = b.getAttribute('data-f');
    chipsFiltro.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    palco.setAttribute('data-filtro', estado.filtro);
  });
  palco.setAttribute('data-filtro', 'todos');

  /* ---------- Roteiros ---------- */
  chipsRot.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    chipsRot.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    var id = b.getAttribute('data-r');
    estado.roteiro = id ? ROTEIROS.filter(function (r) { return r.id === id; })[0] : null;
    estado.passo = 0;
    // Em tela estreita a foto inteira fica pequena demais para mostrar um botão.
    if (estado.roteiro && !estado.zoom && window.innerWidth < 700) btnZoom.click();
    renderPasso();
  });

  function renderPasso() {
    Object.keys(hs).forEach(function (k) { hs[k].classList.remove('pulsa'); });
    passoCard.textContent = '';
    var r = estado.roteiro;
    if (!r) { passoCard.hidden = true; palco.classList.remove('em-roteiro'); return; }
    passoCard.hidden = false;
    palco.classList.add('em-roteiro');
    var p = r.passos[estado.passo];
    var ant = el('button', { type: 'button', class: 'btn', text: 'Anterior' });
    var prox = el('button', { type: 'button', class: 'btn primario', text: estado.passo === r.passos.length - 1 ? 'Concluir' : 'Próximo' });
    ant.disabled = estado.passo === 0;
    ant.addEventListener('click', function () { estado.passo--; renderPasso(); });
    prox.addEventListener('click', function () {
      if (estado.passo === r.passos.length - 1) { btnLivre.click(); return; }
      estado.passo++; renderPasso();
    });
    passoCard.appendChild(el('div', { class: 'passo-head' }, [
      el('strong', { text: r.nome }),
      el('span', { text: 'Passo ' + (estado.passo + 1) + ' de ' + r.passos.length })
    ]));
    passoCard.appendChild(el('p', { class: 'passo-texto', text: p[1] }));
    passoCard.appendChild(el('div', { class: 'passo-nav' }, [ant, prox]));
    hs[p[0]].classList.add('pulsa');
    escolher(p[0], estado.zoom);
  }

  /* ---------- Zoom ---------- */
  btnZoom.addEventListener('click', function () {
    estado.zoom = !estado.zoom;
    palco.classList.toggle('zoom', estado.zoom);
    btnZoom.textContent = estado.zoom ? 'Foto inteira' : 'Ampliar a foto';
    if (estado.zoom && estado.area) escolher(estado.area, true);
  });

  renderPainel();
})();
