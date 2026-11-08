"use client";

/**
 * DSO dodgeball scorer console.
 *
 * DSO dodgeball differences from the generic rulebook:
 * - no toss and no jersey-number lineups: each team fields Player 1-6;
 * - two 1:30 sets, with a deciding third set only when the first two are level;
 * - each team gets three balls to attack with;
 * - points belong to the team, never to an individual player;
 * - no team-colour picker.
 *
 * Every action is queued through the host and validated server-side by the
 * dodgeball engine.
 */
import React, { useEffect, useState } from "react";
import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/i18n/LanguageProvider";
import { ToastBanner } from "@/features/scoring/shared/ToastBanner";
import {
  type DodgeballPhase,
  type DodgeballScoreboard,
  type DodgeballScoringConfig,
} from "@/shared/scoring/sports/dodgeball/types";
import type { SanitizedScoreEvent } from "@/shared/types";
import type { SportConsoleProps } from "../registry";

const btnGhost =
  "flex items-center justify-center gap-1.5 rounded-[6px] border border-hairline bg-surface px-3 py-2 text-xs font-semibold text-ink transition-colors duration-200 hover:border-faint disabled:opacity-45";
const btnPrimary =
  "flex items-center justify-center gap-1.5 rounded-[6px] bg-ink px-3 py-2 text-xs font-semibold text-white transition-opacity duration-200 disabled:opacity-45";
const btnDanger =
  "flex items-center justify-center gap-1.5 rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition-colors duration-200 disabled:opacity-45";

const PHASE_LABEL: Record<DodgeballPhase, string> = {
  awaiting_toss: "Ready for set 1",
  awaiting_lineups: "Ready for set 1",
  awaiting_set_start: "Ready for set 1",
  set_live: "In play",
  set_paused: "Clock stopped",
  awaiting_revival: "Revival window",
  extra_time: "Extra time",
  sudden_death: "Sudden death",
  set_break: "Set break",
  completed: "Completed",
};

type SendEvent = (payload: Record<string, unknown>) => boolean;

const fmtClock = (ms: number | null): string => {
  if (ms === null) return "--:--";
  const clamped = Math.max(0, Math.round(ms));
  const m = Math.floor(clamped / 60000);
  const s = Math.floor((clamped % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
};

const fmtTimeString = (iso: string | null) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

/** DSO players are anonymous slots, not jersey numbers. */
const playerLabel = (playerId?: string | null): string => {
  if (!playerId) return "";
  const slot = /^p(\d+)$/i.exec(playerId);
  return slot ? `P${slot[1]}` : `#${playerId}`;
};

function useElapsedMs(active: boolean, anchor: number | undefined): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active || !anchor) {
      setElapsed(0);
      return;
    }
    const update = () => setElapsed(Math.max(0, Date.now() - anchor));
    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, [active, anchor]);
  return elapsed;
}

function describeEvent(
  ev: SanitizedScoreEvent,
  teamName: (id?: string | null) => string,
  t: (phrase: string, vars?: Record<string, string | number>) => string,
): string {
  const parsed = ev as unknown as Record<string, any>;
  switch (parsed.type) {
    case "TEAM_POINT":
      return t("{team} team point", { team: teamName(parsed.teamId) });
    case "TOSS":
      return t("Toss: {team} chose the court", {
        team: teamName(parsed.winnerTeamId),
      });
    case "LINEUP_SET":
      return t("Lineup set: {team}", { team: teamName(parsed.teamId) });
    case "SUBSTITUTION":
      return t("Substitution: {team}", { team: teamName(parsed.teamId) });
    case "SET_START":
      return t("Set {setNo} started", { setNo: parsed.setNo });
    case "HIT":
      return t("{team} hit {player}", {
        team: teamName(parsed.teamId),
        player: playerLabel(parsed.targetPlayerId),
      });
    case "LINE_OUT":
      return t("{team} line-out point", { team: teamName(parsed.teamId) });
    case "CATCH":
      return t("Catch by {team} ({player})", {
        team: teamName(parsed.teamId),
        player: playerLabel(parsed.playerId),
      });
    case "CARD":
      return t("{card} card: {team} {player}", {
        card: parsed.cardType,
        team: teamName(parsed.teamId),
        player: playerLabel(parsed.playerId),
      });
    case "INJURY":
      return t("Injury: {team} {player}", {
        team: teamName(parsed.teamId),
        player: playerLabel(parsed.playerId),
      });
    case "DELAY":
      return t("Delay penalty: {team}", { team: teamName(parsed.teamId) });
    case "REVIVE":
      return t("Revival: {team}", { team: teamName(parsed.teamId) });
    case "REVIVAL_FAILED":
      return t("Revival failed: {team}", { team: teamName(parsed.teamId) });
    case "PAUSE":
      return t("Clock stopped");
    case "RESUME":
      return t("Clock resumed");
    case "SET_END":
      return t("Set {setNo} ended", { setNo: parsed.setNo });
    case "EXTRA_TIME_START":
      return t("Extra time started");
    case "SUDDEN_DEATH_START":
      return t("Sudden death started");
    case "MANUAL_DECISION":
      return t("Manual decision: {team}", {
        team: teamName(parsed.winnerTeamId),
      });
    case "VOID":
      return t("Earlier event withdrawn");
    default:
      return t("Match event");
  }
}

export const DodgeballConsole: React.FC<SportConsoleProps> = (props) => {
  const {
    tournament,
    match,
    score,
    isReadOnly,
    scorerNames,
    actions,
    sync,
    fault,
    clearFault,
    tournamentId,
    snapshotAt,
  } = props;
  const { t } = useI18n();

  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<{
    tone: "error" | "info" | "success";
    text: string;
  } | null>(null);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideWinner, setOverrideWinner] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const sb =
    score && score.scoreboard.sport === "dodgeball" ? score.scoreboard : null;
  const config =
    score && "hitPoints" in score.config
      ? (score.config as DodgeballScoringConfig)
      : null;
  const clockActive = Boolean(
    sb?.time && !sb.time.paused && sb.time.period !== "sudden_death",
  );
  const elapsedMs = useElapsedMs(clockActive, snapshotAt);

  const teamAId = match.teamA?.id ?? "";
  const teamBId = match.teamB?.id ?? "";
  const teams = sb?.teams ?? [];
  const teamName = (id?: string | null): string => {
    if (!id) return "";
    const fromScore = teams.find((team) => team.id === id)?.name;
    if (fromScore) return fromScore;
    if (match.teamA?.id === id) return match.teamA.name;
    if (match.teamB?.id === id) return match.teamB.name;
    return id;
  };
  const teamAName = teamName(teamAId) || t("TBD");
  const teamBName = teamName(teamBId) || t("TBD");

  const send: SendEvent = (payload) => {
    const ok = actions.postEvent(payload);
    if (!ok)
      setToast({ tone: "error", text: "The score session is not ready yet." });
    return ok;
  };

  const doUndo = () => {
    actions.undoEvent();
    setToast({
      tone: "info",
      text: "Undo queued — it runs after the pending events.",
    });
  };

  const startScoring = async () => {
    setPending(true);
    try {
      await actions.startScoring();
    } catch (err) {
      setToast({
        tone: "error",
        text: err instanceof Error ? err.message : "Could not start scoring",
      });
    } finally {
      setPending(false);
    }
  };

  const doComplete = async () => {
    setPending(true);
    try {
      await actions.completeMatch();
      setToast({
        tone: "success",
        text: "Result recorded to the official bracket.",
      });
    } catch (err) {
      setToast({
        tone: "error",
        text: err instanceof Error ? err.message : "Completion failed",
      });
    } finally {
      setPending(false);
    }
  };

  const doOverride = async () => {
    if (!overrideWinner || overrideReason.trim().length < 5) return;
    setPending(true);
    try {
      await actions.overrideWinner({
        winnerTeamId: overrideWinner,
        reason: overrideReason.trim(),
      });
      setShowOverride(false);
      setToast({ tone: "success", text: "Winner overridden and recorded." });
    } catch (err) {
      setToast({
        tone: "error",
        text: err instanceof Error ? err.message : "Override failed",
      });
    } finally {
      setPending(false);
    }
  };

  const banner = fault ? (
    <ToastBanner
      tone="error"
      text={
        fault.droppedCount > 1
          ? t(
              "{message} {count} queued events were removed — re-check the score before continuing.",
              {
                message: fault.message,
                count: fault.droppedCount,
              },
            )
          : fault.message
      }
      onDismiss={clearFault}
    />
  ) : toast ? (
    <ToastBanner
      tone={toast.tone}
      text={t(toast.text)}
      onDismiss={() => setToast(null)}
    />
  ) : null;

  if (sb && score && score.status === "completed") {
    const winnerId = score.winnerTeamIds?.[0] ?? sb.winner.winnerTeamId;
    return (
      <div className="space-y-5">
        {banner}
        <div className="rounded-[12px] border border-hairline bg-surface p-6 text-center">
          <Icon
            name="trophy"
            size="xl"
            className="mx-auto mb-3 text-accent-strong"
          />
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
            {t("Match completed")}
          </p>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-ink">
            {teamName(winnerId) || t("Result recorded")}
          </h1>
          {sb.winner.label && (
            <p className="mt-1 text-xs font-semibold text-accent-strong">
              {sb.winner.label}
            </p>
          )}
          <div className="mx-auto mt-4 grid max-w-xs grid-cols-3 items-center gap-2">
            <p className="text-center font-mono text-xl font-bold tabular-nums text-ink">
              {sb.setWins[teamAId] ?? 0}
            </p>
            <p className="text-center text-[10px] uppercase tracking-wider text-faint">
              {t("Sets")}
            </p>
            <p className="text-center font-mono text-xl font-bold tabular-nums text-ink">
              {sb.setWins[teamBId] ?? 0}
            </p>
          </div>
          <p className="mt-4 text-[11px] text-muted">
            {t(
              "Winner recorded to the official bracket (advancement, audit log and school notifications done).",
            )}
          </p>
          <Link
            href={`/score/${tournamentId}`}
            className={`mt-4 inline-flex ${btnGhost}`}
          >
            <Icon name="arrowLeft" size="sm" />
            {t("Back to the hub")}
          </Link>
        </div>
      </div>
    );
  }

  if (!score || !sb || !config) {
    return (
      <div className="space-y-5">
        {banner}
        <div className="rounded-[12px] border border-hairline bg-surface p-5 text-center">
          <p className="rounded-full bg-canvas px-2 py-0.5 text-center text-[10px] font-semibold uppercase tracking-[0.05em] text-muted">
            {tournament.name} · {match.roundName} ·{" "}
            {t("Match #{number}", { number: match.matchNumber })}
          </p>
          <h1 className="mt-3 text-center font-serif text-xl font-semibold text-ink">
            {teamAName}
            <span className="mx-2 text-faint">{t("vs")}</span>
            {teamBName}
          </h1>
          <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-muted">
            {match.venue && (
              <span className="inline-flex items-center gap-1">
                <Icon name="location" size="xs" /> {match.venue}
              </span>
            )}
            {fmtTimeString(match.scheduledAt) && (
              <span className="inline-flex items-center gap-1">
                <Icon name="calendar" size="xs" />{" "}
                {fmtTimeString(match.scheduledAt)}
              </span>
            )}
            {scorerNames.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Icon name="userPlus" size="xs" /> {scorerNames.join(", ")}
              </span>
            )}
          </div>
          <button
            onClick={startScoring}
            disabled={pending}
            className={`mt-5 w-full ${btnPrimary}`}
          >
            {pending ? (
              <Icon name="spinner" size="sm" spin />
            ) : (
              <Icon name="play" size="sm" />
            )}
            {t("Start scoring session")}
          </button>
          <p className="mt-2 text-center text-[10px] text-faint">
            {t("No toss, no jersey numbers — start set 1 straight away.")}
          </p>
        </div>
        <Link href={`/score/${tournamentId}`} className={`w-full ${btnGhost}`}>
          <Icon name="arrowLeft" size="sm" />
          {t("Back to the hub")}
        </Link>
      </div>
    );
  }

  const action = sb.nextAction;
  let promptBody: React.ReactNode = null;

  if (action.action === "start_set") {
    promptBody = (
      <StartSetPanel
        setNo={action.setNo}
        deciding={action.deciding}
        config={config}
        pending={pending}
        onEvent={send}
      />
    );
  } else if (action.action === "require_revival" && sb.revival) {
    promptBody = (
      <RevivalPanel
        revival={sb.revival}
        teamName={teamName(sb.revival.teamId)}
        snapshotAt={snapshotAt}
        pending={pending}
        onEvent={send}
      />
    );
  } else if (action.action === "set_paused") {
    promptBody = (
      <div className="rounded-[12px] border border-amber-300 bg-amber-50/70 p-5 text-center">
        <Icon name="pause" size="xl" className="mx-auto mb-2 text-amber-700" />
        <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-amber-800">
          {t("Clock stopped")}
        </p>
        <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-ink">
          {fmtClock(action.remainingMs)}
        </p>
        <button
          onClick={() => send({ type: "RESUME" })}
          disabled={pending || isReadOnly}
          className={`mt-4 w-full ${btnPrimary}`}
        >
          {pending ? (
            <Icon name="spinner" size="sm" spin />
          ) : (
            <Icon name="play" size="sm" />
          )}
          {t("Resume play")}
        </button>
      </div>
    );
  } else if (action.action === "end_set") {
    const level = (sb.points[teamAId] ?? 0) === (sb.points[teamBId] ?? 0);
    promptBody = (
      <div className="rounded-[12px] border border-hairline bg-surface p-5 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-faint">
          {t("Set time is over")}
        </p>
        <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-ink">
          {sb.points[teamAId] ?? 0} – {sb.points[teamBId] ?? 0}
        </p>
        {level && (
          <p className="mt-2 text-[11px] font-semibold text-amber-800">
            {t(
              "Level set — it will be recorded as a draw. No set point to either team.",
            )}
          </p>
        )}
        <button
          onClick={() =>
            send({ type: "SET_END", setNo: action.setNo, reason: "TIMER" })
          }
          disabled={pending || isReadOnly}
          className={`mt-4 w-full ${btnPrimary}`}
        >
          {pending ? (
            <Icon name="spinner" size="sm" spin />
          ) : (
            <Icon name="flag" size="sm" />
          )}
          {t("End set {setNo}", { setNo: action.setNo })}
        </button>
      </div>
    );
  } else if (
    action.action === "record_events" ||
    action.action === "sudden_death"
  ) {
    promptBody = (
      <div className="space-y-3">
        {action.action === "sudden_death" && (
          <p className="flex items-center justify-center gap-1.5 rounded-[6px] bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            <Icon name="bolt" size="sm" />{" "}
            {t("Sudden death — the first point wins the set.")}
          </p>
        )}
        <TeamPointsPanel
          sb={sb}
          config={config}
          teamAId={teamAId}
          teamBId={teamBId}
          pending={pending}
          isReadOnly={isReadOnly}
          onEvent={send}
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => send({ type: "PAUSE", reason: "OFFICIAL" })}
            disabled={
              pending ||
              isReadOnly ||
              sb.time?.paused ||
              sb.time?.period === "sudden_death"
            }
            className={btnGhost}
          >
            <Icon name="pause" size="sm" /> {t("Stop clock")}
          </button>
          <button
            onClick={() => send({ type: "RESUME" })}
            disabled={pending || isReadOnly || !sb.time?.paused}
            className={btnGhost}
          >
            <Icon name="play" size="sm" /> {t("Resume clock")}
          </button>
        </div>
      </div>
    );
  } else if (action.action === "completed") {
    const drawn = sb.winner.kind === "draw";
    promptBody = (
      <div className="rounded-[12px] border border-emerald-200 bg-emerald-50 p-5 text-center">
        <Icon
          name="trophy"
          size="xl"
          className="mx-auto mb-2 text-emerald-700"
        />
        <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-emerald-800">
          {drawn ? t("Match drawn") : t("Match decided")}
        </p>
        <p className="mt-1 font-serif text-xl font-semibold text-ink">
          {drawn ? t("Level after the decider") : teamName(sb.winner.winnerTeamId)}
        </p>
        {sb.winner.label && (
          <p className="text-xs font-semibold text-emerald-700">
            {sb.winner.label}
          </p>
        )}
        {drawn ? (
          <p className="mt-2 text-[11px] text-emerald-900">
            {t(
              "Use Override winner to record the official result for this drawn match.",
            )}
          </p>
        ) : (
          <button
            onClick={doComplete}
            disabled={pending || isReadOnly}
            className={`mt-4 w-full ${btnPrimary}`}
          >
            {pending ? (
              <Icon name="spinner" size="sm" spin />
            ) : (
              <Icon name="flag" size="sm" />
            )}
            {t("Complete match")}
          </button>
        )}
      </div>
    );
  }

  const recentEvents = [...score.events]
    .sort((a, b) => b.atMs - a.atMs)
    .slice(0, 8);
  const liveRemaining =
    sb.time?.remainingMs != null
      ? Math.max(0, sb.time.remainingMs - elapsedMs)
      : null;

  return (
    <div className="space-y-4">
      {banner}

      <div className="rounded-[12px] border border-hairline bg-surface p-4">
        <p className="rounded-full bg-canvas px-2 py-0.5 text-center text-[10px] font-semibold uppercase tracking-[0.05em] text-muted">
          {tournament.name} · {match.roundName} ·{" "}
          {t("Match #{number}", { number: match.matchNumber })}
        </p>
        <div className="mt-2 text-center font-serif text-[17px] font-semibold text-ink">
          {teamAName} <span className="text-faint">{t("vs")}</span> {teamBName}
        </div>

        <p className="mt-1 text-center text-[11px] text-muted">
          {t("Set {setNo}", { setNo: sb.setNo })} · {t(PHASE_LABEL[sb.phase])} ·
          v{score.version}
          {scorerNames.length > 0
            ? ` · ${t("scorers: {names}", { names: scorerNames.join(", ") })}`
            : ""}
        </p>
        <p className="mt-1 text-center font-mono text-lg font-bold tabular-nums text-ink">
          {sb.phase === "sudden_death"
            ? t("SUDDEN DEATH")
            : fmtClock(liveRemaining)}
        </p>
        <p className="mt-0.5 text-center text-[10px] text-faint">
          {t("1:30 per set · 3 balls per team · team points only")}
        </p>
      </div>

      {sync.offline && (
        <p className="flex items-center justify-center gap-1.5 rounded-[6px] bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          <Icon name="circleInfo" size="sm" />
          {sync.pendingCount === 1
            ? t("Offline, 1 event waiting")
            : t("Offline, {count} events waiting", {
                count: sync.pendingCount,
              })}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {[teamAId, teamBId].map((teamId) => {
          const state = sb.teamStates.find((team) => team.teamId === teamId);
          const setWins = sb.setWins[teamId] ?? 0;
          const rivalSetWins = sb.setWins[teamId === teamAId ? teamBId : teamAId] ?? 0;
          const leading = setWins > rivalSetWins;
          return (
            <div
              key={teamId}
              className={`rounded-[12px] border p-4 ${
                leading
                  ? "border-accent-strong bg-accent-soft/30"
                  : "border-hairline bg-surface"
              }`}
            >
              <p className="truncate text-xs font-semibold text-ink">
                {teamName(teamId)}
              </p>
              <p className="mt-1 font-mono text-4xl font-bold tabular-nums text-ink">
                {sb.points[teamId] ?? 0}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                {t("Set points")}
              </p>
              <p className="mt-0.5 text-[10px] text-muted">
                {t("Set wins: {wins}", { wins: setWins })}
              </p>
              {state && (
                <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted">
                  <Icon name="bolt" size="xs" />
                  {t("Balls to attack: {count}", {
                    count: state.balls ?? config.ballsPerTeam,
                  })}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {promptBody}

      {sb.sets.length > 0 && (
        <div className="rounded-[12px] border border-hairline bg-surface p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.06em] text-faint">
            {t("Sets")}
          </p>
          <ul className="space-y-1.5">
            {sb.sets.map((set) => (
              <li
                key={set.setNo}
                className="flex items-center justify-between gap-2 text-xs text-ink"
              >
                <span className="w-12 shrink-0 text-muted">
                  {t("Set {setNo}", { setNo: set.setNo })}
                </span>
                <span className="flex-1 text-center font-mono tabular-nums">
                  {set.points[teamAId] ?? 0} – {set.points[teamBId] ?? 0}
                </span>
                <span className="w-28 shrink-0 text-right text-[10px] font-semibold text-muted">
                  {set.completed
                    ? set.winnerTeamId
                      ? teamName(set.winnerTeamId)
                      : t("Draw")
                    : set.suddenDeath
                      ? t("Sudden death")
                      : set.extraTime
                        ? t("Extra time")
                        : t("In play")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showOverride && (
        <div className="rounded-[12px] border border-amber-300 bg-amber-50/70 p-5">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-amber-700">
            <Icon name="gavel" size="xs" /> {t("Override winner (emergency)")}
          </p>
          <p className="mt-1 text-xs text-amber-900">
            {t(
              "Bypasses the event flow and records the result immediately. Reason is mandatory and audited.",
            )}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[teamAId, teamBId].map((id, idx) => (
              <button
                key={id}
                onClick={() => setOverrideWinner(id)}
                className={`rounded-[6px] border px-3 py-2 text-xs font-semibold ${
                  overrideWinner === id
                    ? "border-amber-600 bg-amber-100 text-amber-900"
                    : "border-amber-200 bg-white text-ink"
                }`}
              >
                {idx === 0 ? teamAName : teamBName}
              </button>
            ))}
          </div>
          <textarea
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            rows={2}
            placeholder={t("Reason (required, min 5 characters)")}
            className="mt-2 w-full rounded-[6px] border border-amber-200 bg-white px-3 py-2 text-sm text-ink"
          />
          <button
            onClick={doOverride}
            disabled={
              pending || !overrideWinner || overrideReason.trim().length < 5
            }
            className={`mt-2 w-full ${btnPrimary}`}
          >
            {pending ? (
              <Icon name="spinner" size="sm" spin />
            ) : (
              <Icon name="gavel" size="sm" />
            )}
            {t("Declare winner & finish")}
          </button>
          <button
            onClick={() => setShowOverride(false)}
            className={`mt-2 w-full ${btnGhost}`}
          >
            {t("Cancel")}
          </button>
        </div>
      )}

      {recentEvents.length > 0 && (
        <div className="rounded-[12px] border border-hairline bg-surface p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.06em] text-faint">
            {t("Recent events")}
          </p>
          <ul className="space-y-1.5">
            {recentEvents.map((ev) => (
              <li
                key={ev.eventId}
                className="flex items-center justify-between gap-2 text-[11px] text-muted"
              >
                <span className="truncate">
                  {describeEvent(ev, teamName, t)}
                </span>
                <span className="shrink-0 font-mono tabular-nums">
                  {Math.max(0, Math.round(ev.atMs / 1000))}s
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="sticky bottom-0 z-30 -mx-4 border-t border-hairline bg-surface/95 px-4 py-3 backdrop-blur-sm">
        <div className="grid grid-cols-2 gap-2">
          {!isReadOnly && (
            <button
              onClick={doUndo}
              disabled={pending || !sync.canUndo}
              className={btnGhost}
              title={
                !sync.canUndo
                  ? t("Wait for the pending events to sync first")
                  : undefined
              }
            >
              {sync.inFlight ? (
                <Icon name="spinner" size="sm" spin />
              ) : (
                <Icon name="rotate" size="sm" />
              )}
              {t("Undo last event")}
            </button>
          )}
          {score.status === "active" && !showOverride && sb.winner.resolved && sb.winner.winnerTeamId ? (
            <button
              onClick={doComplete}
              disabled={pending || isReadOnly}
              className={btnPrimary}
            >
              {pending ? (
                <Icon name="spinner" size="sm" spin />
              ) : (
                <Icon name="flag" size="sm" />
              )}
              {t("Complete match")}
            </button>
          ) : !showOverride ? (
            <button
              onClick={() => setShowOverride(true)}
              disabled={pending || isReadOnly}
              className={btnGhost}
            >
              <Icon name="gavel" size="sm" />
              {t("Override winner")}
            </button>
          ) : (
            <button disabled className={btnGhost}>
              <Icon name="gavel" size="sm" />
              {t("Override open…")}
            </button>
          )}
        </div>
        <p className="mt-2 text-center text-[10px] text-faint">
          {sync.pendingCount > 0
            ? t("Syncing {count} event(s)…", { count: sync.pendingCount })
            : t("Server-validated events only")}
        </p>
      </div>
    </div>
  );
};

const StartSetPanel: React.FC<{
  setNo: number;
  deciding: boolean;
  config: DodgeballScoringConfig;
  pending: boolean;
  onEvent: SendEvent;
}> = ({ setNo, deciding, config, pending, onEvent }) => {
  const { t } = useI18n();
  return (
    <div className="rounded-[12px] border border-hairline bg-surface p-5 text-center">
      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-faint">
        {deciding ? t("Deciding set") : t("Next set")}
      </p>
      <p className="mt-1 font-serif text-xl font-semibold text-ink">
        {t("Set {setNo}", { setNo })}
      </p>
      <p className="mt-1 text-[10px] text-muted">
        {deciding
          ? t("Only played because the first two sets were level.")
          : t("1:30 on the clock · 3 balls for each team.")}
      </p>
      <p className="mt-1 text-[10px] text-faint">
        {t("{players} players per side · no jersey numbers", {
          players: config.playersOnCourt,
        })}
      </p>
      <button
        onClick={() => onEvent({ type: "SET_START", setNo })}
        disabled={pending}
        className={`mt-4 w-full ${btnPrimary}`}
      >
        {pending ? (
          <Icon name="spinner" size="sm" spin />
        ) : (
          <Icon name="play" size="sm" />
        )}
        {t("Start set {setNo}", { setNo })}
      </button>
    </div>
  );
};

const RevivalPanel: React.FC<{
  revival: NonNullable<DodgeballScoreboard["revival"]>;
  teamName: string;
  snapshotAt?: number;
  pending: boolean;
  onEvent: SendEvent;
}> = ({ revival, teamName, snapshotAt, pending, onEvent }) => {
  const { t } = useI18n();
  const elapsedMs = useElapsedMs(true, snapshotAt);
  const remainingMs = Math.max(0, revival.remainingMs - elapsedMs);

  return (
    <div className="rounded-[12px] border border-red-300 bg-red-50 p-5">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-red-700">
        <Icon name="clock" size="xs" /> {t("All out — revival window")}
      </p>
      <p className="mt-1 text-sm font-semibold text-ink">{teamName}</p>
      <p className="mt-1 text-xs text-red-900">
        {t(
          "Players {players} must re-enter before the 5-second window closes.",
          {
            players: revival.outPlayerIds.map(playerLabel).join(", "),
          },
        )}
      </p>
      <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-red-800">
        {fmtClock(remainingMs)}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() =>
            onEvent({
              type: "REVIVE",
              teamId: revival.teamId,
              playerIds: revival.outPlayerIds,
              reason: "REVIVAL",
            })
          }
          disabled={pending || revival.outPlayerIds.length === 0}
          className={btnPrimary}
        >
          <Icon name="check" size="sm" /> {t("All back in")}
        </button>
        <button
          onClick={() =>
            onEvent({ type: "REVIVAL_FAILED", teamId: revival.teamId })
          }
          disabled={pending}
          className={btnDanger}
        >
          <Icon name="xmark" size="sm" /> {t("Revival failed")}
        </button>
      </div>
    </div>
  );
};

const TeamPointsPanel: React.FC<{
  sb: DodgeballScoreboard;
  config: DodgeballScoringConfig;
  teamAId: string;
  teamBId: string;
  pending: boolean;
  isReadOnly: boolean;
  onEvent: SendEvent;
}> = ({ sb, config, teamAId, teamBId, pending, isReadOnly, onEvent }) => {
  const { t } = useI18n();

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {[teamAId, teamBId].map((teamId) => {
        const state = sb.teamStates.find((team) => team.teamId === teamId);
        return (
          <div
            key={teamId}
            className="rounded-[12px] border border-hairline bg-surface p-4 text-center"
          >
            <p className="truncate text-sm font-semibold text-ink">
              {state?.teamName ?? teamId}
            </p>
            <p className="mt-1 font-mono text-4xl font-bold tabular-nums text-ink">
              {sb.points[teamId] ?? 0}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              {t("Set points")}
            </p>
            <button
              onClick={() => onEvent({ type: "TEAM_POINT", teamId, points: 1 })}
              disabled={pending || isReadOnly}
              className={`mt-3 w-full ${btnPrimary}`}
            >
              <Icon name="bolt" size="sm" /> {t("Team point +1")}
            </button>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-[10px] text-muted">
              <Icon name="bolt" size="xs" />
              {t("Balls to attack: {count}", {
                count: state?.balls ?? config.ballsPerTeam,
              })}
            </p>
          </div>
        );
      })}
      <p className="text-[10px] text-muted md:col-span-2">
        {t(
          "Points belong to the team. No player selection and no individual player points.",
        )}
      </p>
    </div>
  );
};
