import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function IconSearch(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

export function IconSidebar(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9 4.5v15" />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 6v12M6 12h12" />
    </svg>
  );
}

export function IconFolder(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 8a1.5 1.5 0 0 1 1.5-1.5h4.1L11 8h7.5A1.5 1.5 0 0 1 20 9.5v7A1.5 1.5 0 0 1 18.5 18h-13A1.5 1.5 0 0 1 4 16.5z" />
    </svg>
  );
}

export function IconChatPlus(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5.2 16.2A7.2 7.2 0 1 1 18.8 12 7.2 7.2 0 0 1 8.4 18.4L5 19.2z" />
      <path d="M12 9.2v5.2M9.4 11.8h5.2" />
    </svg>
  );
}

export function IconPlusCircle(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}

export function IconSend(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2} {...props}>
      <path d="M12 19V6M6.5 11.5 12 6l5.5 5.5" />
    </svg>
  );
}

export function IconStop(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconDots(props: IconProps) {
  return (
    <svg {...base} fill="currentColor" stroke="none" {...props}>
      <circle cx="6" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="18" cy="12" r="1.3" />
    </svg>
  );
}

export function IconGear(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M4.9 6.5l1.6 1.6M17.5 16l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.9 17.5l1.6-1.6M17.5 8.1 19.1 6.5" />
    </svg>
  );
}

export function IconHelp(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 1-1 1.6V14" />
      <circle cx="12" cy="16.4" r=".7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M10 7V5.5A1.5 1.5 0 0 1 11.5 4h6A1.5 1.5 0 0 1 19 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 10 18.5V17" />
      <path d="M4 12h10M11 8.5 14.5 12 11 15.5" />
    </svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 7h14" />
      <path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M8 7l.6 11.2A1.5 1.5 0 0 0 10.1 19.5h3.8a1.5 1.5 0 0 0 1.5-1.3L16 7" />
      <path d="M10.5 10.5v6M13.5 10.5v6" />
    </svg>
  );
}

export function IconExternal(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5V14" />
      <path d="M13 5h6v6M19 5l-8 8" />
    </svg>
  );
}

export function IconPanelLeft(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9 4.5v15" />
    </svg>
  );
}

export function IconPanelRight(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M15 4.5v15" />
    </svg>
  );
}

export function IconChevron(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m7 10 5 5 5-5" />
    </svg>
  );
}

export function IconBrain(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 8.2A2.6 2.6 0 1 0 6.2 12 2.4 2.4 0 0 0 8 16.2V18h8v-1.8A2.4 2.4 0 0 0 17.8 12 2.6 2.6 0 1 0 15 8.2" />
      <path d="M12 8.5V18M9.5 12h5" />
    </svg>
  );
}

export function IconHand(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8 11.5V7.8a1.3 1.3 0 0 1 2.6 0V11" />
      <path d="M10.6 10.8V7.2a1.3 1.3 0 1 1 2.6 0v4" />
      <path d="M13.2 11V8.2a1.3 1.3 0 1 1 2.6 0V12" />
      <path d="M15.8 12.2v-1.4a1.3 1.3 0 1 1 2.6 0v4.4a5 5 0 0 1-5 5H13a5.8 5.8 0 0 1-5.2-3.2L6.2 13.5a1.4 1.4 0 0 1 2.4-1.4L10 14" />
    </svg>
  );
}

export function IconShieldCheck(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5 5.5 6v5.2c0 4 2.7 6.8 6.5 8.3 3.8-1.5 6.5-4.3 6.5-8.3V6z" />
      <path d="m9.2 12 1.8 1.8 3.8-3.8" />
    </svg>
  );
}

export function IconClipboard(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="7" y="5.5" width="10" height="14" rx="1.5" />
      <path d="M9.5 5.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4A1.3 1.3 0 0 1 14.5 4.8v.7" />
      <path d="M9.5 10h5M9.5 13.5h5" />
    </svg>
  );
}

export function IconShieldAlert(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5 5.5 6v5.2c0 4 2.7 6.8 6.5 8.3 3.8-1.5 6.5-4.3 6.5-8.3V6z" />
      <path d="M12 8.5v3.2" />
      <circle cx="12" cy="14.6" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconDevice(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="7.5" y="3.5" width="9" height="17" rx="2" />
      <path d="M11 17.5h2" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2} {...props}>
      <path d="m6 12 4 4 8-8" />
    </svg>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="8.5" y="8.5" width="10" height="12" rx="1.5" />
      <path d="M15.5 8.5V6.8A1.3 1.3 0 0 0 14.2 5.5H6.8A1.3 1.3 0 0 0 5.5 6.8v10.4A1.3 1.3 0 0 0 6.8 18.5H8.5" />
    </svg>
  );
}

export function IconRetry(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7.2 8.2A6 6 0 1 0 12 6" />
      <path d="M6 6.2v3.3h3.3" />
    </svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 7l10 10M17 7 7 17" />
    </svg>
  );
}

export function IconStatus(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}

export function IconArrowLeft(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function IconAgent(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5l2 5.6 5.6 2-5.6 2-2 5.6-2-5.6-5.6-2 5.6-2z" />
      <path d="M18.5 15.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" strokeWidth={1.4} />
    </svg>
  );
}

export function IconMic(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2} {...props}>
      <path d="M12 4a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3Z" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
    </svg>
  );
}
