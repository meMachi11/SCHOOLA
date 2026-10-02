import { bucket, db } from "../server";
import { hash, now, runtime } from "./auth";
import { demoId } from "./demo-marker";
import { schemas, type Kind, type User, type Values } from "./model";

// Idempotent sample-data backfill. No real-user credentials or deliveries are created.
export async function loadDemo(actor: User, requested = false) {
  if (actor.role !== "admin") return;
  if (!requested && runtime().SCOLA_DEMO_DATA !== "enabled") return;
  const instant = now(),
    today = instant.slice(0, 10);
  const day = (offset: number) => {
    const date = new Date(today + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  const loaded = await db()
    .prepare("SELECT key FROM school_settings WHERE key='demo-v1-loaded'")
    .first();
  const teacherIds = [demoId("teacher-1"), demoId("teacher-2")];
  if (!loaded) {
    const statements: D1PreparedStatement[] = [];
    const records: { id: string; kind: Kind; data: Values }[] = [];
    const add = (kind: Kind, id: string, input: Values) => {
      const data = { ...schemas[kind].parse(input), demo: true } as Values;
      records.push({ id, kind, data });
      statements.push(
        db()
          .prepare(
            "INSERT OR IGNORE INTO school_records (id,kind,data,author_id,created,updated) VALUES (?,?,?,?,?,?)",
          )
          .bind(id, kind, JSON.stringify(data), actor.id, instant, instant),
      );
    };
    const account = (
      name: string,
      label: string,
      role: string,
      classIds: string[],
      studentIds: string[],
    ) => {
      statements.push(
        db()
          .prepare(
            "INSERT OR IGNORE INTO school_users (id,email,name,role,class_ids,student_ids,active,created) VALUES (?,?,?,?,?,?,1,?)",
          )
          .bind(
            demoId(name),
            name + "@scola.example.test",
            "[Démo] " + label,
            role,
            JSON.stringify(classIds),
            JSON.stringify(studentIds),
            instant,
          ),
      );
    };
    const yearId = demoId("year"),
      classIds = [demoId("class-cm1"), demoId("class-cm2")];
    const startYear =
      Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 8 ? 1 : 0);
    add("years", yearId, {
      name: `${startYear}–${startYear + 1} · Démo`,
      start: `${startYear}-09-01`,
      end: `${startYear + 1}-07-01`,
      active: true,
    });
    ["CM1", "CM2"].forEach((label, i) => {
      add("levels", demoId("level-" + i), {
        name: label + " · Démo",
        order: i + 4,
      });
      add("classes", classIds[i], {
        name: label + " A · Démo",
        levelId: demoId("level-" + i),
        yearId,
        teacherIds: [teacherIds[i]],
        capacity: 24,
      });
      account(
        "teacher-" + (i + 1),
        i === 0 ? "Salma Benali · سلمى" : "Karim Idrissi · كريم",
        "teacher",
        [classIds[i]],
        [],
      );
    });
    const subjects = [
      "Français · الفرنسية",
      "Mathématiques · الرياضيات",
      "Arabe · العربية",
    ];
    subjects.forEach((name, i) =>
      add("subjects", demoId("subject-" + i), {
        name: name + " · Démo",
        coefficient: i === 1 ? 2 : 1,
      }),
    );
    const pupils = [
      ["Yasmine", "El Amrani"],
      ["Adam", "Bennani"],
      ["Lina", "Idrissi"],
      ["Omar", "Benali"],
      ["Inès", "Mansouri"],
      ["Amine", "Alaoui"],
      ["Sara", "Tahiri"],
      ["Youssef", "Chraibi"],
    ];
    pupils.forEach(([first, last], i) => {
      const id = demoId("student-" + i),
        classId = classIds[i < 4 ? 0 : 1],
        parentId = demoId("parent-" + Math.floor(i / 2));
      add("students", id, {
        first,
        last: last + " · Démo",
        dob: `${2016 + (i % 3)}-0${(i % 8) + 1}-12`,
        gender: i % 2 ? "M" : "F",
        classId,
        yearId,
        status: i === 7 ? "archived" : "active",
        address: "Rabat · adresse fictive",
        notes: "Profil fictif pour découvrir les fonctionnalités.",
        parentIds: [parentId],
      });
      if (i % 2 === 0)
        account(
          "parent-" + Math.floor(i / 2),
          "Famille " + last,
          "parent",
          [],
          [id, demoId("student-" + (i + 1))],
        );
      if (i < 2)
        account("learner-" + i, first + " " + last, "student", [], [id]);
    });
    account("admin", "Direction · الإدارة", "admin", [], []);
    for (let offset = -6; offset <= 0; offset++) {
      for (let i = 0; i < pupils.length; i++) {
        const studentId = demoId("student-" + i),
          date = day(offset),
          session = "Journée";
        const status =
          i === 1 && offset === 0
            ? "absent"
            : i === 3 && offset === 0
              ? "late"
              : i === 5 && offset === -1
                ? "excused"
                : "present";
        add(
          "attendance",
          "att-" + (await hash([studentId, date, session].join("|"))),
          {
            studentId,
            classId: classIds[i < 4 ? 0 : 1],
            date,
            session,
            status,
            minutes: status === "late" ? 12 : 0,
            note:
              status === "absent" ? "Exemple de notification d’absence" : "",
          },
        );
      }
    }
    for (let c = 0; c < 2; c++) {
      for (let n = 0; n < 2; n++) {
        add("homework", demoId(`homework-${c}-${n}`), {
          title: n
            ? "Exercices de fractions · Démo"
            : "Lecture et résumé · Démo",
          classId: classIds[c],
          subjectId: demoId("subject-" + n),
          instructions: n
            ? "Résoudre les exercices 1 à 4. Montrer chaque étape du calcul. / حل التمارين مع توضيح المراحل."
            : "Lire le texte joint et rédiger cinq phrases. / اقرأ النص واكتب خمس جمل.",
          due: day(n ? -1 : 3),
        });
        const assessmentId = demoId(`assessment-${c}-${n}`);
        add("assessments", assessmentId, {
          title:
            (n ? "Contrôle de mathématiques" : "Compréhension de texte") +
            " · Démo",
          classId: classIds[c],
          subjectId: demoId("subject-" + n),
          date: day(-4 + n),
          term: "T1",
          maximum: n ? 40 : 20,
          coefficient: n ? 2 : 1,
        });
        for (let i = c * 4; i < c * 4 + 4; i++) {
          const studentId = demoId("student-" + i);
          add(
            "grades",
            "grade-" + (await hash([studentId, assessmentId].join("|"))),
            {
              studentId,
              assessmentId,
              score: (12 + (i % 7)) * (n ? 2 : 1),
              comment: "Travail régulier · appréciation fictive",
            },
          );
        }
      }
      add("feeSchedules", demoId("schedule-" + c), {
        title: "Scolarité mensuelle · Démo",
        classId: classIds[c],
        yearId,
        amount: 50000,
        due: day(-3),
      });
    }
    for (let i = 0; i < pupils.length; i++) {
      const studentId = demoId("student-" + i),
        scheduleId = demoId("schedule-" + (i < 4 ? 0 : 1));
      const invoiceId =
        "inv-" + (await hash([scheduleId, studentId].join("|")));
      add("invoices", invoiceId, {
        studentId,
        scheduleId,
        title: "Mensualité · Démo",
        amount: 50000,
        due: day(-3),
      });
      add("invoices", demoId("upcoming-invoice-" + i), {
        studentId,
        scheduleId: "",
        title: "Atelier pédagogique · Démo",
        amount: 15000,
        due: day(14),
      });
      if (i % 3 !== 2)
        add("payments", demoId("payment-" + i), {
          invoiceId,
          amount: i % 3 === 0 ? 50000 : 20000,
          date: day(-2),
          method: i % 2 ? "transfer" : "cash",
          reference: "DÉMO · paiement simulé " + (i + 1),
        });
    }
    add("events", demoId("event-1"), {
      title: "Réunion parents–enseignants · Démo",
      start: day(7),
      end: day(7),
      classId: "",
      description: "Présentation des objectifs du trimestre.",
    });
    add("events", demoId("event-2"), {
      title: "Atelier lecture · Démo",
      start: day(2),
      end: day(2),
      classId: classIds[0],
      description: "Lecture en français et en arabe.",
    });
    add("events", demoId("event-3"), {
      title: "Sortie pédagogique · Démo",
      start: day(10),
      end: day(10),
      classId: classIds[1],
      description: "Exemple d’événement de classe.",
    });
    add("announcements", demoId("announcement-1"), {
      title: "Bienvenue dans l’école virtuelle · Démo",
      body: "Tous les dossiers marqués Démo sont fictifs. Explorez les modules, les documents et les bulletins. / هذه بيانات خيالية لتجربة الميزات.",
      classId: "",
      role: "all",
      publishDate: day(-1),
    });
    add("announcements", demoId("announcement-2"), {
      title: "Réunion des familles CM1 · Démo",
      body: "Retrouvez la date de la réunion dans le calendrier.",
      classId: classIds[0],
      role: "parent",
      publishDate: today,
    });
    add("announcements", demoId("announcement-3"), {
      title: "Prochain atelier · Démo",
      body: "Exemple d’annonce programmée pour demain.",
      classId: classIds[1],
      role: "all",
      publishDate: day(1),
    });
    const attachments = [
      {
        id: demoId("file-homework"),
        recordId: demoId("homework-0-0"),
        kind: "homework",
        name: "Lecture-exemple-DEMO.pdf",
        title: "Lecture - Scola DEMO",
        lines: [
          "Un eleve decouvre la bibliotheque de son ecole.",
          "Il choisit un livre et partage son histoire avec sa classe.",
          "Consigne : ecrire un resume en cinq phrases.",
        ],
      },
      {
        id: demoId("file-student"),
        recordId: demoId("student-0"),
        kind: "students",
        name: "Inscription-fictive-DEMO.pdf",
        title: "Dossier d'inscription - DEMO",
        lines: [
          "Yasmine El Amrani - CM1 A",
          "Ce document est fictif et ne constitue pas une inscription reelle.",
        ],
      },
      {
        id: demoId("file-school"),
        recordId: demoId("announcement-1"),
        kind: "announcements",
        name: "Guide-ecole-virtuelle-DEMO.pdf",
        title: "Ecole virtuelle - DEMO",
        lines: [
          "Explorer : eleves, presences, devoirs, bulletins et paiements.",
          "Les paiements et identites sont fictifs.",
          "Aucun email ou push reel n'est envoye pour ces exemples.",
        ],
      },
    ];
    for (const file of attachments) {
      const pdf = demoPdf(file.title, file.lines);
      await bucket().put(file.id, pdf, {
        httpMetadata: { contentType: "application/pdf" },
      });
      statements.push(
        db()
          .prepare(
            "INSERT OR IGNORE INTO school_files (id,record_id,kind,name,type,size,created,author_id) VALUES (?,?,?,?,?,?,?,?)",
          )
          .bind(
            file.id,
            file.recordId,
            file.kind,
            file.name,
            "application/pdf",
            pdf.byteLength,
            instant,
            actor.id,
          ),
      );
    }
    for (let i = 0; i < statements.length; i += 40)
      await db().batch(statements.slice(i, i + 40));
    await db().batch([
      db()
        .prepare(
          "INSERT OR IGNORE INTO school_settings (key,value) VALUES ('demo-v1-loaded',?)",
        )
        .bind(
          JSON.stringify({ created: instant, recordCount: records.length }),
        ),
      db()
        .prepare(
          "INSERT OR IGNORE INTO school_audit (id,actor_id,action,target,created) VALUES (?,?,?,?,?)",
        )
        .bind(
          demoId("audit-load"),
          actor.id,
          "demo.loaded",
          String(records.length),
          instant,
        ),
    ]);
  }
  await demoInbox(actor, teacherIds[0], instant);
}

async function demoInbox(actor: User, teacherId: string, instant: string) {
  // The inbox batch is atomic; its first notice also marks completed setup.
  const ready = await db()
    .prepare("SELECT id FROM school_notifications WHERE id=? AND user_id=?")
    .bind(demoId(`notice-0-${actor.id}`), actor.id)
    .first();
  if (ready) return;
  const statements = [
    db()
      .prepare(
        "INSERT OR IGNORE INTO school_records (id,kind,data,author_id,created,updated) VALUES (?,'messages',?,?,?,?)",
      )
      .bind(
        demoId("welcome-" + actor.id),
        JSON.stringify({
          recipientId: actor.id,
          body: "[Démo] Bonjour, les devoirs et les bulletins de la classe sont disponibles. / مرحباً، الواجبات والتقارير متاحة.",
          demo: true,
        }),
        teacherId,
        instant,
        instant,
      ),
    db()
      .prepare(
        "INSERT OR IGNORE INTO school_records (id,kind,data,author_id,created,updated) VALUES (?,'messages',?,?,?,?)",
      )
      .bind(
        demoId("reply-" + actor.id),
        JSON.stringify({
          recipientId: teacherId,
          body: "[Démo] Merci ! Je consulte les dossiers de l’école virtuelle.",
          demo: true,
        }),
        actor.id,
        instant,
        instant,
      ),
  ];
  const notices = [
    [
      "attendance",
      "Absence · Démo / غياب · تجريبي",
      "Adam est absent aujourd’hui. / آدم غائب اليوم.",
    ],
    [
      "homework",
      "Nouveau devoir · Démo / واجب · تجريبي",
      "Lecture et résumé : échéance dans trois jours. / واجب قراءة جديد.",
    ],
    [
      "grades",
      "Bulletin disponible · Démo / تقرير · تجريبي",
      "Les notes du premier trimestre sont consultables. / نقاط الدورة الأولى متاحة.",
    ],
    [
      "invoices",
      "Solde à régler · Démo / رصيد · تجريبي",
      "Exemple de mensualité partiellement réglée. / دفعة جزئية خيالية.",
    ],
    [
      "announcements",
      "École virtuelle · Démo / مدرسة تجريبية",
      "Explorez les annonces et le calendrier. / اكتشف الإعلانات والتقويم.",
    ],
    [
      "messages",
      "Message reçu · Démo / رسالة · تجريبي",
      "Un enseignant fictif vous a écrit. / رسالة من مدرس خيالي.",
    ],
  ];
  notices.forEach(([link, title, text], i) =>
    statements.push(
      db()
        .prepare(
          "INSERT OR IGNORE INTO school_notifications (id,user_id,title,body,link,created) VALUES (?,?,?,?,?,?)",
        )
        .bind(
          demoId(`notice-${i}-${actor.id}`),
          actor.id,
          title,
          text,
          link,
          instant,
        ),
    ),
  );
  await db().batch(statements);
}

function demoPdf(title: string, lines: string[]) {
  const escape = (text: string) => text.replace(/([\\()])/g, "\\$1");
  const content =
    "BT /F1 18 Tf 48 770 Td (" +
    escape(title) +
    ") Tj /F1 11 Tf 0 -35 Td (DONNEES FICTIVES - DEMONSTRATION) Tj " +
    lines.map((line) => "0 -24 Td (" + escape(line) + ") Tj ").join("") +
    "ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf +=
    `xref\n0 6\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((offset) => String(offset).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
