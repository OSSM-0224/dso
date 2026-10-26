import 'server-only';
import mongoose, { Model, Schema } from 'mongoose';
import { connectDatabase } from '../config/db.ts';
import { dbStore } from './memoryStore.ts';
import {
  AcknowledgementDoc,
  AuditLogDoc,
  EnrollmentDoc,
  FixtureSnapshotDoc,
  MatchDoc,
  MatchScoreDoc,
  NotificationDoc,
  PastTournamentDoc,
  SchoolDoc,
  ScoreEventDoc,
  TeamDoc,
  TournamentDoc,
  UserDoc,
} from '../../shared/types.ts';

interface BaseDoc {
  id: string;
}

const modelCache = new Map<string, Model<any>>();

function getModel(collection: string): Model<any> {
  const cached = modelCache.get(collection);
  if (cached) return cached;

  let model = mongoose.models[collection] as unknown as Model<any> | undefined;
  if (!model) {
    model = mongoose.model(
      collection,
      new Schema({ _id: { type: String } }, { strict: false, versionKey: false, timestamps: false }),
      collection
    ) as unknown as Model<any>;
  }

  modelCache.set(collection, model);
  return model;
}

function fromMongo<T extends BaseDoc>(raw: Record<string, unknown>): T {
  const { _id, ...rest } = raw;
  return { ...rest, id: (rest.id as string | undefined) ?? (String(_id) as string) } as T;
}

function valueAtPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function matchesFilter<T>(doc: T, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(
    ([path, expected]) => valueAtPath(doc, path) === expected
  );
}

export interface DocIndexSpec {
  keys: Record<string, 1 | -1>;
  options?: {
    unique?: boolean;
    name?: string;
    sparse?: boolean;
  };
}

/**
 * Collection gateway used by every repository.
 *
 * When MONGODB_URI is reachable the document is persisted in MongoDB (one
 * collection per domain entity, `_id` mirrors the domain string id). When the
 * URI is missing or the cluster is unreachable it transparently falls back to
 * the existing in-process store so the app (and the test-suite) still works.
 */
export class DocCollection<T extends BaseDoc> {
  constructor(
    private readonly collectionName: string,
    private readonly memory: () => Map<string, T>
  ) {}

  private async useMongo(): Promise<boolean> {
    return connectDatabase();
  }

  async all(): Promise<T[]> {
    if (!(await this.useMongo())) {
      return Array.from(this.memory().values());
    }
    const docs = await getModel(this.collectionName).find({}).lean();
    return docs.map((doc) => fromMongo<T>(doc as Record<string, unknown>));
  }

  async get(id: string): Promise<T | null> {
    if (!(await this.useMongo())) {
      return this.memory().get(id) ?? null;
    }
    const doc = await getModel(this.collectionName).findById(id).lean();
    return doc ? fromMongo<T>(doc as Record<string, unknown>) : null;
  }

  async findWhere(filter: Record<string, unknown>): Promise<T[]> {
    if (!(await this.useMongo())) {
      return Array.from(this.memory().values()).filter((doc) => matchesFilter(doc, filter));
    }
    const docs = await getModel(this.collectionName).find(filter).lean();
    return docs.map((doc) => fromMongo<T>(doc as Record<string, unknown>));
  }

  async findOneWhere(filter: Record<string, unknown>): Promise<T | null> {
    if (!(await this.useMongo())) {
      return Array.from(this.memory().values()).find((doc) => matchesFilter(doc, filter)) ?? null;
    }
    const doc = await getModel(this.collectionName).findOne(filter).lean();
    return doc ? fromMongo<T>(doc as Record<string, unknown>) : null;
  }

  async set(doc: T): Promise<T> {
    if (!(await this.useMongo())) {
      this.memory().set(doc.id, doc);
      return doc;
    }
    await getModel(this.collectionName).replaceOne(
      { _id: doc.id },
      { ...doc, _id: doc.id },
      { upsert: true }
    );
    return doc;
  }

  /** Insert without overwriting an existing document with the same id. */
  async insertIfAbsent(doc: T): Promise<boolean> {
    if (!(await this.useMongo())) {
      if (this.memory().has(doc.id)) return false;
      this.memory().set(doc.id, doc);
      return true;
    }
    const result = await getModel(this.collectionName).updateOne(
      { _id: doc.id },
      { $setOnInsert: { ...doc, _id: doc.id } },
      { upsert: true }
    );
    return (result.upsertedCount ?? 0) > 0;
  }

  async ensureIndexes(specs: DocIndexSpec[]): Promise<void> {
    if (!(await this.useMongo())) return;
    const model = getModel(this.collectionName);
    for (const spec of specs) {
      try {
        await model.collection.createIndex(spec.keys, spec.options ?? {});
      } catch (err) {
        console.warn(
          `[Database]: Could not create index on ${this.collectionName}:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  }

  async delete(id: string): Promise<boolean> {
    if (!(await this.useMongo())) {
      return this.memory().delete(id);
    }
    const result = await getModel(this.collectionName).deleteOne({ _id: id });
    return (result.deletedCount ?? 0) > 0;
  }

  async clear(): Promise<void> {
    if (!(await this.useMongo())) {
      this.memory().clear();
      return;
    }
    await getModel(this.collectionName).deleteMany({});
  }
}

export const collections = {
  schools: new DocCollection<SchoolDoc>('schools', () => dbStore.schools),
  teams: new DocCollection<TeamDoc>('teams', () => dbStore.teams),
  tournaments: new DocCollection<TournamentDoc>('tournaments', () => dbStore.tournaments),
  matches: new DocCollection<MatchDoc>('matches', () => dbStore.matches),
  fixtureSnapshots: new DocCollection<FixtureSnapshotDoc>(
    'fixtureSnapshots',
    () => dbStore.fixtureSnapshots
  ),
  pastTournaments: new DocCollection<PastTournamentDoc>(
    'pastTournaments',
    () => dbStore.pastTournaments
  ),
  enrollments: new DocCollection<EnrollmentDoc>('enrollments', () => dbStore.enrollments),
  auditLogs: new DocCollection<AuditLogDoc>('auditLogs', () => dbStore.auditLogs),
  users: new DocCollection<UserDoc>('users', () => dbStore.users),
  notifications: new DocCollection<NotificationDoc>('notifications', () => dbStore.notifications),
  acknowledgements: new DocCollection<AcknowledgementDoc>(
    'acknowledgements',
    () => dbStore.acknowledgements
  ),
  matchScores: new DocCollection<MatchScoreDoc>('matchScores', () => dbStore.matchScores),
  scoreEvents: new DocCollection<ScoreEventDoc>('scoreEvents', () => dbStore.scoreEvents),
};
