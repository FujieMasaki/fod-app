import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { Link, type LinkProps } from "@tanstack/react-router";

import { Button, Text } from "@/design-system";
import { RELOAD_MESSAGE } from "../messages";

/**
 * 認証の画面で共通に使う骨格・入力欄・メッセージ。見た目はTailwind（tokenだけのtheme）で組む。
 * 余白と文字で階層を作り、カード・影・装飾アイコンを足さない（design-system.md）。
 */

export const AuthScreen = ({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) => {
  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-2">
        <Text variant="title" as="h1">
          {title}
        </Text>
        {lead && (
          <Text variant="small" tone="secondary">
            {lead}
          </Text>
        )}
      </div>
      {children}
    </div>
  );
};

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  error?: string;
  hint?: string;
};

export const TextField = ({ label, error, hint, ...input }: TextFieldProps) => {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-small leading-small text-ink-secondary">
        {label}
      </label>
      {/* 呼び出し側の値で、label・説明・エラーとの関連付けと見た目を上書きさせない */}
      <input
        {...input}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="font-inherit rounded-md border border-line bg-surface px-3 py-2 text-body leading-body text-ink focus-visible:outline-2 focus-visible:outline-brand aria-invalid:border-danger"
      />
      {hint && (
        <p id={`${id}-hint`} className="text-caption leading-caption text-ink-tertiary">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-small leading-small text-danger">
          {error}
        </p>
      )}
    </div>
  );
};

/** 操作の結果。失敗はrole="alert"、それ以外はrole="status"で読み上げる */
export const FormMessage = ({ tone, children }: { tone: "error" | "info"; children: ReactNode }) => {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={tone === "error" ? "text-small leading-small text-danger" : "text-small leading-small text-ink-secondary"}
    >
      {children}
    </p>
  );
};

/** 古いタブの可能性があるときの案内。壊れた表示を続けず、再読み込みへ誘導する（frontend.md §2） */
export const ReloadNotice = () => {
  return (
    <div className="flex flex-col gap-3" role="alert">
      <p className="text-small leading-small text-danger">{RELOAD_MESSAGE}</p>
      <Button variant="secondary" onClick={() => window.location.reload()}>
        再読み込み
      </Button>
    </div>
  );
};

export const TextLink = (props: LinkProps & { children: ReactNode }) => {
  return <Link {...props} className="text-small leading-small text-brand underline underline-offset-4" />;
};
