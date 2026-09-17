import type { SVGProps } from "react";

/**
 * 線画・丸みのあるアイコン。currentColor で着色し、UI よりユーザーを主役にする補助的存在。
 * サイズは em 基準（親の font-size に追随）。
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number | string };

function base({ size = "1em", ...props }: IconProps): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
    ...props,
  };
}

export function MicrophoneIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v3" />
    </svg>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="7.5" y="7.5" width="9" height="9" rx="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 11l8-6 8 6" />
      <path d="M6 10v9h12v-9" />
    </svg>
  );
}

export function JournalIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 4h9l3 3v13H6z" />
      <path d="M9 9h6M9 13h6M9 17h4" />
    </svg>
  );
}

export function DotIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 4c3 4 5 6.5 5 9a5 5 0 0 1-10 0c0-2.5 2-5 5-9z" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 7h9M17 7h2" />
      <path d="M5 12h2M10 12h9" />
      <path d="M5 17h11M19 17h0" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="17" cy="17" r="2" />
    </svg>
  );
}
