/**
 * State Snapshot & Rollback Routes (Issue #227)
 *
 * REST API endpoints for protocol state snapshot management:
 *   - POST   /api/snapshots                    - Capture a new snapshot
 *   - GET    /api/snapshots                    - List snapshots (with filters)
 *   - GET    /api/snapshots/stats              - Get snapshot statistics
 *   - GET    /api/snapshots/scheduling/status  - Get scheduling status
 *   - POST   /api/snapshots/scheduling/start   - Start automated scheduling
 *   - POST   /api/snapshots/scheduling/stop    - Stop automated scheduling
 *   - POST   /api/snapshots/prune              - Prune expired snapshots
 *   - GET    /api/snapshots/:snapshotId        - Get snapshot by ID
 *   - POST   /api/snapshots/:snapshotId/verify - Verify snapshot integrity
 *   - POST   /api/snapshots/:snapshotId/rollback - Execute rollback
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAdmin } = require('../middleware/auth');
const stateSnapshotController = require('../controllers/stateSnapshotController');

// GET /api/snapshots/stats - Snapshot statistics (must be before /:snapshotId)
router.get('/stats', asyncHandler(stateSnapshotController.getSnapshotStats));

// GET /api/snapshots/scheduling/status - Scheduling status (must be before /:snapshotId)
router.get('/scheduling/status', asyncHandler(stateSnapshotController.getSchedulingStatus));

// POST /api/snapshots/scheduling/start - Start automated scheduling (admin only)
router.post('/scheduling/start', requireAdmin, asyncHandler(stateSnapshotController.startScheduling));

// POST /api/snapshots/scheduling/stop - Stop automated scheduling (admin only)
router.post('/scheduling/stop', requireAdmin, asyncHandler(stateSnapshotController.stopScheduling));

// POST /api/snapshots/prune - Prune expired snapshots (admin only)
router.post('/prune', requireAdmin, asyncHandler(stateSnapshotController.pruneExpired));

// POST /api/snapshots - Capture a new snapshot (admin only)
router.post('/', requireAdmin, asyncHandler(stateSnapshotController.createSnapshot));

// GET /api/snapshots - List snapshots
router.get('/', asyncHandler(stateSnapshotController.listSnapshots));

// GET /api/snapshots/:snapshotId - Get snapshot by ID
router.get('/:snapshotId', asyncHandler(stateSnapshotController.getSnapshot));

// POST /api/snapshots/:snapshotId/verify - Verify snapshot integrity (admin only)
router.post('/:snapshotId/verify', requireAdmin, asyncHandler(stateSnapshotController.verifySnapshot));

// POST /api/snapshots/:snapshotId/rollback - Execute rollback (admin only)
router.post('/:snapshotId/rollback', requireAdmin, asyncHandler(stateSnapshotController.executeRollback));

module.exports = router;
