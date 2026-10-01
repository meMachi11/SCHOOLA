import assert from "node:assert/strict";
import ts from "typescript";
import { readFileSync } from "node:fs";
const source = readFileSync("lib/school/model.ts", "utf8");
const code = ts.transpileModule(
  source.slice(source.indexOf("export function dataString")),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const { weightedAverage } = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);
const assessments = [
  {
    id: "a",
    data: { subjectId: "math", term: "T1", maximum: 10, coefficient: 2 },
  },
  {
    id: "b",
    data: { subjectId: "math", term: "T1", maximum: 20, coefficient: 1 },
  },
  {
    id: "c",
    data: { subjectId: "fr", term: "T1", maximum: 100, coefficient: 1 },
  },
  {
    id: "d",
    data: { subjectId: "math", term: "T2", maximum: 20, coefficient: 1 },
  },
];
const grades = [
  ["a", 8],
  ["b", 10],
  ["c", 90],
  ["d", 20],
].map(([assessmentId, score]) => ({
  data: { studentId: "s", assessmentId, score },
}));
const subjects = [
  { id: "math", data: { coefficient: 2 } },
  { id: "fr", data: { coefficient: 1 } },
];
const result = weightedAverage(grades, assessments, subjects, "s", "T1");
assert.equal(result.subjects.find((s) => s.subjectId === "math").average, 14);
assert.equal(result.subjects.find((s) => s.subjectId === "fr").average, 18);
assert.ok(Math.abs(result.average - 46 / 3) < 1e-10);
assert.equal(
  weightedAverage(grades, assessments, subjects, "unknown", "T1").average,
  null,
);
assert.equal(
  weightedAverage(grades, assessments, subjects, "s", "T2").average,
  20,
);
console.log(
  "PASS: grade normalization, assessment weighting, subject weighting, term isolation, and empty report handling.",
);
