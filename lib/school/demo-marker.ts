import type { RecordItem, Values } from "./model";
export const DEMO_PREFIX = "scola-demo-v1-";
export const demoId = (name: string) => DEMO_PREFIX + name;
export const isDemoId = (value: unknown) =>
  typeof value === "string" && value.startsWith(DEMO_PREFIX);
export function demoReferences(data: Values, records: RecordItem[] = []) {
  const demoReference = (value: unknown) =>
    isDemoId(value) ||
    records.some((r) => r.id === value && r.data.demo === true);
  return Object.entries(data).some(
    ([key, value]) =>
      /Ids?$/.test(key) &&
      (Array.isArray(value) ? value.some(demoReference) : demoReference(value)),
  );
}
export const isDemoRecord = (record: RecordItem) =>
  record.data.demo === true ||
  isDemoId(record.id) ||
  demoReferences(record.data);
