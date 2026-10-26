import React from 'react';
import Link from 'next/link';

import { Icon } from '@/components/ui/Icon.tsx';
import { Badge } from '@/components/ui/Card.tsx';
import { BracketDiagram } from './BracketDiagram.tsx';
import { LandingNav } from './LandingNav.tsx';

export interface LandingTournament {
  id: string;
  name: string;
  sport: string;
  ageGroup: string;
  gender: 'boys' | 'girls';
  year: number;
  status: string;
  teamCount: number;
}

export interface LandingChampion {
  id: string;
  name: string;
  year: number;
  sport: string;
  ageGroup: string;
  gender: 'boys' | 'girls';
  winnerTeamName: string;
  schoolName: string;
}

interface LandingPageProps {
  tournaments: LandingTournament[];
  champions: LandingChampion[];
  counts: {
    schools: number;
    teams: number;
  };
}

const facts = [
  { label: 'Format', value: 'Play-in single elimination' },
  { label: 'Categories', value: 'U-14 · U-17 · U-19' },
  { label: 'Draw rules', value: 'Champion-aware seeding' },
  { label: 'Access', value: 'Schools · scorers · public' },
];

const roles = [
  {
    icon: 'clipboardList' as const,
    title: 'Organizers',
    body: 'Create tournaments, enroll teams, generate the draw, and publish it.',
    href: '/dashboard',
  },
  {
    icon: 'school' as const,
    title: 'Schools',
    body: 'Follow your school’s matches, schedules, and path through the bracket.',
    href: '/school/login',
  },
  {
    icon: 'bolt' as const,
    title: 'Scorers',
    body: 'Run the live scoring console on the court, with undo and a full audit trail.',
    href: '/score',
  },
  {
    icon: 'users' as const,
    title: 'Spectators',
    body: 'Open any published bracket. No account, no app, no fixture sheet.',
    href: '#tournaments',
  },
];

const steps = [
  {
    title: 'Enroll',
    body: 'Add schools and teams with age group, gender, and medium recorded up front.',
  },
  {
    title: 'Draw',
    body: 'The engine balances play-in rounds, separates champions, and keeps school-mates apart.',
  },
  {
    title: 'Publish',
    body: 'Fixtures go live on a public page. Scorers take over and results advance the bracket.',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  tournaments,
  champions,
  counts,
}) => {
  const hasPublicDraws = tournaments.length > 0;
  const boardMeta = [
    `${tournaments.length} public ${tournaments.length === 1 ? 'draw' : 'draws'}`,
    counts.teams > 0 ? `${counts.teams} teams` : null,
    counts.schools > 0 ? `${counts.schools} schools` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="min-h-[100dvh] bg-canvas font-sans text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[6px] focus:bg-ink focus:px-3 focus:py-2 focus:text-xs focus:text-white"
      >
        Skip to content
      </a>

      <LandingNav />

      <main id="main-content">
        <section className="relative overflow-hidden">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-14 pt-12 sm:px-6 sm:pt-16 lg:px-8 lg:pb-20 lg:pt-20 xl:grid-cols-2 xl:gap-14">
            <div className="max-w-xl">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                District Sports Office · Navi Mumbai
              </p>
              <h1 className="mt-5 font-serif text-[2.55rem] font-semibold leading-[1.02] tracking-[-0.03em] text-ink sm:text-5xl lg:text-[3.5rem]">
                A <span className="text-accent">fair draw</span>,
                <br className="hidden sm:block" /> kept on the record.
              </h1>
              <p className="mt-6 max-w-[46ch] text-[15px] leading-relaxed text-muted sm:text-base">
                Balanced single-elimination fixtures, public brackets, and live
                scoring for Navi Mumbai’s school tournaments.
              </p>
              <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
                <Link
                  href="/dashboard"
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[6px] bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-rest transition-all duration-200 hover:bg-accent-strong active:scale-[0.98]"
                >
                  Organizer console
                  <Icon name="arrowRight" size="sm" />
                </Link>
                <Link
                  href="/school/login"
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[6px] border border-hairline bg-surface px-5 py-2.5 text-sm font-semibold text-ink shadow-rest transition-all duration-200 hover:border-faint hover:bg-canvas active:scale-[0.98]"
                >
                  School sign in
                </Link>
              </div>
            </div>

            <div className="xl:pt-4">
              <BracketDiagram />
            </div>
          </div>

          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <dl className="grid grid-cols-2 border-y border-hairline sm:grid-cols-4">
              {facts.map((fact) => (
                <div
                  key={fact.label}
                  className="border-hairline px-4 py-4 [&:nth-child(even)]:border-l [&:nth-child(n+3)]:border-t sm:[&:not(:first-child)]:border-l sm:[&:nth-child(n+3)]:border-t-0"
                >
                  <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
                    {fact.label}
                  </dt>
                  <dd className="mt-1.5 text-[13px] font-medium leading-snug text-ink">
                    {fact.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section
          id="platform"
          className="scroll-mt-20 border-t border-hairline py-20 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <h2 className="font-serif text-3xl font-semibold leading-[1.08] tracking-[-0.02em] text-ink sm:text-[2.35rem]">
                The draw, without the notebook.
              </h2>
              <p className="mt-4 max-w-[58ch] text-[15px] leading-relaxed text-muted">
                Built for district organisers who need a bracket that is
                balanced, explainable, and published before the first whistle.
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <article className="flex flex-col rounded-[12px] border border-hairline bg-surface p-6 shadow-rest md:col-span-2 md:row-span-2 md:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-serif text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">
                      A bracket that holds up.
                    </h3>
                    <p className="mt-3 max-w-[48ch] text-sm leading-relaxed text-muted">
                      Every draw balances play-in rounds, separates recent
                      champions, and keeps teams from the same school apart.
                    </p>
                  </div>
                  <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border border-hairline bg-canvas text-accent sm:flex">
                    <Icon name="bracket" size="md" />
                  </span>
                </div>

                <ul className="mt-7 grid gap-2.5 sm:grid-cols-2">
                  {[
                    'Play-in balancing',
                    'Champion-aware seeding',
                    'Cross-medium conflict checks',
                    'Deterministic, repeatable draws',
                  ].map((rule) => (
                    <li
                      key={rule}
                      className="flex items-center gap-2.5 rounded-[7px] border border-hairline bg-canvas/60 px-3 py-2.5 text-[13px] font-medium text-ink"
                    >
                      <Icon name="check" size="sm" className="text-accent" />
                      {rule}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-hairline pt-5 text-[11px] text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="shieldCheck" size="xs" className="text-accent" />
                    Rule set recorded with every draw
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="history" size="xs" className="text-accent" />
                    Results stay auditable
                  </span>
                </div>
              </article>

              <article className="flex flex-col rounded-[12px] border border-hairline bg-sand-soft p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-[7px] border border-sand-text/15 bg-surface/70 text-sand-text">
                  <Icon name="external" size="sm" />
                </span>
                <h3 className="mt-5 font-serif text-xl font-semibold tracking-[-0.01em] text-ink">
                  Published, not printed.
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink/75">
                  Share one server-rendered bracket link. It updates as results
                  come in, on any phone.
                </p>
                <a
                  href="#tournaments"
                  className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink transition-colors hover:text-accent"
                >
                  See the public board
                  <Icon name="arrowRight" size="xs" />
                </a>
              </article>

              <article className="flex flex-col rounded-[12px] border border-hairline bg-accent-soft p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-[7px] border border-accent/10 bg-surface/70 text-accent">
                  <Icon name="bolt" size="sm" />
                </span>
                <h3 className="mt-5 font-serif text-xl font-semibold tracking-[-0.01em] text-accent-strong">
                  Field-ready scoring.
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-accent-strong/85">
                  Scorers record live events from the court. Every point is
                  validated by the same engine.
                </p>
                <Link
                  href="/score"
                  className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent-strong transition-colors hover:text-ink"
                >
                  Open live scoring
                  <Icon name="arrowRight" size="xs" />
                </Link>
              </article>
            </div>
          </div>
        </section>

        <section
          id="roles"
          className="scroll-mt-20 border-t border-hairline py-20 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <h2 className="font-serif text-3xl font-semibold leading-[1.08] tracking-[-0.02em] text-ink sm:text-[2.35rem]">
                One desk for every role.
              </h2>
              <p className="mt-4 max-w-[58ch] text-[15px] leading-relaxed text-muted">
                Everyone sees only what they need. Every change is attributed
                to the person who made it.
              </p>
            </div>

            <div className="mt-10 grid gap-x-10 sm:grid-cols-2">
              {roles.map((role) => (
                <Link
                  key={role.title}
                  href={role.href}
                  className="group flex items-start gap-4 border-t border-hairline py-6 transition-colors duration-200 hover:border-faint"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border border-hairline bg-surface text-accent shadow-rest transition-colors duration-200 group-hover:bg-accent-soft">
                    <Icon name={role.icon} size="sm" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-4">
                      <span className="text-sm font-semibold text-ink">
                        {role.title}
                      </span>
                      <Icon
                        name="arrowRight"
                        size="sm"
                        className="text-faint transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-accent"
                      />
                    </span>
                    <span className="mt-1.5 block max-w-[42ch] text-sm leading-relaxed text-muted">
                      {role.body}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section
          id="process"
          className="scroll-mt-20 border-t border-hairline py-20 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 className="max-w-xl font-serif text-3xl font-semibold leading-[1.08] tracking-[-0.02em] text-ink sm:text-[2.35rem]">
              From enrollment to final whistle.
            </h2>

            <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-6">
              {steps.map((step, index) => (
                <li key={step.title} className="border-t border-hairline pt-5">
                  <span className="font-serif text-[2.6rem] font-semibold leading-none tracking-[-0.04em] text-accent/80">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-4 text-sm font-semibold text-ink">
                    {step.title}
                  </h3>
                  <p className="mt-2 max-w-[36ch] text-sm leading-relaxed text-muted">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          id="tournaments"
          className="scroll-mt-20 border-t border-hairline py-20 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-2xl">
                <h2 className="font-serif text-3xl font-semibold leading-[1.08] tracking-[-0.02em] text-ink sm:text-[2.35rem]">
                  On the public board.
                </h2>
                <p className="mt-4 max-w-[58ch] text-[15px] leading-relaxed text-muted">
                  Published fixtures are server-rendered, shareable, and updated
                  as matches finish.
                </p>
              </div>
              {boardMeta.length > 0 && (
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  {boardMeta.join(' · ')}
                </p>
              )}
            </div>

            {hasPublicDraws ? (
              <div className="mt-10 grid gap-4 md:grid-cols-3">
                {tournaments.map((tournament) => (
                  <Link
                    key={tournament.id}
                    href={`/public/tournaments/${tournament.id}`}
                    className="group flex flex-col rounded-[12px] border border-hairline bg-surface p-5 shadow-rest transition-all duration-200 hover:-translate-y-0.5 hover:border-faint hover:shadow-raise"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
                        {tournament.sport} · {tournament.ageGroup}{' '}
                        {tournament.gender}
                      </span>
                      <Badge
                        tone={
                          tournament.status === 'ongoing'
                            ? 'live'
                            : tournament.status === 'completed'
                              ? 'won'
                              : 'upcoming'
                        }
                      >
                        {tournament.status === 'ongoing'
                          ? 'Live'
                          : tournament.status === 'completed'
                            ? 'Completed'
                            : 'Published'}
                      </Badge>
                    </div>
                    <h3 className="mt-4 font-serif text-xl font-semibold leading-snug tracking-[-0.01em] text-ink">
                      {tournament.name}
                    </h3>
                    <div className="mt-6 flex items-center justify-between gap-3 border-t border-hairline pt-4 text-[11px] text-muted">
                      <span>
                        {tournament.year} · {tournament.teamCount} teams
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-semibold text-ink transition-colors group-hover:text-accent">
                        View bracket
                        <Icon name="arrowRight" size="xs" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-10 grid gap-6 rounded-[12px] border border-dashed border-hairline bg-surface px-6 py-10 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-[9px] border border-hairline bg-canvas text-accent">
                  <Icon name="bracket" size="lg" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">
                    The board is clear for now.
                  </p>
                  <p className="mt-1 max-w-[52ch] text-sm leading-relaxed text-muted">
                    Public draws appear here the moment an organizer publishes
                    a bracket.
                  </p>
                </div>
                <Link
                  href="/dashboard"
                  className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-[6px] border border-hairline bg-canvas px-3.5 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-surface"
                >
                  Organizer console
                  <Icon name="arrowRight" size="xs" />
                </Link>
              </div>
            )}
          </div>
        </section>

        {champions.length > 0 && (
          <section
            id="champions"
            className="scroll-mt-20 border-t border-hairline py-20 sm:py-24"
          >
            <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:px-8">
              <div>
                <h2 className="font-serif text-3xl font-semibold leading-[1.08] tracking-[-0.02em] text-ink sm:text-[2.35rem]">
                  The record book.
                </h2>
                <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-muted">
                  Recent winners the draw engine uses to keep strong sides
                  apart in the early rounds.
                </p>
              </div>

              <ol className="divide-y divide-hairline border-y border-hairline">
                {champions.map((champion) => (
                  <li
                    key={champion.id}
                    className="grid grid-cols-[auto_1fr_auto] items-center gap-4 py-4"
                  >
                    <span className="font-mono text-xs tabular-nums text-muted">
                      {champion.year}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {champion.winnerTeamName}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {champion.schoolName}
                      </span>
                    </span>
                    <span className="text-right font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                      {champion.sport} · {champion.ageGroup} {champion.gender}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}

        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-[14px] border border-accent/15 bg-accent-soft px-6 py-10 sm:px-10 sm:py-12">
              <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
                <div>
                  <h2 className="max-w-xl font-serif text-3xl font-semibold leading-[1.08] tracking-[-0.02em] text-accent-strong sm:text-[2.35rem]">
                    The next draw starts here.
                  </h2>
                  <p className="mt-3 max-w-[52ch] text-sm leading-relaxed text-accent-strong/85">
                    Open the organizer console to enroll teams and publish the
                    season’s first bracket.
                  </p>
                </div>
                <div className="flex flex-col gap-2.5 sm:flex-row">
                  <Link
                    href="/dashboard"
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[6px] bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-rest transition-all duration-200 hover:bg-accent-strong active:scale-[0.98]"
                  >
                    Organizer console
                    <Icon name="arrowRight" size="sm" />
                  </Link>
                  <Link
                    href="/school/login"
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[6px] border border-accent/15 bg-surface px-5 py-2.5 text-sm font-semibold text-ink shadow-rest transition-all duration-200 hover:border-accent/30 active:scale-[0.98]"
                  >
                    School sign in
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-hairline bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-accent text-white">
                <Icon name="trophy" size="sm" />
              </span>
              <span className="font-serif text-[17px] font-semibold tracking-[-0.01em] text-ink">
                DSO Navi Mumbai
              </span>
            </div>
            <p className="mt-4 max-w-[42ch] text-sm leading-relaxed text-muted">
              The official fixture and bracket desk for school sports in Navi
              Mumbai.
            </p>
          </div>

          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
              Explore
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {[
                ['#platform', 'Platform'],
                ['#roles', 'Roles'],
                ['#tournaments', 'Public fixtures'],
                ['#process', 'How it works'],
              ].map(([href, label]) => (
                <li key={href}>
                  <a
                    href={href}
                    className="text-muted transition-colors hover:text-ink"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
              Access
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link
                  href="/dashboard"
                  className="text-muted transition-colors hover:text-ink"
                >
                  Organizer console
                </Link>
              </li>
              <li>
                <Link
                  href="/school/login"
                  className="text-muted transition-colors hover:text-ink"
                >
                  School sign in
                </Link>
              </li>
              <li>
                <Link
                  href="/score"
                  className="text-muted transition-colors hover:text-ink"
                >
                  Live scoring
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-hairline px-4 py-5 text-center text-xs text-muted">
          © {new Date().getFullYear()} District Sports Office, Navi Mumbai.
          Built for the district’s schools.
        </div>
      </footer>
    </div>
  );
};
