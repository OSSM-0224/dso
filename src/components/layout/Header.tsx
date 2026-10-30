"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "@/context/AuthContext.tsx";
import { UserRole } from "@/shared/types.ts";
import { Icon } from "@/components/ui/Icon.tsx";
import { LanguageSwitcher } from "@/i18n/LanguageSwitcher.tsx";
import { useI18n } from "@/i18n/LanguageProvider.tsx";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";

export const Header: React.FC = () => {
  const { user, role, canScore, switchRole } = useAuth();
  const { t } = useI18n();

  const pathname = usePathname() || "/";
  const [mobileOpen, setMobileOpen] = useState(false);

  const isParticipant = role === "participant";

  const isOnTournaments =
    pathname === "/dashboard" || pathname.startsWith("/tournaments");

  const isOnTeams = pathname.startsWith("/teams");
  const isOnPlayers = pathname.startsWith("/players");
  const isOnSchoolAccounts = pathname.startsWith("/school-accounts");
  const isOnHistory = pathname.startsWith("/past-champions");
  const isOnTesting = pathname.startsWith("/engine-tests");
  const isOnPortal = pathname.startsWith("/school");

  const handleRoleChange = (val: UserRole) => {
    if (val === "participant") {
      window.location.assign("/school/login");
      return;
    }

    switchRole(val);
  };

  const navigationItems = isParticipant
    ? [
        {
          label: t("My school matches"),
          href: "/school/dashboard",
          active: isOnPortal,
        },
        {
          label: t("Public brackets"),
          href: "/#tournaments",
          active: pathname === "/",
        },
        {
          label: t("Past champions"),
          href: "/past-champions",
          active: isOnHistory,
        },
      ]
    : [
        {
          label: t("Tournaments"),
          href: "/dashboard",
          active: isOnTournaments,
        },
        {
          label: t("Teams & schools"),
          href: "/teams",
          active: isOnTeams,
        },
        {
          label: t("Players management"),
          href: "/players",
          active: isOnPlayers,
        },
        {
          label: t("School accounts"),
          href: "/school-accounts",
          active: isOnSchoolAccounts,
        },
        {
          label: t("Past champions"),
          href: "/past-champions",
          active: isOnHistory,
        },
        {
          label: t("Engine tests"),
          href: "/engine-tests",
          active: isOnTesting,
        },
      ];

  const navLink = (item: (typeof navigationItems)[number], mobile = false) => {
    const content = (
      <Button
        variant={item.active ? "secondary" : "ghost"}
        size={mobile ? "default" : "sm"}
        className={`justify-start ${
          mobile ? "w-full h-11 text-sm" : "h-8 px-3 text-[13px]"
        }`}
      >
        {item.label}
      </Button>
    );

    return mobile ? (
      <SheetClose asChild key={item.href}>
        <Link href={item.href}>{content}</Link>
      </SheetClose>
    ) : (
      <Link href={item.href} key={item.href}>
        {content}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        {/* Brand */}
        <Link
          href={isParticipant ? "/school/dashboard" : "/dashboard"}
          className="flex shrink-0 items-center gap-2"
        >
          <span className="font-serif text-[17px] font-semibold tracking-tight text-foreground">
            DSO Navi Mumbai
          </span>

          {isParticipant && (
            <Badge
              variant="secondary"
              className="hidden sm:inline-flex rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide"
            >
              {t("Portal")}
            </Badge>
          )}
        </Link>

        {/* Desktop Navigation */}
        <nav
          className="hidden lg:flex items-center gap-1"
          aria-label={t("Primary")}
        >
          {navigationItems.map((item) => navLink(item))}
        </nav>

        {/* Right Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <LanguageSwitcher compact />

          {/* Participant Details */}
          {isParticipant && (
            <div className="hidden sm:block text-right">
              <p className="max-w-[160px] truncate text-xs font-semibold text-foreground">
                {user?.schoolName || user?.name || t("Participant")}
              </p>

              {user?.schoolCode && (
                <p className="font-mono text-[10px] text-muted-foreground">
                  {user.schoolCode}
                </p>
              )}
            </div>
          )}

          {/* Staff Role Dropdown */}
          {!isParticipant && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-2 rounded-md px-3 text-xs"
                >
                  <span className="capitalize">{t(role)}</span>
                  <Icon name="chevronDown" size="sm" />
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-64 rounded-xl">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t("Preview as staff")}
                </DropdownMenuLabel>

                <DropdownMenuSeparator />

                {(
                  [
                    "admin",
                    "organizer",
                    "scorer",
                    "viewer",
                    "participant",
                  ] as UserRole[]
                ).map((r) => (
                  <DropdownMenuItem
                    key={r}
                    onSelect={() => handleRoleChange(r)}
                    className="flex cursor-pointer items-center justify-between py-2 text-sm"
                  >
                    <span className="capitalize">
                      {r === "participant" ? t("Log in as school") : t(r)}
                    </span>

                    {r === role && (
                      <Icon name="check" size="sm" className="text-primary" />
                    )}
                  </DropdownMenuItem>
                ))}

                <DropdownMenuSeparator />

                {canScore && (
                  <DropdownMenuItem asChild>
                    <Link href="/score" className="cursor-pointer">
                      <Icon name="bolt" size="sm" />
                      {t("Live scoring console")}
                    </Link>
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem asChild>
                  <Link href="/school/login" className="cursor-pointer">
                    <Icon name="school" size="sm" />
                    {t("School login page")}
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link href="/engine-tests" className="cursor-pointer">
                    <Icon name="flask" size="sm" />
                    {t("Engine tests")}
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Mobile Navigation */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 lg:hidden"
                aria-label={t("Open navigation")}
              >
                <Icon name="menu" size="sm" />
              </Button>
            </SheetTrigger>

            <SheetContent side="right" className="w-[280px] sm:w-[320px] p-0">
              <SheetHeader className="border-b px-5 py-4 text-left">
                <SheetTitle className="font-serif text-base">
                  DSO Navi Mumbai
                </SheetTitle>

                {isParticipant && (
                  <Badge variant="secondary" className="w-fit text-[10px]">
                    {t("School Portal")}
                  </Badge>
                )}
              </SheetHeader>

              <div className="flex flex-col gap-1 p-4">
                <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("Navigation")}
                </p>

                {navigationItems.map((item) => navLink(item, true))}

                {!isParticipant && (
                  <>
                    <div className="my-3 border-t" />

                    <SheetClose asChild>
                      <Link href="/school/login">
                        <Button
                          variant="ghost"
                          className="h-11 w-full justify-start gap-2 text-sm"
                        >
                          <Icon name="school" size="sm" />
                          {t("School login page")}
                        </Button>
                      </Link>
                    </SheetClose>

                    {canScore && (
                      <SheetClose asChild>
                        <Link href="/score">
                          <Button
                            variant="ghost"
                            className="h-11 w-full justify-start gap-2 text-sm"
                          >
                            <Icon name="bolt" size="sm" />
                            {t("Live scoring console")}
                          </Button>
                        </Link>
                      </SheetClose>
                    )}
                  </>
                )}
              </div>

              {isParticipant && (
                <div className="absolute bottom-0 w-full border-t p-4">
                  <p className="truncate text-sm font-semibold">
                    {user?.schoolName || user?.name}
                  </p>
                  {user?.schoolCode && (
                    <p className="font-mono text-xs text-muted-foreground">
                      {user.schoolCode}
                    </p>
                  )}
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};
