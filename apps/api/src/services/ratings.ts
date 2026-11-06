import type { Db } from './db';

export async function ratingStats(db: Db, userIds: string[]): Promise<Map<string, { avg: number | null; count: number }>> {
  const map = new Map<string, { avg: number | null; count: number }>();
  if (userIds.length === 0) return map;
  const rows = await db.rating.groupBy({
    by: ['toUserId'],
    where: { toUserId: { in: userIds } },
    _avg: { score: true },
    _count: { _all: true },
  });
  for (const r of rows) {
    map.set(r.toUserId, {
      avg: r._avg.score !== null ? Math.round(r._avg.score * 10) / 10 : null,
      count: r._count._all,
    });
  }
  return map;
}
