import 'server-only';
import { collections } from '../db/docStore.ts';
import { NotificationDoc, NotificationType } from '../../shared/types.ts';

export class NotificationRepository {
  async findBySchoolId(schoolId: string): Promise<NotificationDoc[]> {
    return (await collections.notifications.all())
      .filter((n) => n.schoolId === schoolId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async countUnread(schoolId: string): Promise<number> {
    const list = await collections.notifications.all();
    return list.filter((n) => n.schoolId === schoolId && !n.isRead).length;
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
    await collections.notifications.set(doc);
    return doc;
  }

  async markAsRead(id: string, schoolId: string): Promise<NotificationDoc | null> {
    const notif = await collections.notifications.get(id);
    if (!notif || notif.schoolId !== schoolId) {
      return null;
    }
    const updated = { ...notif, isRead: true };
    await collections.notifications.set(updated);
    return updated;
  }

  async markAllAsRead(schoolId: string): Promise<number> {
    const list = await collections.notifications.all();
    let count = 0;
    for (const notif of list) {
      if (notif.schoolId === schoolId && !notif.isRead) {
        await collections.notifications.set({ ...notif, isRead: true });
        count++;
      }
    }
    return count;
  }
}

export const notificationRepository = new NotificationRepository();
