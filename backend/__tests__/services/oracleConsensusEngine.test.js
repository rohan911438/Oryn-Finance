const fc = require('fast-check');
const consensusEngine = require('../../src/services/oracle/ConsensusEngine');

const NOW = Date.parse('2026-07-19T12:00:00.000Z');

describe('OracleConsensusEngine', () => {
  it('reaches weighted consensus when the winning outcome clears the threshold', () => {
    const decision = consensusEngine.evaluate(
      [
        { source: 'a', outcome: 'yes', confidence: 1, timestamp: NOW },
        { source: 'b', outcome: 'yes', confidence: 1, timestamp: NOW },
        { source: 'c', outcome: 'no', confidence: 1, timestamp: NOW }
      ],
      {
        weightResolver: (source) => ({ a: 0.4, b: 0.4, c: 0.2 }[source]),
        consensusThreshold: 0.6,
        now: NOW
      }
    );

    expect(decision.consensusReached).toBe(true);
    expect(decision.finalOutcome).toBe('yes');
    expect(decision.agreementRatio).toBeCloseTo(0.8, 5);
    expect(decision.weightByOutcome).toEqual({ yes: 0.8, no: 0.2 });
  });

  it('does not reach consensus when agreement falls short of the threshold', () => {
    const decision = consensusEngine.evaluate(
      [
        { source: 'a', outcome: 'yes', confidence: 1, timestamp: NOW },
        { source: 'b', outcome: 'no', confidence: 1, timestamp: NOW }
      ],
      {
        weightResolver: () => 0.5,
        consensusThreshold: 0.6,
        now: NOW
      }
    );

    expect(decision.consensusReached).toBe(false);
    expect(decision.finalOutcome).toBeNull();
    expect(decision.agreementRatio).toBeCloseTo(0.5, 5);
  });

  it('honors a configurable consensus threshold', () => {
    const responses = [
      { source: 'a', outcome: 'yes', confidence: 1, timestamp: NOW },
      { source: 'b', outcome: 'no', confidence: 1, timestamp: NOW }
    ];
    const options = { weightResolver: () => 0.5, now: NOW };

    expect(consensusEngine.evaluate(responses, { ...options, consensusThreshold: 0.6 }).consensusReached).toBe(false);
    expect(consensusEngine.evaluate(responses, { ...options, consensusThreshold: 0.5 }).consensusReached).toBe(true);
  });

  it('rejects responses older than maxAgeMs as stale', () => {
    const fiveMinutesMs = 5 * 60 * 1000;
    const decision = consensusEngine.evaluate(
      [
        { source: 'fresh', outcome: 'yes', confidence: 1, timestamp: NOW - 1000 },
        { source: 'stale', outcome: 'no', confidence: 1, timestamp: NOW - (fiveMinutesMs + 1000) }
      ],
      { weightResolver: () => 0.5, maxAgeMs: fiveMinutesMs, now: NOW }
    );

    expect(decision.rejected.stale).toHaveLength(1);
    expect(decision.rejected.stale[0].source).toBe('stale');
    expect(decision.participants).toHaveLength(1);
    expect(decision.participants[0].source).toBe('fresh');
    expect(decision.finalOutcome).toBe('yes');
  });

  it('rejects statistical outliers among numeric measurements via robust MAD z-score', () => {
    const decision = consensusEngine.evaluate(
      [
        { source: 'p1', outcome: 'yes', value: 100, timestamp: NOW },
        { source: 'p2', outcome: 'yes', value: 101, timestamp: NOW },
        { source: 'p3', outcome: 'yes', value: 99, timestamp: NOW },
        { source: 'p4', outcome: 'no', value: 5000, timestamp: NOW }
      ],
      { weightResolver: () => 0.5, now: NOW }
    );

    expect(decision.rejected.outliers.map((o) => o.source)).toEqual(['p4']);
    expect(decision.participants.map((p) => p.source)).toEqual(['p1', 'p2', 'p3']);
    expect(decision.finalOutcome).toBe('yes');
  });

  it('does not flag outliers when fewer than 3 numeric samples are present', () => {
    const decision = consensusEngine.evaluate(
      [
        { source: 'p1', outcome: 'yes', value: 100, timestamp: NOW },
        { source: 'p2', outcome: 'no', value: 5000, timestamp: NOW }
      ],
      { weightResolver: () => 0.5, now: NOW }
    );

    expect(decision.rejected.outliers).toHaveLength(0);
    expect(decision.participants).toHaveLength(2);
  });

  it('rejects invalid responses missing a source or a recognized outcome', () => {
    const decision = consensusEngine.evaluate(
      [
        { source: 'a', outcome: 'yes', timestamp: NOW },
        { outcome: 'no', timestamp: NOW },
        { source: 'c', outcome: 'maybe', timestamp: NOW }
      ],
      { weightResolver: () => 0.5, now: NOW }
    );

    expect(decision.rejected.invalid).toHaveLength(2);
    expect(decision.participants).toHaveLength(1);
  });

  it('enforces a configurable minimum response count before declaring consensus', () => {
    const decision = consensusEngine.evaluate(
      [{ source: 'a', outcome: 'yes', timestamp: NOW }],
      { weightResolver: () => 0.5, consensusThreshold: 0.5, minResponses: 2, now: NOW }
    );

    expect(decision.consensusReached).toBe(false);
    expect(decision.finalOutcome).toBeNull();
  });

  it('assigns provider weights via the weightResolver and applies per-response confidence', () => {
    const decision = consensusEngine.evaluate(
      [{ source: 'a', outcome: 'yes', confidence: 0.5, timestamp: NOW }],
      { weightResolver: (source) => (source === 'a' ? 0.8 : 0.1), consensusThreshold: 0.1, now: NOW }
    );

    expect(decision.participants[0].weight).toBeCloseTo(0.4, 5);
  });

  it('property: unanimous agreement always reaches consensus with agreementRatio 1', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            source: fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
            weight: fc.double({ min: 0.01, max: 1, noNaN: true })
          }),
          { minLength: 1, maxLength: 8 }
        ),
        (entries) => {
          // dedupe sources so each participant is counted once
          const seen = new Set();
          const unique = entries.filter((e) => (seen.has(e.source) ? false : (seen.add(e.source), true)));

          const responses = unique.map((e) => ({ source: e.source, outcome: 'yes', confidence: 1, timestamp: NOW }));
          const decision = consensusEngine.evaluate(responses, {
            weightResolver: (source) => unique.find((e) => e.source === source).weight,
            consensusThreshold: 0.99,
            now: NOW
          });

          expect(decision.consensusReached).toBe(true);
          expect(decision.finalOutcome).toBe('yes');
          expect(decision.agreementRatio).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});
