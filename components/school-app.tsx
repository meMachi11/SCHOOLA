"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  GraduationCap,
  Users,
  School,
  ClipboardCheck,
  BookOpen,
  ChartColumn,
  Wallet,
  Bell,
  MessageCircle,
  Megaphone,
  Files,
  Settings,
  LayoutDashboard,
  Globe,
  LogOut,
  Menu,
  Plus,
  Search,
  RefreshCw,
  WifiOff,
  Check,
  Upload,
  Printer,
  Download,
  ShieldCheck,
  CalendarDays,
  Trash2,
  X,
  ChevronRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  modules,
  defaults,
  today,
  type Field,
  type Label,
} from "../lib/school/forms";
import {
  kinds,
  roles,
  weightedAverage,
  type Kind,
  type User,
  type RecordItem,
  type Values,
} from "../lib/school/model";
import {
  request,
  localRead,
  localWrite,
  clearLocal,
  type Snapshot,
  type Pending,
} from "../lib/school/offline";
type LegacyParent = {
  name: string;
  relation: string;
  phone: string;
  email: string;
};
type Page =
  | Kind
  | "dashboard"
  | "administration"
  | "files"
  | "notifications"
  | "users"
  | "settings"
  | "sync";
type Editor = { kind: Kind; id: string; version: number; data: Values };
const nav: { page: Page; label: Label; icon: typeof Users }[] = [
  {
    page: "dashboard",
    label: ["Vue d’ensemble", "نظرة عامة"],
    icon: LayoutDashboard,
  },
  { page: "students", label: modules.students.label, icon: Users },
  {
    page: "administration",
    label: ["Administration", "الإدارة المدرسية"],
    icon: School,
  },
  { page: "attendance", label: modules.attendance.label, icon: ClipboardCheck },
  { page: "homework", label: modules.homework.label, icon: BookOpen },
  { page: "grades", label: modules.grades.label, icon: ChartColumn },
  { page: "invoices", label: modules.invoices.label, icon: Wallet },
  { page: "notifications", label: ["Notifications", "الإشعارات"], icon: Bell },
  {
    page: "announcements",
    label: modules.announcements.label,
    icon: Megaphone,
  },
  { page: "messages", label: modules.messages.label, icon: MessageCircle },
  { page: "files", label: ["Documents", "الوثائق"], icon: Files },
  {
    page: "users",
    label: ["Utilisateurs & accès", "المستخدمون والصلاحيات"],
    icon: ShieldCheck,
  },
  { page: "settings", label: ["Paramètres", "الإعدادات"], icon: Settings },
];
const statusLabels: Record<string, Label> = {
  active: ["Actif", "نشط"],
  pending: ["À compléter", "غير مكتمل"],
  archived: ["Archivé", "مؤرشف"],
  present: ["Présent", "حاضر"],
  absent: ["Absent", "غائب"],
  late: ["En retard", "متأخر"],
  excused: ["Justifié", "مبرر"],
  admin: ["Administrateur", "مدير"],
  teacher: ["Enseignant", "مدرس"],
  parent: ["Parent", "ولي أمر"],
  student: ["Élève", "تلميذ"],
  all: ["Tout le monde", "الجميع"],
  cash: ["Espèces", "نقداً"],
  transfer: ["Virement", "تحويل"],
  card: ["Carte", "بطاقة"],
  cheque: ["Chèque", "شيك"],
};
export default function SchoolApp() {
  const [pendingReviewId, setPendingReviewId] = useState<string | null>(null);
  const [lang, setLang] = useState<"fr" | "ar">("fr"),
    [page, setPage] = useState<Page>("dashboard"),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(false),
    [online, setOnline] = useState(true),
    [offline, setOffline] = useState(false),
    [pending, setPending] = useState<Pending[]>([]),
    [editor, setEditor] = useState<Editor | null>(null),
    [detail, setDetail] = useState<RecordItem | null>(null),
    [query, setQuery] = useState(""),
    [classFilter, setClassFilter] = useState(""),
    [yearFilter, setYearFilter] = useState(""),
    [adminTab, setAdminTab] = useState<Kind>("classes"),
    [feeTab, setFeeTab] = useState<Kind>("invoices"),
    [gradeTab, setGradeTab] = useState<"grades" | "assessments" | "reports">(
      "grades",
    ),
    [userEditor, setUserEditor] = useState<User | null>(null),
    [userNew, setUserNew] = useState(false),
    [recipient, setRecipient] = useState(""),
    [chat, setChat] = useState(""),
    [resetToken, setResetToken] = useState(""),
    [authMode, setAuthMode] = useState<"login" | "forgot" | "reset">("login"),
    [pushState, setPushState] = useState("");
  const syncLock = useRef(false),
    offlineRef = useRef(false),
    snapshotRef = useRef<Snapshot | null>(null);
  const t = useCallback((label: Label) => label[lang === "ar" ? 1 : 0], [lang]);
  const message = useCallback(
    (e: unknown) =>
      lang === "ar"
        ? "تعذر إكمال العملية. تحقق من البيانات وحاول مجدداً."
        : e instanceof Error
          ? e.message
          : "Impossible de terminer. Réessayez.",
    [lang],
  );
  const refresh = useCallback(async () => {
    const value = await request<Snapshot>("/api/school");
    snapshotRef.current = value;
    setSnapshot(value);
    if (offlineRef.current) {
      await localWrite("active-account", value.user.id);
      await localWrite("snapshot:" + value.user.id, value);
    }
    return value;
  }, []);
  const sync = useCallback(async () => {
    if (syncLock.current || !navigator.onLine) return;
    syncLock.current = true;
    try {
      const fresh = await refresh();
      const queue =
        (await localRead<Pending[]>("pending:" + fresh.user.id)) ?? [];
      const remaining: Pending[] = [];
      for (const item of queue) {
        try {
          await request("/api/school", "POST", item);
        } catch (e) {
          remaining.push({
            ...item,
            error:
              e instanceof Error ? e.message : "Synchronisation interrompue.",
          });
        }
      }
      await localWrite("pending:" + fresh.user.id, remaining);
      setPending(remaining);
      if (queue.length) await refresh();
    } catch (e) {
      if (
        (e as { status?: number }).status === 401 ||
        (e as { status?: number }).status === 403
      ) {
        await clearLocal();
        setSnapshot(null);
        snapshotRef.current = null;
        setPending([]);
      }
    } finally {
      syncLock.current = false;
    }
  }, [refresh]);
  useEffect(() => {
    let alive = true;
    async function initialize() {
      const saved = localStorage.getItem("scola-language");
      const preference = localStorage.getItem("scola-offline") === "yes";
      offlineRef.current = preference;
      const params = new URLSearchParams(location.search);
      const token = params.get("reset") ?? "";
      const requestedPage = params.get("module");
      try {
        const value = await refresh();
        if (!alive) return;
        setPending(
          (await localRead<Pending[]>("pending:" + value.user.id)) ?? [],
        );
      } catch (e) {
        if (!alive) return;
        if (!(e as { status?: number }).status && preference) {
          const id = await localRead<string>("active-account"),
            cached = id ? await localRead<Snapshot>("snapshot:" + id) : null;
          if (cached && Date.now() - Date.parse(cached.serverTime) < 86400000) {
            snapshotRef.current = cached;
            setSnapshot(cached);
            setPending((await localRead<Pending[]>("pending:" + id)) ?? []);
          } else
            setError(
              "Connectez-vous pour actualiser votre espace hors connexion.",
            );
        } else if ([401, 403].includes((e as { status?: number }).status ?? 0))
          await clearLocal();
        else setError(e instanceof Error ? e.message : "Service indisponible.");
      } finally {
        if (alive) {
          setLang(saved === "ar" ? "ar" : "fr");
          setOffline(preference);
          setOnline(navigator.onLine);
          setResetToken(token);
          if (token) setAuthMode("reset");
          if (
            requestedPage &&
            [...kinds, "notifications", "dashboard", "files"].includes(
              requestedPage,
            )
          )
            setPage(requestedPage as Page);
          setLoading(false);
        }
      }
    }
    void initialize();
    const changed = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void sync();
    };
    const swSync = (e: MessageEvent) => {
      if (e.data?.type === "sync") void sync();
    };
    window.addEventListener("online", changed);
    window.addEventListener("offline", changed);
    navigator.serviceWorker?.addEventListener("message", swSync);
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    const interval = setInterval(() => {
      if (navigator.onLine && snapshotRef.current) void sync();
    }, 30000);
    return () => {
      alive = false;
      clearInterval(interval);
      window.removeEventListener("online", changed);
      window.removeEventListener("offline", changed);
      navigator.serviceWorker?.removeEventListener("message", swSync);
    };
  }, [refresh, sync]);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    localStorage.setItem("scola-language", lang);
  }, [lang]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timeout);
  }, [toast]);
  const records = snapshot?.records ?? [],
    users = snapshot?.users ?? [],
    user = snapshot?.user;
  const admin = user?.role === "admin",
    teacher = user?.role === "teacher",
    writer = admin || teacher;
  const byKind = (kind: Kind) => records.filter((r) => r.kind === kind);
  function recordName(r: RecordItem) {
    return String(
      r.kind === "students"
        ? r.data.first + " " + r.data.last
        : (r.data.name ?? r.data.title ?? r.data.body ?? r.id.slice(0, 8)),
    );
  }
  function name(id: unknown) {
    const r = records.find((r) => r.id === id);
    return r
      ? recordName(r)
      : (users.find((u) => u.id === id)?.name ??
          String(id || t(["Toute l’école", "كل المدرسة"])));
  }
  function money(cents: unknown) {
    return new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-MA", {
      style: "currency",
      currency: "MAD",
    }).format(Number(cents) / 100);
  }
  function display(r: RecordItem, key: string) {
    const value = r.data[key];
    if (key === "first") return recordName(r);
    if (key.endsWith("Id")) return name(value);
    if (key === "amount") return money(value);
    if (typeof value === "boolean")
      return t(value ? ["Oui", "نعم"] : ["Non", "لا"]);
    if (typeof value === "string" && statusLabels[value])
      return t(statusLabels[value]);
    if (Array.isArray(value)) return value.map(name).join(", ");
    return String(value ?? "—");
  }
  function navigate(next: Page) {
    setPage(next);
    setMobile(false);
    setQuery("");
    setClassFilter("");
    setError("");
  }
  function canEdit(kind: Kind) {
    return (
      admin ||
      (teacher &&
        [
          "attendance",
          "homework",
          "assessments",
          "grades",
          "announcements",
        ].includes(kind)) ||
      kind === "messages"
    );
  }
  function newRecord(kind: Kind, preset: Values = {}) {
    setError("");
    setEditor({
      kind,
      id: crypto.randomUUID(),
      version: 0,
      data: {
        ...defaults(kind),
        ...(classFilter ? { classId: classFilter } : {}),
        ...(yearFilter ? { yearId: yearFilter } : {}),
        ...preset,
      },
    });
  }
  async function mutate(item: Pending) {
    if (!user) throw new Error("Connexion requise.");
    try {
      if (!navigator.onLine) throw new TypeError("offline");
      await request("/api/school", "POST", item);
      const queue = (await localRead<Pending[]>("pending:" + user.id)) ?? [];
      const remaining = queue.filter((p) => p.id !== item.id);
      await localWrite("pending:" + user.id, remaining);
      setPending(remaining);
      await refresh();
      setToast(t(["Enregistré", "تم الحفظ"]));
    } catch (e) {
      if (
        !(e as { status?: number }).status &&
        offlineRef.current &&
        !["payments", "invoices", "feeSchedules"].includes(item.kind)
      ) {
        const queue = (await localRead<Pending[]>("pending:" + user.id)) ?? [];
        const previous = queue.find((q) => q.id === item.id);
        const queued = {
          ...item,
          version: previous?.version ?? item.version,
          mutationId: previous?.mutationId ?? item.mutationId,
        };
        const next = [...queue.filter((q) => q.id !== item.id), queued];
        await localWrite("pending:" + user.id, next);
        setPending(next);
        const optimistic: RecordItem = {
          id: item.id,
          kind: item.kind,
          data: item.data,
          version: item.version,
          authorId: user.id,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        };
        const current = snapshotRef.current!;
        const updated = {
          ...current,
          records: [
            optimistic,
            ...current.records.filter((r) => r.id !== item.id),
          ],
        };
        snapshotRef.current = updated;
        setSnapshot(updated);
        await localWrite("snapshot:" + user.id, updated);
        setToast(
          t([
            "Enregistré sur cet appareil. Envoi au retour de la connexion.",
            "تم الحفظ على الجهاز. سيُرسل عند عودة الاتصال.",
          ]),
        );
      } else throw e;
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    setBusy(true);
    setError("");
    try {
      await mutate({ ...editor, mutationId: crypto.randomUUID() });
      if (pendingReviewId) {
        const queue = (await localRead<Pending[]>("pending:" + user!.id)) ?? [];
        const next = queue.filter((p) => p.mutationId !== pendingReviewId);
        await localWrite("pending:" + user!.id, next);
        setPending(next);
        setPendingReviewId(null);
      }
      setEditor(null);
      setDetail(null);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function run(
    fn: () => Promise<unknown>,
    success: Label = ["Enregistré", "تم الحفظ"],
  ) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
      setToast(t(success));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function auth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await request("/api/auth", "POST", {
        action: authMode,
        email: form.get("email"),
        password: form.get("password"),
        token: resetToken,
      });
      if (authMode === "login") {
        await clearLocal();
        await refresh();
        setPending([]);
      } else if (authMode === "forgot")
        setToast(
          t([
            "Si ce compte existe, un lien lui a été envoyé.",
            "إذا كان الحساب موجوداً، فسيصله رابط الاستعادة.",
          ]),
        );
      else {
        setAuthMode("login");
        setResetToken("");
        history.replaceState(null, "", "/");
        setToast(
          t([
            "Mot de passe réinitialisé. Connectez-vous.",
            "تم تغيير كلمة المرور. سجّل الدخول.",
          ]),
        );
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (!online) {
      setError(
        t([
          "Reconnectez-vous pour fermer votre session.",
          "اتصل بالإنترنت لإنهاء الجلسة.",
        ]),
      );
      return;
    }
    if (
      pending.length &&
      !confirm(
        t([
          "Des changements attendent leur envoi. Les supprimer et se déconnecter ?",
          "هناك تغييرات لم تُرسل بعد. هل تريد حذفها والخروج؟",
        ]),
      )
    )
      return;
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      const subscription = await registration?.pushManager?.getSubscription();
      if (subscription) {
        await request(
          "/api/push?endpoint=" + encodeURIComponent(subscription.endpoint),
          "DELETE",
        );
        await subscription.unsubscribe();
      }
      await request("/api/auth", "POST", { action: "logout" });
      await clearLocal();
      localStorage.removeItem("scola-offline");
      await caches.delete("scola-shell-v2");
      snapshotRef.current = null;
      setSnapshot(null);
      setPending([]);
      setOffline(false);
      offlineRef.current = false;
      // Dispatch-owned sign-out requires a top-level browser navigation.
      if (user?.identityId) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        location.assign("/signout-with-chatgpt?return_to=/");
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  function options(field: Field) {
    if (field.options)
      return field.options.map((o) => ({ value: o.value, label: t(o.label) }));
    if (["teachers", "parents", "recipients"].includes(field.source ?? ""))
      return users
        .filter(
          (u) =>
            u.active &&
            (field.source === "recipients"
              ? u.id !== user?.id
              : u.role ===
                (field.source === "teachers" ? "teacher" : "parent")),
        )
        .map((u) => ({ value: u.id, label: u.name }));
    return byKind(field.source as Kind)
      .filter(
        (r) =>
          !teacher ||
          field.source !== "classes" ||
          user!.classIds.includes(r.id),
      )
      .map((r) => ({ value: r.id, label: recordName(r) }));
  }
  function fieldInput(
    field: Field,
    data: Values,
    onChange: (key: string, value: Values[string]) => void,
  ) {
    const value = data[field.key];
    const attributes = { id: "field-" + field.key, required: field.required };
    if (field.type === "checkbox")
      return (
        <input
          {...attributes}
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(field.key, e.target.checked)}
        />
      );
    if (field.type === "textarea")
      return (
        <textarea
          {...attributes}
          rows={4}
          maxLength={5000}
          value={String(value ?? "")}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      );
    if (field.type === "multi")
      return (
        <select
          {...attributes}
          multiple
          size={Math.min(5, Math.max(2, options(field).length))}
          value={Array.isArray(value) ? value : []}
          onChange={(e) =>
            onChange(
              field.key,
              Array.from(e.target.selectedOptions, (o) => o.value),
            )
          }
        >
          {options(field).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    if (field.type === "select")
      return (
        <select
          {...attributes}
          value={String(value ?? "")}
          onChange={(e) => onChange(field.key, e.target.value)}
        >
          <option value="">
            {t(
              field.required
                ? ["Sélectionner…", "اختر…"]
                : ["Toute l’école / non renseigné", "كل المدرسة / غير محدد"],
            )}
          </option>
          {options(field).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    const number = field.type === "number" || field.type === "money";
    return (
      <input
        {...attributes}
        type={number ? "number" : (field.type ?? "text")}
        min={field.type === "money" ? 0.01 : field.min}
        max={field.type === "money" ? 1000000 : field.max}
        step={number ? 0.01 : undefined}
        maxLength={field.key === "notes" ? 3000 : 200}
        value={
          number
            ? Number(value) / (field.type === "money" ? 100 : 1)
            : String(value ?? "")
        }
        onChange={(e) =>
          onChange(
            field.key,
            number
              ? field.type === "money"
                ? Math.round(Number(e.target.value) * 100)
                : Number(e.target.value)
              : e.target.value,
          )
        }
      />
    );
  }
  const currentKind: Kind | undefined =
    page === "administration"
      ? adminTab
      : page === "invoices"
        ? feeTab
        : page === "grades"
          ? gradeTab === "assessments"
            ? "assessments"
            : gradeTab === "grades"
              ? "grades"
              : undefined
          : kinds.includes(page as Kind)
            ? (page as Kind)
            : undefined;
  const title = currentKind
    ? t(modules[currentKind].label)
    : t(
        nav.find((n) => n.page === page)?.label ?? [
          "Synchronisation",
          "المزامنة",
        ],
      );
  const filtered = currentKind
    ? byKind(currentKind).filter(
        (r) =>
          (!query ||
            JSON.stringify(r.data)
              .toLowerCase()
              .includes(query.toLowerCase()) ||
            (currentKind &&
              modules[currentKind].columns.some((k) =>
                display(r, k).toLowerCase().includes(query.toLowerCase()),
              ))) &&
          (!classFilter ||
            r.data.classId === classFilter ||
            (r.kind === "students" && r.data.classId === classFilter) ||
            (r.data.studentId &&
              records.find((s) => s.id === r.data.studentId)?.data.classId ===
                classFilter) ||
            (r.kind === "grades" &&
              records.find((a) => a.id === r.data.assessmentId)?.data
                .classId === classFilter)) &&
          (!yearFilter || !r.data.yearId || r.data.yearId === yearFilter),
      )
    : [];
  const selectedFiles = detail
    ? (snapshot?.files.filter((f) => f.recordId === detail.id) ?? [])
    : [];
  const paid = (id: string) =>
    byKind("payments")
      .filter((p) => p.data.invoiceId === id)
      .reduce((n, p) => n + Number(p.data.amount), 0);
  async function upload(recordId: string, file: File) {
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("record", recordId);
      body.set("file", file);
      const response = await fetch("/api/documents", { method: "POST", body });
      const value = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(value.error);
      await refresh();
      setToast(t(["Document ajouté", "تمت إضافة الوثيقة"]));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function enablePush() {
    setBusy(true);
    try {
      if (!("PushManager" in window) || !navigator.serviceWorker)
        throw new Error(
          t([
            "Ce navigateur ne prend pas en charge les notifications push. Sur iPhone, installez Scola sur l’écran d’accueil.",
            "المتصفح لا يدعم الإشعارات. على آيفون، ثبّت التطبيق على الشاشة الرئيسية.",
          ]),
        );
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error(
          t([
            "Autorisez les notifications dans les paramètres du navigateur.",
            "اسمح بالإشعارات في إعدادات المتصفح.",
          ]),
        );
      const { publicKey } = await request<{ publicKey: string }>("/api/push");
      const registration = await navigator.serviceWorker.ready;
      const raw = Uint8Array.from(
        atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0),
      );
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: raw,
        }));
      await request("/api/push", "POST", {
        subscription: subscription.toJSON(),
      });
      setPushState(
        t([
          "Notifications activées sur cet appareil",
          "الإشعارات مفعلة على هذا الجهاز",
        ]),
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <div className="startup">
        <GraduationCap size={44} />
        <h1>scola.</h1>
        <p>{t(["Chargement de votre école…", "جار تحميل مدرستك…"])}</p>
      </div>
    );
  if (!user || resetToken)
    return (
      <main className="auth-layout">
        <section className="auth-brand">
          <GraduationCap size={46} />
          <h1>scola.</h1>
          <h2>
            {t(["Votre école, au même endroit.", "مدرستك في مكان واحد."])}
          </h2>
          <p>
            {t([
              "Un espace pour l’administration, les enseignants, les élèves et leurs familles.",
              "مساحة للإدارة والمدرسين والتلاميذ وعائلاتهم.",
            ])}
          </p>
        </section>
        <section className="auth-card">
          <button
            className="language"
            onClick={() => setLang(lang === "fr" ? "ar" : "fr")}
          >
            <Globe size={18} />
            {lang === "fr" ? "العربية" : "Français"}
          </button>
          <h2>
            {t(
              authMode === "login"
                ? ["Connexion", "تسجيل الدخول"]
                : authMode === "forgot"
                  ? ["Retrouver votre accès", "استعادة الحساب"]
                  : ["Nouveau mot de passe", "كلمة مرور جديدة"],
            )}
          </h2>
          <form onSubmit={auth}>
            {authMode !== "reset" && (
              <label>
                {t(["Email", "البريد الإلكتروني"])}
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="username"
                />
              </label>
            )}
            {authMode !== "forgot" && (
              <label>
                {t(["Mot de passe", "كلمة المرور"])}
                <input
                  type="password"
                  name="password"
                  required
                  minLength={authMode === "reset" ? 12 : 1}
                  maxLength={128}
                  autoComplete={
                    authMode === "reset" ? "new-password" : "current-password"
                  }
                />
              </label>
            )}
            {error && (
              <div role="alert" className="error">
                {error}
              </div>
            )}
            <button className="primary" disabled={busy}>
              {t(
                authMode === "login"
                  ? ["Se connecter", "دخول"]
                  : authMode === "forgot"
                    ? ["Envoyer un lien", "إرسال رابط"]
                    : ["Enregistrer", "حفظ"],
              )}
            </button>
          </form>
          {authMode === "login" ? (
            <>
              <a
                className="secondary siwc"
                href="/signin-with-chatgpt?return_to=/"
                target="_top"
              >
                {t(["Se connecter avec ChatGPT", "الدخول عبر ChatGPT"])}
              </a>
              <button
                className="text-button"
                onClick={() => {
                  setAuthMode("forgot");
                  setError("");
                }}
              >
                {t(["Mot de passe oublié ?", "نسيت كلمة المرور؟"])}
              </button>
              <p className="muted">
                {t([
                  "Votre école doit vous attribuer un compte avant votre première connexion.",
                  "يجب أن تمنحك المدرسة حساباً قبل الدخول لأول مرة.",
                ])}
              </p>
            </>
          ) : (
            <button
              className="text-button"
              onClick={() => {
                setAuthMode("login");
                setResetToken("");
                history.replaceState(null, "", "/");
              }}
            >
              {t(["Retour à la connexion", "العودة لتسجيل الدخول"])}
            </button>
          )}
        </section>
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </main>
    );
  return (
    <div className="app-shell school-app" dir={lang === "ar" ? "rtl" : "ltr"}>
      {mobile && (
        <button
          className="mobile-backdrop"
          aria-label={t(["Fermer le menu", "إغلاق القائمة"])}
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={"sidebar " + (mobile ? "shown" : "")}>
        <div className="brand">
          <span className="brandmark">
            <GraduationCap size={25} />
          </span>
          scola<span className="brand-dot">.</span>
        </div>
        <div className="workspace">
          <span className="school-icon">
            <School size={20} />
          </span>
          <div>
            <strong>{snapshot.settings.name}</strong>
            <small>{t(statusLabels[user.role])}</small>
          </div>
        </div>
        <nav aria-label={t(["Navigation principale", "القائمة الرئيسية"])}>
          {nav
            .filter(
              (n) => admin || !["users", "administration"].includes(n.page),
            )
            .map((n) => (
              <button
                key={n.page}
                aria-label={t(n.label)}
                className={"nav-item " + (page === n.page ? "active" : "")}
                onClick={() => navigate(n.page)}
              >
                <n.icon size={19} />
                {t(n.label)}
                {n.page === "notifications" &&
                  snapshot.notifications.some((v) => !v.read) && (
                    <span className="nav-count">
                      {snapshot.notifications.filter((v) => !v.read).length}
                    </span>
                  )}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => navigate("sync")}>
            <RefreshCw size={18} />
            {t(["Synchronisation", "المزامنة"])}
            {pending.length > 0 && (
              <span className="nav-count">{pending.length}</span>
            )}
          </button>
          <div className="account">
            <span className="account-avatar">
              {user.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>{user.name}</strong>
              <small>{t(statusLabels[user.role])}</small>
            </div>
            <button
              className="icon-button"
              disabled={busy}
              aria-label={t(["Se déconnecter", "تسجيل الخروج"])}
              onClick={logout}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobile(!mobile)}
              aria-label={t(["Menu", "القائمة"])}
            >
              <Menu size={22} />
            </button>
            <span>{snapshot.settings.name}</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="top-controls">
            <button
              className={"connection " + (!online ? "is-offline" : "")}
              onClick={() => navigate("sync")}
            >
              {online ? <ShieldCheck size={16} /> : <WifiOff size={16} />}
              <span>
                {t(
                  online
                    ? ["Connecté", "متصل"]
                    : ["Hors connexion", "دون اتصال"],
                )}
                {pending.length ? ` · ${pending.length}` : ""}
              </span>
            </button>
            <button
              className="language"
              onClick={() => setLang(lang === "fr" ? "ar" : "fr")}
            >
              <Globe size={17} />
              {lang === "fr" ? "العربية" : "Français"}
            </button>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {t(["ESPACE ÉCOLE", "مساحة المدرسة"])}
              </span>
              <h1>{title}</h1>
              <p>
                {currentKind
                  ? t(modules[currentKind].description)
                  : page === "dashboard"
                    ? t([
                        "Ce qui compte pour votre école, aujourd’hui.",
                        "ما يهم مدرستك اليوم.",
                      ])
                    : ""}
              </p>
            </div>
            {byKind("years").length > 0 && (
              <label className="year-select">
                <CalendarDays size={19} />
                <div>
                  <small>{t(["Année scolaire", "السنة الدراسية"])}</small>
                  <select
                    value={yearFilter}
                    onChange={(e) => setYearFilter(e.target.value)}
                  >
                    <option value="">
                      {t(["Toutes les années", "كل السنوات"])}
                    </option>
                    {byKind("years").map((r) => (
                      <option key={r.id} value={r.id}>
                        {recordName(r)}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
            )}
          </div>
          {error && !editor && !userEditor && !userNew && (
            <div className="error" role="alert">
              {error}
              <button
                className="icon-button"
                aria-label={t(["Fermer", "إغلاق"])}
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!online && (
            <div className="offline-banner">
              <WifiOff size={18} />
              {t([
                "Vous consultez les données enregistrées sur cet appareil. Les changements autorisés seront synchronisés au retour de la connexion.",
                "تطّلع على بيانات محفوظة على هذا الجهاز. ستتم مزامنة التغييرات المسموح بها عند عودة الاتصال.",
              ])}
            </div>
          )}
          {page === "administration" && (
            <div className="module-tabs">
              {(
                ["classes", "levels", "subjects", "years", "events"] as Kind[]
              ).map((k) => (
                <button
                  className={adminTab === k ? "selected" : ""}
                  key={k}
                  onClick={() => {
                    setAdminTab(k);
                    setQuery("");
                  }}
                >
                  {t(modules[k].label)}
                </button>
              ))}
            </div>
          )}
          {page === "invoices" && (
            <div className="module-tabs">
              {(
                [
                  "invoices",
                  "payments",
                  ...(admin ? ["feeSchedules"] : []),
                ] as Kind[]
              ).map((k) => (
                <button
                  className={feeTab === k ? "selected" : ""}
                  key={k}
                  onClick={() => {
                    setFeeTab(k);
                    setQuery("");
                  }}
                >
                  {t(modules[k].label)}
                </button>
              ))}
              {admin && (
                <button
                  disabled={busy || !online}
                  onClick={() =>
                    run(
                      () =>
                        request("/api/school", "POST", { action: "remind" }),
                      [
                        "Rappels envoyés aux parents concernés",
                        "تم إرسال التذكيرات لأولياء الأمور المعنيين",
                      ],
                    )
                  }
                >
                  <Bell size={16} />
                  {t(["Envoyer les rappels", "إرسال التذكيرات"])}
                </button>
              )}
            </div>
          )}
          {page === "grades" && (
            <div className="module-tabs">
              {(["grades", "assessments", "reports"] as const).map((k) => (
                <button
                  key={k}
                  className={gradeTab === k ? "selected" : ""}
                  onClick={() => setGradeTab(k)}
                >
                  {t(
                    k === "reports"
                      ? ["Bulletins", "التقارير"]
                      : modules[k].label,
                  )}
                </button>
              ))}
            </div>
          )}
          {page === "dashboard" && (
            <Dashboard
              records={records}
              year={yearFilter}
              name={name}
              t={t}
              money={money}
              onNavigate={navigate}
            />
          )}
          {currentKind && page !== "messages" && (
            <section className="directory">
              <div className="directory-title">
                <div>
                  <h2>{t(modules[currentKind].label)}</h2>
                  <span>{filtered.length}</span>
                </div>
                {canEdit(currentKind) && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => newRecord(currentKind)}
                  >
                    <Plus size={18} />
                    {t(["Ajouter", "إضافة"])}
                  </button>
                )}
              </div>
              <div className="filters">
                <div className="search">
                  <Search size={18} />
                  <input
                    value={query}
                    placeholder={t(["Rechercher…", "بحث…"])}
                    aria-label={t(["Rechercher", "بحث"])}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                {!["years", "levels", "subjects", "payments"].includes(
                  currentKind,
                ) && (
                  <select
                    value={classFilter}
                    aria-label={t(["Classe", "القسم"])}
                    onChange={(e) => setClassFilter(e.target.value)}
                  >
                    <option value="">
                      {t(["Toutes les classes", "كل الأقسام"])}
                    </option>
                    {byKind("classes").map((r) => (
                      <option key={r.id} value={r.id}>
                        {recordName(r)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {currentKind === "attendance" && writer && (
                <div className="attendance-action">
                  <span>
                    {t([
                      "Appel rapide : choisissez une classe, puis marquez tous les élèves présents. Vous pourrez corriger les absences et retards.",
                      "اختر قسماً وسجّل حضور الجميع، ثم عدّل الغياب والتأخر.",
                    ])}
                  </span>
                  <button
                    className="secondary"
                    disabled={!classFilter || busy}
                    onClick={() =>
                      run(async () => {
                        for (const student of byKind("students").filter(
                          (s) =>
                            s.data.classId === classFilter &&
                            s.data.status === "active",
                        )) {
                          if (
                            byKind("attendance").some(
                              (a) =>
                                a.data.studentId === student.id &&
                                a.data.date === today() &&
                                a.data.session === "Journée",
                            )
                          )
                            continue;
                          await mutate({
                            id: crypto.randomUUID(),
                            kind: "attendance",
                            data: {
                              studentId: student.id,
                              classId: classFilter,
                              date: today(),
                              session: "Journée",
                              status: "present",
                              minutes: 0,
                              note: "",
                            },
                            version: 0,
                            mutationId: crypto.randomUUID(),
                          });
                        }
                      }, ["Appel enregistré", "تم تسجيل الحضور"])
                    }
                  >
                    <Check size={16} />
                    {t(["Présents aujourd’hui", "حاضرون اليوم"])}
                  </button>
                </div>
              )}
              {filtered.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {modules[currentKind].columns.map((key) => (
                          <th key={key}>
                            {t(
                              modules[currentKind].fields.find(
                                (f) => f.key === key,
                              )!.label,
                            )}
                          </th>
                        ))}
                        {currentKind === "invoices" && (
                          <th>{t(["Solde", "الرصيد"])}</th>
                        )}
                        <th>{t(["Actions", "الإجراءات"])}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => (
                        <tr key={r.id}>
                          {modules[currentKind].columns.map((key, i) => (
                            <td key={key}>
                              {i === 0 ? (
                                <button
                                  className="record-link"
                                  onClick={() => setDetail(r)}
                                >
                                  {r.kind === "students" && (
                                    <span className="avatar">
                                      {String(r.data.first)[0]}
                                      {String(r.data.last)[0]}
                                    </span>
                                  )}
                                  <strong>{display(r, key)}</strong>
                                </button>
                              ) : key === "status" ? (
                                <span className={"status " + r.data.status}>
                                  {display(r, key)}
                                </span>
                              ) : (
                                display(r, key)
                              )}
                            </td>
                          ))}
                          {r.kind === "invoices" && (
                            <td>
                              <span
                                className={
                                  "status " +
                                  (paid(r.id) >= Number(r.data.amount)
                                    ? "active"
                                    : String(r.data.due) < today()
                                      ? "late"
                                      : "pending")
                                }
                              >
                                {money(Number(r.data.amount) - paid(r.id))}
                              </span>
                            </td>
                          )}
                          <td>
                            <button
                              className="secondary compact"
                              onClick={() => setDetail(r)}
                            >
                              {t(["Ouvrir", "فتح"])}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty">
                  <Files size={28} />
                  <h3>
                    {t([
                      "Aucun dossier pour le moment",
                      "لا توجد ملفات حالياً",
                    ])}
                  </h3>
                  <p>
                    {t(
                      canEdit(currentKind)
                        ? [
                            "Ajoutez un dossier pour commencer. Configurez d’abord vos années, classes et matières dans Administration.",
                            "أضف ملفاً للبدء. اضبط أولاً السنوات والأقسام والمواد في الإدارة.",
                          ]
                        : [
                            "Les dossiers partagés par votre école apparaîtront ici.",
                            "ستظهر هنا الملفات التي تشاركها مدرستك.",
                          ],
                    )}
                  </p>
                </div>
              )}
            </section>
          )}
          {page === "grades" && gradeTab === "reports" && (
            <section className="directory">
              <div className="directory-title">
                <h2>{t(["Bulletins par élève", "تقارير التلاميذ"])}</h2>
              </div>
              <div className="report-grid">
                {byKind("students")
                  .filter((s) => !yearFilter || s.data.yearId === yearFilter)
                  .map((s) => {
                    const result = weightedAverage(
                      byKind("grades"),
                      byKind("assessments"),
                      byKind("subjects"),
                      s.id,
                    );
                    return (
                      <button
                        className="report-card"
                        key={s.id}
                        onClick={() => setDetail(s)}
                      >
                        <span className="avatar">
                          {String(s.data.first)[0]}
                          {String(s.data.last)[0]}
                        </span>
                        <strong>{recordName(s)}</strong>
                        <small>{name(s.data.classId)}</small>
                        <b>
                          {result.average === null
                            ? "—"
                            : result.average.toFixed(2)}
                          <small> / 20</small>
                        </b>
                        <span>
                          {t(["Consulter le bulletin", "عرض التقرير"])}
                        </span>
                      </button>
                    );
                  })}
              </div>
              {!byKind("students").length && <Empty t={t} />}
            </section>
          )}
          {page === "messages" && (
            <section className="messaging">
              <aside>
                <h2>{t(["Conversations", "المحادثات"])}</h2>
                <select
                  value={recipient}
                  aria-label={t(["Destinataire", "المستلم"])}
                  onChange={(e) => setRecipient(e.target.value)}
                >
                  <option value="">
                    {t(["Choisir un interlocuteur", "اختر جهة اتصال"])}
                  </option>
                  {users
                    .filter((u) => u.id !== user.id && u.active)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} · {t(statusLabels[u.role])}
                      </option>
                    ))}
                </select>
                {users
                  .filter(
                    (u) =>
                      u.id !== user.id &&
                      byKind("messages").some(
                        (m) =>
                          (m.authorId === u.id &&
                            m.data.recipientId === user.id) ||
                          (m.authorId === user.id &&
                            m.data.recipientId === u.id),
                      ),
                  )
                  .map((u) => (
                    <button
                      className={recipient === u.id ? "selected" : ""}
                      key={u.id}
                      onClick={() => setRecipient(u.id)}
                    >
                      {u.name}
                    </button>
                  ))}
              </aside>
              <div className="conversation">
                <div className="conversation-heading">
                  <strong>
                    {recipient
                      ? name(recipient)
                      : t(["Votre messagerie", "المراسلات"])}
                  </strong>
                  <ShieldCheck size={18} />
                </div>
                <div className="chat-messages">
                  {byKind("messages")
                    .filter(
                      (m) =>
                        (m.authorId === user.id &&
                          m.data.recipientId === recipient) ||
                        (m.authorId === recipient &&
                          m.data.recipientId === user.id),
                    )
                    .sort((a, b) => a.created.localeCompare(b.created))
                    .map((m) => (
                      <div
                        className={
                          "chat-bubble " +
                          (m.authorId === user.id ? "mine" : "")
                        }
                        key={m.id}
                      >
                        <p>{String(m.data.body)}</p>
                        <small>
                          {new Date(m.created).toLocaleString(
                            lang === "ar" ? "ar-MA" : "fr-FR",
                          )}
                          {pending.some((p) => p.id === m.id)
                            ? " · " + t(["En attente", "قيد الانتظار"])
                            : ""}
                        </small>
                      </div>
                    ))}
                  {!recipient && <Empty t={t} />}
                </div>
                <form
                  className="chat-compose"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!chat.trim() || !recipient) return;
                    setBusy(true);
                    try {
                      await mutate({
                        kind: "messages",
                        id: crypto.randomUUID(),
                        version: 0,
                        data: { recipientId: recipient, body: chat },
                        mutationId: crypto.randomUUID(),
                      });
                      setChat("");
                    } catch (e) {
                      setError(message(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <textarea
                    aria-label={t(["Message", "الرسالة"])}
                    placeholder={t(["Écrire un message…", "اكتب رسالة…"])}
                    value={chat}
                    maxLength={5000}
                    required
                    disabled={!recipient}
                    onChange={(e) => setChat(e.target.value)}
                  />
                  <button
                    className="primary"
                    disabled={busy || !recipient || !chat.trim()}
                  >
                    {t(["Envoyer", "إرسال"])}
                  </button>
                </form>
              </div>
            </section>
          )}
          {page === "notifications" && (
            <section className="directory">
              <div className="directory-title">
                <h2>
                  {t(["Votre centre de notifications", "مركز الإشعارات"])}
                </h2>
                <button
                  className="secondary"
                  disabled={busy || !online}
                  onClick={() =>
                    run(() =>
                      request("/api/school", "POST", {
                        action: "read",
                        id: "all",
                      }),
                    )
                  }
                >
                  {t(["Tout marquer comme lu", "تحديد الكل كمقروء"])}
                </button>
              </div>
              <div className="push-controls">
                <button
                  className="primary"
                  disabled={busy || !online}
                  onClick={enablePush}
                >
                  <Bell size={17} />
                  {t(["Activer les notifications push", "تفعيل الإشعارات"])}
                </button>
                <button
                  className="secondary"
                  disabled={busy || !online}
                  onClick={() =>
                    run(async () => {
                      const result = await request<{
                        devices: number;
                        sent: number;
                      }>("/api/push", "POST", { action: "test" });
                      setPushState(
                        `${result.sent}/${result.devices} · ` +
                          t(["appareils notifiés", "أجهزة تم إشعارها"]),
                      );
                    })
                  }
                >
                  {t(["Tester", "اختبار"])}
                </button>
                <button
                  className="secondary"
                  disabled={busy || !online}
                  onClick={() =>
                    run(async () => {
                      const registration =
                        await navigator.serviceWorker.getRegistration();
                      const subscription =
                        await registration?.pushManager?.getSubscription();
                      if (subscription) {
                        await request(
                          "/api/push?endpoint=" +
                            encodeURIComponent(subscription.endpoint),
                          "DELETE",
                        );
                        await subscription.unsubscribe();
                      }
                      setPushState(
                        t(["Notifications désactivées", "تم إيقاف الإشعارات"]),
                      );
                    })
                  }
                >
                  {t(["Désactiver", "إيقاف"])}
                </button>
                {pushState && <span role="status">{pushState}</span>}
              </div>
              {snapshot.notifications.map((n) => (
                <button
                  className={"notice " + (!n.read ? "unread" : "")}
                  key={n.id}
                  onClick={() =>
                    run(async () => {
                      await request("/api/school", "POST", {
                        action: "read",
                        id: n.id,
                      });
                      navigate(n.link as Page);
                    })
                  }
                >
                  <Bell size={19} />
                  <div>
                    <strong>
                      {n.title.split(" / ")[lang === "ar" ? 1 : 0] ?? n.title}
                    </strong>
                    <p>
                      {n.body.split(" / ")[lang === "ar" ? 1 : 0] ?? n.body}
                    </p>
                    <small>
                      {new Date(n.created).toLocaleString(
                        lang === "ar" ? "ar-MA" : "fr-FR",
                      )}
                    </small>
                  </div>
                  <ChevronRight size={18} />
                </button>
              ))}
              {!snapshot.notifications.length && <Empty t={t} />}
            </section>
          )}
          {page === "files" && (
            <section className="directory">
              <div className="directory-title">
                <h2>{t(["Documents de votre école", "وثائق المدرسة"])}</h2>
              </div>
              <div className="file-list">
                {snapshot.files.map((f) => (
                  <a
                    className="document-row"
                    key={f.id}
                    href={"/api/documents?id=" + f.id}
                  >
                    <Files size={24} />
                    <div>
                      <strong>{f.name}</strong>
                      <small>
                        {name(f.recordId)} · {(f.size / 1024).toFixed(0)} Ko
                      </small>
                    </div>
                    <Download size={18} />
                  </a>
                ))}
              </div>
              <div className="attendance-action">
                {t([
                  "Pour ajouter un document, ouvrez le profil de l’élève, le devoir ou l’annonce concerné. PDF, JPG ou PNG · 5 Mo · 10 documents maximum par dossier.",
                  "لإضافة وثيقة، افتح ملف التلميذ أو الواجب أو الإعلان. PDF أو JPG أو PNG · 5 ميغابايت · 10 وثائق لكل ملف.",
                ])}
              </div>
              {!snapshot.files.length && <Empty t={t} />}
            </section>
          )}
          {page === "users" && admin && (
            <section className="directory">
              <div className="directory-title">
                <h2>
                  {t(["Comptes et autorisations", "الحسابات والصلاحيات"])}
                </h2>
                <button
                  className="primary"
                  onClick={() => {
                    setError("");
                    setUserNew(true);
                  }}
                >
                  <Plus size={18} />
                  {t(["Créer un compte", "إنشاء حساب"])}
                </button>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {[
                        ["Nom", "الاسم"],
                        ["Email", "البريد الإلكتروني"],
                        ["Rôle", "الدور"],
                        ["Accès", "الصلاحيات"],
                        ["Statut", "الحالة"],
                      ].map((l) => (
                        <th key={l[0]}>{t(l as unknown as Label)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <button
                            className="record-link"
                            onClick={() => {
                              setError("");
                              setUserEditor(u);
                            }}
                          >
                            <strong>{u.name}</strong>
                          </button>
                        </td>
                        <td>{u.email}</td>
                        <td>{t(statusLabels[u.role])}</td>
                        <td>
                          {u.role === "admin"
                            ? t(["Toute l’école", "كل المدرسة"])
                            : [...u.classIds, ...u.studentIds]
                                .map(name)
                                .join(", ") || "—"}
                        </td>
                        <td>
                          <span
                            className={
                              "status " + (u.active ? "active" : "archived")
                            }
                          >
                            {t(
                              u.active
                                ? ["Actif", "نشط"]
                                : ["Désactivé", "معطل"],
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {page === "settings" && (
            <section className="settings-grid">
              {admin && (
                <div className="directory settings-card">
                  <h2>{t(["Votre école", "مدرستك"])}</h2>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = new FormData(e.currentTarget);
                      void run(() =>
                        request("/api/school", "POST", {
                          action: "settings",
                          data: { name: form.get("name") },
                        }),
                      );
                    }}
                  >
                    <label>
                      {t(["Nom de l’école", "اسم المدرسة"])}
                      <input
                        name="name"
                        defaultValue={snapshot.settings.name}
                        required
                        maxLength={100}
                      />
                    </label>
                    <p>
                      {t([
                        "Devise : dirham marocain (MAD)",
                        "العملة: الدرهم المغربي",
                      ])}
                    </p>
                    <button className="primary" disabled={busy || !online}>
                      {t(["Enregistrer", "حفظ"])}
                    </button>
                  </form>
                </div>
              )}
              {admin && (
                <div className="directory settings-card">
                  <h2>
                    {t(["Emails de récupération", "رسائل استعادة الحساب"])}
                  </h2>
                  <p>
                    {t(
                      snapshot.email?.configured
                        ? [
                            "Service connecté. Envoyez un test pour vérifier la livraison.",
                            "الخدمة متصلة. أرسل اختباراً للتحقق من التسليم.",
                          ]
                        : [
                            "Connectez Resend, Brevo ou Mailgun avec une adresse expéditrice vérifiée. Votre adresse seule ne permet pas l’envoi.",
                            "اربط Resend أو Brevo أو Mailgun بعنوان إرسال مُتحقق منه. العنوان وحده لا يكفي للإرسال.",
                          ],
                    )}
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = new FormData(e.currentTarget);
                      const element = e.currentTarget;
                      void run(async () => {
                        await request("/api/school", "POST", {
                          action: "email",
                          data: {
                            provider: form.get("provider"),
                            from: form.get("from"),
                            key: form.get("key"),
                            domain: form.get("domain"),
                          },
                        });
                        element.reset();
                      });
                    }}
                  >
                    <label>
                      {t(["Service", "الخدمة"])}
                      <select
                        name="provider"
                        defaultValue={snapshot.email?.provider ?? "resend"}
                      >
                        <option value="resend">Resend</option>
                        <option value="brevo">Brevo</option>
                        <option value="mailgun">Mailgun</option>
                      </select>
                    </label>
                    <label>
                      {t([
                        "Adresse expéditrice vérifiée",
                        "عنوان الإرسال المتحقق منه",
                      ])}
                      <input
                        name="from"
                        type="email"
                        defaultValue={
                          snapshot.email?.from ?? "contact@schoolapp.space"
                        }
                        required
                      />
                    </label>
                    <label>
                      {t([
                        "Clé API du service (chiffrée sur le serveur)",
                        "مفتاح API للخدمة (مشفر على الخادم)",
                      ])}
                      <input
                        name="key"
                        type="password"
                        minLength={10}
                        maxLength={500}
                        required
                        autoComplete="off"
                      />
                    </label>
                    <label>
                      {t([
                        "Domaine Mailgun (si utilisé)",
                        "نطاق Mailgun (إن استُخدم)",
                      ])}
                      <input name="domain" />
                    </label>
                    <button className="primary" disabled={busy || !online}>
                      {t(["Connecter le service", "ربط الخدمة"])}
                    </button>
                  </form>
                  {snapshot.email?.configured && (
                    <button
                      className="secondary email-test"
                      disabled={busy || !online}
                      onClick={() =>
                        run(
                          () =>
                            request("/api/school", "POST", {
                              action: "email-test",
                            }),
                          [
                            "Email test envoyé à votre adresse",
                            "تم إرسال اختبار إلى بريدك",
                          ],
                        )
                      }
                    >
                      {t(["Envoyer un email test", "إرسال رسالة اختبار"])}
                    </button>
                  )}
                  <p className="provider-links">
                    <a
                      href="https://resend.com/api-keys"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Resend
                    </a>{" "}
                    ·{" "}
                    <a
                      href="https://app.brevo.com/settings/keys/api"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Brevo
                    </a>{" "}
                    ·{" "}
                    <a
                      href="https://app.mailgun.com/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Mailgun
                    </a>
                  </p>
                </div>
              )}
              <div className="directory settings-card">
                <h2>{t(["Sécurité du compte", "أمان الحساب"])}</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    const element = e.currentTarget;
                    void run(async () => {
                      await request("/api/auth", "POST", {
                        action: "password",
                        currentPassword: form.get("current"),
                        password: form.get("password"),
                      });
                      element.reset();
                    }, [
                      "Mot de passe changé. Les anciennes sessions ont été fermées.",
                      "تم تغيير كلمة المرور وإغلاق الجلسات القديمة.",
                    ]);
                  }}
                >
                  <label>
                    {t(["Mot de passe actuel", "كلمة المرور الحالية"])}
                    <input
                      name="current"
                      type="password"
                      autoComplete="current-password"
                    />
                  </label>
                  <label>
                    {t(["Nouveau mot de passe", "كلمة مرور جديدة"])}
                    <input
                      name="password"
                      type="password"
                      required
                      minLength={12}
                      maxLength={128}
                      autoComplete="new-password"
                    />
                  </label>
                  <small>
                    {t([
                      "12 caractères minimum, avec lettres et chiffres.",
                      "12 حرفاً على الأقل، تتضمن حروفاً وأرقاماً.",
                    ])}
                  </small>
                  <button className="primary" disabled={busy || !online}>
                    {t(["Modifier le mot de passe", "تغيير كلمة المرور"])}
                  </button>
                </form>
              </div>
              {admin && (
                <div className="directory settings-card audit-card">
                  <h2>{t(["Journal de sécurité", "سجل الأمان"])}</h2>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>{t(["Date", "التاريخ"])}</th>
                          <th>{t(["Utilisateur", "المستخدم"])}</th>
                          <th>{t(["Action", "العملية"])}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshot.audit.map((a) => (
                          <tr key={a.id}>
                            <td>
                              {new Date(a.created).toLocaleString(
                                lang === "ar" ? "ar-MA" : "fr-FR",
                              )}
                            </td>
                            <td>{name(a.actor_id)}</td>
                            <td>{a.action}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          )}
          {page === "sync" && (
            <section className="directory settings-card">
              <h2>{t(["Travailler hors connexion", "العمل دون اتصال"])}</h2>
              <p>
                {t([
                  "Autorisez la conservation des dossiers sur cet appareil privé. Désactivez cette option sur un appareil partagé. Les paiements, comptes et pièces jointes nécessitent une connexion. Les données hors connexion expirent après 24 heures.",
                  "اسمح بحفظ الملفات على جهازك الخاص. لا تستخدم هذا الخيار على جهاز مشترك. تحتاج المدفوعات والحسابات والمرفقات إلى الاتصال. تنتهي صلاحية البيانات المحفوظة بعد 24 ساعة.",
                ])}
              </p>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={offline}
                  onChange={async (e) => {
                    const enabled = e.target.checked;
                    if (!enabled && pending.length) {
                      setError(
                        t([
                          "Synchronisez ou supprimez les changements en attente avant de désactiver.",
                          "زامن أو احذف التغييرات المعلقة أولاً.",
                        ]),
                      );
                      return;
                    }
                    setOffline(enabled);
                    offlineRef.current = enabled;
                    localStorage.setItem(
                      "scola-offline",
                      enabled ? "yes" : "no",
                    );
                    if (enabled) {
                      await localWrite("active-account", user.id);
                      await localWrite("snapshot:" + user.id, snapshot);
                    } else await clearLocal();
                  }}
                />
                {t([
                  "Enregistrer les dossiers sur cet appareil",
                  "حفظ الملفات على هذا الجهاز",
                ])}
              </label>
              <div className="sync-summary">
                <RefreshCw size={28} />
                <div>
                  <strong>
                    {pending.length}{" "}
                    {t(["changements en attente", "تغييرات معلقة"])}
                  </strong>
                  <small>
                    {t(["Dernière actualisation", "آخر تحديث"])} ·{" "}
                    {new Date(snapshot.serverTime).toLocaleString(
                      lang === "ar" ? "ar-MA" : "fr-FR",
                    )}
                  </small>
                </div>
                <button
                  className="primary"
                  disabled={!online || busy}
                  onClick={() => run(sync)}
                >
                  {t(["Synchroniser", "مزامنة"])}
                </button>
              </div>
              {pending.map((p) => (
                <div className="pending-row" key={p.mutationId}>
                  <div>
                    <strong>
                      {t(modules[p.kind].label)} ·{" "}
                      {String(
                        p.data.title ?? p.data.first ?? p.data.body ?? p.id,
                      )}
                    </strong>
                    <p>
                      {p.error
                        ? t([
                            "Conflit ou refus : rechargez le dossier, puis réappliquez vos modifications.",
                            "تعارض أو رفض: أعد تحميل الملف وطبّق التغييرات مجدداً.",
                          ])
                        : t(["En attente de connexion", "في انتظار الاتصال"])}
                    </p>
                  </div>
                  <button
                    className="secondary"
                    disabled={!online}
                    onClick={() => {
                      const existing = records.find(
                        (r) =>
                          r.id === p.id ||
                          (r.kind === p.kind &&
                            (p.kind === "attendance"
                              ? r.data.studentId === p.data.studentId &&
                                r.data.date === p.data.date &&
                                r.data.session === p.data.session
                              : p.kind === "grades"
                                ? r.data.studentId === p.data.studentId &&
                                  r.data.assessmentId === p.data.assessmentId
                                : false)),
                      );
                      setPendingReviewId(p.mutationId);
                      setEditor({
                        kind: p.kind,
                        id: existing?.id ?? p.id,
                        version: existing?.version ?? 0,
                        data: p.data,
                      });
                    }}
                  >
                    {t(["Revoir et réenregistrer", "مراجعة وحفظ مجدداً"])}
                  </button>
                  <button
                    className="secondary"
                    onClick={async () => {
                      const next = pending.filter(
                        (v) => v.mutationId !== p.mutationId,
                      );
                      await localWrite("pending:" + user.id, next);
                      setPending(next);
                      if (online) await refresh();
                    }}
                  >
                    {t(["Supprimer cet envoi", "حذف هذا الإرسال"])}
                  </button>
                </div>
              ))}
            </section>
          )}
          <footer className="page-footer">
            <span>scola · {snapshot.settings.name}</span>
            <span>{t(statusLabels[user.role])} · MAD</span>
          </footer>
        </main>
      </div>
      <Dialog
        open={!!editor}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setEditor(null);
            setError("");
          }
        }}
      >
        <DialogContent className="school-dialog" showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>
              {editor ? t(modules[editor.kind].label) : ""}
            </DialogTitle>
            <DialogDescription>
              {t([
                "Informations du dossier. Les champs obligatoires sont marqués *.",
                "معلومات الملف. الحقول المطلوبة تحمل علامة *.",
              ])}
            </DialogDescription>
          </DialogHeader>
          {editor && (
            <form onSubmit={save}>
              <div className="form-grid">
                {modules[editor.kind].fields.map((field) => (
                  <label
                    key={field.key}
                    className={
                      field.type === "textarea" || field.type === "multi"
                        ? "full-field"
                        : ""
                    }
                    htmlFor={"field-" + field.key}
                  >
                    {t(field.label)}
                    {field.required ? " *" : ""}
                    {fieldInput(field, editor.data, (key, value) =>
                      setEditor({
                        ...editor,
                        data: { ...editor.data, [key]: value },
                      }),
                    )}
                    {field.type === "multi" && (
                      <small>
                        {t([
                          "Maintenez Ctrl / Cmd pour sélectionner plusieurs comptes.",
                          "اضغط Ctrl / Cmd لاختيار عدة حسابات.",
                        ])}
                      </small>
                    )}
                  </label>
                ))}
              </div>
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              <div className="modal-actions">
                <button
                  className="secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEditor(null);
                    setError("");
                  }}
                >
                  {t(["Annuler", "إلغاء"])}
                </button>
                <button
                  className="primary"
                  disabled={
                    busy ||
                    (!online &&
                      ["payments", "invoices", "feeSchedules"].includes(
                        editor.kind,
                      ))
                  }
                >
                  {t(["Enregistrer", "حفظ"])}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!detail && !editor}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent className="school-dialog detail-dialog">
          <DialogHeader>
            <DialogTitle>{detail ? recordName(detail) : ""}</DialogTitle>
            <DialogDescription>
              {detail ? t(modules[detail.kind].label) : ""}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="record-detail">
              <div className="detail-actions">
                {canEdit(detail.kind) &&
                  !["payments", "messages"].includes(detail.kind) && (
                    <button
                      className="primary"
                      onClick={() => {
                        const fresh =
                          records.find((r) => r.id === detail.id) ?? detail;
                        setError("");
                        setEditor({
                          id: fresh.id,
                          kind: fresh.kind,
                          version: fresh.version,
                          data: { ...fresh.data },
                        });
                      }}
                    >
                      {t(["Modifier", "تعديل"])}
                    </button>
                  )}
                {detail.kind === "students" && admin && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const fresh =
                          records.find((r) => r.id === detail.id) ?? detail;
                        await mutate({
                          id: fresh.id,
                          kind: "students",
                          data: {
                            ...fresh.data,
                            status:
                              fresh.data.status === "archived"
                                ? "active"
                                : "archived",
                          },
                          version: fresh.version,
                          mutationId: crypto.randomUUID(),
                        });
                        setDetail(null);
                      })
                    }
                  >
                    {t(
                      detail.data.status === "archived"
                        ? ["Réactiver", "إعادة التفعيل"]
                        : ["Archiver", "أرشفة"],
                    )}
                  </button>
                )}
                <button className="secondary" onClick={() => window.print()}>
                  <Printer size={16} />
                  {t(["Imprimer", "طباعة"])}
                </button>
                {admin &&
                  !["students", "payments", "invoices", "messages"].includes(
                    detail.kind,
                  ) && (
                    <button
                      className="icon-button danger"
                      disabled={busy || !online}
                      aria-label={t(["Supprimer", "حذف"])}
                      onClick={() => {
                        if (
                          confirm(
                            t([
                              "Supprimer ce dossier ? Cette action est définitive.",
                              "حذف هذا الملف؟ لا يمكن التراجع عن هذه العملية.",
                            ]),
                          )
                        )
                          void run(async () => {
                            await request("/api/school", "DELETE", {
                              id: detail.id,
                              version: detail.version,
                            });
                            setDetail(null);
                          });
                      }}
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
              </div>
              <div className="print-heading">
                <h2>{snapshot.settings.name}</h2>
                <h3>
                  {detail.kind === "payments"
                    ? t(["Reçu de paiement", "إيصال الدفع"])
                    : recordName(detail)}
                </h3>
                <p>
                  {detail.id} ·{" "}
                  {new Date(detail.created).toLocaleDateString(
                    lang === "ar" ? "ar-MA" : "fr-FR",
                  )}
                </p>
              </div>
              <dl>
                {modules[detail.kind].fields.map((field) => (
                  <div key={field.key}>
                    <dt>{t(field.label)}</dt>
                    <dd>{display(detail, field.key)}</dd>
                  </div>
                ))}
              </dl>
              {detail.kind === "students" && (
                <>
                  <h3>{t(["Famille", "العائلة"])}</h3>
                  {users
                    .filter(
                      (u) =>
                        u.role === "parent" &&
                        (u.studentIds.includes(detail.id) ||
                          (detail.data.parentIds as string[]).includes(u.id)),
                    )
                    .map((u) => (
                      <div className="family-detail" key={u.id}>
                        <Users size={20} />
                        <div>
                          <strong>{u.name}</strong>
                          {u.email && (
                            <a href={"mailto:" + u.email}>{u.email}</a>
                          )}
                        </div>
                      </div>
                    ))}
                  {(
                    (detail.data.legacyParents ??
                      []) as unknown as LegacyParent[]
                  ).map((p, i) => (
                    <div className="family-detail" key={"legacy-" + i}>
                      <Users size={20} />
                      <div>
                        <strong>{p.name}</strong>
                        {p.phone && <a href={"tel:" + p.phone}>{p.phone}</a>}
                        {p.email && <a href={"mailto:" + p.email}>{p.email}</a>}
                        <small>
                          {t([
                            "Contact historique · associez un compte parent pour lui donner accès",
                            "جهة اتصال سابقة · اربط حساب ولي أمر لمنحه الدخول",
                          ])}
                        </small>
                      </div>
                    </div>
                  ))}
                  <Report
                    student={detail}
                    records={records}
                    t={t}
                    name={name}
                  />
                </>
              )}
              {detail.kind === "invoices" && (
                <div className="invoice-summary">
                  <div>
                    {t(["Payé", "المبلغ المدفوع"])}
                    <strong>{money(paid(detail.id))}</strong>
                  </div>
                  <div>
                    {t(["Solde", "الرصيد"])}
                    <strong>
                      {money(Number(detail.data.amount) - paid(detail.id))}
                    </strong>
                  </div>
                  {admin && paid(detail.id) < Number(detail.data.amount) && (
                    <button
                      className="primary"
                      onClick={() =>
                        newRecord("payments", {
                          invoiceId: detail.id,
                          amount: Number(detail.data.amount) - paid(detail.id),
                        })
                      }
                    >
                      {t(["Enregistrer un paiement", "تسجيل دفعة"])}
                    </button>
                  )}
                  {byKind("payments")
                    .filter((p) => p.data.invoiceId === detail.id)
                    .map((p) => (
                      <button
                        className="document-row"
                        key={p.id}
                        onClick={() => setDetail(p)}
                      >
                        <Wallet size={20} />
                        <div>
                          {money(p.data.amount)}
                          <small>
                            {String(p.data.date)} · {t(["Reçu", "إيصال"])}
                          </small>
                        </div>
                        <Printer size={18} />
                      </button>
                    ))}
                </div>
              )}
              {detail.kind === "feeSchedules" && admin && (
                <button
                  className="primary"
                  disabled={busy || !online}
                  onClick={() =>
                    run(async () => {
                      const students = byKind("students").filter(
                        (s) =>
                          s.data.yearId === detail.data.yearId &&
                          s.data.status === "active" &&
                          (!detail.data.classId ||
                            s.data.classId === detail.data.classId),
                      );
                      for (const s of students) {
                        if (
                          byKind("invoices").some(
                            (i) =>
                              i.data.scheduleId === detail.id &&
                              i.data.studentId === s.id,
                          )
                        )
                          continue;
                        await mutate({
                          id: crypto.randomUUID(),
                          kind: "invoices",
                          version: 0,
                          data: {
                            studentId: s.id,
                            scheduleId: detail.id,
                            title: detail.data.title,
                            amount: detail.data.amount,
                            due: detail.data.due,
                          },
                          mutationId: crypto.randomUUID(),
                        });
                      }
                    }, [
                      "Factures créées pour les élèves concernés",
                      "تم إنشاء فواتير للتلاميذ المعنيين",
                    ])
                  }
                >
                  {t([
                    "Créer les factures des élèves",
                    "إنشاء فواتير التلاميذ",
                  ])}
                </button>
              )}
              {detail.kind === "assessments" && writer && (
                <button
                  className="primary"
                  onClick={() =>
                    newRecord("grades", { assessmentId: detail.id })
                  }
                >
                  {t(["Saisir une note", "إدخال نقطة"])}
                </button>
              )}
              {selectedFiles.length > 0 && (
                <h3>{t(["Documents", "الوثائق"])}</h3>
              )}
              {selectedFiles.map((f) => (
                <a
                  className="document-row"
                  href={"/api/documents?id=" + f.id}
                  key={f.id}
                >
                  <Files size={22} />
                  <div>
                    <strong>{f.name}</strong>
                    <small>{(f.size / 1024).toFixed(0)} Ko</small>
                  </div>
                  <Download size={18} />
                </a>
              ))}
              {(canEdit(detail.kind) ||
                (detail.kind === "students" && user.role === "parent")) &&
                ![
                  "payments",
                  "messages",
                  "invoices",
                  "grades",
                  "attendance",
                  "feeSchedules",
                ].includes(detail.kind) && (
                  <label className="upload-zone">
                    <Upload size={23} />
                    <strong>{t(["Ajouter un document", "إضافة وثيقة"])}</strong>
                    <small>PDF, JPG, PNG · 5 Mo</small>
                    <input
                      type="file"
                      accept="application/pdf,image/png,image/jpeg"
                      disabled={busy || !online}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void upload(detail.id, file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!userEditor || userNew}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setUserEditor(null);
            setUserNew(false);
            setError("");
          }
        }}
      >
        <DialogContent className="school-dialog">
          <DialogHeader>
            <DialogTitle>
              {t(
                userNew
                  ? ["Créer un compte", "إنشاء حساب"]
                  : ["Modifier les autorisations", "تعديل الصلاحيات"],
              )}
            </DialogTitle>
            <DialogDescription>
              {t([
                "Les accès sont vérifiés sur le serveur pour chaque dossier.",
                "تُتحقق صلاحيات كل ملف على الخادم.",
              ])}
            </DialogDescription>
          </DialogHeader>
          {(userEditor || userNew) && (
            <UserForm
              user={userEditor}
              records={records}
              t={t}
              name={name}
              busy={busy || !online}
              error={error}
              onSave={async (value, password) => {
                setBusy(true);
                setError("");
                try {
                  await request("/api/school", "POST", {
                    action: "user",
                    ...(userEditor ? { id: userEditor.id } : {}),
                    data: value,
                    password,
                  });
                  await refresh();
                  setUserEditor(null);
                  setUserNew(false);
                  setToast(t(["Compte enregistré", "تم حفظ الحساب"]));
                } catch (e) {
                  setError(message(e));
                } finally {
                  setBusy(false);
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}
function Empty({ t }: { t: (label: Label) => string }) {
  return (
    <div className="empty">
      <Files size={28} />
      <h3>{t(["Rien pour le moment", "لا توجد بيانات حالياً"])}</h3>
      <p>
        {t([
          "Les informations de votre école apparaîtront ici.",
          "ستظهر معلومات مدرستك هنا.",
        ])}
      </p>
    </div>
  );
}
function UserForm({
  user,
  records,
  t,
  name,
  busy,
  error,
  onSave,
}: {
  user: User | null;
  records: RecordItem[];
  t: (l: Label) => string;
  name: (id: unknown) => string;
  busy: boolean;
  error: string;
  onSave: (
    data: Omit<User, "id" | "identityId">,
    password: string,
  ) => Promise<void>;
}) {
  const [role, setRole] = useState(user?.role ?? "teacher");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        void onSave(
          {
            name: String(form.get("name")),
            email: String(form.get("email")),
            role,
            classIds:
              role === "teacher" ? form.getAll("classIds").map(String) : [],
            studentIds:
              role === "parent" || role === "student"
                ? form.getAll("studentIds").map(String)
                : [],
            active: form.get("active") === "on",
          },
          String(form.get("password") ?? ""),
        );
      }}
    >
      <div className="form-grid">
        <label>
          {t(["Nom", "الاسم"])} *
          <input
            name="name"
            defaultValue={user?.name}
            required
            maxLength={200}
          />
        </label>
        <label>
          {t(["Email", "البريد الإلكتروني"])} *
          <input
            name="email"
            type="email"
            defaultValue={user?.email}
            required
            maxLength={200}
          />
        </label>
        <label>
          {t(["Rôle", "الدور"])}
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as User["role"])}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {t(statusLabels[r])}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t([
            "Mot de passe initial / nouveau",
            "كلمة المرور الأولية / الجديدة",
          ])}
          <input
            type="password"
            name="password"
            required={!user}
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
          <small>
            {t([
              "12 caractères, lettres et chiffres. Laissez vide pour conserver le mot de passe actuel.",
              "12 حرفاً تشمل حروفاً وأرقاماً. اتركه فارغاً للاحتفاظ بكلمة المرور الحالية.",
            ])}
          </small>
        </label>
        {role === "teacher" && (
          <label className="full-field">
            {t(["Classes autorisées", "الأقسام المسموح بها"])}
            <select
              name="classIds"
              multiple
              size={4}
              defaultValue={user?.classIds}
            >
              {records
                .filter((r) => r.kind === "classes")
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {name(r.id)}
                  </option>
                ))}
            </select>
          </label>
        )}
        {(role === "parent" || role === "student") && (
          <label className="full-field">
            {t(["Élèves autorisés", "التلاميذ المسموح بالاطلاع عليهم"])}
            <select
              name="studentIds"
              multiple
              size={5}
              defaultValue={user?.studentIds}
            >
              {records
                .filter((r) => r.kind === "students")
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {name(r.id)}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label className="checkbox-label">
          <input
            name="active"
            type="checkbox"
            defaultChecked={user?.active ?? true}
          />
          {t(["Compte actif", "حساب نشط"])}
        </label>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="modal-actions">
        <button className="primary" disabled={busy}>
          {t(["Enregistrer", "حفظ"])}
        </button>
      </div>
    </form>
  );
}
function Report({
  student,
  records,
  t,
  name,
}: {
  student: RecordItem;
  records: RecordItem[];
  t: (l: Label) => string;
  name: (id: unknown) => string;
}) {
  const [term, setTerm] = useState("T1");
  const result = weightedAverage(
    records.filter((r) => r.kind === "grades"),
    records.filter((r) => r.kind === "assessments"),
    records.filter((r) => r.kind === "subjects"),
    student.id,
    term,
  );
  return (
    <section className="student-report">
      <div className="report-title">
        <h3>{t(["Bulletin scolaire", "التقرير الدراسي"])}</h3>
        <select
          value={term}
          aria-label={t(["Trimestre", "الدورة"])}
          onChange={(e) => setTerm(e.target.value)}
        >
          {["T1", "T2", "T3"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </div>
      <table>
        <thead>
          <tr>
            <th>{t(["Matière", "المادة"])}</th>
            <th>{t(["Coefficient", "المعامل"])}</th>
            <th>{t(["Moyenne / 20", "المعدل / 20"])}</th>
          </tr>
        </thead>
        <tbody>
          {result.subjects.map((r) => (
            <tr key={r.subjectId}>
              <td>{name(r.subjectId)}</td>
              <td>{r.coefficient}</td>
              <td>{r.average.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="report-average">
        <span>{t(["Moyenne générale", "المعدل العام"])}</span>
        <strong>
          {result.average === null ? "—" : result.average.toFixed(2)} / 20
        </strong>
      </div>
      <small>
        {t([
          "Les notes sont normalisées sur 20, pondérées par évaluation puis par matière.",
          "تُحوّل النقط إلى 20 وتُوزن حسب التقييم ثم حسب المادة.",
        ])}
      </small>
    </section>
  );
}
function Dashboard({
  records,
  year,
  name,
  t,
  money,
  onNavigate,
}: {
  records: RecordItem[];
  year: string;
  name: (id: unknown) => string;
  t: (l: Label) => string;
  money: (value: unknown) => string;
  onNavigate: (p: Page) => void;
}) {
  const students = records.filter(
    (r) =>
      r.kind === "students" &&
      r.data.status !== "archived" &&
      (!year || r.data.yearId === year),
  );
  const studentIds = new Set(students.map((r) => r.id));
  const attendance = records.filter(
    (r) =>
      r.kind === "attendance" &&
      studentIds.has(String(r.data.studentId)) &&
      r.data.date === today(),
  );
  const present = attendance.filter((r) =>
    ["present", "late"].includes(String(r.data.status)),
  ).length;
  const invoices = records.filter(
      (r) => r.kind === "invoices" && studentIds.has(String(r.data.studentId)),
    ),
    payments = records.filter(
      (r) =>
        r.kind === "payments" &&
        invoices.some((i) => i.id === r.data.invoiceId),
    );
  const due = invoices.reduce((n, r) => n + Number(r.data.amount), 0),
    paid = payments.reduce((n, r) => n + Number(r.data.amount), 0);
  const assessments = records.filter((r) => r.kind === "assessments"),
    grades = records.filter((r) => r.kind === "grades"),
    subjects = records.filter((r) => r.kind === "subjects");
  const averages = students
    .map((s) => weightedAverage(grades, assessments, subjects, s.id).average)
    .filter((v): v is number => v !== null);
  const average = averages.length
    ? averages.reduce((n, v) => n + v, 0) / averages.length
    : null;
  const stats = [
    {
      label: ["Élèves inscrits", "التلاميذ المسجلون"] as Label,
      value: String(students.length),
      note: [
        "Profils actifs et à compléter",
        "ملفات نشطة وغير مكتملة",
      ] as Label,
      icon: Users,
      tone: "blue",
      page: "students" as Page,
    },
    {
      label: ["Présence aujourd’hui", "حضور اليوم"] as Label,
      value: attendance.length
        ? Math.round((present / attendance.length) * 100) + "%"
        : "—",
      note: [
        `${attendance.length} présences saisies`,
        `${attendance.length} حالات حضور مسجلة`,
      ] as Label,
      icon: ClipboardCheck,
      tone: "teal",
      page: "attendance" as Page,
    },
    {
      label: ["Moyenne scolaire", "المعدل الدراسي"] as Label,
      value: average === null ? "—" : average.toFixed(2) + " / 20",
      note: ["Élèves avec notes", "تلاميذ لديهم نقط"] as Label,
      icon: ChartColumn,
      tone: "purple",
      page: "grades" as Page,
    },
    {
      label: ["Solde des factures", "رصيد الفواتير"] as Label,
      value: money(due - paid),
      note: ["Montant restant à régler", "المبلغ المتبقي للدفع"] as Label,
      icon: Wallet,
      tone: "orange",
      page: "invoices" as Page,
    },
  ];
  const upcoming = records
    .filter(
      (r) =>
        (r.kind === "homework" && String(r.data.due) >= today()) ||
        (r.kind === "events" && String(r.data.end) >= today()),
    )
    .sort((a, b) =>
      String(a.data.due ?? a.data.start).localeCompare(
        String(b.data.due ?? b.data.start),
      ),
    )
    .slice(0, 6);
  return (
    <>
      <section className="stats">
        {stats.map((s) => (
          <button
            className="stat-card"
            key={s.page}
            onClick={() => onNavigate(s.page)}
          >
            <div className="stat-top">
              <span>{t(s.label)}</span>
              <span className={"stat-icon " + s.tone}>
                <s.icon size={21} />
              </span>
            </div>
            <div className="stat-value">{s.value}</div>
            <small>{t(s.note)}</small>
          </button>
        ))}
      </section>
      <div className="dashboard-grid">
        <section className="directory dashboard-card">
          <div className="directory-title">
            <h2>{t(["Présences du jour", "حضور اليوم"])}</h2>
            <button
              className="text-button"
              onClick={() => onNavigate("attendance")}
            >
              {t(["Ouvrir l’appel", "عرض الحضور"])}
            </button>
          </div>
          <div className="attendance-chart">
            {(["present", "late", "absent", "excused"] as const).map(
              (status) => {
                const count = attendance.filter(
                  (a) => a.data.status === status,
                ).length;
                return (
                  <div key={status}>
                    <span>{t(statusLabels[status])}</span>
                    <div className={"chart-bar " + status}>
                      <i
                        style={{
                          width:
                            (attendance.length
                              ? (count / attendance.length) * 100
                              : 0) + "%",
                        }}
                      />
                    </div>
                    <strong>{count}</strong>
                  </div>
                );
              },
            )}
          </div>
          <p className="dashboard-note">
            {t([
              "Le taux est calculé uniquement sur les séances enregistrées.",
              "تُحسب النسبة من الحصص المسجلة فقط.",
            ])}
          </p>
        </section>
        <section className="directory dashboard-card">
          <div className="directory-title">
            <h2>{t(["Scolarité", "الرسوم الدراسية"])}</h2>
            <Wallet size={20} />
          </div>
          <div className="fee-kpi">
            <strong>{money(paid)}</strong>
            <span>
              {t(["encaissés sur", "تم تحصيلها من"])} {money(due)}
            </span>
            <div className="fee-progress">
              <i style={{ width: (due ? (paid / due) * 100 : 0) + "%" }} />
            </div>
            <small>
              {invoices.length} {t(["factures", "فواتير"])} · {payments.length}{" "}
              {t(["paiements", "دفعات"])}
            </small>
          </div>
        </section>
        <section className="directory dashboard-card">
          <div className="directory-title">
            <h2>{t(["À venir", "القادم"])}</h2>
            <CalendarDays size={20} />
          </div>
          {upcoming.map((r) => (
            <button
              className="upcoming-row"
              key={r.id}
              onClick={() => onNavigate(r.kind)}
            >
              <span className="calendar-date">
                {String(r.data.due ?? r.data.start).slice(8)}
                <small>{String(r.data.due ?? r.data.start).slice(5, 7)}</small>
              </span>
              <div>
                <strong>{String(r.data.title)}</strong>
                <small>
                  {name(r.data.classId)} · {String(r.data.due ?? r.data.start)}
                </small>
              </div>
            </button>
          ))}
          {!upcoming.length && <Empty t={t} />}
        </section>
        <section className="directory dashboard-card">
          <div className="directory-title">
            <h2>{t(["Les classes", "الأقسام"])}</h2>
            <School size={20} />
          </div>
          {records
            .filter(
              (r) => r.kind === "classes" && (!year || r.data.yearId === year),
            )
            .map((c) => (
              <button
                className="class-summary"
                key={c.id}
                onClick={() => onNavigate("students")}
              >
                <span className="school-icon">
                  <GraduationCap size={20} />
                </span>
                <strong>{name(c.id)}</strong>
                <span>
                  {students.filter((s) => s.data.classId === c.id).length} /{" "}
                  {String(c.data.capacity)}
                </span>
              </button>
            ))}
          {!records.some((r) => r.kind === "classes") && <Empty t={t} />}
        </section>
      </div>
    </>
  );
}
