#!/usr/bin/env node
/**
 * VALIDAR.JS — conferência automática antes de publicar (V394)
 * ---------------------------------------------------------------
 * Rode na pasta do projeto:      node validar.js
 *
 * Por que existe: cada versão deste app já foi corrigida por auditorias, e a
 * mesma classe de erro voltava depois. Este arquivo guarda as REGRAS que não
 * podem quebrar — se algo aqui falhar, NÃO publique.
 *
 * Ele NÃO precisa de internet, login nem instalação: só Node e os arquivos
 * do projeto. Adicione uma checagem nova sempre que corrigir um bug de novo.
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const ler = (arq) => fs.readFileSync(path.join(DIR, arq), 'utf8');
const idx = ler('index.html');
const lnd = ler('landing.html');
const agents = ler('agents.md');
const rulesRaw = ler('database.rules.json');
// privacidade.html é o canal exigido pela LGPD: se ela apontar pra um contato
// que não existe mais, a promessa legal fica sem lastro.
const priv = fs.existsSync(path.join(DIR, 'privacidade.html')) ? ler('privacidade.html') : null;

const erros = [];
const avisos = [];
const ok = [];
const checar = (nome, condicao, dica) => {
    if (condicao) ok.push(nome);
    else erros.push(nome + (dica ? '  → ' + dica : ''));
};

// ─────────────────────────────────────────────────────────────
// 1. VERSÃO — os 3 lugares precisam bater
// ─────────────────────────────────────────────────────────────
const mTitle = idx.match(/<title>Madrid Casa Elevada \| Premium V(\d+)<\/title>/);
const mConst = idx.match(/const CURRENT_APP_VERSION = "(\d+)";/);
const mLog = idx.match(/console\.log\("LOG: Versão Premium V(\d+)"\);/);
checar('versão no <title>', !!mTitle, 'o título precisa terminar com "Premium V###"');
checar('versão em CURRENT_APP_VERSION', !!mConst);
checar('versão no console.log', !!mLog);
if (mTitle && mConst && mLog) {
    checar('as 3 versões são iguais',
        mTitle[1] === mConst[1] && mConst[1] === mLog[1],
        `título=V${mTitle[1]} const=V${mConst[1]} log=V${mLog[1]}`);
}
const VERSAO = mConst ? mConst[1] : '???';

// ─────────────────────────────────────────────────────────────
// 2. O ARQUIVO ABRE? (sintaxe do JS e equilíbrio do HTML)
// ─────────────────────────────────────────────────────────────
[['index.html', idx], ['landing.html', lnd]].forEach(([nome, txt]) => {
    [...txt.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach((m, i) => {
        try { new Function(m[1]); }
        catch (e) { erros.push(`${nome}: erro de sintaxe no script ${i + 1} — ${e.message}`); }
    });
    const abre = (txt.match(/<div\b/g) || []).length;
    const fecha = (txt.match(/<\/div>/g) || []).length;
    checar(`${nome}: <div> equilibrados`, abre === fecha, `${abre} abertos vs ${fecha} fechados`);
});
try { JSON.parse(rulesRaw); ok.push('database.rules.json é um JSON válido'); }
catch (e) { erros.push('database.rules.json inválido: ' + e.message); }

// ─────────────────────────────────────────────────────────────
// 3. SIGILO — o repositório e o site são PÚBLICOS
// ─────────────────────────────────────────────────────────────
// A lista de dados de cliente NÃO fica em claro aqui: este arquivo vive num
// repositório público, e os próprios sobrenomes eram o vazamento (auditoria
// 24/08/2026 — o guardião do sigilo entregava os nomes que devia esconder).
// Ela mora em dados-sensiveis.local.txt (no .gitignore; uma entrada por linha;
// # comenta). FALHA-FECHADA: sem o arquivo, o validador REPROVA — conferir
// sigilo sem a lista seria fingir que conferiu.
const ARQ_SIGILO = 'dados-sensiveis.local.txt';
let DADOS_CLIENTE = [];
// A dica muda conforme o problema real — "crie o arquivo" quando ele NÃO existe
// confundia quando ele existia mas estava vazio/corrompido (revisão 24/08).
let dicaSigilo = `crie ${ARQ_SIGILO} nesta pasta (identificadores sigilosos, um por linha; ` +
    `o conteúdo real está com o gestor e nos backups do banco)`;
if (fs.existsSync(path.join(DIR, ARQ_SIGILO))) {
    // Sobrenome acentuado salvo em ANSI viraria U+FFFD e NUNCA casaria — a
    // checagem ficaria verde sem conferir nada (falha-aberta). Melhor reprovar.
    const bruto = ler(ARQ_SIGILO).replace(/^\uFEFF/, '');
    if (bruto.includes('\uFFFD')) {
        dicaSigilo = `${ARQ_SIGILO} tem caracteres corrompidos (não é UTF-8) — abra no Bloco de Notas e salve de novo escolhendo UTF-8`;
    } else {
        DADOS_CLIENTE = bruto.split(/\r\n|\r|\n/)
            .map(l => l.trim().toUpperCase().normalize('NFC'))
            .filter(l => l && !l.startsWith('#'));
        dicaSigilo = `${ARQ_SIGILO} existe mas está sem entrada válida (uma por linha; # comenta; salve em UTF-8)`;
    }
}
checar('lista local de dados sigilosos carregada (falha-fechada)', DADOS_CLIENTE.length >= 1, dicaSigilo);

// Os .cmd entram na varredura: foi neles que o e-mail da conta dona vazou —
// sem isso na lista de arquivos, nada impedia o e-mail de voltar (revisão 24/08).
const bkpCmd = ler('backup-madrid.cmd');
const pubCmd = ler('publicar-regras.cmd');
[['index.html', idx], ['landing.html', lnd], ['agents.md', agents],
 ['backup-madrid.cmd', bkpCmd], ['publicar-regras.cmd', pubCmd]].forEach(([nome, txt]) => {
    // preços-base de unidade (formato 1234567.89) fora de comentário
    const semComentario = txt.split('\n').filter(l => !/^\s*(\/\/|\*|<!--)/.test(l)).join('\n');
    const precos = semComentario.match(/valor: \d{6,7}\.\d+/g) || [];
    checar(`${nome}: sem preço de unidade no código`, precos.length === 0,
        precos.length + ' preço(s) encontrado(s) — os valores vivem só no Firebase');
    // tabela de preços formatada (agents.md). Comentários explicativos não contam
    // — o que não pode é preço REAL de unidade servido ao visitante.
    // V399 (auditoria): a forma antiga só via preço >= 1 milhão — 950.000,00
    // passava com o validador verde. Agora pega também XXX.XXX,XX (o 55.000,00
    // da vaga extra tem 2 dígitos antes do ponto e continua permitido).
    const formatados = (semComentario.match(/\d\.\d{3}\.\d{3},\d{2}|\d{3}\.\d{3},\d{2}/g) || []);
    checar(`${nome}: sem tabela de preços formatada`, formatados.length === 0,
        formatados.slice(0, 3).join(', '));
    // dados sigilosos (a lista vem de fora do repositório — ver topo da seção 3).
    // normalize('NFC') nos dois lados: um acento decomposto (arquivo vindo de
    // Mac) casaria byte diferente e passaria batido.
    const alvoSigilo = txt.toUpperCase().normalize('NFC');
    DADOS_CLIENTE.forEach(t => {
        if (alvoSigilo.includes(t)) erros.push(`${nome}: DADO SIGILOSO no código ("${t}")`);
    });
    const cpfs = (txt.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/g) || []).filter(c => c !== '000.000.000-00');
    if (cpfs.length) erros.push(`${nome}: CPF no código (${cpfs.join(', ')})`);
});
checar('landing sem valores em R$', !/R\$/.test(lnd),
    'regra do gestor: nenhum valor financeiro na página pública');

// ─────────────────────────────────────────────────────────────
// 4. DINHEIRO — regras que já quebraram antes
// ─────────────────────────────────────────────────────────────
checar('multiplicador do INCC nunca fica nulo',
    /state\.globalMultiplier = \(isFinite\(m\) && m > 0\) \? m : 1;/.test(idx),
    'sem isso, toda a tela e o PDF saem R$ 0,00 (V390)');
checar('preço ausente vira travessão, não R$ 0,00',
    /precoTexto: \(v\) => \{ const n = Number\(v\); return \(isFinite\(n\) && n > 0\) \?/.test(idx));
checar('proposta bloqueada quando a unidade está sem preço',
    /if \(AppCore\.precoUnidade\(state\.selectedUnit\) === null\) \{/.test(idx));
checar('data de entrega em constante única',
    /const ENTREGA = \{ ano: \d{4}, mes: \d+, dia: \d+ \};/.test(idx),
    'não escrever a data solta — usar ENTREGA_BR / ENTREGA_ISO / ENTREGA_DATE');
checar('nenhuma parcela vence depois da entrega',
    (idx.match(/_capEntrega\(AppSim\._isoDate\(/g) || []).length === 3,
    'sinal, mensais e balões precisam passar pelo _capEntrega (V387)');
// V400 (aval do gestor): mês sem o dia usa o ÚLTIMO dia — gerar dia 29-31
// perto de fevereiro pulava um mês e empilhava duas parcelas no mesmo.
checar('soma de mês não transborda o dia (29-31 vira último dia do mês)',
    // As TRÊS linhas do clamp, pinadas: revisão da V400 provou por mutação que
    // sem a âncora do dia 1, um revert parcial dava 31/03 (PIOR que o bug
    // original) com o validador verde.
    /const alvo = new Date\(base\.getFullYear\(\), base\.getMonth\(\) \+ n, 1\);/.test(idx) &&
    /const ultimo = new Date\(alvo\.getFullYear\(\), alvo\.getMonth\(\) \+ 1, 0\)\.getDate\(\);/.test(idx) &&
    /alvo\.setDate\(Math\.min\(base\.getDate\(\), ultimo\)\);/.test(idx),
    'o _addMonths perdeu o clamp — 31/01 volta a virar 03/03 no PDF do cliente');
checar('remover usuário lembra o 2º passo da demissão (Disable no Auth)',
    /2º PASSO OBRIGATÓRIO/.test(idx),
    'sem o aviso, a conta demitida segue com acesso à carteira dela');
checar('colunas da tabela seguem o percentual, não o nome do plano',
    (idx.match(/const showM = pMensal > 0;/g) || []).length === 2,
    'plano "Personalizado" escondia parcelas na tela e no PDF (V392)');
checar('vaga avulsa reajusta com a tabela',
    /getExtraVagaUnit: \(\) => EXTRA_VAGA_PRICE \* \(state\.globalMultiplier \|\| 1\)/.test(idx),
    'decisão do gestor na V387');
checar('rótulo das vagas extras é único nos 3 documentos',
    (idx.match(/AppSim\._rotuloVagas\(d\)/g) || []).length === 3,
    'PDF, WhatsApp e Excel precisam contar a mesma história (V392)');

// ─────────────────────────────────────────────────────────────
// 5. NÃO PERDER TRABALHO
// ─────────────────────────────────────────────────────────────
checar('gravação da proposta tem prazo de resposta',
    /return Promise\.race\(\[confirmada, timeout\]\);/.test(idx),
    'sem isso o app fica "salvando" para sempre offline (V386)');
// V399: a pendência inclui também o rascunho da OBRA (AppObra._dirty).
checar('logout de inatividade não descarta gravação em voo nem rascunho da obra',
    /if \(\(AppDB\._gravacoesPendentes > 0 \|\| \(window\.AppObra && AppObra\._dirty\)\) && adiamentos < MAX_ADIAMENTOS\)/.test(idx));
checar('adiamento do logout tem teto', /const MAX_ADIAMENTOS = \d+;/.test(idx),
    'sem teto a sessão nunca encerra (V391)');
checar('mudança de status confere quem mexeu antes',
    /\{ esperado: AppCore\._detStatusRender \}/.test(idx),
    'evita desfazer venda feita em outro acesso (V391)');
checar('reserva grava o status ANTES dos dados do cliente',
    /Promise\.race\(\[AppCore\.changeUnitStatus\(apt, 'reservado', \{ esperado: 'livre' \}\), novoPrazo\(\)\]\)/.test(idx) &&
    // Revisão V399: a 2ª gravação também precisa do prazo PRÓPRIO (o objeto
    // único reusado herdava o resto dos 8s).
    /reservaPayload\), novoPrazo\(\)\]/.test(idx),
    'a ordem inversa apagava a reserva de outro gestor (V391)');
// V399: e o timeout não pode voltar a jurar "Nada foi alterado" — a transação
// segue na fila do SDK e pode commitar quando a conexão volta.
checar('mensagem de timeout da reserva é honesta',
    /a gravação ainda NÃO foi confirmada — ela pode ser aplicada sozinha/.test(idx) ||
    /ATENÇÃO: a gravação ainda NÃO foi confirmada/.test(idx),
    'o timeout de reserva voltou a prometer "Nada foi alterado"');
checar('cronograma da obra avisa antes de descartar',
    /Você tem alterações NÃO SALVAS no cronograma/.test(idx));

// ─────────────────────────────────────────────────────────────
// 6. CONTATO — se o número quebrar, o lead some sem ninguém notar
// ─────────────────────────────────────────────────────────────
// Números que o gestor já usou e desativou. Voltar a um deles manda o lead
// para uma linha que ninguém atende — e nada na tela denuncia isso.
// V405 (auditoria): só os 4 últimos dígitos — o número inteiro não precisa viver
// num arquivo do repositório público (basta pra reconhecer o reuso).
const APOSENTADOS_SUFIXO = ['9009'];   // aposentado em 17/08/2026

// Pega a declaração REAL (ignora linha comentada): se alguém deixar a antiga
// comentada logo acima, um match simples leria o número velho e aprovaria tudo.
const linhasWa = lnd.split('\n')
    .filter(l => /const WHATSAPP_NUM = '\d+';/.test(l) && !/^\s*(\/\/|\*|<!--)/.test(l));
checar('o número de WhatsApp está declarado uma vez só', linhasWa.length === 1,
    linhasWa.length === 0
        ? "não achei a linha: const WHATSAPP_NUM = '55DDD9XXXXXXXX';"
        : `achei ${linhasWa.length} declarações ativas — o navegador nem carrega a página assim`);
const mWa = linhasWa.length === 1 ? linhasWa[0].match(/'(\d+)'/) : null;
if (mWa) {
    checar('número de WhatsApp no formato que o wa.me aceita',
        /^55\d{2}9\d{8}$/.test(mWa[1]),
        `"${mWa[1]}" — tem que ser 55 + DDD (2) + 9 + 8 dígitos, só números. ` +
        'Faltando o 9 do celular, o link abre em erro e TODO lead se perde calado');
    checar('não voltou para um número aposentado',
        !APOSENTADOS_SUFIXO.some(s => mWa[1].endsWith(s)),
        `${mWa[1]} foi desativado — o gestor não atende mais nele`);
}
// V397: a regra mudou de "proibido escrever o número" para "todo número escrito
// É o da constante". Motivo: os href precisam do número literal como fallback
// sem-JS (antes eram href="#" — sem JS, nenhum botão de WhatsApp funcionava).
// A segurança continua a mesma: número divergente da constante REPROVA, então
// trocar o número num lugar só ainda quebra o validador até acertar todos.
if (mWa) {
    const numsLnd = [
        ...[...lnd.matchAll(/wa\.me\/(\d+)/g)].map(m => m[1]),
        ...[...lnd.matchAll(/tel:\+(\d+)/g)].map(m => m[1]),
    ];
    const numsErrados = [...new Set(numsLnd.filter(n => n !== mWa[1]))];
    checar('todo contato escrito na landing é o número da constante',
        numsLnd.length > 0 && numsErrados.length === 0 && !/api\.whatsapp\.com/.test(lnd),
        numsLnd.length === 0
            ? 'os href de WhatsApp voltaram a ser "#" — sem JS nenhum botão funciona'
            : `número(s) divergente(s): ${numsErrados.join(', ')} — a constante diz ${mWa[1]}`);
    // O número visível no rodapé (o que a pessoa copia pra ligar) tem que ser
    // o mesmo — formatado, mas o MESMO.
    const mFone = lnd.match(/id="footFoneNum">([^<]+)</);
    checar('o telefone por extenso no rodapé bate com a constante',
        !!mFone && '55' + mFone[1].replace(/\D/g, '') === mWa[1],
        mFone ? `o rodapé mostra "${mFone[1]}" mas a constante é ${mWa[1]}` : 'o rodapé perdeu o telefone por extenso (id="footFoneNum")');
}

if (mWa && priv) {
    const numsPriv = [...priv.matchAll(/wa\.me\/(\d+)/g)].map(m => m[1]);
    checar('a política de privacidade oferece um contato real',
        numsPriv.length > 0 && numsPriv.every(n => n === mWa[1]),
        numsPriv.length === 0
            ? 'privacidade.html não tem link de WhatsApp — a LGPD pede um canal que funcione'
            : `privacidade.html aponta para ${[...new Set(numsPriv)].join(', ')} em vez de ${mWa[1]}`);
}

// O book em PDF é baixado e REENCAMINHADO por fora do site: se ele guardar o
// número velho, trocar a constante não adianta e ninguém percebe. O jsPDF grava
// o texto sem compressão, então dá para conferir lendo o binário.
const bookArq = path.join(DIR, 'book-madrid.pdf');
if (mWa && fs.existsSync(bookArq)) {
    const pdf = fs.readFileSync(bookArq, 'latin1');
    const semDDI = mWa[1].slice(2);                       // 77981346775
    const impressos = [...pdf.matchAll(/\((?:[^()\\]|\\.)*\)\s*Tj/g)]
        .map(m => m[0].slice(1, m[0].lastIndexOf(')')))
        .filter(t => /\d{4}\s?-\s?\d{4}/.test(t));        // o que parece telefone
    const errados = impressos.filter(t => t.replace(/\D/g, '') !== semDDI);
    checar('o book em PDF traz o número atual',
        impressos.length > 0 && errados.length === 0,
        impressos.length === 0
            ? 'o book não imprime telefone nenhum — quem baixa fica sem contato'
            : `o book imprime "${errados.join('" / "')}" — regere com scratchpad/gerar_book.js`);
    checar('o número do book é clicável e aponta pro atual',
        pdf.includes('/URI (https://wa.me/' + mWa[1] + ')'),
        'a anotação de link do PDF ficou com outro número (ou sumiu)');
}

// Lê uma constante de configuração do HTML. Aceita aspas simples, duplas ou
// crase, com espaçamento livre, e IGNORA linha comentada.
//
// Por que tanto cuidado: a primeira versão desta função só aceitava um tipo de
// aspa. Quem colasse o ID com o outro tipo — a convenção usada no MESMO arquivo,
// duas linhas acima — fazia a checagem "não encontrar" e concluir DESLIGADO.
// Ou seja: o portão aprovava exatamente o que ele existe para barrar. Agora,
// "não encontrei" é ERRO, nunca "está desligado" (falha fechada, não aberta).
const lerConst = (txt, nome) => {
    const linhas = txt.split('\n')
        .filter(l => !/^\s*(\/\/|\*|<!--)/.test(l))
        .filter(l => new RegExp('const\\s+' + nome + '\\s*=').test(l));
    if (linhas.length !== 1) return { achou: false, quantas: linhas.length, valor: null };
    const m = linhas[0].match(new RegExp('const\\s+' + nome + '\\s*=\\s*([\'"`])([\\s\\S]*?)\\1'));
    return m ? { achou: true, quantas: 1, valor: m[2].trim() } : { achou: false, quantas: 1, valor: null };
};

// A política de privacidade é linkada pela landing e pelo sitemap. Sumir com
// ela deixa dois links mortos numa página que promete LGPD — isso é erro.
checar('privacidade.html existe', priv !== null,
    'a landing e o sitemap.xml apontam para ela — sem o arquivo, os links morrem');

// App Check só pode ser exigido no console quando as DUAS páginas mandam token.
// Com a chave só no app dos corretores, ligar a exigência apaga o cronograma da
// landing e recusa o formulário de lead — e nada no código denuncia isso.
const acApp = lerConst(idx, 'APP_CHECK_SITE_KEY');
const acLnd = lerConst(lnd, 'APP_CHECK_SITE_KEY');
checar('as duas páginas têm o campo do App Check',
    acApp.achou && acLnd.achou,
    'não achei uma declaração única de APP_CHECK_SITE_KEY em ' +
    (!acApp.achou ? `index.html (${acApp.quantas} linha[s])` : `landing.html (${acLnd.quantas} linha[s])`));
if (acApp.achou && acLnd.achou) {
    checar('a chave do App Check é a mesma nas duas páginas', acApp.valor === acLnd.valor,
        acApp.valor && !acLnd.valor ? 'só o index.html tem a chave — exigir App Check derruba a landing pública'
            : (!acApp.valor && acLnd.valor ? 'só a landing tem a chave — o app dos corretores fica de fora'
                : 'as chaves são diferentes'));

    if (acApp.valor && acApp.valor === acLnd.valor) {
        // Chave preenchida = App Check vai pra valer. Três coisas precisam estar
        // no lugar ANTES de o dono marcar "Enforced" no console, e nenhuma delas
        // aparece na tela quando falta: o site simplesmente para de ler o banco.
        const SDK = 'firebase-app-check-compat.js';
        checar('o SDK do App Check está nas duas páginas',
            idx.includes(SDK) && lnd.includes(SDK),
            'falta a tag <script> do ' + SDK + ' em ' + (idx.includes(SDK) ? 'landing.html' : 'index.html') +
            ' — com a chave preenchida e sem o SDK, a página não gera token e o banco recusa tudo');
        const csp = (idx.match(/Content-Security-Policy"\s+content="([\s\S]*?)"/) || [])[1] || '';
        const bloco = (nome) => (csp.match(new RegExp(nome + '([^;]*)')) || [])[1] || '';
        checar('a CSP do app libera o reCAPTCHA',
            bloco('script-src').includes('https://www.google.com') &&
            bloco('frame-src').includes('https://www.google.com'),
            'o reCAPTCHA v3 carrega de www.google.com; sem ele em script-src E frame-src ' +
            'a CSP bloqueia calado e NENHUM corretor consegue usar o app com App Check exigido');
        checar('o reCAPTCHA está declarado na política de privacidade',
            !!priv && /reCAPTCHA/i.test(priv),
            'App Check ligado usa o reCAPTCHA do Google, que grava cookie — a política precisa dizer isso');
    }
    if (!acApp.valor && !acLnd.valor) ok.push('App Check preparado nas duas páginas, ainda desligado');
}

// Rastreamento não declarado é problema de LGPD, não de código: se o ID estiver
// preenchido, a política PRECISA citar o serviço antes de a página ir ao ar.
const medicao = [
    { const: 'GA_ID', nome: 'Google Analytics', termos: ['Google Analytics', 'GA4'] },
    { const: 'PIXEL_ID', nome: 'Meta (Facebook) Pixel', termos: ['Facebook', 'Meta Pixel', 'Meta (Facebook)'] },
];
medicao.forEach(m => {
    const c = lerConst(lnd, m.const);
    checar(`o campo ${m.const} existe uma vez só na landing`, c.achou,
        `não achei uma declaração única de ${m.const} — sem ela eu não consigo saber se ` +
        'o rastreamento está ligado, e não vou aprovar no escuro');
    if (!c.achou) return;
    if (!c.valor) { ok.push(`${m.nome} desligado (nenhum cookie criado)`); return; }
    checar(`${m.nome} está declarado na política de privacidade`,
        !!priv && m.termos.some(t => priv.includes(t)),
        `${m.const} está preenchido, mas privacidade.html não cita "${m.termos[0]}" — ` +
        'ligar rastreamento sem declarar é o tipo de coisa que a LGPD pune');
});

// A grade da galeria usa fotos-mini/. Adicionar foto em galleryFiles sem rodar
// `node gerar-miniaturas.js` deixa um quadrado quebrado no site publico — e o
// erro so aparece para quem visita, nunca para quem publicou.
(function () {
    const ini = lnd.indexOf('galleryFiles');
    const fim = lnd.indexOf('];', ini);
    if (ini < 0 || fim < 0) { erros.push('não achei a lista galleryFiles na landing.html'); return; }
    const fotos = [...new Set([...lnd.slice(ini, fim).matchAll(/src: *['"`]([^'"`]+)['"`]/g)].map(m => m[1]))];
    checar('a galeria tem fotos listadas', fotos.length > 0);
    const semMini = fotos.filter(f => !fs.existsSync(path.join(DIR, 'fotos-mini', f.replace(/[.](jpeg|png)$/i, '.jpg'))));
    checar('toda foto da galeria tem miniatura', semMini.length === 0,
        semMini.length + ' sem miniatura (' + semMini.slice(0, 4).join(', ') + ') — rode: node gerar-miniaturas.js');
    const semOriginal = fotos.filter(f => !fs.existsSync(path.join(DIR, f)));
    checar('toda foto da galeria tem o arquivo original', semOriginal.length === 0,
        'o lightbox abre o original: ' + semOriginal.slice(0, 4).join(', ') + ' não existe(m)');
    checar('a grade usa a miniatura, não o arquivo grande',
        lnd.includes('<img src="${miniatura(g.src)}"'),
        'a grade voltou a apontar para o original — 8 MB por visita');
})();

// O resto deste arquivo confere o DISCO. Mas o site é servido pelo GitHub Pages
// a partir do que está no REPOSITÓRIO: arquivo que existe aqui e não foi
// versionado responde 404 no ar. Foi exatamente o risco das miniaturas — a pasta
// fotos-mini/ nasceu fora do versionamento e todas as checagens passavam, porque
// olhavam a máquina que já funciona em vez de olhar o que vai ao ar.
(function () {
    let rastreados = null;
    try {
        const saida = require('child_process').execSync('git ls-files -z', {
            cwd: DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 8 * 1024 * 1024
        });
        rastreados = new Set(saida.split('\0').map(x => x.trim()).filter(Boolean));
    } catch (e) { rastreados = null; }

    if (!rastreados || rastreados.size === 0) {
        avisos.push('não consegui perguntar ao git quais arquivos estão versionados — confira à mão se todo arquivo novo entrou no commit');
        return;
    }

    // todo arquivo local que a landing referencia
    const refs = new Set();
    const juntar = (re, grupo) => { for (const m of lnd.matchAll(re)) refs.add(m[grupo]); };
    juntar(/src="([^"${}]+.(?:jpe?g|png|mp4|pdf))"/gi, 1);
    juntar(/href="([^"${}]+.(?:jpe?g|png|mp4|pdf))"/gi, 1);
    juntar(/src: *['"`]([^'"`${}]+[.](?:jpe?g|png))['"`]/gi, 1);
    // as miniaturas correspondentes (a grade monta o caminho por JS)
    [...refs].forEach(f => {
        if (f.indexOf('fotos-mini/') === 0) return;
        const mini = 'fotos-mini/' + f.replace(/[.](jpeg|png)$/i, '.jpg');
        if (fs.existsSync(path.join(DIR, mini))) refs.add(mini);
    });

    // V399 (auditoria): arquivos que o JS injeta em runtime não aparecem nos
    // atributos do HTML — lista explícita do que o varredor não enxerga.
    ['fachada-video.mp4'].forEach(f => refs.add(f));

    const fora = [...refs].filter(f => !rastreados.has(f));
    // Logo de parceiro que a arte AINDA NÃO CHEGOU (nem existe no disco) = AVISO:
    // o cartão do decorado mostra só o nome e o JS esconde o logo que falta.
    // MAS logo que EXISTE no disco e está sem `git add` = ERRO que trava — é o
    // "esqueci de versionar → 404 no ar", o mesmo buraco do fotos-mini (a rede
    // de segurança deste bloco existe justamente pra isso). Revisão 27/08: a 1ª
    // versão rebaixava os dois casos a aviso e deixava publicar 14 logos untracked.
    const parceirosPendentes = fora.filter(f => /^parceiros\//i.test(f) && !fs.existsSync(path.join(DIR, f)));
    const foraQueTrava = fora.filter(f => !parceirosPendentes.includes(f));
    checar('todo arquivo que a landing usa está versionado', foraQueTrava.length === 0,
        foraQueTrava.length + ' fora do repositório (' + foraQueTrava.slice(0, 5).join(', ') + ') — no disco mas sem git add (daria 404 no ar). Rode: git add -A');
    if (parceirosPendentes.length) {
        avisos.push('faltam ' + parceirosPendentes.length + ' logo(s) de parceiro (a arte ainda não chegou; o cartão mostra só o nome): ' + parceirosPendentes.join(', '));
    }

    ['gerar-miniaturas.js', 'validar.js', 'privacidade.html'].forEach(f => {
        if (fs.existsSync(path.join(DIR, f))) {
            checar(f + ' está versionado', rastreados.has(f),
                'existe na sua máquina mas não no repositório — some para quem clonar');
        }
    });
})();

// ─────────────────────────────────────────────────────────────
// 7. ACESSO
// ─────────────────────────────────────────────────────────────
// V397-fix (revisão): o replace tem que levar a QUERY junto — o anúncio aponta
// pro endereço curto com ?utm_source=..., e jogar o search fora matava a
// atribuição de campanha em silêncio.
checar('endereço curto leva o visitante à landing com âncora E query',
    /window\.__madridIndoLanding = true;/.test(idx) && /location\.replace\('landing\.html' \+ location\.search \+ location\.hash\);/.test(idx));
// V397: o portão testava "tem âncora?" — /#galeria jogava o CLIENTE na tela de
// login. Só o deep-link real do push (#agenda) pode abrir o app.
checar('só a âncora #agenda abre o app (o resto é âncora da landing)',
    /q\.has\('app'\) \|\| location\.hash === '#agenda'/.test(idx));
checar('recarregamento de versão preserva o passe do corretor',
    /q\.set\('app', '1'\);/.test(idx));
checar('aprovação de acesso dá papel de corretor (nunca gestor)',
    /database\.ref\('madrid_data\/permissions\/' \+ enc\)\.set\(AppAuthManager\._entradaPermissao\(email, 'corretor'/.test(idx));
checar('gestor não consegue se auto-rebaixar/remover',
    (idx.match(/Você não pode rebaixar a própria conta/g) || []).length === 2 &&
    /Você não pode remover a própria conta/.test(idx));

// ─────────────────────────────────────────────────────────────
// 8. REGRAS DO FIREBASE — sintaxe que o motor aceita
// ─────────────────────────────────────────────────────────────
if (/indexOf\(|numChildren\(/.test(rulesRaw)) {
    erros.push('database.rules.json usa indexOf/numChildren — o motor de regras NÃO tem esses métodos (o publish falha)');
} else ok.push('rules sem métodos inexistentes (indexOf/numChildren)');
(function () {
    const expr = [];
    (function varre(no) {
        if (!no || typeof no !== 'object') return;
        Object.keys(no).forEach(k => {
            if (['.read', '.write', '.validate'].includes(k) && typeof no[k] === 'string') expr.push(no[k]);
            else if (!k.startsWith('.')) varre(no[k]);
        });
    })(JSON.parse(rulesRaw).rules);
    const desbalanceadas = expr.filter(e => {
        let n = 0;
        for (const c of e) { if (c === '(') n++; else if (c === ')') n--; if (n < 0) return true; }
        return n !== 0;
    });
    checar('rules com parênteses equilibrados', desbalanceadas.length === 0,
        desbalanceadas.length + ' expressão(ões) quebrada(s)');
})();

// ─────────────────────────────────────────────────────────────
// 8b. V397 — o que a rodada "mais seguro, mais prático, mais bonito" travou
// ─────────────────────────────────────────────────────────────
// (a) O formulário da landing e a lista de campos aceitos nas rules têm que
//     andar JUNTOS: se a landing mandar um campo fora da lista, o dia em que
//     o gestor publicar as regras o formulário passa a falhar EM SILÊNCIO.
(function () {
    const rules = JSON.parse(rulesRaw);
    const li = rules.rules && rules.rules.madrid_data && rules.rules.madrid_data.leads_inbox;
    const lead = li && li['$leadId'];
    checar('leads_inbox fecha campos desconhecidos ($other)',
        !!lead && !!lead['$other'] && lead['$other']['.validate'] === false,
        'sem "$other": um robô grava campos de megabytes por fora do formulário');
    // Campos que a landing (submitLead) e o app (_registrarSolicitacao) enviam:
    const enviados = ['nome', 'telefone', 'email', 'interesse', 'mensagem', 'origem', 'status', 'ts', 'ua', 'referrer', 'utm'];
    const semRegra = lead ? enviados.filter(c => !lead[c]) : enviados;
    checar('todo campo que o formulário envia está na lista das rules',
        semRegra.length === 0,
        `campo(s) sem regra: ${semRegra.join(', ')} — com $other fechado, o push seria recusado`);
})();
// (b) Histórico de login e de reajuste viram prova: ninguém apaga, ninguém
//     assina pelo outro.
checar('logs: sem .write no nível que permitiria apagar tudo',
    !JSON.parse(rulesRaw).rules.madrid_data.logs['.write'],
    'o .write no nó logs deixa qualquer corretor apagar o histórico inteiro');
checar('price_history é só-acrescenta e assinado por quem gravou',
    /!data\.exists\(\) && newData\.exists\(\)/.test(JSON.stringify(JSON.parse(rulesRaw).rules.madrid_data.price_history)) &&
    JSON.parse(rulesRaw).rules.madrid_data.price_history['$snapId'].user['.validate'].includes('auth.token.email'),
    'reajuste de preço apagável/assinável por outro = sistema não sustenta a versão de ninguém');
// (c) Proteções da página pública: CSP + anti-iframe nos DOIS HTMLs públicos
//     (o GitHub Pages não manda cabeçalho nenhum — conferido no ar em 19/08).
checar('landing tem CSP em <meta>', /Content-Security-Policy/.test(lnd),
    'a landing voltou a ficar sem CSP — única defesa possível no GitHub Pages');
checar('landing tem anti-iframe (frame-ancestors não funciona em meta)',
    /window\.top !== window\.self/.test(lnd));
if (priv) {
    checar('privacidade tem CSP em <meta>', /Content-Security-Policy/.test(priv));
    checar('privacidade tem anti-iframe', /window\.top !== window\.self/.test(priv));
}
// (d) A documentação interna NÃO pode voltar ao ar: o _config.yml usa o Jekyll
//     do GitHub Pages pra tirar esses arquivos do site (ficam só no repo).
(function () {
    const cfgPath = path.join(DIR, '_config.yml');
    if (!fs.existsSync(cfgPath)) {
        erros.push('_config.yml sumiu — agents.md, HISTORICO.md e as rules voltam a ser baixáveis do site');
        return;
    }
    const cfg = ler('_config.yml');
    // V397-fix (revisão): a lista tem que cobrir TUDO que o _config.yml exclui —
    // com 9 de 12 conferidos, SECURITY.md, PUSH_SETUP.md e gerar-miniaturas.js
    // podiam sumir do exclude e voltar ao ar sem o validador reclamar.
    const devemSumir = ['agents.md', 'HISTORICO.md', 'SECURITY-SETUP.md', 'SECURITY.md', 'PUSH_SETUP.md',
        'database.rules.json', 'publicar-regras.cmd', 'backup-madrid.cmd', 'validar.js',
        'gerar-miniaturas.js', 'firebase.json', 'functions/'];
    const fora = devemSumir.filter(f => !new RegExp('^\\s*-\\s*' + f.replace(/[.\/]/g, '\\$&') + '\\s*$', 'm').test(cfg));
    checar('a documentação interna está excluída do site (_config.yml)',
        fora.length === 0, `faltando no exclude: ${fora.join(', ')}`);
    const nuncaExcluir = ['landing.html', 'index.html', 'privacidade.html', 'book-madrid.pdf', 'robots.txt', 'sitemap.xml', 'CNAME', 'firebase-messaging-sw.js', 'fotos-mini'];
    const excluidoErrado = nuncaExcluir.filter(f => new RegExp('^\\s*-\\s*' + f.replace(/[.\/]/g, '\\$&'), 'm').test(cfg));
    checar('nenhuma página/foto do site foi excluída por engano',
        excluidoErrado.length === 0, `REMOVA do exclude: ${excluidoErrado.join(', ')}`);
})();
// (e) O cronograma da landing tem que continuar leitura pontual (.once) — o
//     .on segura 1 conexão por visitante e o teto do plano é 100, dividido
//     com o app dos corretores.
checar('cronograma da landing lê com .once (não segura conexão)',
    /madrid_data\/cronograma'\)\.once\('value'\)/.test(lnd) && !/madrid_data\/cronograma'\)\.on\(/.test(lnd),
    'voltou o .on(\'value\') — cada visitante vira uma conexão presa no teto de 100');

// ─────────────────────────────────────────────────────────────
// 8b. NOME NAS CONTAS (V398) — o nome tem que sobreviver ao caminho
//     cadastro → aprovação → EQUIPE, e o set() não pode apagá-lo.
// ─────────────────────────────────────────────────────────────
// A rule do nome tem que estar pendurada em ".write" E exigir que a entrada
// JÁ tenha papel — sem isso, escrever o nome MATERIALIZA a entrada e todas as
// leituras do banco que liberam por .exists() (units, statusMap, reservas,
// agenda, master_admins) abrem pra conta não aprovada. Achado g9 da V398.
const rulesFlat = rulesRaw.replace(/\s+/g, ' ');
checar('rules: dono escreve só o próprio nome — e só se JÁ tem papel',
    // V405: a cláusula email_verified entrou entre o auth != null e a chave.
    /"nome": \{ "\.write": "auth != null && auth\.token\.email_verified === true && \$emailKey === auth\.token\.email/.test(rulesFlat) &&
    /&& data\.parent\(\)\.child\('role'\)\.exists\(\)/.test(rulesFlat),
    'sem o exists(role) no .write, conta não aprovada se auto-provisiona e lê o banco inteiro');
checar('rules: validate do nome exige tamanho 2..80 E entrada com papel',
    /newData\.isString\(\) && newData\.val\(\)\.length >= 2 && newData\.val\(\)\.length <= 80 && newData\.parent\(\)\.child\('role'\)\.exists\(\)/.test(rulesFlat),
    'o validate é a segunda tranca contra o nó órfão só-com-nome');
// Contagem POSITIVA: todo set de OBJETO em /permissions passa pelo helper.
// (Os sets de valor único em …/nome' não entram na conta — regex exige ")" logo
// antes do .set.) Lista negra de literal já falhou aberto uma vez.
const setsPerm = (idx.match(/permissions\/(?:' \+ \w+\)|\$\{\w+\}`\))\.set\(/g) || []).length;
const setsOk = (idx.match(/permissions\/(?:' \+ \w+\)|\$\{\w+\}`\))\.set\(AppAuthManager\._entradaPermissao\(/g) || []).length;
// V399: a troca de e-mail virou update atômico multi-caminho — são 3 sets de
// objeto (addUser, changeRole, approveRequest) + o mover, que também usa o helper.
checar('toda gravação de permissão passa por _entradaPermissao (preserva o nome)',
    setsPerm === setsOk && setsPerm >= 3 && !/permissions\/[^\n)]{0,40}\)\.update\(/.test(idx) &&
    /mover\[newKey\] = AppAuthManager\._entradaPermissao\(/.test(idx) &&
    // Revisão V399: update no NÓ RAIZ de permissions só pode existir 1 (o mover).
    (idx.match(/permissions'\)\.update\(/g) || []).length === 1,
    `${setsOk}/${setsPerm} sets usam o helper — um set/update cru apaga o nome em silêncio`);
checar('troca de e-mail é atômica (criar nova + apagar antiga numa gravação)',
    /const mover = \{\};/.test(idx) && /mover\[oldKey\] = null;/.test(idx),
    'em 2 passos, falha no meio deixava os DOIS e-mails autorizados');
checar('_entradaPermissao preserva o nome já gravado',
    /else if \(antigo\) entrada\.nome = antigo;/.test(idx),
    'o helper deixou de reaproveitar o nome existente — changeRole volta a apagar nome');
checar('EQUIPE salva só o nome quando o e-mail não mudou (vale na própria linha)',
    /permissions\/' \+ oldKey \+ '\/nome'\)\.set\(novoNome \|\| null\)/.test(idx),
    'o caminho nome-só do updateEmail sumiu — gestor não corrige mais nome de conta existente');
checar('fila de pedidos filtra por PAPEL, não por existência da entrada',
    /state\.permissions\[enc\] && state\.permissions\[enc\]\.role\) return;/.test(idx),
    'nó órfão só-com-nome esconderia o pedido de acesso da fila do gestor');
checar('aprovação copia o nome do pedido', /_entradaPermissao\(email, 'corretor', sol && sol\.nome/.test(idx));
checar('EQUIPE tem campo de nome por linha', /id="edit_nome_\$\{safeKey\}"/.test(idx));
checar('formulário do gestor tem campo de nome', /id="newAuthNome"/.test(idx));
checar('cadastro grava displayName no Firebase Auth', /updateProfile\(\{ displayName: nome \}\)/.test(idx));
checar('crachá do topo mostra o nome (pintura única)',
    /_pintaBadge/.test(idx) && /state\.userNome/.test(idx) &&
    (idx.match(/badge\.innerHTML/g) || []).length === 1,
    'a pintura do crachá voltou a ser inline sem nome (qualquer papel, qualquer ícone)');
checar('botão "Mudar meu nome" existe', /AppAuth\.mudarMeuNome\(\)/.test(idx));

// ─────────────────────────────────────────────────────────────
// 8d. TRAVA DE E-MAIL / COLISÃO DE CHAVE (V401) — a falha g9.
//     A chave é many-to-one (joao.silva e joao_silva colidem). A
//     autorização NÃO pode confiar só na chave: todo check tem que
//     comparar o campo `email` gravado com auth.token.email.
// ─────────────────────────────────────────────────────────────
{
    const DEC = "auth.token.email.replace('.','_').replace('#','_').replace('$','_').replace('[','_').replace(']','_')";
    const bareGestor = "+ '/role').val() === 'gestor'";
    const emailCheck = "+ '/email').val() === auth.token.email";
    const barePermExists = "root.child('madrid_data/permissions/' + " + DEC + ").exists()";
    const bareMasterExists = "root.child('madrid_data/master_admins/' + " + DEC + ").exists()";
    const nGestor = rulesRaw.split(bareGestor).length - 1;
    const nEmail = rulesRaw.split(emailCheck).length - 1;
    // Todo check de gestor por role tem que ter um email-check companheiro
    // (31 dentro dos gestor + 10 dos permissions-exists = 41).
    checar('trava de e-mail: todo check de gestor tem o email do dono ao lado',
        nGestor > 0 && nEmail >= nGestor,
        `${nGestor} checks de gestor mas só ${nEmail} comparações de email — a colisão de chave reabre (g9)`);
    checar('nenhum check de permissão confia só na chave (permissions.exists cru)',
        rulesRaw.indexOf(barePermExists) === -1,
        'permissions/<chave>.exists() sem email deixa joao_silva se passar por joao.silva');
    checar('nenhum check de master confia só na chave (master.exists cru)',
        rulesRaw.indexOf(bareMasterExists) === -1,
        'master_admins/<chave>.exists() sem comparar o e-mail reabre a colisão');
    checar('a regra do nome exige o e-mail do dono (não só a chave)',
        /data\.parent\(\)\.child\('email'\)\.val\(\) === auth\.token\.email/.test(rulesRaw),
        'sem isso o impostor da colisão sobrescreve o nome do gestor');
    // g6 da revisão: propostas/visitas se autorizavam pelo ramo self ($emailKey
    // === chave) SEM email — a colisão deixava o impostor ler/apagar a carteira
    // do gêmeo com ponto. O ramo self com ' || ' (só propostas+visitas) tem que
    // vir travado com o email do dono.
    const ramoSelfCru = "$emailKey === " + DEC + " || ";
    checar('propostas/visitas: ramo self travado pelo e-mail do dono (não só a chave)',
        rulesRaw.indexOf(ramoSelfCru) === -1,
        'o ramo self cru ($emailKey === chave || ...) deixa o impostor ler/apagar a carteira do gêmeo com ponto');
}

// ─────────────────────────────────────────────────────────────
// 8c. CLASSES RECORRENTES (V399) — bugs que já voltaram 2+ vezes
//     ganham guarda permanente.
// ─────────────────────────────────────────────────────────────
// wa.me montado na mão voltou 3x (V395, follow-up, fallback). TODO link com
// número tem que sair do AppAuthManager._linkWhats. A checagem varre o arquivo
// FORA do corpo do helper (revisão V399: contagem de literal era cega a
// concatenação) — só o fallback sem número (wa.me/?text=) é permitido fora.
{
    const iniHelper = idx.indexOf('_linkWhats:');
    const fimHelper = idx.indexOf('},', iniHelper);
    const foraHelper = (idx.slice(0, iniHelper) + idx.slice(fimHelper))
        .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    checar('nenhum link de WhatsApp montado fora do _linkWhats',
        iniHelper > 0 && (foraHelper.match(/wa\.me\/(?!\?text=)/g) || []).length === 0,
        'monte o link com AppAuthManager._linkWhats (zero no DDD quebrava o número)');
}
// O encode de e-mail era copiado inline 24x — agora só o helper pode ter a
// regex, em QUALQUER grafia (revisão V399: a variante com \[ escapado passava).
checar('encode de e-mail só existe dentro de AppUtils.chaveEmail',
    (idx.split("replace(/[.#$[\\]]/g, '_')").length - 1)
    + (idx.split("replace(/[.#$\\[\\]]/g, '_')").length - 1) === 1,
    'use AppUtils.chaveEmail(email) em vez de copiar a regex');
// Revisão V399: pinar o CORPO do helper e contar os call-sites — sem isso,
// _exigeAdmin: () => true passava verde.
checar('guarda de gestor usa o helper _exigeAdmin (corpo íntegro + 14 usos)',
    idx.indexOf('if (!state.isAdmin) { AppUI.showError("Acesso negado.", "Erro"); return; }') === -1 &&
    /_exigeAdmin: \(\) => \{ if \(state\.isAdmin\) return true; AppUI\.showError\("Acesso negado\.", "Erro"\); return false; \},/.test(idx) &&
    (idx.match(/if \(!AppAuthManager\._exigeAdmin\(\)\) return;/g) || []).length >= 14);
// Revisão V399: exigir a CONSTRUÇÃO do prazo (o literal do catch sobrevivia
// à remoção do próprio race) + a chave reusada que impede lead duplicado.
checar('formulário da landing tem prazo e chave reusada (sem lead duplicado)',
    /Promise\.race\(\[\s*leadRef\.set\(payload\)/.test(lnd) &&
    /window\.__leadRefPendente/.test(lnd) && /tempo esgotado/.test(lnd),
    'sem o race o botão morria em Enviando...; sem a chave reusada o reenvio duplicava o lead');
// Revisão V399: a mera DECLARAÇÃO da flag satisfazia — exigir a GUARDA em uso,
// o set, e o feedback (trava muda engolia cliques em silêncio).
checar('salvar visita tem trava de voo com feedback',
    /if \(AppAgenda\._visitaEmVoo\) \{ AppUI\.showToast\(/.test(idx) &&
    /AppAgenda\._visitaEmVoo = true;/.test(idx) &&
    /btnSalvarVisita/.test(idx),
    'toque duplo no 4G gravava a visita em dobro — e trava sem aviso engole cliques');

// V404: um filtro da tabela vive em 6 lugares (select, renderTable, PDF da
// tabela, saveState, loadState, limparFiltrosTabela). Esquecer um deles = tela e
// PDF discordam, o filtro some no F5 ou "Limpar filtros" não limpa. A revisão da
// V404 conferiu os três à mão; aqui fica pinado pra próxima vez.
['filterTypology', 'filterFloor', 'filterFinal'].forEach(f => {
    const temSelect = idx.includes(`id="${f}"`);
    const usos = idx.split(`getElementById('${f}')`).length - 1;          // renderTable, PDF, saveState (2), limpar
    const predicados = idx.split(`${f} !== 'todos'`).length - 1;                 // tela + PDF
    const restaura = idx.includes(`restauraSelect('${f}'`);                                        // loadState
    checar(`filtro ${f} pareado em tela, PDF, estado e "limpar"`,
        temSelect && predicados === 2 && usos >= 5 && restaura,
        `select=${temSelect} predicados=${predicados}/2 getElementById=${usos}/5 loadState=${restaura}`);
});

// ─────────────────────────────────────────────────────────────
// 8b. SEGURANÇA V405 — e-mail confirmado e sessão
// ─────────────────────────────────────────────────────────────
// Toda regra que concede algo a "auth != null" tem que exigir também o e-mail
// verificado: sem isso, quem registra um e-mail que não possui (pré-cadastrado
// pelo gestor) herda o papel. Confere predicado por predicado, não por grep.
{
    // Revisão V405: varre TODO .read/.write que não seja false — um predicado novo
    // escrito de outro jeito ("auth.uid != null", true…) não pode escapar da
    // contagem. true só é aceito no cronograma (público de propósito).
    let semVerif = [], comAuth = 0, abertos = [];
    (function conf(no, p) {
        for (const k of Object.keys(no)) {
            const v = no[k];
            if (k === '.read' || k === '.write') {
                if (v === false) continue;
                if (v === true) { if (p + '/' + k !== '/rules/madrid_data/cronograma/.read') abertos.push(p + '/' + k); continue; }
                comAuth++;
                if (typeof v !== 'string' || !v.includes('auth.token.email_verified === true')) semVerif.push(p + '/' + k);
            } else if (v && typeof v === 'object') conf(v, p + '/' + k);
        }
    })(JSON.parse(rulesRaw), '');
    checar('rules: todo .read/.write (exceto false e o cronograma público) exige email_verified (' + comAuth + ' predicados)',
        comAuth >= 48 && semVerif.length === 0 && abertos.length === 0,
        (semVerif.length ? 'sem a cláusula em: ' + semVerif.join(', ') : '') + (abertos.length ? ' | liberado (true) fora do cronograma: ' + abertos.join(', ') : ''));
    const selfRead = (JSON.parse(rulesRaw).rules.madrid_data.permissions.$emailKey || {})['.read'] || '';
    checar('rules: self-read de permissions confere o e-mail (colisão de chave)',
        selfRead.includes("(!data.exists() || data.child('email').val() === auth.token.email)"),
        'o gêmeo-underscore lia role/email/nome do aprovado');
}
// O app tem que (a) barrar conta sem e-mail confirmado ANTES do initApp, (b) mandar
// o link, (c) renovar o token quando confirmar (as rules leem o token), (d) não
// registrar o pedido de acesso antes da confirmação, (e) escolher a persistência.
checar('app: conta sem e-mail confirmado cai na tela de confirmação antes do initApp',
    /if \(!u\.emailVerified\) \{ AppAuth\.showVerifyScreen\(u\); return; \}\s*AppAuth\.initApp\(\);/.test(idx),
    'a verificação tem que vir antes de AppAuth.initApp() no onAuthStateChanged');
checar('app: tela de confirmação envia o link e renova o token ao confirmar',
    idx.includes('u.sendEmailVerification()') && idx.includes('atual.getIdToken(true).then(() => location.reload()') && idx.includes('id="verifyOverlay"'),
    'sem getIdToken(true) as rules continuam vendo email_verified=false');
checar('app: cadastro não registra o pedido antes da confirmação do e-mail',
    (idx.match(/AppAuth\._registrarSolicitacao\(/g) || []).length === 2,
    'só a tela de espera (showPendingScreen) e o botão Reenviar podem chamar _registrarSolicitacao');
checar('app: login e cadastro escolhem a persistência da sessão (SESSION por padrão)',
    idx.includes('AppAuth._persistencia(manter).then(() => firebase.auth().signInWithEmailAndPassword(') &&
    idx.includes('AppAuth._persistencia(false).then(() => firebase.auth().createUserWithEmailAndPassword(') &&
    idx.includes('P.LOCAL : P.SESSION') && idx.includes('id="keepSignedIn"'),
    'sem setPersistence a sessão fica LOCAL e o PC do plantão abre como o corretor anterior');

// ─────────────────────────────────────────────────────────────
// 8e. SEGURANÇA V405 — achados da auditoria de 03/11/2026 (8 lentes)
// ─────────────────────────────────────────────────────────────
// Cada item abaixo foi um defeito CONFIRMADO por dois revisores independentes.
// A checagem pina a correção para a próxima edição não desfazê-la em silêncio.
{
    const R = JSON.parse(rulesRaw).rules.madrid_data;
    const DEC = "auth.token.email.replace('.','_').replace('#','_').replace('$','_').replace('[','_').replace(']','_')";
    const APROV = "root.child('madrid_data/permissions/' + " + DEC + " + '/email').val() === auth.token.email";
    // (1) agenda: conta registrada mas NÃO aprovada gravava visitas na agenda de todos.
    const agW = R.agenda['$id']['.write'] || '';
    checar('rules: agenda/$id — o ramo do corretor exige conta aprovada, chave push e criadoPor === token (e só edita/apaga o próprio)',
        agW.endsWith("|| (" + APROV + " && (!data.exists() ? ($id.matches(/^-[A-Za-z0-9_-]{19}$/) && newData.child('corretor').val() === auth.token.email && newData.child('criadoPor').val() === auth.token.email) : (data.child('corretor').val() === auth.token.email && (!newData.exists() || newData.child('corretor').val() === auth.token.email)))))"),
        'sem o check de permissions/<chave>/email, qualquer conta auto-cadastrada enche a agenda do time');
    checar('rules: agenda — corretorNome/criadoPor/criadoEm amarrados (nome do dono, autor = token, hora do servidor)',
        (R.agenda['$id'].corretorNome['.validate'] || '').includes("newData.parent().child('corretor').val().beginsWith(newData.val() + '@')") &&
        R.agenda['$id'].criadoPor['.validate'] === "newData.isString() && newData.val() === auth.token.email" &&
        (R.agenda['$id'].criadoEm['.validate'] || '').includes('newData.val() === now'),
        'corretor assinava visita com o nome do colega e criadoEm no futuro matava o sino de todo mundo');
    // (2) visitas: id do privado amarrado ao corretor do slot (colisão entre partições).
    const visV = R.visitas['$emailKey']['$id']['.validate'] || '';
    // Revisão V405: a chave vem do e-mail do PRÓPRIO slot (não de permissions) —
    // consultar permissions impedia o gestor de editar visita de corretor removido.
    checar('rules: visitas/$id — id de push e amarrado à chave do corretor do slot em agenda/$id',
        visV.includes('$id.matches(/^-[A-Za-z0-9_-]{19}$/)') &&
        visV.includes("(root.child('madrid_data/agenda/' + $id + '/corretor').isString() && root.child('madrid_data/agenda/' + $id + '/corretor').val().replace('.','_').replace('#','_').replace('$','_').replace('[','_').replace(']','_') === $emailKey)") &&
        !visV.includes("root.child('madrid_data/permissions/' + $emailKey"),
        'corretor gravava visitas/<ele>/<idDoSlotDeOutro> e o gestor via o telefone do atacante no lugar do cliente');
    checar('rules: proposals/$emailKey e visitas/$emailKey não aceitam primitivo (hasChildren)',
        R.proposals['$emailKey']['.validate'] === 'newData.hasChildren()' && R.visitas['$emailKey']['.validate'] === 'newData.hasChildren()',
        'uma string de 8 MB na partição virava "uma proposta por caractere" e travava a GESTÃO de todo gestor');
    // (3) proposals: lista fechada, plan só string, corretor = token, timestamps do servidor; cofre à parte.
    const pid = R.proposals['$emailKey']['$propId'];
    checar('rules: proposals — plan só string, $other fechado, corretor === token, timestamp/status_ts = servidor',
        pid.plan['.validate'] === 'newData.isString() && newData.val().length <= 8000' &&
        pid['$other']['.validate'] === false &&
        (pid.corretor['.validate'] || '').endsWith('newData.val() === auth.token.email') &&
        pid.timestamp['.validate'] === 'newData.isNumber() && (newData.val() === now || newData.val() === data.val())' &&
        pid.status_ts['.validate'] === 'newData.isNumber() && (newData.val() === now || newData.val() === data.val())',
        '"!newData.isString() ||" deixava objeto sem teto; corretor/timestamp livres escondiam e atribuíam propostas');
    checar('rules: cofre zz_vendas_reais declarado à parte, com lista fechada de campos',
        !!R.proposals.zz_vendas_reais && R.proposals.zz_vendas_reais['$key']['$other']['.validate'] === false,
        'sem o nó literal, o cofre cai no wildcard do corretor e a lista fechada quebra a importação');
    let naoString = [];
    (function v(no, p) { Object.keys(no).forEach(k => { const x = no[k]; if (k === '.validate' && typeof x === 'string' && x.startsWith('!newData.isString() ||')) naoString.push(p); if (x && typeof x === 'object') v(x, p + '/' + k); }); })(R, '');
    checar('rules: nenhum .validate do tipo "!newData.isString() || …" (teto que objeto contorna)', naoString.length === 0, 'em: ' + naoString.join(', '));
    // (4) permissions: gestor nunca escreve o nó inteiro; entrada validada; sem auto-rebaixamento.
    checar('rules: permissions — gestor escreve só em $emailKey (nó inteiro = master), com validate de email/role',
        !String(R.permissions['.write']).includes("'gestor'") &&
        String(R.permissions['$emailKey']['.write']).includes("($emailKey !== " + DEC + " || (newData.exists() && newData.child('role').val() === 'gestor' && newData.child('email').val() === auth.token.email))") &&
        String(R.permissions['$emailKey']['.validate']).includes("newData.child('role').val().matches(/^(corretor|gestor)$/)") &&
        String(R.permissions['$emailKey']['.validate']).includes("=== $emailKey") &&
        R.permissions['$emailKey']['$other']['.validate'] === false,
        'um set(null) em permissions trancava as 9 contas (master_admins está vazio)');
    // (5) reservas: PII de prospect só pra gestor; sem apagar o nó inteiro.
    checar('rules: reservas — leitura só gestor/master, escrita por $apt, cliente declarado, $other fechado',
        String(R.reservas['.read']).includes("'/role').val() === 'gestor'") && !R.reservas['.write'] &&
        !!R.reservas['$apt']['.write'] && !!R.reservas['$apt'].cliente && R.reservas['$apt']['$other']['.validate'] === false &&
        String(R.reservas['$apt'].createdAt['.validate']).includes('newData.val() === now'),
        'corretor lia nome/observação/autor de TODAS as reservas via REST (a UI escondia, a rule não)');
    // (6) nós inteiros do gestor: set(null) negado; units validado; nós mortos fechados.
    ['units', 'statusMap', 'vendas', 'cronograma'].forEach(no => checar(`rules: ${no} — apagar o nó inteiro é negado (newData.exists())`,
        String(R[no]['.write']).endsWith(' && newData.exists()'), 'um set(null) no console do gestor zerava o nó (backup é manual, mensal)'));
    checar('rules: units/$apt validado (chave numérica, valor numérico com teto, $other só primitivo curto)',
        !!R.units['$apt'] && R.units['$apt']['.validate'] === '$apt.matches(/^[0-9]{3,4}$/)' &&
        String(R.units['$apt'].valor['.validate']).includes('newData.val() < 100000000') &&
        R.units['$apt']['$other']['.validate'] === '(newData.isString() && newData.val().length <= 60) || newData.isNumber() || newData.isBoolean()',
        'units/1404/valor = "abc" virava R$ NaN na tabela e nos PDFs dos clientes');
    checar('rules: cronograma (público) com lista fechada de campos', R.cronograma['$other']['.validate'] === false && R.cronograma.etapas['$idx']['$other']['.validate'] === false,
        'cronograma/dump = <qualquer coisa> publicava conteúdo arbitrário legível por anônimo');
    ['metas', 'leads', 'public_stats'].forEach(no => checar(`rules: ${no} (nó morto) não aceita escrita`, R[no]['.write'] === false, 'superfície morta continuava gravável'));
    // (7) audit_log tipado; price_history fechado.
    const au = R.audit_log['$auditId'];
    checar('rules: audit_log — campos tipados ($other fechado), id de push, timestamp plausível, expurgo só master',
        au['$other']['.validate'] === false && au.percentage['.validate'] === 'newData.isNumber()' &&
        String(au['.validate']).includes('$auditId.matches(/^-[A-Za-z0-9_-]{19}$/)') &&
        String(au.timestamp['.validate']).includes('newData.val() < now + 31622400000') &&
        String(au['.write']).includes("(!newData.exists() && root.child('madrid_data/master_admins/'"),
        'percentage sem tipo era XSS armazenado indelével na Trilha de Auditoria');
    checar('rules: price_history com lista fechada e tetos', R.price_history['$snapId']['$other']['.validate'] === false &&
        String(R.price_history['$snapId'].vgv_after['.validate']).includes('< 1000000000000'));
    // (8) leads_inbox: janela por ts (hora do servidor), não por chave forjável.
    checar('rules + app: fila do inbox ordenada por ts (índice nas rules, orderByChild no app)',
        Array.isArray(R.leads_inbox['.indexOn']) && R.leads_inbox['.indexOn'].includes('ts') &&
        idx.includes("database.ref('madrid_data/leads_inbox').orderByChild('ts').limitToLast(200)") &&
        !idx.includes("database.ref('madrid_data/leads_inbox').limitToLast(200)"),
        '200 chaves "-zzzz…" (push key nasce no CLIENTE) enterravam a fila de acesso e as mensagens do site pra sempre');
    checar('rules: logs/$date só aceita data AAAA-MM-DD', String(R.logs['$date']['.validate']).includes('$date.matches('), 'logs/<qualquer texto>/<chave> sem fim');
}
// (9) App — as mesmas falhas pelo lado do cliente.
checar('app: Trilha de Auditoria escapa percentage (único ${} sem escape do arquivo)',
    idx.includes("const pct = AppUtils.escapeHTML(String((typeof log.percentage === 'number')"),
    'percentage não-numérico entrava cru no innerHTML — XSS armazenado de gestor pra gestor');
checar('app: privado da visita indexado por dono+id (só _privDe lê AppAgenda._priv)',
    (idx.match(/AppAgenda\._priv\[/g) || []).length === 1 && idx.includes("flat[ownerKey + '/' + id] = d") &&
    (idx.match(/AppAgenda\._privDe\(/g) || []).length === 3,
    'achatar por id deixava o gestor ver (e gravar) o cliente do atacante na visita da vítima');
checar('app: nome exibido na agenda/sino/toast vem do e-mail do dono (não de corretorNome)',
    !/escapeHTML\([sv]\.corretorNome \|\| [sv]\.corretor/.test(idx) && (idx.match(/AppAgenda\._nomeDe\(/g) || []).length >= 3,
    'corretorNome é texto livre — corretor assinava visita com o nome do colega');
checar('app: marca de lido ignora criadoEm/timestamp no futuro',
    idx.includes('if (c > mx && c <= teto) mx = c;') && idx.includes('if (t > mx && t <= teto) mx = t;'),
    'um timestamp 9e15 virava marca de lido eterna — nenhum aviso acendia mais');
checar('app: listeners de propostas ignoram partição que não é objeto',
    idx.includes("if (!userProps || typeof userProps !== 'object') return;") && idx.includes("if (minhas && typeof minhas === 'object')"),
    'Object.values("string") virava uma proposta por caractere');
checar('app: CPF fora do texto do WhatsApp (vira URL no PC do plantão)',
    (() => {
        const ini = idx.indexOf('sendWhatsApp: () => {'), fim = idx.indexOf('_whatsFallback: (', ini);
        if (ini < 0 || fim < 0) return false;
        const linhasMsg = idx.slice(ini, fim).split('\n').filter(l => /\bmsg\s*\+?=/.test(l));
        return linhasMsg.length > 5 && linhasMsg.filter(l => /cpf/i.test(l) && !l.includes('consta na proposta em PDF (anexa)')).length === 0 &&
            idx.includes('consta na proposta em PDF (anexa)');
    })(),
    'nome+CPF+telefone+valor ficavam no histórico do navegador compartilhado e chegavam ao wa.me');
checar('app: CSP sem unsafe-eval, sem img-src https: genérico, sem *.googleapis.com em script-src',
    (() => { const csp = (idx.match(/Content-Security-Policy"\s+content="([\s\S]*?)"/) || [])[1] || ''; const b = (n) => (csp.match(new RegExp(n + '([^;]*)')) || [])[1] || '';
        return csp && !b('script-src').includes("'unsafe-eval'") && !b('script-src').includes('*.googleapis.com') && !/\shttps:(\s|$)/.test(b('img-src')); })(),
    'nenhuma lib usa eval e nenhuma imagem é externa — os curingas só ampliavam o dano de uma injeção futura');
checar('app: carregador GA4/Pixel não existe mais no index.html (medição só na landing)',
    !idx.includes('_GA_MEASUREMENT_ID') && !idx.includes('_META_PIXEL_ID') &&
    !/googletagmanager\.com|google-analytics\.com|connect\.facebook\.net|\bgtag\(|\bfbq\(/.test(idx),
    'ele ficava fora da CSP e fora do gate de LGPD do validar');
checar('app: caixa "Manter conectado" sem autocomplete, zerada no boot e escondida no cadastro',
    idx.includes('id="keepSignedIn" autocomplete="off"') && idx.includes('if (ks) ks.checked = false;') &&
    /const kr = document\.getElementById\('keepRow'\);\s*if \(kr\) kr\.classList\.toggle\('hidden', on\);/.test(idx),
    'o Firefox restaurava a caixa marcada no reload do logout — o próximo corretor ficava com sessão LOCAL');
checar('app: sessão herdada de antes da V405 é encerrada uma vez (relogin único)',
    /if \(!AppAuth\._sessaoJaMigrada\(\)\) \{\s*AppAuth\._marcaSessaoMigrada\(\);\s*AppAuth\._limpaRastros\(\);\s*firebase\.auth\(\)\.signOut\(\)/.test(idx) &&
    (idx.match(/AppAuth\._marcaSessaoMigrada\(\);/g) || []).length >= 4 &&
    /_sessaoJaMigrada: \(\) => \{ try \{ return localStorage\.getItem\('madrid_relogin_v405'\) === '1'; \} catch \(e\) \{ return true; \} \}/.test(idx),
    'setPersistence só vale no PRÓXIMO login — o PC do plantão nunca passava por ele');
checar('app: addUser não pré-cadastra papel para e-mail sem conta (papel só pela fila de pedidos)',
    (() => {
        const m = idx.match(/if \(!\(state\.permissions && state\.permissions\[encoded\] && state\.permissions\[encoded\]\.role\)\) \{([\s\S]{0,2500}?)"Cadastro pelo pedido de acesso"\);\s*return;\s*\}/);
        return !!m && !/confirm\(|\.set\(|\.update\(/.test(m[1]);
    })(),
    'com o papel pré-gravado, um clique do dono da caixa no link "confirme seu e-mail" entregava o papel ao impostor');
checar('app: recusas locais em hash (sem e-mail de terceiros no localStorage) e migração das antigas',
    idx.includes('hashCurto: (s) =>') && idx.includes('locais[rh] = carimbo;') && !idx.includes('locais[enc] = carimbo;') &&
    idx.includes('_recusasSoHash: (locais) =>') && idx.includes('const k = AppUtils.hashCurto(AppUtils.chaveEmail(String(a.email).toLowerCase()));'),
    'madrid_recusas guardava a chave de e-mail de todo recusado, pra sempre, no aparelho do plantão');
checar('app: logout apaga nome/WhatsApp do cadastro e flags do pedido do usuário; cadastro grava só após criar a conta',
    idx.includes("['madrid_signup_info_', 'madrid_acesso_solicitado_'].forEach(p => { try { localStorage.removeItem(p + ch); } catch (e) {} });") &&
    /createUserWithEmailAndPassword\(email, pass\)\)\.then\(\(cred\) => \{[\s\S]{0,900}?localStorage\.setItem\('madrid_signup_info_'/.test(idx),
    'nome e WhatsApp ficavam no aparelho mesmo quando o cadastro falhava, e sobreviviam ao Sair');
checar('app: reservas gravam createdAt com a hora do servidor',
    (idx.match(/createdAt: firebase\.database\.ServerValue\.TIMESTAMP/g) || []).length === 2 && !/createdAt: (Date\.now\(\)|now),/.test(idx),
    'as rules exigem createdAt === now; com Date.now() a reserva seria recusada');
checar('landing: iframe do Maps não manda a URL completa (com utm) ao Google',
    /output=embed"\s*loading="lazy" referrerpolicy="strict-origin-when-cross-origin"/.test(lnd) && !lnd.includes('referrerpolicy="no-referrer-when-downgrade"'),
    'referrerpolicy frouxo no iframe entregava ao Google a campanha de cada visitante');
checar('privacidade cita a origem de campanha (utm) e a Cloudflare (cdnjs)',
    !!priv && /utm/.test(priv) && /Cloudflare/.test(priv),
    'a landing grava utm e carrega cdnjs — a política precisa dizer (LGPD)');
// Revisão V405 (rodada 2) — o que a revisão adversarial do diff achou nas correções.
checar('app: tela de espera registra o pedido mesmo sem o localStorage do cadastro (nome do perfil)',
    idx.includes("const nomePed = String((info && info.nome) || (cu && cu.displayName) || '').trim();") &&
    idx.includes('if (!ja && nomePed.length >= 3) AppAuth._registrarSolicitacao(nomePed, fonePed, state.user, false);') &&
    idx.includes("_chavePedido: (email) => 'madrid_pedido_' + AppUtils.hashCurto(AppUtils.chaveEmail(email)),"),
    'quem clicava Sair na tela de confirmação (ou entrava por outro aparelho) nunca chegava à fila do gestor');
checar('app: recusa do gestor vale contra o pedido AUTOMÁTICO (só o Reenviar manual ressuscita)',
    idx.includes('if (recusados[rh] && (recusados[rh] >= ts || l.mensagem === AppAuth._MSG_PEDIDO_AUTO)) return;') &&
    idx.includes('AppAuth._registrarSolicitacao(nome, fone, state.user, true)'),
    'com o pedido automático a cada login, o recusado voltava sozinho pra fila');
checar('app: aba restaurada depois de 30 min parada perde a sessão (carimbo no sessionStorage)',
    /if \(AppAuth\._abaParadaDemais\(\)\) \{[\s\S]{0,300}?firebase\.auth\(\)\.signOut\(\)[\s\S]{0,300}?return;\s*\}\s*if \(!u\.emailVerified\)/.test(idx) &&
    (idx.match(/AppAuth\._tocaSessaoAba\(\)/g) || []).length >= 3 && idx.includes('AppAuth._marcaSessaoAba(!manter);'),
    'SESSION é por aba e o navegador restaura a aba com a sessão (Continuar de onde parou, Ctrl+Shift+T)');
checar('app: signOut automático (relogin único e aba restaurada) limpa o aparelho igual ao Sair',
    /if \(!AppAuth\._sessaoJaMigrada\(\)\) \{\s*AppAuth\._marcaSessaoMigrada\(\);\s*AppAuth\._limpaRastros\(\);/.test(idx) &&
    /if \(AppAuth\._abaParadaDemais\(\)\) \{\s*AppAuth\._limpaRastros\(\);/.test(idx) &&
    /_limpaRastros: \(\) => \{\s*try \{ sessionStorage\.removeItem\('madrid_app_state'\); \} catch \(e\) \{\}/.test(idx) &&
    (idx.match(/AppAuth\._limpaRastros\(\);/g) || []).length === 3,
    'sem a limpeza, o cliente simulado (nome, CPF, telefone) ficava na aba para o próximo corretor');
checar('app: marca de lido do sino em hora do servidor (.info/serverTimeOffset)',
    idx.includes("ref('.info/serverTimeOffset')") && idx.includes('const agora = Date.now() + (AppDB._serverOffset || 0);'),
    'com o relógio do aparelho atrasado, o teto de +1 h prendia avisos da última hora');
checar('app: statusMap normalizado na fonte (só livre/reservado/vendido chegam aos templates)',
    idx.includes("state.statusMap[k] = OK_ST.includes(brutoSt[k]) ? brutoSt[k] : 'livre';"),
    'o valor do statusMap cai cru em class/title/onchange — a whitelist das rules não pode ser a única tranca');
checar('app: não toca mais no nó morto public_stats (as rules negam a escrita)',
    !idx.includes('madrid_data/public_stats') && !idx.includes('updatePublicStats('),
    'o remove() virava PERMISSION_DENIED a cada login de gestor');
checar('rules: audit_log/unit com o mesmo teto do cofre (40) e user === token também na folha',
    String((JSON.parse(rulesRaw).rules.madrid_data.audit_log['$auditId'].unit || {})['.validate']).endsWith('<= 40') &&
    String((JSON.parse(rulesRaw).rules.madrid_data.audit_log['$auditId'].user || {})['.validate']).endsWith('newData.val() === auth.token.email'),
    'unidade de 21–40 caracteres derrubava a importação de contratos inteira (atômica)');
(function () {
    const cmd = path.join(DIR, 'publicar-regras.cmd');
    if (!fs.existsSync(cmd)) { erros.push('publicar-regras.cmd sumiu'); return; }
    const c = ler('publicar-regras.cmd');
    checar('publicar-regras.cmd confere no fim se as rules VIVAS são iguais ao arquivo',
        c.includes('database:get "/.settings/rules"') && c.includes('IDENTICAS') && c.includes('madrid_data/proposals/zz_vendas_reais.json'),
        '"corrigido" só conta depois de publicado E conferido — a V397/V403 ficaram 2,5 meses só no git');
})();
(function () {
    const wf = path.join(DIR, '.github', 'workflows', 'weekly-review.yml');
    if (!fs.existsSync(wf)) { avisos.push('weekly-review.yml não existe mais — ok se a rotina semanal foi desligada de propósito'); return; }
    const y = ler('.github/workflows/weekly-review.yml');
    checar('workflow semanal: actions fixadas por SHA e sem caminho local no corpo da issue',
        /uses: actions\/checkout@[0-9a-f]{40}/.test(y) && /uses: actions\/github-script@[0-9a-f]{40}/.test(y) && !/C:\/Projetos/.test(y),
        'tag móvel (@v4) é supply chain gratuito de fechar; o caminho local do PC do gestor estava público');
})();

// ─────────────────────────────────────────────────────────────
// 9. AVISOS (não impedem publicar)
// ─────────────────────────────────────────────────────────────
const versaoAgents = (agents.match(/Versão do sistema: V(\d+)/) || [])[1];
if (versaoAgents && VERSAO !== '???' && Math.abs(Number(versaoAgents) - Number(VERSAO)) > 3) {
    avisos.push(`agents.md está em V${versaoAgents} e o app em V${VERSAO} — atualize o manual que a IA lê primeiro`);
}
const planta = path.join(DIR, 'PLANTA_3_SUITES.jpeg');
if (fs.existsSync(planta) && fs.statSync(planta).size > 600 * 1024) {
    avisos.push('PLANTA_3_SUITES.jpeg está pesada (>600 KB) — otimize antes de publicar');
}

// ─────────────────────────────────────────────────────────────
// SEO (V406) — o site ficou FORA do Google (site: = 0 em 24/11/2026) porque a
// raiz tinha noindex fixo. Estas checagens impedem a volta do problema.
// ─────────────────────────────────────────────────────────────
// Só o <head> estático da raiz (até o primeiro <script>): o noindex do modo app
// é criado pelo JS e aparece no fonte como string, não como tag.
const headRaiz = idx.slice(0, idx.indexOf('<script'));
checar('SEO: raiz (index.html) sem <meta robots noindex> fixo',
    !/<meta[^>]+name=["']robots["'][^>]*noindex/i.test(headRaiz),
    'o Google descarta a raiz antes de rodar o desvio JS — o site some das buscas');
checar('SEO: raiz com canonical para a landing',
    /<link[^>]+rel=["']canonical["'][^>]+href=["']https:\/\/www\.madridcasaelevada\.com\/landing\.html["']/i.test(headRaiz),
    'sem o canonical a raiz (tela de login no HTML cru) pode ir para as buscas no lugar da landing');
checar('SEO: modo app coloca o noindex pelo script do desvio',
    /nr\.content\s*=\s*['"]noindex, nofollow['"]/.test(idx) && /document\.head\.appendChild\(nr\)/.test(idx),
    'a tela de login dos corretores não pode entrar nas buscas');
checar('SEO: landing é index,follow e tem canonical próprio',
    /<meta name="robots" content="index, follow">/.test(lnd) &&
    /<link rel="canonical" href="https:\/\/www\.madridcasaelevada\.com\/landing\.html">/.test(lnd));
let jsonLdOk = false;
try {
    const blocoLd = lnd.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    jsonLdOk = !!(blocoLd && JSON.parse(blocoLd[1]));
} catch (e) { jsonLdOk = false; }
checar('SEO: JSON-LD da landing é JSON válido', jsonLdOk,
    'JSON-LD quebrado é ignorado inteiro pelo Google — rode JSON.parse no bloco');
const robotsTxt = fs.existsSync(path.join(DIR, 'robots.txt')) ? ler('robots.txt') : '';
const sitemapXml = fs.existsSync(path.join(DIR, 'sitemap.xml')) ? ler('sitemap.xml') : '';
checar('SEO: robots.txt não bloqueia a raiz nem a landing e aponta o sitemap',
    !/^\s*Disallow:\s*\/\s*$/mi.test(robotsTxt) && !/^\s*Disallow:\s*\/landing/mi.test(robotsTxt) &&
    /Sitemap:\s*https:\/\/www\.madridcasaelevada\.com\/sitemap\.xml/i.test(robotsTxt));
checar('SEO: sitemap.xml lista a landing',
    sitemapXml.includes('<loc>https://www.madridcasaelevada.com/landing.html</loc>'));

// ─────────────────────────────────────────────────────────────
// RESULTADO
// ─────────────────────────────────────────────────────────────
console.log(`\nMadrid Casa Elevada — conferência da V${VERSAO}`);
console.log(`${ok.length} verificações passaram.`);
if (avisos.length) {
    console.log('\nAVISOS (dá pra publicar, mas olhe):');
    avisos.forEach(a => console.log('  ! ' + a));
}
if (erros.length) {
    console.log('\n❌ NÃO PUBLIQUE — problemas encontrados:');
    erros.forEach(e => console.log('  - ' + e));
    process.exit(1);
}
console.log('\n✅ Tudo certo. Pode publicar.\n');
