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

const errorCodes = [
  "unauthenticated",
  "session_expired",
  "email_unconfirmed",
  "csrf_invalid",
  "invalid_credentials",
  "reauthentication_failed",
  "google_reauthentication_required",
  "rate_limited",
  "validation_failed",
  "token_invalid",
  "token_expired",
  "cursor_invalid",
  "not_found",
  "account_deletion_in_progress",
  "attempt_invalid",
  "attempt_expired",
  "audio_too_large",
  "unsupported_audio_type",
  "retry_expired",
  "retry_not_allowed",
  "deletion_failed",
  "internal_error",
] as const satisfies readonly Schemas["ErrorCode"][];

export const errorCodeSchema = z.enum(errorCodes);

export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  code: errorCodeSchema,
  errors: z
    .array(
      z.object({
        field: z.string(),
        code: z.enum(["required", "too_long", "invalid_format", "out_of_range", "not_allowed", "taken"]),
      }),
    )
    .optional(),
  retry_expires_at: z.iso.datetime().optional(),
  retry_after_seconds: z.number().int().min(1).optional(),
});

export const dotSchema = z.object({
  id: z.uuid(),
  date: z.iso.date(),
  started_at: z.iso.datetime(),
  duration_seconds: z.number().int().min(1).max(1800),
  sentence: z.string().max(200),
  summary: z.string().max(2000),
});

export const generationSchema = z.object({
  id: z.uuid(),
  status: z.enum(["processing", "succeeded", "failed", "expired"]),
  stage: z.enum(["uploading", "transcribing", "generating"]).optional(),
  started_at: z.iso.datetime(),
  retryable: z.boolean(),
  retry_expires_at: z.iso.datetime(),
  failure: z
    .object({ kind: z.enum(["processing_failed", "upload_incomplete", "empty_recording"]) })
    .optional(),
  poll_after_seconds: z.number().int().min(1).max(60).optional(),
  dot: dotSchema.optional(),
  transcript: z
    .object({
      status: z.enum(["available", "unavailable"]),
      text: z.string().optional(),
      unavailable_reason: z.enum(["acknowledged", "expired"]).optional(),
    })
    .optional(),
});

export type Problem = z.infer<typeof problemSchema>;
export type Dot = z.infer<typeof dotSchema>;
export type Generation = z.infer<typeof generationSchema>;

// 契約とZodの型がずれたら、ここで型検査が失敗する。
export const contractTypeChecks = {
  problem: true satisfies TypeMatches<Problem, Schemas["Problem"]>,
  dot: true satisfies TypeMatches<Dot, Schemas["Dot"]>,
  generation: true satisfies TypeMatches<Generation, Schemas["Generation"]>,
} as const;
