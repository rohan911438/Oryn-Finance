jest.useFakeTimers();

jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

jest.mock('../../src/services/sorobanService', () => ({
  submitSignedTransaction: jest.fn()
}));

const sorobanService = require('../../src/services/sorobanService');
const retryQueue = require('../../src/services/transactionRetryQueue');

describe('TransactionRetryQueue', () => {
  let setTimeoutSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    retryQueue.recentFailures = [];
    retryQueue.recentSuccesses = [];
    setTimeoutSpy = jest.spyOn(global, 'setTimeout');
  });

  afterEach(() => {
    setTimeoutSpy.mockRestore();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('enqueues jobs for background retry and records recoveries', async () => {
    sorobanService.submitSignedTransaction.mockResolvedValue({ hash: 'hash-1' });

    const result = retryQueue.enqueue({ signedXDR: 'XDR', txHash: null });
    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(result).toEqual(expect.objectContaining({ queued: true, jobId: expect.any(String) }));
    expect(retryQueue.getRecoverySnapshot().recentRecoveries).toEqual([
      expect.objectContaining({ jobId: result.jobId, txHash: 'hash-1' })
    ]);
  });

  it('retries failed submissions with exponential backoff before recording failure', async () => {
    sorobanService.submitSignedTransaction.mockRejectedValue(new Error('rpc unavailable'));

    await retryQueue.processJob({
      jobId: 'job-1',
      signedXDR: 'XDR',
      txHash: 'hash-1',
      attempt: 0
    });

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);

    jest.runOnlyPendingTimers();
    await Promise.resolve();
    jest.runOnlyPendingTimers();
    await Promise.resolve();
    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(retryQueue.getRecoverySnapshot().recentFailures[0]).toEqual(
      expect.objectContaining({
        jobId: 'job-1',
        txHash: 'hash-1',
        attempts: 4,
        message: 'rpc unavailable'
      })
    );
  });

  it('returns a stable recovery snapshot', () => {
    const snapshot = retryQueue.getRecoverySnapshot();

    expect(snapshot).toEqual({
      queueEnabled: true,
      maxAttempts: 4,
      backoffMs: 2000,
      recentFailures: [],
      recentRecoveries: []
    });
  });
});
