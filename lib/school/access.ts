import type { Role } from "./model";

export const accessAreas = {
  admin: {
    title: ["Espace administration", "مساحة الإدارة"],
    description: [
      "Gérez l’école, les comptes, les classes et les finances.",
      "إدارة المدرسة والحسابات والأقسام والمالية.",
    ],
    students: ["Élèves", "التلاميذ"],
  },
  teacher: {
    title: ["Espace enseignant", "مساحة المدرس"],
    description: [
      "Suivez vos classes : présences, devoirs, notes et échanges avec les familles.",
      "تتبع أقسامك: الحضور والواجبات والنقط والتواصل مع الأسر.",
    ],
    students: ["Mes élèves", "تلاميذي"],
  },
  parent: {
    title: ["Espace parent", "مساحة ولي الأمر"],
    description: [
      "Suivez vos enfants, leurs devoirs, leurs résultats et les frais scolaires.",
      "تتبع أطفالك وواجباتهم ونتائجهم والرسوم المدرسية.",
    ],
    students: ["Mes enfants", "أطفالي"],
  },
  student: {
    title: ["Espace élève", "مساحة التلميذ"],
    description: [
      "Consultez votre profil, vos devoirs, vos présences et vos résultats.",
      "اطلع على ملفك وواجباتك وحضورك ونتائجك.",
    ],
    students: ["Mon profil", "ملفي"],
  },
} as const;

export function canOpenPage(role: Role, page: string): boolean {
  if (role === "admin") return true;
  if (
    [
      "administration",
      "users",
      "classes",
      "levels",
      "subjects",
      "years",
      "feeSchedules",
    ].includes(page)
  )
    return false;
  if (["invoices", "payments"].includes(page)) return role === "parent";
  if (page === "assessments") return role === "teacher";
  return [
    "dashboard",
    "students",
    "attendance",
    "homework",
    "grades",
    "events",
    "announcements",
    "notifications",
    "messages",
    "files",
    "settings",
    "sync",
  ].includes(page);
}
