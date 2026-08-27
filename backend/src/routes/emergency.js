const express = require('express');
const router = express.Router();
const { auth, admin } = require('../middleware/auth');
const emergencyController = require('../controllers/emergencyController');

router.get('/status', auth, async (req, res) => {
  await emergencyController.getEmergencyStatus(req, res);
});

router.get('/active', auth, async (req, res) => {
  await emergencyController.getActiveEmergencies(req, res);
});

router.get('/stats', auth, async (req, res) => {
  await emergencyController.getEmergencyStats(req, res);
});

router.get('/history', auth, admin, async (req, res) => {
  await emergencyController.getEmergencyHistory(req, res);
});

router.get('/:emergencyId', auth, async (req, res) => {
  await emergencyController.getEmergencyById(req, res);
});

router.post('/declare', auth, admin, async (req, res) => {
  await emergencyController.declareEmergency(req, res);
});

router.post('/:emergencyId/actions', auth, admin, async (req, res) => {
  await emergencyController.executeAction(req, res);
});

router.post('/:emergencyId/actions/:actionId/reverse', auth, admin, async (req, res) => {
  await emergencyController.reverseAction(req, res);
});

router.post('/:emergencyId/resolve', auth, admin, async (req, res) => {
  await emergencyController.resolveEmergency(req, res);
});

router.post('/:emergencyId/recovery-plan', auth, admin, async (req, res) => {
  await emergencyController.createRecoveryPlan(req, res);
});

router.post('/:emergencyId/recovery-steps/:stepNumber/complete', auth, admin, async (req, res) => {
  await emergencyController.completeRecoveryStep(req, res);
});

router.post('/quick/pause-pool', auth, admin, async (req, res) => {
  await emergencyController.quickPausePool(req, res);
});

router.post('/quick/pause-market', auth, admin, async (req, res) => {
  await emergencyController.quickPauseMarket(req, res);
});

router.post('/quick/freeze-account', auth, admin, async (req, res) => {
  await emergencyController.quickFreezeAccount(req, res);
});

router.post('/quick/pause-platform', auth, admin, async (req, res) => {
  await emergencyController.pausePlatform(req, res);
});

router.post('/quick/unpause-platform', auth, admin, async (req, res) => {
  await emergencyController.unpausePlatform(req, res);
});

module.exports = router;
