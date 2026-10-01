import {
  type RecordItem,
  type User,
  type Notice,
  type SchoolFile,
} from "./model";
export type Snapshot = {
  user: User;
  records: RecordItem[];
  users: User[];
  files: SchoolFile[];
  notifications: Notice[];
  audit: Record<string, string>[];
  settings: { name: string; currency: string };
  serverTime: string;
  email?: { configured: boolean; provider: string; from: string };
};
export type Pending = {
  mutationId: string;
  id: string;
  kind: RecordItem["kind"];
  data: RecordItem["data"];
  version: number;
  error?: string;
};
function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("scola-offline-v1", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("accounts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function localRead<T>(key: string): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("accounts", "readonly"),
      request = transaction.objectStore("accounts").get(key);
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}
export async function localWrite(key: string, value: unknown) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("accounts", "readwrite");
    if (value === undefined) transaction.objectStore("accounts").delete(key);
    else transaction.objectStore("accounts").put(value, key);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}
export async function clearLocal() {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("accounts", "readwrite");
    transaction.objectStore("accounts").clear();
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}
export async function request<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  const value = (await response.json()) as { error?: string };
  if (!response.ok)
    throw Object.assign(new Error(value.error ?? "Service indisponible."), {
      status: response.status,
    });
  return value as T;
}
