# Central GLX — Notificações (sem Firebase Blaze)

Este mini-projeto roda por conta própria no GitHub Actions, de graça, e substitui a
Cloud Function do Firebase (que exigiria o plano pago Blaze) pra mandar as
notificações push da agenda compartilhada.

A cada 5 minutos o GitHub dispara o workflow, e dentro de cada execução ele
roda `send-notifications.js` em loop a cada 30 segundos (por ~4,5 minutos,
cobrindo o intervalo até o próximo disparo). Isso dá uma verificação
praticamente contínua sem custo — o GitHub Actions só permite agendar de 5
em 5 minutos no mínimo, então o loop interno é o jeito de contornar isso.

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

### 3. Pronto
O workflow em `.github/workflows/notify.yml` já roda automaticamente a cada 5
minutos. Pra testar na hora sem esperar, vá em Actions → "Enviar notificações
da agenda" → "Run workflow".
