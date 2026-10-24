import React from 'react';

/**
 * The ONLY way components render icons (Font Awesome Free kit).
 * Components never write `fa-*` classes directly — change icons by editing
 * ICON_MAP below. Icons replace cleanly because the kit script is loaded with
 * `data-auto-replace-svg="nest"` in src/app/layout.tsx.
 */

/* Semantic name -> Font Awesome (free) class string */
export const ICON_MAP = {
  trophy: 'fa-solid fa-trophy',
  medal: 'fa-solid fa-medal',
  calendar: 'fa-solid fa-calendar',
  calendarCheck: 'fa-solid fa-calendar-check',
  calendarPlus: 'fa-solid fa-calendar-plus',
  clock: 'fa-solid fa-clock',
  history: 'fa-solid fa-clock-rotate-left',
  location: 'fa-solid fa-location-dot',
  users: 'fa-solid fa-users',
  user: 'fa-solid fa-user',
  userPlus: 'fa-solid fa-user-plus',
  school: 'fa-solid fa-school',
  clipboardList: 'fa-solid fa-clipboard-list',
  shield: 'fa-solid fa-shield',
  shieldCheck: 'fa-solid fa-shield',
  shieldAlert: 'fa-solid fa-shield-halved',
  lock: 'fa-solid fa-lock',
  unlock: 'fa-solid fa-unlock',
  key: 'fa-solid fa-key',
  check: 'fa-solid fa-check',
  circleCheck: 'fa-solid fa-circle-check',
  checkDouble: 'fa-solid fa-check-double',
  xmark: 'fa-solid fa-xmark',
  plus: 'fa-solid fa-plus',
  minus: 'fa-solid fa-minus',
  pen: 'fa-solid fa-pen',
  trash: 'fa-solid fa-trash',
  search: 'fa-solid fa-magnifying-glass',
  filter: 'fa-solid fa-filter',
  download: 'fa-solid fa-download',
  upload: 'fa-solid fa-upload',
  fileCsv: 'fa-solid fa-file-csv',
  print: 'fa-solid fa-print',
  share: 'fa-solid fa-share-nodes',
  external: 'fa-solid fa-arrow-up-right-from-square',
  bell: 'fa-solid fa-bell',
  eye: 'fa-solid fa-eye',
  eyeSlash: 'fa-solid fa-eye-slash',
  arrowLeft: 'fa-solid fa-arrow-left',
  arrowRight: 'fa-solid fa-arrow-right',
  chevronDown: 'fa-solid fa-chevron-down',
  chevronRight: 'fa-solid fa-chevron-right',
  swap: 'fa-solid fa-right-left',
  bracket: 'fa-solid fa-sitemap',
  bolt: 'fa-solid fa-bolt',
  flag: 'fa-solid fa-flag-checkered',
  circleInfo: 'fa-solid fa-circle-info',
  circleAlert: 'fa-solid fa-circle-exclamation',
  triangleExclamation: 'fa-solid fa-triangle-exclamation',
  gear: 'fa-solid fa-gear',
  flask: 'fa-solid fa-flask',
  rightFromBracket: 'fa-solid fa-right-from-bracket',
  rightToBracket: 'fa-solid fa-right-to-bracket',
  spinner: 'fa-solid fa-spinner',
  bars: 'fa-solid fa-bars',
  copy: 'fa-solid fa-copy',
  refresh: 'fa-solid fa-arrows-rotate',
  power: 'fa-solid fa-power-off',
  rotate: 'fa-solid fa-rotate-left',
  layers: 'fa-solid fa-layer-group',
  sparkles: 'fa-solid fa-wand-magic-sparkles',
} as const;

export type IconName = keyof typeof ICON_MAP;
export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/* Fixed inline-block box per size → zero layout shift while the kit loads. */
const SIZE_BOX: Record<IconSize, { fontSize: string; box: string; lineHeight: string }> = {
  xs: { fontSize: '11px', box: 'w-[16px] h-[16px]', lineHeight: '16px' },
  sm: { fontSize: '13px', box: 'w-[18px] h-[18px]', lineHeight: '18px' },
  md: { fontSize: '16px', box: 'w-[22px] h-[22px]', lineHeight: '22px' },
  lg: { fontSize: '20px', box: 'w-[26px] h-[26px]', lineHeight: '26px' },
  xl: { fontSize: '26px', box: 'w-[32px] h-[32px]', lineHeight: '32px' },
};

interface IconProps {
  name: IconName;
  size?: IconSize;
  /** Announced to screen readers when present; otherwise aria-hidden. */
  label?: string;
  spin?: boolean;
  className?: string;
}

export const Icon: React.FC<IconProps> = ({ name, size = 'md', label, spin = false, className = '' }) => {
  const s = SIZE_BOX[size];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${s.box} overflow-visible align-[-0.15em] ${className}`}
      style={{ fontSize: s.fontSize, lineHeight: s.lineHeight }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <i
        className={`${ICON_MAP[name]}${spin ? ' fa-spin' : ''}`}
        style={{ lineHeight: s.lineHeight }}
      />
    </span>
  );
};
