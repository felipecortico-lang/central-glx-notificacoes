# Central GLX — Notificações (sem Firebase Blaze)

Este mini-projeto roda por conta própria no GitHub Actions, de graça, e substitui a
Cloud Function do Firebase (que exigiria o plano pago Blaze) pra mandar as
notificações push da agenda compartilhada.

Um serviço externo (cron-job.org, grátis) dispara o workflow a cada poucos
minutos via API, e dentro de cada execução ele roda `send-notifications.js`
em loop a cada 30 segundos (por ~4,5 minutos, cobrindo o intervalo até o
próximo disparo). Isso dá uma verificação praticamente contínua sem custo.

**Por que não usar o agendamento nativo do GitHub (`schedule:`)?** Ele é
"melhor esforço" e pode atrasar dezenas de minutos em repositórios com pouca
atividade — isso já aconteceu aqui (disparos que deveriam ser de 5 em 5
minutos ficaram espaçados em até 90 minutos). Chamando a API
`workflow_dispatch` de fora, o disparo é imediato e confiável.

Cada verificação:
1. Lê os eventos da agenda compartilhada no Firestore.
2. Verifica quem foi convocado recentemente e quem tem lembrete vencendo agora.
3. Envia a notificação push (FCM) pra essas pessoas.
4. Marca no Firestore quem já foi avisado, pra nunca repetir.

**Este repositório é público** (necessário pro GitHub Actions rodar de graça
com essa frequência — repos privados têm cota limitada de minutos). Por isso
os logs não exibem e-mails completos nem título de reunião, só uma versão
mascarada (ex: `f***@glxengenharia.com.br`). A chave do Firebase continua
protegida como Secret e nunca aparece em lugar nenhum, público ou não.

## Configuração (fazer uma vez só)

### 1. Gerar a chave de serviço do Firebase
No [console do Firebase](https://console.firebase.google.com/project/central-glx/settings/serviceaccounts/adminsdk):
"Contas de serviço" → "Gerar nova chave privada". Isso baixa um arquivo `.json`.

**Nunca cole o conteúdo desse arquivo no chat ou em código versionado** — ele dá acesso total ao projeto Firebase.

### 2. Adicionar como Secret no GitHub
No repositório: Settings → Secrets and variables → Actions → "New repository secret".
- Nome: `FIREBASE_SERVICE_ACCOUNT`
- Valor: cole o conteúdo inteiro do arquivo `.json` baixado no passo 1

### 3. Gerar um token do GitHub (só pra disparar este workflow)
Em https://github.com/settings/personal-access-tokens/new:
- Token name: `central-glx-notify-trigger`
- Resource owner: sua conta
- Repository access: "Only select repositories" → escolha `central-glx-notificacoes`
- Permissions → Repository permissions → **Actions**: "Read and write"
- Generate token, copie o valor (começa com `github_pat_...`)

**Nunca cole esse token no chat ou em código versionado.**

### 4. Configurar o cron-job.org
Crie uma conta grátis em https://cron-job.org e adicione um novo cronjob:
- **Address**: `https://api.github.com/repos/felipecortico-lang/central-glx-notificacoes/actions/workflows/notify.yml/dispatches`
- **Schedule**: a cada 5 minutos
- **Request method**: POST
- **Headers**:
  - `Authorization: Bearer SEU_TOKEN_AQUI`
  - `Accept: application/vnd.github+json`
  - `X-GitHub-Api-Version: 2022-11-28`
- **Body** (raw JSON): `{"ref":"main"}`

### 5. Pronto
A partir daí o cron-job.org dispara o workflow pontualmente. Pra testar na
hora sem esperar, vá em Actions → "Enviar notificações da agenda" → "Run
workflow" (ou clique em "Executar" no painel do cron-job.org).
