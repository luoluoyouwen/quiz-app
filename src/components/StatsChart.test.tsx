// No jsdom needed — pure data logic tests
import { describe, it, expect } from 'vitest';

interface SessionLike {
  id?: number;
  startedAt: Date;
  score: number;
}

function makeSession(overrides: Partial<{
  id: number; startedAt: Date; score: number;
}> = {}): SessionLike {
  return {
    id: overrides.id ?? 1,
    startedAt: overrides.startedAt ?? new Date('2026-06-21T10:00:00'),
    score: overrides.score ?? 80,
  };
}

// The data processing logic used by StatsChart (duplicated here for testing)
function processChartData(sessions: SessionLike[]) {
  const recent = [...sessions]
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 20)
    .reverse();
  return recent.map((s) => ({
    score: s.score,
    date: new Date(s.startedAt),
  }));
}

describe('StatsChart data processing', () => {
  it('returns empty array for no sessions', () => {
    expect(processChartData([])).toHaveLength(0);
  });

  it('returns one data point for one session', () => {
    expect(processChartData([makeSession()])).toHaveLength(1);
  });

  it('caps at 20 sessions when 25 provided', () => {
    const sessions = Array.from({ length: 25 }, (_, i) =>
      makeSession({ id: i + 1, startedAt: new Date(2026, 5, 20 - i), score: 50 + i })
    );
    const data = processChartData(sessions);
    expect(data).toHaveLength(20);
  });

  it('keeps most recent 20 sessions', () => {
    const sessions = Array.from({ length: 25 }, (_, i) =>
      makeSession({ id: i + 1, startedAt: new Date(2026, 5, i + 1), score: i })
    );
    const data = processChartData(sessions);
    expect(data).toHaveLength(20);
    // Should start with the oldest of the 20 most recent
    expect(data[0].score).toBe(5);  // day 6 → day 25; first is day 6 (score 5)
    expect(data[data.length - 1].score).toBe(24); // day 25 (score 24)
  });

  it('sorts chronologically (oldest first)', () => {
    const sessions = [
      makeSession({ id: 1, startedAt: new Date('2026-06-21'), score: 90 }),
      makeSession({ id: 2, startedAt: new Date('2026-06-20'), score: 70 }),
      makeSession({ id: 3, startedAt: new Date('2026-06-22'), score: 80 }),
    ];
    const data = processChartData(sessions);
    expect(data.map(d => d.score)).toEqual([70, 90, 80]);
  });
});
