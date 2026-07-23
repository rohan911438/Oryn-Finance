/**
 * State Snapshot Controller (Issue #227)
 *
 * REST API endpoints for managing protocol state snapshots:
 *   - Capture complete protocol state
 *   - List and retrieve snapshots
 *   - Verify snapshot integrity
 *   - Execute rollback to previous state
 *   - Manage automated scheduling
 */

const stateSnapshotService = require('../services/stateSnapshotService');
const logger = require('../config/logger');

class StateSnapshotController {
  /**
   * POST /api/snapshots
   * Capture a new protocol state snapshot.
   * Body: { description }
   */
  static async createSnapshot(req, res) {
    try {
      const { description } = req.body;
      const actor = {
        walletAddress: req.user?.walletAddress || 'system',
        isGovernanceAction: req.body.isGovernanceAction || false,
        proposalId: req.body.proposalId || null,
      };

      const snapshot = await stateSnapshotService.captureStateSnapshot({
        description: description || 'Manual protocol state snapshot',
        actor,
      });

      logger.info('Snapshot created via API', {
        snapshotId: snapshot.snapshotId,
        version: snapshot.version,
        createdBy: actor.walletAddress,
      });

      res.status(201).json({
        success: true,
        message: 'Protocol state snapshot captured successfully',
        data: {
          snapshotId: snapshot.snapshotId,
          version: snapshot.version,
          timestamp: snapshot.timestamp,
          contractCount: snapshot.contractCount,
          status: snapshot.status,
          stateHash: snapshot.stateHash,
        },
      });
    } catch (error) {
      logger.error('Failed to create snapshot', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/snapshots
   * List snapshots with optional filters.
   * Query: ?status=verified&minVersion=1&maxVersion=10&page=1&limit=50
   */
  static async listSnapshots(req, res) {
    try {
      const { status, minVersion, maxVersion, page, limit } = req.query;
      const result = await stateSnapshotService.listSnapshots({
        status,
        minVersion,
        maxVersion,
        page,
        limit,
      });

      res.json({
        success: true,
        data: result.snapshots,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          pages: Math.ceil(result.total / result.limit),
        },
      });
    } catch (error) {
      logger.error('Failed to list snapshots', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/snapshots/stats
   * Get snapshot statistics for dashboards.
   */
  static async getSnapshotStats(req, res) {
    try {
      const stats = await stateSnapshotService.getSnapshotStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      logger.error('Failed to get snapshot stats', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/snapshots/:snapshotId
   * Get a single snapshot by ID.
   */
  static async getSnapshot(req, res) {
    try {
      const { snapshotId } = req.params;
      const snapshot = await stateSnapshotService.getSnapshot(snapshotId);

      if (!snapshot) {
        return res.status(404).json({
          success: false,
          message: `Snapshot '${snapshotId}' not found`,
        });
      }

      res.json({ success: true, data: snapshot });
    } catch (error) {
      logger.error('Failed to get snapshot', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /api/snapshots/:snapshotId/verify
   * Verify the integrity of a snapshot by recomputing its state hash.
   */
  static async verifySnapshot(req, res) {
    try {
      const { snapshotId } = req.params;
      const result = await stateSnapshotService.verifySnapshotIntegrity(snapshotId);

      res.json({
        success: true,
        message: `Snapshot integrity ${result.isValid ? 'verified' : 'check FAILED'}`,
        data: result,
      });
    } catch (error) {
      logger.error('Failed to verify snapshot', error);
      const statusCode = error.message.includes('not found') ? 404 : 500;
      res.status(statusCode).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /api/snapshots/:snapshotId/rollback
   * Execute a protocol rollback to the specified snapshot.
   * Body: { reason }
   */
  static async executeRollback(req, res) {
    try {
      const { snapshotId } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          message: 'Rollback reason is required',
        });
      }

      const actor = {
        walletAddress: req.user?.walletAddress || 'system',
      };

      const result = await stateSnapshotService.executeRollback(snapshotId, {
        actor,
        reason,
      });

      logger.warn('Rollback executed via API', {
        snapshotId,
        initiatedBy: actor.walletAddress,
        reason,
      });

      res.json({
        success: true,
        message: 'Protocol rollback executed successfully',
        data: result,
      });
    } catch (error) {
      logger.error('Failed to execute rollback', error);
      const statusCode = error.message.includes('not found') ? 404 : 400;
      res.status(statusCode).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /api/snapshots/scheduling/start
   * Start automated snapshot scheduling.
   * Body: { intervalMinutes }
   */
  static async startScheduling(req, res) {
    try {
      const { intervalMinutes } = req.body;
      stateSnapshotService.startScheduledSnapshots(intervalMinutes || null);

      res.json({
        success: true,
        message: 'Automated snapshot scheduling started',
        data: {
          isScheduling: stateSnapshotService.isScheduling,
          intervalMinutes: intervalMinutes || parseInt(process.env.SNAPSHOT_INTERVAL_MINUTES || '360', 10),
        },
      });
    } catch (error) {
      logger.error('Failed to start snapshot scheduling', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /api/snapshots/scheduling/stop
   * Stop automated snapshot scheduling.
   */
  static async stopScheduling(req, res) {
    try {
      stateSnapshotService.stopScheduledSnapshots();

      res.json({
        success: true,
        message: 'Automated snapshot scheduling stopped',
        data: { isScheduling: false },
      });
    } catch (error) {
      logger.error('Failed to stop snapshot scheduling', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/snapshots/scheduling/status
   * Get current scheduling status.
   */
  static async getSchedulingStatus(req, res) {
    try {
      res.json({
        success: true,
        data: {
          isScheduling: stateSnapshotService.isScheduling,
          retentionDays: stateSnapshotService.defaultRetentionDays,
          maxSnapshots: stateSnapshotService.maxSnapshots,
        },
      });
    } catch (error) {
      logger.error('Failed to get scheduling status', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /api/snapshots/prune
   * Manually prune expired snapshots.
   */
  static async pruneExpired(req, res) {
    try {
      const result = await stateSnapshotService.pruneExpiredSnapshots();
      res.json({
        success: true,
        message: `Pruned ${result.deletedCount || 0} expired snapshots`,
        data: result,
      });
    } catch (error) {
      logger.error('Failed to prune expired snapshots', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = StateSnapshotController;
