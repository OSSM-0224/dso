import { dbStore } from '../db/memoryStore.ts';
import { NotificationDoc, NotificationType } from '../../shared/types.ts';

export class NotificationRepository {
  async findBySchoolId(schoolId: string): Promise<NotificationDoc[]> {
    return Array.from(dbStore.notifications.values())
      .filter((n) => n.schoolId === schoolId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async countUnread(schoolId: string): Promise<number> {
    let count = 0;
    for (const n of dbStore.notifications.values()) {
      if (n.schoolId === schoolId && !n.isRead) {
        count++;
      }
    }
    return count;
  }

  async create(data: {
    schoolId: string;
    userId?: string;
    type: NotificationType;
    matchId?: string;
    tournamentId?: string;
    title: string;
    message: string;
    oldValue?: { scheduledAt?: string | null; venue?: string | null } | null;
    newValue?: { scheduledAt?: string | null; venue?: string | null } | null;
  }): Promise<NotificationDoc> {
    const id = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const doc: NotificationDoc = {
      id,
      schoolId: data.schoolId,
      userId: data.userId,
      type: data.type,
      matchId: data.matchId,
      tournamentId: data.tournamentId,
      title: data.title,
      message: data.message,
      oldValue: data.oldValue || null,
      newValue: data.newValue || null,
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    dbStore.notifications.set(id, doc);
    return doc;
  }

  async markAsRead(id: string, schoolId: string): Promise<NotificationDoc | null> {
    const notif = dbStore.notifications.get(id);
    if (!notif || notif.schoolId !== schoolId) {
      return null;
    }
    const updated = { ...notif, isRead: true };
    dbStore.notifications.set(id, updated);
    return updated;
  }

  async markAllAsRead(schoolId: string): Promise<number> {
    let count = 0;
    for (const [id, notif] of dbStore.notifications.entries()) {
      if (notif.schoolId === schoolId && !notif.isRead) {
        dbStore.notifications.set(id, { ...notif, isRead: true });
        count++;
      }
    }
    return count;
  }
}

export const notificationRepository = new NotificationRepository();
