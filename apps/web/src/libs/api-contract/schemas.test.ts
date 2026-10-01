// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import type { z } from "zod";

import { dotSchema, generationSchema, problemSchema } from "./schemas";

// 契約の正本。examplesはWebとAPIが同じ意味で解釈することを確かめる共通の具体例。
const contractPath = fileURLToPath(new URL("../../../../../contracts/openapi.yaml", import.meta.url));
const contract = parse(readFileSync(contractPath, "utf8"));

const schemasByName: Record<string, z.ZodType> = {
  Problem: problemSchema,
  Dot: dotSchema,
  Generation: generationSchema,
};

type Ref = { $ref: string };
type MediaType = { schema?: Ref; examples?: Record<string, Ref> };

function resolve<T>(ref: Ref | T): T {
  if (typeof ref !== "object" || ref === null || !("$ref" in ref)) return ref as T;
  const path = (ref as Ref).$ref.replace(/^#\//, "").split("/");
  return path.reduce((node, key) => node[key], contract) as T;
}

// 各operationのresponseについて、Zod schemaがある型の例を集める。
function collectResponseExamples() {
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
}

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

  it("上限を超えたsentenceを拒否する", () => {
    const dot = {
      id: "6b1f0c2e-7a4d-4c1b-8e2f-3a9d5c7b1e04",
      date: "2026-09-28",
      started_at: "2026-09-28T13:04:05Z",
      duration_seconds: 312,
      sentence: "あ".repeat(201),
      summary: "",
    };
    expect(dotSchema.safeParse(dot).success).toBe(false);
  });
});
