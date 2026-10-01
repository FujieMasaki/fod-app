import { z } from "zod";

import type { components } from "../../types/api-contract";

/**
 * API契約（contracts/openapi.yaml）のresponseを実行時に検証するZod schema。
 * 型は契約から生成した`api-contract.d.ts`と完全一致させる（下の`TypeMatches`）。
 * 契約を変えたら`pnpm --filter @focus-on-dot/web generate:api-types`で型を作り直し、
 * ずれた schema を直す。schema は使う機能の実装時に追加する。
 */

type Schemas = components["schemas"];

// 2つの型が完全に一致するときだけ true になる。
type TypeMatches<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// codeごとに必ず返す拡張項目が違う（契約のProblemのoneOf）。拡張項目を持たないcodeの一覧。
const generalErrorCodes = [
  "unauthenticated",
  "session_expired",
  "email_unconfirmed",
  "csrf_invalid",
  "invalid_credentials",
  "reauthentication_failed",
  "google_reauthentication_required",
  "token_invalid",
  "token_expired",
  "cursor_invalid",
  "not_found",
  "account_deletion_in_progress",
  "attempt_invalid",
  "attempt_expired",
  "audio_too_large",
  "unsupported_audio_type",
  "retry_not_allowed",
  "generation_completed",
  "deletion_failed",
  "internal_error",
] as const satisfies readonly Schemas["ProblemGeneral"]["code"][];

const problemBase = {
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
};

const generalProblemSchema = z.object({ ...problemBase, code: z.enum(generalErrorCodes) });
const validationFailedProblemSchema = z.object({
  ...problemBase,
  status: z.literal(422),
  code: z.literal("validation_failed"),
  errors: z
    .array(
      z.object({
        field: z.string(),
        code: z.enum(["required", "too_long", "invalid_format", "out_of_range", "not_allowed", "taken"]),
      }),
    )
    .min(1),
});
const rateLimitedProblemSchema = z.object({
  ...problemBase,
  status: z.literal(429),
  code: z.literal("rate_limited"),
  retry_after_seconds: z.number().int().min(1),
});
const retryExpiredProblemSchema = z.object({
  ...problemBase,
  status: z.literal(409),
  code: z.literal("retry_expired"),
  retry_expires_at: z.iso.datetime(),
});

export const problemSchema = z.union([
  generalProblemSchema,
  validationFailedProblemSchema,
  rateLimitedProblemSchema,
  retryExpiredProblemSchema,
]);

export const dotSchema = z.object({
  id: z.uuid(),
  date: z.iso.date(),
  started_at: z.iso.datetime(),
  duration_seconds: z.number().int().min(1).max(1800),
  sentence: z.string().max(200),
  summary: z.string().max(2000),
});

const retryExpiresAtSchema = z.iso.datetime();

const transcriptSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("available"), text: z.string() }),
  z.object({ status: z.literal("unavailable") }),
]);

// statusごとに必ず返す項目が違う（契約のGenerationのoneOf）。
export const generationSchema = z.discriminatedUnion("status", [
  z.object({
    id: z.uuid(),
    status: z.literal("processing"),
    stage: z.enum(["uploading", "transcribing", "generating"]),
    started_at: z.iso.datetime(),
    retryable: z.literal(false),
    retry_expires_at: retryExpiresAtSchema,
    poll_after_seconds: z.number().int().min(1).max(60),
  }),
  z.object({
    id: z.uuid(),
    status: z.literal("succeeded"),
    started_at: z.iso.datetime(),
    retryable: z.literal(false),
    dot: dotSchema,
    transcript: transcriptSchema,
  }),
  z.object({
    id: z.uuid(),
    status: z.literal("failed"),
    started_at: z.iso.datetime(),
    retryable: z.boolean(),
    retry_expires_at: retryExpiresAtSchema,
    failure: z.object({ kind: z.enum(["processing_failed", "upload_incomplete", "empty_recording"]) }),
  }),
  z.object({
    id: z.uuid(),
    status: z.literal("expired"),
    started_at: z.iso.datetime(),
    retryable: z.literal(false),
    retry_expires_at: retryExpiresAtSchema,
  }),
]);

export type Problem = z.infer<typeof problemSchema>;
export type Dot = z.infer<typeof dotSchema>;
export type Generation = z.infer<typeof generationSchema>;

// 契約とZodの型がずれたら、ここで型検査が失敗する。
export const contractTypeChecks = {
  problem: true satisfies TypeMatches<Problem, Schemas["Problem"]>,
  generalProblem: true satisfies TypeMatches<z.infer<typeof generalProblemSchema>, Schemas["ProblemGeneral"]>,
  validationFailedProblem: true satisfies TypeMatches<
    z.infer<typeof validationFailedProblemSchema>,
    Schemas["ProblemValidationFailed"]
  >,
  rateLimitedProblem: true satisfies TypeMatches<z.infer<typeof rateLimitedProblemSchema>, Schemas["ProblemRateLimited"]>,
  retryExpiredProblem: true satisfies TypeMatches<z.infer<typeof retryExpiredProblemSchema>, Schemas["ProblemRetryExpired"]>,
  dot: true satisfies TypeMatches<Dot, Schemas["Dot"]>,
  generation: true satisfies TypeMatches<Generation, Schemas["Generation"]>,
} as const;
