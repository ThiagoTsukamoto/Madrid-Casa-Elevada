# 🔒 Configurações de Segurança no Firebase (Madrid Casa Elevada)

Este documento lista **todas as configurações que precisam ser feitas no console** (Firebase + Google Cloud) para complementar as defesas que estão no código (V322).

O código sozinho protege contra ~70% dos ataques. Os 30% restantes (e mais graves) só fecham aqui.

> **Antes de aplicar qualquer mudança abaixo:** garanta que você consegue logar como Master no sistema atualmente. Se algo der errado nas Rules, você pode ficar trancado para fora — basta voltar para Rules abertas que recupera.

---

## 1. Cadastro público: fica ligado DE PROPÓSITO — proteja o que sobra

**Severidade:** 🟡 Média (era "desabilitar signup"; mudou na V388/V405)
**Tempo:** 2 minutos

### O que mudou

Desde a V388 o cadastro é **público com aprovação**: a pessoa cria a conta na tela de login,
cai em "Acesso aguardando liberação" e o gestor libera na aba EQUIPE. Desde a V405 a conta só
vale depois que a pessoa **clica no link "confirme seu e-mail"** — as rules exigem
`auth.token.email_verified` em tudo, e a aba EQUIPE **não pré-cadastra mais papel para e-mail
sem conta** (o papel só nasce pela fila "Solicitações de acesso"). Portanto o item antigo
("desabilitar signup") **não se aplica**: uma conta criada por fora não lê nem grava nada.

O que uma conta não aprovada ainda consegue fazer: existir, confirmar o próprio e-mail e
pedir acesso. O que **você** precisa fechar no console:

### Como

1. Abra: <https://console.firebase.google.com/project/madrid-casa-elevada/authentication/settings>
2. Em **User actions**, marque **"Email enumeration protection"** — fecha a enumeração pelo
   **login** (todo erro vira "credenciais inválidas") e pelo **"Esqueci a senha"** (não há mais
   erro para e-mail inexistente). Atenção: o **cadastro** (`accounts:signUp`) CONTINUA
   respondendo `EMAIL_EXISTS` mesmo com a opção ligada — essa enumeração só fecha com o App
   Check em Enforce (seção 3). A tela do app já mostra a mesma mensagem nos dois casos.
3. Em **Templates → Verificação de endereço de e-mail** o Firebase só deixa editar o
   **remetente** e o **assunto** (o corpo da mensagem só é editável no modelo de redefinição de
   senha). Ajuste os dois:
   - Nome do remetente: `Madrid Casa Elevada (app da equipe)`
   - Assunto: `Confirme seu e-mail no app Madrid Casa Elevada — se você NÃO criou esta conta, ignore e avise o gestor`

   É a defesa contra alguém criar a conta com o e-mail de outra pessoa e torcer para o dono
   da caixa clicar no link. A outra metade já está no app: o papel só nasce pela fila
   "Solicitações de acesso", e o gestor vê o nome e o WhatsApp de quem pediu antes de liberar.
4. (Opcional, se um dia quiser fechar de vez) o caminho antigo continua válido: desmarcar
   "Ativar criação (inscrição)" no provider Email/Senha e criar as contas pelo console +
   botão "Enviar Link de Reset de Senha" da aba EQUIPE. Hoje **não** é o fluxo.

---

## 2. Aplicar as Rules robustas do Realtime Database

**Severidade:** 🔴 Crítica
**Tempo:** 2 minutos

### Por que

Sem Rules robustas, qualquer usuário logado (mesmo um atacante anônimo que criou conta na Fase 1) pode **ler e escrever** em todos os nós via API REST direta:
```bash
curl "https://madrid-casa-elevada-default-rtdb.firebaseio.com/madrid_data.json?auth=<token>"
```

### Caminho rápido (CLI — recomendado)

O jeito certo é o **`publicar-regras.cmd`** desta pasta (dois cliques): ele roda o `validar.js`,
faz o login, publica e, no fim, **confere se as regras no ar ficaram idênticas ao arquivo** —
publicação sem conferência não conta (V397 e V403 ficaram 2,5 meses só no git).

Pelo PowerShell, de dentro da pasta do repositório (a cópia que você usa no dia a dia):

```powershell
npx --yes firebase-tools login
npx --yes firebase-tools deploy --only database
```

- O `login` abre o browser, você autoriza com sua conta Google → fecha a aba quando aparecer "Success".
- O `deploy` envia o `database.rules.json` para o Firebase. Em ~5 segundos: "Deploy complete!"

### Caminho alternativo (Console UI)

1. Abra: <https://console.firebase.google.com/project/madrid-casa-elevada/database/madrid-casa-elevada-default-rtdb/rules>
2. **Apague todo** o conteúdo do editor
3. Abra o arquivo `database.rules.json` deste repositório
4. **Copie todo o conteúdo** e cole no editor do Firebase
5. Clique em **Publicar**

### Caminho onde **eu** rodo o deploy por você (se preferir delegar)

1. Você roda no PowerShell, de dentro da pasta do repositório:
   ```powershell
   npx --yes firebase-tools login:ci
   ```
2. Browser abre, você autoriza, e o CLI imprime um token longo no terminal
3. Você cola o token no chat
4. Eu rodo o deploy usando esse token (não preciso da sua senha)
5. **Logo após o deploy**, recomendo você rodar `npx firebase-tools logout` no seu terminal para invalidar o token

### Validação pós-deploy

- Logue como Master → tudo deve continuar funcionando
- Logue como Corretor → não deve ver Gestão/Equipe/Leads (já era assim, mas agora é defendido também no servidor)
- Tente acessar via curl sem auth → deve dar **401 Unauthorized**

### Como funcionam essas Rules

| Quem | O que pode |
|---|---|
| Anônimo (sem login) | Lê só o `cronograma` (a landing mostra a obra); grava só um contato em `leads_inbox` (formulário da landing, sem ler nada de volta) |
| Logado com e-mail NÃO confirmado | **Nada** (toda regra exige `email_verified`) |
| Logado, e-mail confirmado, sem papel em `/permissions` | Lê a própria chave em `permissions` (vazia — é o que destrava a tela de espera) e grava o pedido de acesso (`ACESSO_APP`) em `leads_inbox`; nada mais |
| Corretor | Lê preços/status; lê e escreve só **suas próprias** propostas |
| Gestor | Tudo, exceto `master_admins` e leitura de propostas alheias (a permissão de leitura geral inclui propostas de todos) |
| Master | Tudo |
| **Ninguém via app** | Editar `master_admins` (só pelo console) |

---

## 3. Ativar App Check com reCAPTCHA v3

**Severidade:** 🟡 Alta
**Tempo:** 5 minutos

### Por que

App Check garante que **só requisições vindas do seu site real** sejam aceitas pelo Firebase. Sem ele, scripts de bot e ferramentas como `curl`/`Postman` conseguem falar diretamente com seu DB (assumindo que tenham um token de auth válido).

### Como

#### 3.1) Gerar o site key do reCAPTCHA v3

1. Abra: <https://console.cloud.google.com/security/recaptcha?project=madrid-casa-elevada>
2. Clique em **+ CRIAR CHAVE**
3. Preencha:
   - **Nome:** `Madrid Casa Elevada`
   - **Tipo:** **reCAPTCHA v3**
   - **Domínios:** adicione `madridcasaelevada.com` e `www.madridcasaelevada.com`
4. Clique em **Criar**
5. **Copie o "Chave do site"** (site key) — começa com `6Lc...`

#### 3.2) Registrar o site no App Check

1. Abra: <https://console.firebase.google.com/project/madrid-casa-elevada/appcheck/apps>
2. Clique no seu **Web App** (Madrid Casa Elevada)
3. Escolha provedor: **reCAPTCHA v3**
4. Cole o **site key** que você copiou
5. Salvar

#### 3.3) Plugar o site key no código

1. Abra `index.html` localmente
2. Procure por `const APP_CHECK_SITE_KEY = "";` (~linha 1226)
3. Cole o site key entre as aspas: `const APP_CHECK_SITE_KEY = "6Lc..."`
4. Faça commit + push

#### 3.4) Ativar "Enforce" gradualmente

> **NÃO ATIVE "Enforce" na primeira meia hora.** Antes, deixe em **"Não aplicado / Monitorar"** por algumas horas para confirmar que as requisições legítimas estão chegando com token válido.

1. Em Firebase Console → App Check → **APIs**
2. Para cada API (Realtime Database, Authentication), marque **"Aplicar"** apenas depois de monitorar tráfego.

---

## 4. Restringir a API key por HTTP referrer

**Severidade:** 🟡 Média
**Tempo:** 1 minuto

### Por que

A API key do Firebase é "pública por design", mas se ela **só funciona quando a request vem do `madridcasaelevada.com`**, fica muito mais difícil de ser abusada via scripts maliciosos hospedados em outros domínios.

### Como

1. Abra: <https://console.cloud.google.com/apis/credentials?project=madrid-casa-elevada>
2. Procure a chave `AIzaSyAMoE5JkohMp632zSUSublIuSx_JL1rxv4` (Browser key)
3. Clique no nome dela para editar
4. Em **"Restrições do aplicativo"**, selecione **"Referenciadores HTTP (sites)"**
5. Em **"Restrições do site"**, adicione:
   - `https://madridcasaelevada.com/*`
   - `https://www.madridcasaelevada.com/*`
   - `http://localhost:*/*` (opcional, para desenvolvimento local)
6. Salvar

> **Conferido em 03/11/2026:** a chave viva aceita **só** `https://www.madridcasaelevada.com/*`
> (apex e localhost respondem `403 API_KEY_HTTP_REFERRER_BLOCKED`). Está certo assim: o apex
> redireciona para `www` antes de carregar qualquer script. Só acrescente `localhost` se for
> testar login localmente.
>
> **Restrição por referrer NÃO é controle anti-abuso:** ela só amarra navegadores. Um cliente
> fora do navegador manda o Referer do site e passa. Quem fecha o cadastro/escrita por fora é
> **App Check em modo Enforce + as rules** (`/email === auth.token.email` + `email_verified`).

> **Cuidado:** depois disso, requests vindas do GitHub Pages preview, de Codespaces, ou de qualquer outro domínio vão falhar com `API_KEY_HTTP_REFERRER_BLOCKED`. Use o `localhost:*` para dev local.

---

## 5. Ativar MFA (verificação em 2 passos) nas contas Master

**Severidade:** 🔴 Crítica
**Tempo:** 5 minutos por conta

### Por que

Sem 2FA, uma senha vazada em qualquer outro serviço (dump de mega-vazamentos, phishing) dá acesso total ao Master. Com 2FA, mesmo com a senha o atacante precisa do segundo fator (SMS, app autenticador, chave física).

### Como (cada master deve fazer no próprio Google account)

1. Cada master abre: <https://myaccount.google.com/signinoptions/twosv>
2. Clique em **Começar**
3. Escolha o método (recomendo **Google Authenticator** ou **chave de segurança**)
4. Siga o assistente

> **Não use SMS como único 2FA.** Ataques de SIM swap são comuns. Use app autenticador ou chave física.

---

## ✅ Checklist final

Marque conforme for fazendo:

- [ ] **#1** (o antigo "desabilitar signup" NÃO se aplica — cadastro público + aprovação V388 + e-mail confirmado V405) → ligar **Email enumeration protection** e ajustar **remetente e assunto** do e-mail de verificação (seção 1)
- [ ] **#1.1** PC do plantão: Chrome/Edge em "Ao iniciar → Abrir a página Nova guia" (não "Continuar de onde parou") e combinar com a equipe de clicar **Sair** ao terminar. O app já derruba a sessão de uma aba restaurada depois de 30 min parada, mas o hábito é a primeira tranca.
- [ ] **#2** Apliquei `database.rules.json` no Realtime Database e publiquei
- [ ] **#2.1** Testei: anônimo não acessa, corretor vê só o que deve, master vê tudo
- [ ] **#3.1** Gerei site key do reCAPTCHA v3
- [ ] **#3.2** Registrei o app no App Check com o site key
- [ ] **#3.3** Plugei o site key em `APP_CHECK_SITE_KEY` no `index.html` e fiz push
- [ ] **#3.4** Monitorei tráfego algumas horas e **só depois** ativei "Enforce"
- [ ] **#4** Restringi a API key por HTTP referrer no Google Cloud Console
- [ ] **#5** Cada master ativou 2FA na conta Google dele
- [ ] **#6** DNS: SPF `v=spf1 -all`, DMARC `p=reject`, MX nulo, 4 IPs do Pages no apex, domínio verificado no GitHub (seção 6)
- [ ] **#7** GitHub: Private vulnerability reporting ligado, `main` protegida, histórico limpo (seção 7)

---

## 6. DNS do domínio (GoDaddy: ns39/ns40.domaincontrol.com)

**Severidade:** 🟡 Média
**Tempo:** 10 minutos

### Por que

Conferido em 03/11/2026: `madridcasaelevada.com` **não tem SPF, DMARC nem MX**. Qualquer um
manda e-mail "De: gestor@madridcasaelevada.com" para os corretores ("sua senha do sistema
expira — entre aqui") e o servidor de quem recebe não tem base para recusar. O domínio não
envia e-mail (os do Firebase saem de `noreply@madrid-casa-elevada.firebaseapp.com`), então a
política pode ser a mais dura. Além disso o apex tem **1 dos 4 IPs** do GitHub Pages.

### Como (zona DNS da GoDaddy)

| Tipo | Nome | Valor |
|------|------|-------|
| TXT | `@` | `v=spf1 -all` |
| TXT | `_dmarc` | `v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s` |
| MX | `@` | prioridade `0`, servidor `.` (MX nulo, RFC 7505) |
| A | `@` | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (um registro A para cada) |
| AAAA | `@` | `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` |

> O `p=reject` funciona sozinho. Relatórios DMARC (`rua=`) só chegam por um **serviço de
> recepção de DMARC** (há planos gratuitos) — uma caixa Gmail/Outlook não aceita relatório de
> domínio de outra pessoa e eles somem em silêncio. Se quiser os relatórios, cadastre o domínio
> num desses serviços e acrescente o `rua=mailto:` que ele fornecer.

Depois: GitHub → sua conta → **Settings → Pages → Verified domains → Add** `madridcasaelevada.com`
e crie o TXT `_github-pages-challenge-thiagozinhooo` que ele pedir. Isso impede que, se o site
for despublicado um dia, outra conta do GitHub "adote" o domínio.

> Se um dia for enviar e-mail com remetente `@madridcasaelevada.com`, troque o SPF e o DMARC
> ANTES (inclua o provedor), senão os seus próprios e-mails passam a ser recusados.

---

## 7. Repositório GitHub (público)

**Severidade:** 🟡 Média
**Tempo:** 15 minutos (+ chamado ao suporte)

1. **Settings → Code security → Private vulnerability reporting → Enable** — hoje quem acha uma
   falha não tem canal privado e abriria uma issue pública (o `SECURITY.md` explica o caminho).
2. **Settings → Branches → Add rule** para `main`: bloquear force-push e exclusão.
3. **Histórico:** commits antigos ainda alcançáveis trazem o e-mail da conta dona do Firebase
   (18 commits) e a lista de sigilo que o commit "Sigilo" (5563a83) removeu só da ponta. Limpar
   exige reescrever o histórico (`git filter-repo --replace-text`, `git push --force`, apagar o
   branch remoto `fix/publicar-regras-login`) **e** pedir ao GitHub Support a purga dos objetos
   antigos (mesmo chamado da pendência `f11f67d`). Enquanto isso, trate o e-mail da conta dona
   como público: **2FA nela hoje** (#5).
4. As 23 issues semanais abertas e nunca tratadas sinalizam abandono a quem visita. Não precisa
   fechar à mão: na próxima rodada o workflow cria a issue nova e fecha **todas** as `weekly-review`
   que ainda estiverem abertas (com um comentário apontando a nova).

---

## Teste de invasão pós-config

Depois de aplicar tudo, **rode estes comandos** num terminal qualquer e compare com o esperado.
Nenhum deles cria conta nem grava nada.

```bash
# Teste 1a: a restrição de referrer da API key funciona (sem Referer → 403)
curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=AIzaSyAMoE5JkohMp632zSUSublIuSx_JL1rxv4" \
  -H "Content-Type: application/json" -d '{}'
# esperado: 403 "API_KEY_HTTP_REFERRER_BLOCKED"

# Teste 1b: com o Referer do site a chave funciona (400 MISSING_EMAIL = a requisição chegou à API)
curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=AIzaSyAMoE5JkohMp632zSUSublIuSx_JL1rxv4" \
  -H "Content-Type: application/json" -H "Referer: https://www.madridcasaelevada.com/" -d '{}'
# esperado: 400 "MISSING_EMAIL"

# Teste 2: ler o DB sem auth (deve falhar com Permission denied)
curl "https://madrid-casa-elevada-default-rtdb.firebaseio.com/madrid_data.json"
# esperado: 401 {"error":"Permission denied"} — e o mesmo para
#   .../madrid_data/units.json  .../madrid_data/permissions.json  .../madrid_data/proposals.json
#   (só .../madrid_data/cronograma.json responde 200 — é público de propósito, lido pela landing)

# Teste 4: o reporte privado de falhas está ligado (seção 7) — só leitura
curl -s "https://api.github.com/repos/Thiagozinhooo/Madrid-Casa-Elevada/private-vulnerability-reporting"
# esperado: {"enabled":true}
```

**Teste 3 — as rules no ar são as do repositório.** O `publicar-regras.cmd` já faz isso
sozinho no passo [5/5] (imprime `IDENTICAS`). Para conferir à mão, no **PowerShell**, de
dentro da pasta do repositório (precisa do Firebase CLI logado na conta dona):

```powershell
firebase database:get "/.settings/rules" --instance madrid-casa-elevada-default-rtdb > "$env:TEMP\rules_vivas.json"
node -e "const s=f=>JSON.stringify(JSON.parse(require('fs').readFileSync(f,'utf8').replace(/\/\/[^\n]*/g,'')));console.log(s(process.env.TEMP+'/rules_vivas.json')===s('database.rules.json')?'IDENTICAS':'DIFERENTES - rode publicar-regras.cmd')"
```

> **Importante:** o Teste 1a "falhar" **não** prova que o cadastro está fechado — ele prova a
> restrição de referrer, que só amarra navegadores. O cadastro é público de propósito; o que
> protege o banco são as rules (`email_verified` + `/email === auth.token.email`) e, quando
> ligado, o App Check em Enforce. **Nunca** teste com `accounts:signUp` e e-mail/senha reais:
> isso cria uma conta de verdade no projeto.
