// Roda periodicamente (via GitHub Actions) e substitui a necessidade de
// Cloud Functions / plano Blaze do Firebase para notificações push.
//
// O que faz, a cada execução:
// 1. Lê o documento shared/agenda no Firestore.
// 2. Para cada evento, verifica:
//    a) Se há convocados que ainda não foram avisados da convocação (imediato).
//    b) Se o horário de lembrete (reminderAt, ou o próprio horário do evento
//       caso não haja lembrete customizado) já passou e ainda não foi enviado.
// 3. Envia push via FCM (Firebase Admin SDK) para os tokens de cada e-mail.
// 4. Grava de volta no Firestore quem já foi notificado, pra nunca duplicar.

const admin = require("firebase-admin");

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.error("Faltando a variável de ambiente FIREBASE_SERVICE_ACCOUNT.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(raw)),
});
const db = admin.firestore();

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function sendPushTo(notifications) {
  if (!notifications.length) return;
  const uniqueEmails = [...new Set(notifications.map((n) => n.email))];
  const tokenDocs = await Promise.all(
      uniqueEmails.map((email) => db.collection("tokens").doc(email).get()),
  );
  const tokenByEmail = {};
  tokenDocs.forEach((doc) => {
    if (doc.exists) tokenByEmail[doc.id] = doc.data().token;
  });

  for (const n of notifications) {
    const token = tokenByEmail[n.email];
    if (!token) {
      console.log(`Sem token salvo para ${n.email}, pulando.`);
      continue;
    }
    try {
      await admin.messaging().send({
        token,
        notification: {title: n.title, body: n.body},
        webpush: {
          notification: {icon: "/icons/icon-192.png"},
          fcmOptions: {link: "/"},
        },
      });
      console.log(`Push enviado para ${n.email}: ${n.title}`);
    } catch (err) {
      console.warn(`Falha ao enviar push para ${n.email}:`, err.message);
    }
  }
}

async function main() {
  const ref = db.collection("shared").doc("agenda");
  const snap = await ref.get();
  if (!snap.exists) {
    console.log("Nenhuma agenda compartilhada encontrada ainda.");
    return;
  }

  const events = snap.data().events || [];
  const now = Date.now();
  const notifications = [];
  let changed = false;

  const updatedEvents = events.map((original) => {
    let ev = original;
    const eventMoment = new Date(`${ev.date}T${ev.time}`).getTime();
    const eventTooOld = !isNaN(eventMoment) && (now - eventMoment > ONE_DAY_MS);

    // (a) Notificação imediata de nova convocação
    if (!eventTooOld) {
      const notifiedAssignment = ev.notifiedAssignment || [];
      const newlyAssigned = (ev.attendees || []).filter(
          (email) => !notifiedAssignment.includes(email),
      );
      if (newlyAssigned.length) {
        newlyAssigned.forEach((email) => {
          notifications.push({
            email: email.toLowerCase(),
            title: "🔔 Nova reunião marcada",
            body: `${ev.title} às ${ev.time}${ev.location ? " - " + ev.location : ""}`,
          });
        });
        ev = {...ev, notifiedAssignment: [...notifiedAssignment, ...newlyAssigned]};
        changed = true;
      }
    }

    // (b) Lembrete no horário customizado (ou horário do próprio evento)
    const momentStr = ev.reminderAt || `${ev.date}T${ev.time}`;
    const moment = new Date(momentStr).getTime();
    if (!isNaN(moment) && moment <= now && now - moment < ONE_DAY_MS) {
      const remindersSent = ev.remindersSent || [];
      const pending = (ev.attendees || []).filter((email) => !remindersSent.includes(email));
      if (pending.length) {
        pending.forEach((email) => {
          notifications.push({
            email: email.toLowerCase(),
            title: "🔔 Lembrete de reunião",
            body: `${ev.title} às ${ev.time}${ev.location ? " - " + ev.location : ""}`,
          });
        });
        ev = {...ev, remindersSent: [...remindersSent, ...pending]};
        changed = true;
      }
    }

    return ev;
  });

  await sendPushTo(notifications);

  if (changed) {
    await ref.set({events: updatedEvents});
    console.log(`Concluído: ${notifications.length} notificação(ões) enviada(s).`);
  } else {
    console.log("Concluído: nada pendente pra notificar.");
  }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Erro no worker de notificações:", err);
      process.exit(1);
    });
