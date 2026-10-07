// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import type { z } from "zod";

import { dotSchema, generationSchema, problemSchema, sessionSchema } from "./schemas";

// 契約の正本。examplesはWebとAPIが同じ意味で解釈することを確かめる共通の具体例。
const contractPath = fileURLToPath(new URL("../../../../../contracts/openapi.yaml", import.meta.url));
const contract = parse(readFileSync(contractPath, "utf8"));

const schemasByName: Record<string, z.ZodType> = {
  Problem: problemSchema,
  Dot: dotSchema,
  Generation: generationSchema,
  Session: sessionSchema,
};

type Ref = { $ref: string };
type MediaType = { schema?: Ref; examples?: Record<string, Ref> };

const resolve = <T>(ref: Ref | T): T => {
  if (typeof ref !== "object" || ref === null || !("$ref" in ref)) return ref as T;
  const path = (ref as Ref).$ref.replace(/^#\//, "").split("/");
  return path.reduce((node, key) => node[key], contract) as T;
};

// 各operationのresponseについて、Zod schemaがある型の例を集める。
const collectResponseExamples = () => {
  const cases: { label: string; schemaName: string; value: unknown }[] = [];
  for (const [path, operations] of Object.entries<Record<string, { responses?: Record<string, unknown> }>>(
    contract.paths,
  )) {
    for (const [method, operation] of Object.entries(operations)) {
      for (const [status, rawResponse] of Object.entries(operation.responses ?? {})) {
        const response = resolve<{ content?: Record<string, MediaType> }>(rawResponse as Ref);
        for (const media of Object.values(response.content ?? {})) {
          const schemaName = media.schema?.$ref.split("/").at(-1);
          if (!schemaName || !(schemaName in schemasByName)) continue;
          for (const [exampleName, example] of Object.entries(media.examples ?? {})) {
            cases.push({
              label: `${method.toUpperCase()} ${path} ${status} ${exampleName}`,
              schemaName,
              value: resolve<{ value: unknown }>(example).value,
            });
          }
        }
      }
    }
  }
  return cases;
};

const cases = collectResponseExamples();

describe("API契約のexamples", () => {
  it("Zod schemaがある型の例を、主要な型ごとに1件以上含む", () => {
    const covered = new Set(cases.map((c) => c.schemaName));
    expect([...covered].sort()).toEqual(Object.keys(schemasByName).sort());
  });

  it.each(cases)("$label をWebのschemaで解釈できる", ({ schemaName, value }) => {
    expect(schemasByName[schemaName].safeParse(value).success).toBe(true);
  });
});

describe("Webのschemaが契約外の値を拒否する", () => {
  it("未知のerror codeを拒否する", () => {
    expect(problemSchema.safeParse({ type: "x", title: "x", status: 500, code: "unknown" }).success).toBe(false);
  });

  it("codeごとに必須の拡張項目が欠けたProblemを拒否する", () => {
    const base = { title: "x" };
    expect(problemSchema.safeParse({ ...base, type: "x", status: 429, code: "rate_limited" }).success).toBe(false);
    expect(problemSchema.safeParse({ ...base, type: "x", status: 409, code: "retry_expired" }).success).toBe(false);
    expect(problemSchema.safeParse({ ...base, type: "x", status: 422, code: "validation_failed", errors: [] }).success).toBe(false);
  });

  it("拡張項目を持つcodeでstatusを取り違えたProblemを拒否する", () => {
    const problem = { type: "x", title: "x", status: 400, code: "rate_limited", retry_after_seconds: 60 };
    expect(problemSchema.safeParse(problem).success).toBe(false);
    expect(problemSchema.safeParse({ ...problem, status: 429 }).success).toBe(true);
  });

  it("statusごとに必須の項目が欠けたGenerationを拒否する", () => {
    const base = { id: "6b1f0c2e-7a4d-4c1b-8e2f-3a9d5c7b1e04", started_at: "2026-09-28T13:04:05Z", retryable: false };
    expect(generationSchema.safeParse({ ...base, status: "processing", stage: "transcribing", poll_after_seconds: 3 }).success).toBe(false);
    expect(generationSchema.safeParse({ ...base, status: "succeeded" }).success).toBe(false);
  });

  it("Zで終わらない日時を拒否する（契約のpatternと同じ境界）", () => {
    const dot = {
      id: "6b1f0c2e-7a4d-4c1b-8e2f-3a9d5c7b1e04",
      date: "2026-09-28",
      started_at: "2026-09-28T13:04:05+00:00",
      duration_seconds: 312,
      sentence: "",
      summary: "",
    };
    expect(dotSchema.safeParse(dot).success).toBe(false);
    expect(dotSchema.safeParse({ ...dot, started_at: "2026-09-28T13:04:05Z\n" }).success).toBe(false);
    expect(dotSchema.safeParse({ ...dot, date: "2026-09-28\n", started_at: "2026-09-28T13:04:05Z" }).success).toBe(false);
    expect(dotSchema.safeParse({ ...dot, started_at: "2026-09-28T13:04:05.123Z" }).success).toBe(true);
  });

  it("authenticatedごとに必須の項目が欠けたSessionを拒否する", () => {
    expect(sessionSchema.safeParse({ authenticated: true, csrf_token: "t" }).success).toBe(false);
    expect(sessionSchema.safeParse({ authenticated: false }).success).toBe(false);
  });
});

// 型の一致検査は制約値（maxLengthなど）を比べないため、契約から読んだ値の境界でZodと一致させる。
// Zod schemaを足したら、制約を持つ契約のschemaをここへ足す。
type Limits = { maxLength?: number; minimum?: number; maximum?: number };

const limitTargets: { contractSchema: string; schema: z.ZodType; valid: Record<string, unknown> }[] = [
  {
    contractSchema: "Dot",
    schema: dotSchema,
    valid: {
      id: "6b1f0c2e-7a4d-4c1b-8e2f-3a9d5c7b1e04",
      date: "2026-09-28",
      started_at: "2026-09-28T13:04:05Z",
      duration_seconds: 312,
      sentence: "",
      summary: "",
    },
  },
  {
    contractSchema: "ProblemGeneral",
    schema: problemSchema,
    valid: { type: "urn:focus-on-dot:problem:internal_error", title: "x", status: 500, code: "internal_error" },
  },
  {
    contractSchema: "ProblemValidationFailed",
    schema: problemSchema,
    valid: {
      type: "urn:focus-on-dot:problem:validation_failed",
      title: "x",
      status: 422,
      code: "validation_failed",
      errors: [{ field: "sentence", code: "too_long" }],
    },
  },
  {
    contractSchema: "ProblemRateLimited",
    schema: problemSchema,
    valid: { type: "urn:focus-on-dot:problem:rate_limited", title: "x", status: 429, code: "rate_limited", retry_after_seconds: 60 },
  },
  {
    contractSchema: "ProblemRetryExpired",
    schema: problemSchema,
    valid: {
      type: "urn:focus-on-dot:problem:retry_expired",
      title: "x",
      status: 409,
      code: "retry_expired",
      retry_expires_at: "2026-09-29T13:20:11Z",
    },
  },
  {
    contractSchema: "GenerationProcessing",
    schema: generationSchema,
    valid: {
      id: "6b1f0c2e-7a4d-4c1b-8e2f-3a9d5c7b1e04",
      status: "processing",
      stage: "transcribing",
      started_at: "2026-09-28T13:04:05Z",
      retryable: false,
      retry_expires_at: "2026-09-29T13:20:11Z",
      poll_after_seconds: 3,
    },
  },
];

const limitCases = limitTargets.flatMap(({ contractSchema, schema, valid }) =>
  Object.entries<Limits>(contract.components.schemas[contractSchema].properties)
    .filter(([, limits]) => limits.maxLength !== undefined || limits.minimum !== undefined || limits.maximum !== undefined)
    .map(([field, limits]) => ({
      label: `${contractSchema}.${field}`,
      limits,
      parses: (value: unknown) => schema.safeParse({ ...valid, [field]: value }).success,
    })),
);

describe("Zod schemaの制約値が契約と一致する", () => {
  it("各対象の正しい値そのものは受け付ける", () => {
    for (const { schema, valid } of limitTargets) expect(schema.safeParse(valid).success).toBe(true);
  });

  it("制約を持つ項目を対象のすべてから集めている", () => {
    expect(limitCases.map((c) => c.label).sort()).toEqual([
      "Dot.duration_seconds",
      "Dot.sentence",
      "Dot.summary",
      "GenerationProcessing.poll_after_seconds",
      "ProblemGeneral.status",
      "ProblemRateLimited.retry_after_seconds",
    ]);
  });

  it.each(limitCases)("$label は契約の境界ちょうどを受け付け、外を拒否する", ({ limits, parses }) => {
    if (limits.maxLength !== undefined) {
      expect(parses("あ".repeat(limits.maxLength))).toBe(true);
      expect(parses("あ".repeat(limits.maxLength + 1))).toBe(false);
    }
    if (limits.minimum !== undefined) {
      expect(parses(limits.minimum)).toBe(true);
      expect(parses(limits.minimum - 1)).toBe(false);
    }
    if (limits.maximum !== undefined) {
      expect(parses(limits.maximum)).toBe(true);
      expect(parses(limits.maximum + 1)).toBe(false);
    }
  });
});
