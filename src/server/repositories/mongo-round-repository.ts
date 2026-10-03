import { ObjectId, type Collection, type Db, type Filter, type Sort } from 'mongodb';
import type { Dimension } from '../../shared/contracts';
import type { NewRoundRecord, RoundRecord } from '../domain/round';
import {
  rankingSortsAscending,
  type HistoryFilter,
  type RankingFilter,
  type RoundRepository,
} from './round-repository';

/** Stored shape; `linesCleared` is optional because older rounds predate row clears. */
type RoundDocument = Omit<NewRoundRecord, 'linesCleared' | 'dimension'> & {
  _id: ObjectId;
  linesCleared?: number;
  dimension?: Dimension;
};

export class MongoRoundRepository implements RoundRepository {
  private readonly rounds: Collection<RoundDocument>;

  constructor(db: Db) {
    this.rounds = db.collection<RoundDocument>('rounds');
  }

  /** Each index matches one query shape below, so rankings and history never full-scan. */
  async ensureIndexes(): Promise<void> {
    await this.rounds.createIndexes([
      // v2 names: the key spec gained `dimension`, and Mongo refuses to redefine an existing name.
      {
        key: { mode: 1, difficulty: 1, dimension: 1, flagged: 1, score: -1, _id: -1 },
        name: 'ranking_score_v2',
      },
      {
        key: { mode: 1, difficulty: 1, dimension: 1, flagged: 1, completed: 1, durationMs: 1, _id: 1 },
        name: 'ranking_time_v2',
      },
      { key: { playerNameLower: 1, _id: -1 }, name: 'player_history' },
    ]);
  }

  async insert(round: NewRoundRecord): Promise<RoundRecord> {
    const _id = new ObjectId();
    await this.rounds.insertOne({ ...round, _id });
    return { ...round, id: _id.toHexString() };
  }

  async findRanking(filter: RankingFilter): Promise<RoundRecord[]> {
    const ascending = rankingSortsAscending(filter.mode);
    const field = ascending ? 'durationMs' : 'score';
    const query: Filter<RoundDocument> = {
      mode: filter.mode,
      difficulty: filter.difficulty,
      // Rounds stored before the 2D mode have no `dimension` and belong to the 3D board.
      dimension: filter.dimension === '2d' ? '2d' : { $ne: '2d' },
      flagged: false,
    };
    if (ascending) query.completed = true;
    if (filter.since) query.playedAt = { $gte: filter.since };
    if (filter.after) {
      const id = new ObjectId(filter.after.id);
      const op = ascending ? '$gt' : '$lt';
      query.$or = [
        { [field]: { [op]: filter.after.value } },
        { [field]: filter.after.value, _id: { [op]: id } },
      ];
    }
    const direction = ascending ? 1 : -1;
    const sort: Sort = { [field]: direction, _id: direction };
    const docs = await this.rounds.find(query).sort(sort).limit(filter.limit).toArray();
    return docs.map(toRecord);
  }

  async findHistory(filter: HistoryFilter): Promise<RoundRecord[]> {
    const query: Filter<RoundDocument> = { playerNameLower: filter.playerNameLower };
    if (filter.beforeId) query._id = { $lt: new ObjectId(filter.beforeId) };
    const docs = await this.rounds.find(query).sort({ _id: -1 }).limit(filter.limit).toArray();
    return docs.map(toRecord);
  }

  async findPersonalBest(playerNameLower: string): Promise<RoundRecord | null> {
    const doc = await this.rounds.findOne(
      { playerNameLower, flagged: false },
      { sort: { score: -1, _id: -1 } },
    );
    return doc ? toRecord(doc) : null;
  }
}

function toRecord({ _id, linesCleared, dimension, ...rest }: RoundDocument): RoundRecord {
  return { ...rest, linesCleared: linesCleared ?? 0, dimension: dimension ?? '3d', id: _id.toHexString() };
}
