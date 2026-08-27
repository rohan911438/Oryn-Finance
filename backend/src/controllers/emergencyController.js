const logger = require('../config/logger');
const emergencyControlService = require('../services/emergencyControlService');
const { EmergencyEvent, Market } = require('../models');

class EmergencyController {
  async declareEmergency(req, res) {
    try {
      const { severity, emergencyType, title, description, affectedComponents } = req.body;

      if (!severity || !emergencyType || !title || !description) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: severity, emergencyType, title, description'
        });
      }

      const emergency = await emergencyControlService.declareEmergency(
        {
          walletAddress: req.user.walletAddress,
          role: req.user.userData?.isAdmin ? 'admin' : 'user',
          ip: req.ip
        },
        { severity, emergencyType, title, description, affectedComponents }
      );

      res.status(201).json({
        success: true,
        data: emergency
      });
    } catch (error) {
      logger.error('Failed to declare emergency:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async executeAction(req, res) {
    try {
      const { emergencyId } = req.params;
      const { action, parameters } = req.body;

      if (!action) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: action'
        });
      }

      const { emergency, actionResult } = await emergencyControlService.executeEmergencyAction(
        emergencyId,
        { action, parameters: parameters || {} },
        {
          walletAddress: req.user.walletAddress,
          role: req.user.userData?.isAdmin ? 'admin' : 'user',
          ip: req.ip
        }
      );

      res.json({
        success: true,
        data: {
          emergency,
          actionResult
        }
      });
    } catch (error) {
      logger.error('Failed to execute emergency action:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async reverseAction(req, res) {
    try {
      const { emergencyId, actionId } = req.params;

      const { emergency, reverseResult } = await emergencyControlService.reverseAction(
        emergencyId,
        actionId,
        {
          walletAddress: req.user.walletAddress,
          role: req.user.userData?.isAdmin ? 'admin' : 'user',
          ip: req.ip
        }
      );

      res.json({
        success: true,
        data: {
          emergency,
          reverseResult
        }
      });
    } catch (error) {
      logger.error('Failed to reverse emergency action:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async resolveEmergency(req, res) {
    try {
      const { emergencyId } = req.params;
      const { resolutionNotes } = req.body;

      const emergency = await emergencyControlService.resolveEmergency(
        emergencyId,
        resolutionNotes || '',
        {
          walletAddress: req.user.walletAddress,
          role: req.user.userData?.isAdmin ? 'admin' : 'user',
          ip: req.ip
        }
      );

      res.json({
        success: true,
        data: emergency
      });
    } catch (error) {
      logger.error('Failed to resolve emergency:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async createRecoveryPlan(req, res) {
    try {
      const { emergencyId } = req.params;
      const { steps } = req.body;

      if (!steps || !Array.isArray(steps) || steps.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Missing or invalid recovery steps'
        });
      }

      const emergency = await emergencyControlService.createRecoveryPlan(
        emergencyId,
        steps,
        req.user.walletAddress
      );

      res.json({
        success: true,
        data: emergency
      });
    } catch (error) {
      logger.error('Failed to create recovery plan:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async completeRecoveryStep(req, res) {
    try {
      const { emergencyId, stepNumber } = req.params;

      const emergency = await emergencyControlService.completeRecoveryStep(
        emergencyId,
        parseInt(stepNumber),
        req.user.walletAddress
      );

      res.json({
        success: true,
        data: emergency
      });
    } catch (error) {
      logger.error('Failed to complete recovery step:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getEmergencyStatus(req, res) {
    try {
      const status = emergencyControlService.getEmergencyStatus();

      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      logger.error('Failed to get emergency status:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getActiveEmergencies(req, res) {
    try {
      const emergencies = await EmergencyEvent.getActiveEmergencies();

      res.json({
        success: true,
        data: emergencies
      });
    } catch (error) {
      logger.error('Failed to get active emergencies:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getEmergencyById(req, res) {
    try {
      const { emergencyId } = req.params;
      const emergency = await emergencyControlService.getEmergency(emergencyId);

      res.json({
        success: true,
        data: emergency
      });
    } catch (error) {
      logger.error('Failed to get emergency:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getEmergencyHistory(req, res) {
    try {
      const { limit = 50, offset = 0, status, severity } = req.query;

      const query = {};
      if (status) query.status = status;
      if (severity) query.severity = parseInt(severity);

      const emergencies = await EmergencyEvent.find(query)
        .sort({ createdAt: -1 })
        .skip(parseInt(offset))
        .limit(parseInt(limit));

      const total = await EmergencyEvent.countDocuments(query);

      res.json({
        success: true,
        data: {
          emergencies,
          total,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      logger.error('Failed to get emergency history:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getEmergencyStats(req, res) {
    try {
      const stats = await EmergencyEvent.getEmergencyStats();
      const total = await EmergencyEvent.countDocuments();
      const activeCount = await EmergencyEvent.countDocuments({
        status: { $in: ['declared', 'active', 'investigating', 'mitigating'] }
      });

      res.json({
        success: true,
        data: {
          stats,
          total,
          active: activeCount
        }
      });
    } catch (error) {
      logger.error('Failed to get emergency stats:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async quickPausePool(req, res) {
    try {
      const { poolId, reason } = req.body;

      if (!poolId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: poolId'
        });
      }

      const emergency = await emergencyControlService.declareEmergency(
        {
          walletAddress: req.user.walletAddress,
          role: 'admin',
          ip: req.ip
        },
        {
          severity: 3,
          emergencyType: 'abnormal_activity',
          title: `Quick pause pool ${poolId}`,
          description: reason || 'Quick pause initiated by admin',
          affectedComponents: [{ type: 'pool', id: poolId }]
        }
      );

      const { actionResult } = await emergencyControlService.executeEmergencyAction(
        emergency.emergencyId,
        { action: 'pause_pool', parameters: { poolId } },
        {
          walletAddress: req.user.walletAddress,
          role: 'admin',
          ip: req.ip
        }
      );

      res.json({
        success: true,
        data: {
          emergency,
          actionResult
        }
      });
    } catch (error) {
      logger.error('Failed to quick pause pool:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async quickPauseMarket(req, res) {
    try {
      const { marketId, reason } = req.body;

      if (!marketId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: marketId'
        });
      }

      const emergency = await emergencyControlService.declareEmergency(
        {
          walletAddress: req.user.walletAddress,
          role: 'admin',
          ip: req.ip
        },
        {
          severity: 3,
          emergencyType: 'abnormal_activity',
          title: `Quick pause market ${marketId}`,
          description: reason || 'Quick pause initiated by admin',
          affectedComponents: [{ type: 'market', id: marketId }]
        }
      );

      const { actionResult } = await emergencyControlService.executeEmergencyAction(
        emergency.emergencyId,
        { action: 'pause_market', parameters: { marketId } },
        {
          walletAddress: req.user.walletAddress,
          role: 'admin',
          ip: req.ip
        }
      );

      res.json({
        success: true,
        data: {
          emergency,
          actionResult
        }
      });
    } catch (error) {
      logger.error('Failed to quick pause market:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async quickFreezeAccount(req, res) {
    try {
      const { accountAddress, reason } = req.body;

      if (!accountAddress) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: accountAddress'
        });
      }

      const emergency = await emergencyControlService.declareEmergency(
        {
          walletAddress: req.user.walletAddress,
          role: 'admin',
          ip: req.ip
        },
        {
          severity: 4,
          emergencyType: 'unauthorized_access',
          title: `Quick freeze account ${accountAddress.substring(0, 10)}...`,
          description: reason || 'Account freeze initiated by admin',
          affectedComponents: [{ type: 'account', id: accountAddress }]
        }
      );

      const { actionResult } = await emergencyControlService.executeEmergencyAction(
        emergency.emergencyId,
        { action: 'freeze_account', parameters: { accountAddress, reason } },
        {
          walletAddress: req.user.walletAddress,
          role: 'admin',
          ip: req.ip
        }
      );

      res.json({
        success: true,
        data: {
          emergency,
          actionResult
        }
      });
    } catch (error) {
      logger.error('Failed to quick freeze account:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async pausePlatform(req, res) {
    try {
      const { reason } = req.body;

      const emergency = await emergencyControlService.declareEmergency(
        {
          walletAddress: req.user.walletAddress,
          role: 'admin',
          ip: req.ip
        },
        {
          severity: 5,
          emergencyType: 'protocol_bug',
          title: 'Platform emergency pause',
          description: reason || 'Platform-wide emergency pause initiated by admin',
          affectedComponents: [{ type: 'platform', id: 'all' }]
        }
      );

      const { actionResult } = await emergencyControlService.executeEmergencyAction(
        emergency.emergencyId,
        { action: 'pause_platform', parameters: {} },
        {
          walletAddress: req.user.walletAddress,
          role: 'admin',
          ip: req.ip
        }
      );

      res.json({
        success: true,
        data: {
          emergency,
          actionResult
        }
      });
    } catch (error) {
      logger.error('Failed to pause platform:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async unpausePlatform(req, res) {
    try {
      const activeEmergencies = await EmergencyEvent.getActiveEmergencies();
      const emergency = activeEmergencies[0];

      if (!emergency) {
        return res.status(400).json({
          success: false,
          error: 'No active emergency found'
        });
      }

      const { actionResult } = await emergencyControlService.executeEmergencyAction(
        emergency.emergencyId,
        { action: 'unpause_platform', parameters: {} },
        {
          walletAddress: req.user.walletAddress,
          role: 'admin',
          ip: req.ip
        }
      );

      res.json({
        success: true,
        data: {
          emergency,
          actionResult
        }
      });
    } catch (error) {
      logger.error('Failed to unpause platform:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new EmergencyController();
