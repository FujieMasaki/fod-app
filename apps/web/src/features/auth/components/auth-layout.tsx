import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { Link, type LinkProps } from "@tanstack/react-router";

import { Button, Text } from "@/design-system";
import { RELOAD_MESSAGE } from "../messages";
import styles from "./auth-layout.module.css";

/**
 * 認証の画面で共通に使う骨格・入力欄・メッセージ。見た目はTailwind（tokenだけのtheme）をmodule.cssで@applyして組む。
 * 余白と文字で階層を作り、カード・影・装飾アイコンを足さない（design-system.md）。
 */

export const AuthScreen = ({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) => {
  return (
    <div className={styles.screen}>
      <div className={styles.heading}>
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
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {/* 呼び出し側の値で、label・説明・エラーとの関連付けと見た目を上書きさせない */}
      <input
        {...input}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={styles.input}
      />
      {hint && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className={styles.fieldError}>
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
      className={tone === "error" ? styles.messageError : styles.messageInfo}
    >
      {children}
    </p>
  );
};

/** 古いタブの可能性があるときの案内。壊れた表示を続けず、再読み込みへ誘導する（frontend.md §2） */
export const ReloadNotice = () => {
  return (
    <div className={styles.reloadNotice} role="alert">
      <p className={styles.messageError}>{RELOAD_MESSAGE}</p>
      <Button variant="secondary" onClick={() => window.location.reload()}>
        再読み込み
      </Button>
    </div>
  );
};

export const TextLink = (props: LinkProps & { children: ReactNode }) => {
  return <Link {...props} className={styles.textLink} />;
};
