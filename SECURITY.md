# Política de segurança — Madrid Casa Elevada

Este repositório publica o site e o app de vendas do empreendimento Madrid Casa Elevada
(Luís Eduardo Magalhães/BA). O app guarda dados pessoais de clientes e da equipe de vendas;
levamos a sério qualquer relato de falha.

## Como relatar uma vulnerabilidade

**Não abra uma issue pública** com detalhes de uma falha — a issue é visível para qualquer
pessoa e exporia os usuários até a correção sair.

Use um destes canais privados:

1. o **WhatsApp de atendimento** publicado em <https://www.madridcasaelevada.com/privacidade.html>,
   dizendo que se trata de um relato de segurança (não descreva a falha pelo WhatsApp; só peça
   o contato para enviar os detalhes), ou
2. **GitHub → aba Security → "Report a vulnerability"** — quando o botão aparecer nessa aba
   (é o reporte privado de vulnerabilidade do GitHub; se ele não estiver visível, use o canal 1).

Inclua, se puder: o que você encontrou, como reproduzir, qual o impacto e se já contou para
mais alguém.

## O que esperar

- **Confirmação de recebimento:** em até 3 dias úteis.
- **Avaliação e plano:** em até 10 dias úteis, dizemos se o relato foi aceito, a gravidade e o
  prazo de correção.
- **Correção:** falhas que expõem dados de clientes ou permitem acesso indevido são tratadas
  antes de qualquer outra coisa; falhas menores entram na próxima versão.
- **Crédito:** se quiser, seu nome entra no registro da versão que corrige a falha
  (`agents.md`). Nunca divulgamos quem relatou sem autorização.

## Escopo

- `www.madridcasaelevada.com` (landing, app `?app=1`, política de privacidade)
- Regras do Realtime Database publicadas (`database.rules.json`)
- Este repositório (histórico, workflows)

Fora do escopo: ataques de negação de serviço, engenharia social contra a equipe, e qualquer
teste que crie contas reais, grave ou apague dados no banco de produção — **o banco é o da
operação real**. Se precisar demonstrar uma escrita, descreva-a; não a execute.

## Versões

Só a versão publicada em `www.madridcasaelevada.com` (a `main` deste repositório) recebe
correções. Não há versões antigas em uso.
