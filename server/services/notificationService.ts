import { notificationRepository } from '../repositories/notificationRepository.ts';
import { tournamentRepository } from '../repositories/tournamentRepository.ts';
import { teamRepository } from '../repositories/teamRepository.ts';
import { enrollmentRepository } from '../repositories/enrollmentRepository.ts';
import { MatchDoc, NotificationDoc, NotificationType, TeamDoc } from '../../shared/types.ts';

export interface NotificationPayload {
  schoolId: string;
  userId?: string;
  type: NotificationType;
  title: string;
  message: string;
  matchId?: string;
  tournamentId?: string;
  oldValue?: {
    scheduledAt?: string | null;
    venue?: string | null;
  } | null;
  newValue?: {
    scheduledAt?: string | null;
    venue?: string | null;
  } | null;
}

/**
 * Provider interface so WhatsApp / SMS / Push providers can be registered in the future.
 */
export interface INotificationProvider {
  name: string;
  send(payload: NotificationPayload): Promise<void>;
}

/**
 * In-App Provider: persists to notificationRepository for dashboard and bell queries.
 */
export class InAppNotificationProvider implements INotificationProvider {
  name = 'in-app';

  async send(payload: NotificationPayload): Promise<void> {
    await notificationRepository.create({
      schoolId: payload.schoolId,
      userId: payload.userId,
      type: payload.type,
      matchId: payload.matchId,
      tournamentId: payload.tournamentId,
      title: payload.title,
      message: payload.message,
      oldValue: payload.oldValue,
      newValue: payload.newValue,
    });
  }
}

export class NotificationService {
  private providers: INotificationProvider[] = [new InAppNotificationProvider()];

  /**
   * Extensible hook: Register additional providers (e.g. WhatsAppProvider, SmsProvider)
   */
  registerProvider(provider: INotificationProvider) {
    this.providers.push(provider);
  }

  private async dispatch(payload: NotificationPayload): Promise<void> {
    for (const provider of this.providers) {
      try {
        await provider.send(payload);
      } catch (err) {
        console.error(`[NotificationService] Provider ${provider.name} error:`, err);
      }
    }
  }

  /**
   * Triggered when organizer publishes tournament fixtures.
   */
  async notifyFixturePublished(tournamentId: string): Promise<void> {
    const tournament = await tournamentRepository.findById(tournamentId);
    if (!tournament) return;

    const enrollments = await enrollmentRepository.findByTournamentId(tournamentId);
    const notifiedSchoolIds = new Set<string>();

    for (const enr of enrollments) {
      if (enr.status === 'withdrawn') continue;
      const team = await teamRepository.findById(enr.teamId);
      if (team && !notifiedSchoolIds.has(team.schoolId)) {
        notifiedSchoolIds.add(team.schoolId);
        await this.dispatch({
          schoolId: team.schoolId,
          type: 'fixture_published',
          tournamentId,
          title: `Fixtures Published: ${tournament.name}`,
          message: `The official match schedule and bracket have been published for ${tournament.name}. Check your portal to view your matches.`,
        });
      }
    }
  }

  /**
   * Triggered when match date, time, or venue changes.
   */
  async notifyScheduleUpdated(
    match: MatchDoc,
    oldSchedule: { scheduledAt?: string | null; venue?: string | null },
    tournamentName: string
  ): Promise<void> {
    const schoolsToNotify = new Set<string>();
    if (match.teamA && match.teamA.schoolId) schoolsToNotify.add(match.teamA.schoolId);
    if (match.teamB && match.teamB.schoolId) schoolsToNotify.add(match.teamB.schoolId);

    const hasTimeChanged = oldSchedule.scheduledAt !== match.scheduledAt;
    const hasVenueChanged = oldSchedule.venue !== match.venue;

    const notifType: NotificationType = hasVenueChanged && !hasTimeChanged ? 'venue_changed' : 'schedule_changed';

    const matchTitle = `${match.teamA?.name || 'TBD'} vs ${match.teamB?.name || 'TBD'}`;
    const descParts: string[] = [];
    if (hasTimeChanged) {
      descParts.push(`Time rescheduled: was "${oldSchedule.scheduledAt || 'TBD'}", now "${match.scheduledAt || 'TBD'}"`);
    }
    if (hasVenueChanged) {
      descParts.push(`Venue moved: was "${oldSchedule.venue || 'TBD'}", now "${match.venue || 'TBD'}"`);
    }

    const message = `Match ${match.roundName} (${matchTitle}) in ${tournamentName} has been updated. ${descParts.join('. ')}.`;

    for (const schoolId of schoolsToNotify) {
      await this.dispatch({
        schoolId,
        type: notifType,
        matchId: match.id,
        tournamentId: match.tournamentId,
        title: hasVenueChanged && !hasTimeChanged ? `Venue Changed: ${matchTitle}` : `Schedule Rescheduled: ${matchTitle}`,
        message,
        oldValue: oldSchedule,
        newValue: { scheduledAt: match.scheduledAt, venue: match.venue },
      });
    }
  }

  /**
   * Triggered when a match result is recorded.
   */
  async notifyResultEntered(
    match: MatchDoc,
    winnerTeam: TeamDoc,
    loserTeam?: TeamDoc | null,
    tournamentName: string = 'Tournament'
  ): Promise<void> {
    const scoreStr = match.score
      ? `(${match.score.teamAScore ?? '-'} - ${match.score.teamBScore ?? '-'})`
      : '';

    // Notify winner school
    if (winnerTeam.schoolId) {
      await this.dispatch({
        schoolId: winnerTeam.schoolId,
        type: 'team_advanced',
        matchId: match.id,
        tournamentId: match.tournamentId,
        title: `Victory! ${winnerTeam.name} advances!`,
        message: `${winnerTeam.name} won match ${match.roundName} ${scoreStr} and advances to the next round in ${tournamentName}.`,
      });
    }

    // Notify loser school
    if (loserTeam && loserTeam.schoolId) {
      await this.dispatch({
        schoolId: loserTeam.schoolId,
        type: 'team_eliminated',
        matchId: match.id,
        tournamentId: match.tournamentId,
        title: `Match Result: ${match.roundName}`,
        message: `${loserTeam.name} completed ${match.roundName} against ${winnerTeam.name} ${scoreStr}. Thank you for competing.`,
      });
    }
  }

  async getSchoolNotifications(schoolId: string): Promise<NotificationDoc[]> {
    return notificationRepository.findBySchoolId(schoolId);
  }

  async getUnreadCount(schoolId: string): Promise<number> {
    return notificationRepository.countUnread(schoolId);
  }

  async markAsRead(id: string, schoolId: string): Promise<NotificationDoc | null> {
    return notificationRepository.markAsRead(id, schoolId);
  }

  async markAllAsRead(schoolId: string): Promise<number> {
    return notificationRepository.markAllAsRead(schoolId);
  }
}

export const notificationService = new NotificationService();
