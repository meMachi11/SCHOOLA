import { type Kind } from "./model";
export type Label = readonly [string, string];
export type Field = {
  key: string;
  label: Label;
  type?:
    | "text"
    | "number"
    | "money"
    | "date"
    | "textarea"
    | "select"
    | "multi"
    | "checkbox"
    | "email";
  options?: { value: string; label: Label }[];
  source?: Kind | "teachers" | "parents" | "recipients";
  required?: boolean;
  min?: number;
  max?: number;
};
export type Module = {
  label: Label;
  description: Label;
  fields: Field[];
  columns: string[];
};
const f = (
  key: string,
  fr: string,
  ar: string,
  type: Field["type"] = "text",
  source?: Field["source"],
  required = true,
): Field => ({ key, label: [fr, ar], type, source, required });
const student = f("studentId", "Élève", "التلميذ", "select", "students");
const cls = f("classId", "Classe", "القسم", "select", "classes");
const subject = f("subjectId", "Matière", "المادة", "select", "subjects");
const year = f("yearId", "Année scolaire", "السنة الدراسية", "select", "years");
const opts = (
  key: string,
  fr: string,
  ar: string,
  values: [string, string, string][],
): Field => ({
  ...f(key, fr, ar, "select"),
  options: values.map(([value, a, b]) => ({ value, label: [a, b] })),
});
export const modules: Record<Kind, Module> = {
  students: {
    label: ["Élèves", "التلاميذ"],
    description: [
      "Profils, inscriptions et familles",
      "الملفات والتسجيل والعائلات",
    ],
    fields: [
      f("first", "Prénom", "الاسم الشخصي"),
      f("last", "Nom", "الاسم العائلي"),
      f("dob", "Date de naissance", "تاريخ الميلاد", "date", undefined, false),
      opts("gender", "Genre", "الجنس", [
        ["F", "Fille", "أنثى"],
        ["M", "Garçon", "ذكر"],
      ]),
      cls,
      year,
      opts("status", "Statut", "الحالة", [
        ["active", "Actif", "نشط"],
        ["pending", "À compléter", "غير مكتمل"],
        ["archived", "Archivé", "مؤرشف"],
      ]),
      f(
        "parentIds",
        "Responsables liés",
        "أولياء الأمور المرتبطون",
        "multi",
        "parents",
        false,
      ),
      f("address", "Adresse", "العنوان", "text", undefined, false),
      f(
        "notes",
        "Notes administratives",
        "ملاحظات إدارية",
        "textarea",
        undefined,
        false,
      ),
    ],
    columns: ["first", "classId", "yearId", "status"],
  },
  levels: {
    label: ["Niveaux", "المستويات"],
    description: [
      "Structure pédagogique de votre école",
      "الهيكل التعليمي للمدرسة",
    ],
    fields: [
      f("name", "Nom du niveau", "اسم المستوى"),
      { ...f("order", "Ordre", "الترتيب", "number"), min: 0, max: 30 },
    ],
    columns: ["name", "order"],
  },
  classes: {
    label: ["Classes", "الأقسام"],
    description: [
      "Affectations et capacité d’accueil",
      "التعيينات والطاقة الاستيعابية",
    ],
    fields: [
      f("name", "Nom de classe", "اسم القسم"),
      f("levelId", "Niveau", "المستوى", "select", "levels", false),
      year,
      f("teacherIds", "Enseignants", "المدرسون", "multi", "teachers", false),
      {
        ...f("capacity", "Capacité", "عدد المقاعد", "number"),
        min: 1,
        max: 200,
      },
    ],
    columns: ["name", "levelId", "yearId", "capacity"],
  },
  subjects: {
    label: ["Matières", "المواد"],
    description: [
      "Matières et coefficients des bulletins",
      "المواد ومعاملات التقارير",
    ],
    fields: [
      f("name", "Matière", "المادة"),
      {
        ...f("coefficient", "Coefficient", "المعامل", "number"),
        min: 0.1,
        max: 20,
      },
    ],
    columns: ["name", "coefficient"],
  },
  years: {
    label: ["Années scolaires", "السنوات الدراسية"],
    description: [
      "Périodes d’inscription et calendrier",
      "فترات التسجيل والتقويم",
    ],
    fields: [
      f("name", "Année scolaire", "السنة الدراسية"),
      f("start", "Début", "البداية", "date"),
      f("end", "Fin", "النهاية", "date"),
      f("active", "Active", "نشطة", "checkbox", undefined, false),
    ],
    columns: ["name", "start", "end", "active"],
  },
  events: {
    label: ["Calendrier", "التقويم"],
    description: [
      "Événements, vacances et réunions",
      "الأحداث والعطل والاجتماعات",
    ],
    fields: [
      f("title", "Titre", "العنوان"),
      f("start", "Début", "البداية", "date"),
      f("end", "Fin", "النهاية", "date"),
      { ...cls, required: false },
      f("description", "Description", "الوصف", "textarea", undefined, false),
    ],
    columns: ["title", "start", "end", "classId"],
  },
  attendance: {
    label: ["Présences", "الحضور"],
    description: [
      "Appel par classe, séance et date",
      "تسجيل الحضور حسب القسم والحصة والتاريخ",
    ],
    fields: [
      student,
      cls,
      f("date", "Date", "التاريخ", "date"),
      f("session", "Séance", "الحصة"),
      opts("status", "Statut", "الحالة", [
        ["present", "Présent", "حاضر"],
        ["absent", "Absent", "غائب"],
        ["late", "En retard", "متأخر"],
        ["excused", "Absence justifiée", "غياب مبرر"],
      ]),
      {
        ...f("minutes", "Retard (minutes)", "التأخر بالدقائق", "number"),
        min: 0,
        max: 600,
      },
      f("note", "Note", "ملاحظة", "textarea", undefined, false),
    ],
    columns: ["studentId", "date", "session", "status", "minutes"],
  },
  homework: {
    label: ["Devoirs", "الواجبات"],
    description: [
      "Consignes, échéances et pièces jointes",
      "التعليمات والمواعيد والمرفقات",
    ],
    fields: [
      f("title", "Titre", "العنوان"),
      cls,
      subject,
      f("due", "À rendre le", "آخر أجل", "date"),
      f("instructions", "Consignes", "التعليمات", "textarea", undefined, false),
    ],
    columns: ["title", "classId", "subjectId", "due"],
  },
  assessments: {
    label: ["Évaluations", "التقييمات"],
    description: ["Épreuves et coefficients", "الاختبارات والمعاملات"],
    fields: [
      f("title", "Évaluation", "التقييم"),
      cls,
      subject,
      f("date", "Date", "التاريخ", "date"),
      opts("term", "Trimestre", "الدورة", [
        ["T1", "Trimestre 1", "الدورة 1"],
        ["T2", "Trimestre 2", "الدورة 2"],
        ["T3", "Trimestre 3", "الدورة 3"],
      ]),
      {
        ...f("maximum", "Barème", "النقطة القصوى", "number"),
        min: 1,
        max: 1000,
      },
      {
        ...f("coefficient", "Coefficient", "المعامل", "number"),
        min: 0.1,
        max: 20,
      },
    ],
    columns: ["title", "classId", "subjectId", "term", "maximum"],
  },
  grades: {
    label: ["Notes & bulletins", "النقط والتقارير"],
    description: [
      "Notes, moyennes pondérées et bulletins",
      "النقط والمعدلات الموزونة والتقارير",
    ],
    fields: [
      student,
      f("assessmentId", "Évaluation", "التقييم", "select", "assessments"),
      { ...f("score", "Note", "النقطة", "number"), min: 0, max: 1000 },
      f("comment", "Appréciation", "الملاحظة", "textarea", undefined, false),
    ],
    columns: ["studentId", "assessmentId", "score", "comment"],
  },
  feeSchedules: {
    label: ["Tarifs", "جداول الرسوم"],
    description: ["Échéanciers et montants en MAD", "الآجال والمبالغ بالدرهم"],
    fields: [
      f("title", "Libellé", "البيان"),
      { ...cls, required: false },
      year,
      f("amount", "Montant (MAD)", "المبلغ (درهم)", "money"),
      f("due", "Échéance", "الموعد", "date"),
    ],
    columns: ["title", "classId", "yearId", "amount", "due"],
  },
  invoices: {
    label: ["Scolarité & paiements", "الرسوم والمدفوعات"],
    description: [
      "Factures, soldes et rappels",
      "الفواتير والأرصدة والتذكيرات",
    ],
    fields: [
      student,
      f("scheduleId", "Tarif", "جدول الرسوم", "select", "feeSchedules", false),
      f("title", "Libellé", "البيان"),
      f("amount", "Montant (MAD)", "المبلغ (درهم)", "money"),
      f("due", "Échéance", "الموعد", "date"),
    ],
    columns: ["studentId", "title", "amount", "due"],
  },
  payments: {
    label: ["Paiements & reçus", "المدفوعات والإيصالات"],
    description: [
      "Registre des paiements et reçus",
      "سجل المدفوعات والإيصالات",
    ],
    fields: [
      f("invoiceId", "Facture", "الفاتورة", "select", "invoices"),
      f("amount", "Montant (MAD)", "المبلغ (درهم)", "money"),
      f("date", "Date", "التاريخ", "date"),
      opts("method", "Mode de paiement", "طريقة الدفع", [
        ["cash", "Espèces", "نقداً"],
        ["transfer", "Virement", "تحويل"],
        ["card", "Carte", "بطاقة"],
        ["cheque", "Chèque", "شيك"],
      ]),
      f("reference", "Référence", "المرجع", "text", undefined, false),
    ],
    columns: ["invoiceId", "amount", "date", "method"],
  },
  announcements: {
    label: ["Annonces", "الإعلانات"],
    description: [
      "Communication ciblée par classe et rôle",
      "التواصل حسب القسم والدور",
    ],
    fields: [
      f("title", "Titre", "العنوان"),
      f("body", "Annonce", "الإعلان", "textarea"),
      { ...cls, required: false },
      opts("role", "Destinataires", "المستلمون", [
        ["all", "Tout le monde", "الجميع"],
        ["teacher", "Enseignants", "المدرسون"],
        ["parent", "Parents", "أولياء الأمور"],
        ["student", "Élèves", "التلاميذ"],
        ["admin", "Administration", "الإدارة"],
      ]),
      f("publishDate", "Publication", "تاريخ النشر", "date"),
    ],
    columns: ["title", "classId", "role", "publishDate"],
  },
  messages: {
    label: ["Messagerie", "المراسلات"],
    description: [
      "Échanges privés avec les familles et l’école",
      "محادثات خاصة مع العائلات والمدرسة",
    ],
    fields: [
      f("recipientId", "Destinataire", "المستلم", "select", "recipients"),
      f("body", "Message", "الرسالة", "textarea"),
    ],
    columns: ["recipientId", "body"],
  },
};
export const today = () => new Date().toISOString().slice(0, 10);
export function defaults(kind: Kind) {
  const result: Record<string, string | number | boolean | string[]> = {};
  for (const field of modules[kind].fields)
    result[field.key] =
      field.type === "multi"
        ? []
        : field.type === "checkbox"
          ? false
          : field.type === "date" && field.required
            ? today()
            : field.type === "money"
              ? 0
              : field.type === "number"
                ? field.key === "maximum"
                  ? 20
                  : field.key === "capacity"
                    ? 30
                    : field.key === "coefficient"
                      ? 1
                      : 0
                : (field.options?.[0].value ?? "");
  return result;
}
