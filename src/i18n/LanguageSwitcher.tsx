"use client";

import React, { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon.tsx";
import { useI18n } from "./LanguageProvider.tsx";
import { locales } from "./types.ts";

interface LanguageSwitcherProps {
  className?: string;
  /** Icon-only on tiny screens when true. */
  compact?: boolean;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  className = "",
  compact = false,
}) => {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = locales.find((option) => option.code === locale) ?? locales[0];

  useEffect(() => {
    if (!open) return;
    const onClickAway = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={menuRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Change language"
        className="flex min-h-[36px] items-center gap-1.5 rounded-[6px] border border-hairline bg-surface px-2 py-1.5 text-xs font-medium text-ink transition-colors duration-200 hover:border-faint active:scale-[0.98]"
      >
        <Icon name="language" size="sm" className="text-muted" />
        <span className={compact ? "hidden sm:inline" : ""}>
          {current.nativeLabel}
        </span>
        <Icon
          name="chevronDown"
          size="xs"
          className={`text-muted transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-40 overflow-hidden rounded-[10px] border border-hairline bg-surface p-1 shadow-raise"
        >
          {locales.map((option) => (
            <button
              key={option.code}
              type="button"
              role="menuitemradio"
              aria-checked={option.code === locale}
              onClick={() => {
                setLocale(option.code);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-[6px] px-2.5 py-2 text-[13px] transition-colors duration-150 ${
                option.code === locale
                  ? "bg-accent-soft font-semibold text-accent-strong"
                  : "text-ink hover:bg-canvas"
              }`}
            >
              <span>{option.nativeLabel}</span>
              {option.code === locale && <Icon name="check" size="xs" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
