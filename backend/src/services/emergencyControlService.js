const logger = require('../config/logger');
const sorobanService = require('./sorobanService');
const contractConfig = require('../config/contracts');
const websocketHandler = require('./websocketHandler');
const auditService = require('./auditService');
const circuitBreakerService = require('./circuitBreakerService');
const {
  EmergencyEvent,
  Market,
  AuditLog,
  User
} = require('../models');
const {
  EMERGENCY_SEVERITY_LEVELS,
  EMERGENCY_SEVERITY_LABELS,
  EMERGENCY_TYPES,
  EMERGENCY_ACTIONS,
  EMERGENCY_STATUSES
} = require('../models/EmergencyEvent');

class EmergencyControlService {
  constructor() {
    this.platformPaused = false;
    this.pausedPools = new Map();
    this.pausedMarkets = new Map();
    this.frozenAccounts = new Set();
    this.oraclePaused = false;
    this.tradingPaused = false;
    this.activeEmergencies = new Map();
    this.recoveryTimers = new Map();
  }

  async initialize() {
    try {
      const activeEmergencies = await EmergencyEvent.getActiveEmergencies();
      for (const emergency of activeEmergencies) {
        this.activeEmergencies.set(emergency.emergencyId, emergency);
      }
      logger.info(`Emergency control service initialized with ${activeEmergencies.length} active emergencies`);
    } catch (error) {
      logger.error('Failed to initialize emergency control service:', error);
    }
  }

  async declareEmergency(declaredBy, emergencyData) {
    const { severity, emergencyType, title, description, affectedComponents } = emergencyData;

    this.validateSeverity(severity);
    this.validateEmergencyType(emergencyType);

    const emergency = new EmergencyEvent({
      severity,
      severityLabel: EMERGENCY_SEVERITY_LABELS[severity],
      emergencyType,
      title,
      description,
      declaredBy: {
        walletAddress: declaredBy.walletAddress,
        role: declaredBy.role || 'admin'
      },
      affectedComponents: affectedComponents || [],
      status: 'declared',
      timeline: [{
        timestamp: new Date(),
        event: 'emergency_declared',
        actor: declaredBy.walletAddress,
        details: { severity, emergencyType, title }
      }]
    });

    await emergency.save();
    this.activeEmergencies.set(emergency.emergencyId, emergency);

    await auditService.record({
      category: 'emergency',
      action: 'emergency.declared',
      status: 'success',
      actor: {
        walletAddress: declaredBy.walletAddress,
        isAdmin: true,
        ip: declaredBy.ip
      },
      target: { type: 'emergency', id: emergency.emergencyId },
      description: `Emergency declared: ${title}`,
      metadata: { severity, emergencyType, emergencyId: emergency.emergencyId }
    });

    this.broadcastEmergencyAlert(emergency);
    logger.warn(`Emergency declared: ${emergency.emergencyId} (severity ${severity})`, { title, emergencyType });

    return emergency;
  }

  async executeEmergencyAction(emergencyId, actionData, actor) {
    const emergency = await this.getEmergency(emergencyId);
    this.validateEmergencyActive(emergency);

    const { action, parameters } = actionData;
    this.validateEmergencyAction(action);

    const hasPermission = this.checkEmergencyPermission(actor, action, emergency.severity);
    if (!hasPermission) {
      throw new Error(`Insufficient permissions for action ${action} at severity level ${emergency.severity}`);
    }

    let result = { success: false };

    try {
      result = await this.performAction(action, parameters, emergency);
    } catch (error) {
      result = { success: false, error: error.message };
      logger.error(`Emergency action failed: ${action}`, error);
    }

    await emergency.addAction({
      action,
      executedAt: new Date(),
      executedBy: {
        walletAddress: actor.walletAddress,
        role: actor.role || 'admin'
      },
      parameters,
      result,
      reversible: this.isActionReversible(action)
    });

    await emergency.updateStatus('active', actor.walletAddress, `Action ${action} executed`);

    await auditService.record({
      category: 'emergency',
      action: `emergency.${action}`,
      status: result.success ? 'success' : 'failure',
      actor: {
        walletAddress: actor.walletAddress,
        isAdmin: true,
        ip: actor.ip
      },
      target: { type: 'emergency', id: emergencyId },
      description: `Emergency action ${action} executed`,
      metadata: { emergencyId, action, parameters, result }
    });

    if (result.success) {
      this.broadcastEmergencyAction(emergency, action, result);
    }

    return { emergency, actionResult: result };
  }

  async performAction(action, parameters, emergency) {
    switch (action) {
      case 'pause_pool':
        return await this.pausePool(parameters.poolId, emergency);
      case 'unpause_pool':
        return await this.unpausePool(parameters.poolId, emergency);
      case 'pause_market':
        return await this.pauseMarket(parameters.marketId, emergency);
      case 'unpause_market':
        return await this.unpauseMarket(parameters.marketId, emergency);
      case 'pause_platform':
        return await this.pausePlatform(emergency);
      case 'unpause_platform':
        return await this.unpausePlatform(emergency);
      case 'circuit_breaker_trigger':
        return await this.triggerCircuitBreaker(parameters.poolId, parameters.reason);
      case 'circuit_breaker_reset':
        return await this.resetCircuitBreaker(parameters.poolId);
      case 'emergency_withdraw':
        return await this.emergencyWithdraw(parameters);
      case 'freeze_account':
        return await this.freezeAccount(parameters.accountAddress, parameters.reason);
      case 'unfreeze_account':
        return await this.unfreezeAccount(parameters.accountAddress);
      case 'pause_trading':
        return await this.pauseTrading(emergency);
      case 'unpause_trading':
        return await this.unpauseTrading();
      case 'pause_oracle':
        return await this.pauseOracle(parameters.oracleId, emergency);
      case 'unpause_oracle':
        return await this.unpauseOracle(parameters.oracleId);
      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  }

  async pausePool(poolId, emergency) {
    this.pausedPools.set(poolId, {
      emergencyId: emergency.emergencyId,
      pausedAt: new Date(),
      reason: emergency.title
    });

    try {
      await sorobanService.queryContract('AMM_POOL', 'activate_emergency_pause', []);
    } catch (error) {
      logger.warn('Failed to pause pool on-chain (may not be deployed):', error.message);
    }

    logger.warn(`Pool ${poolId} paused`, { emergencyId: emergency.emergencyId });
    return { success: true, poolId, paused: true };
  }

  async unpausePool(poolId) {
    this.pausedPools.delete(poolId);

    try {
      await sorobanService.queryContract('AMM_POOL', 'deactivate_emergency_pause', []);
    } catch (error) {
      logger.warn('Failed to unpause pool on-chain:', error.message);
    }

    logger.info(`Pool ${poolId} unpaused`);
    return { success: true, poolId, unpaused: true };
  }

  async pauseMarket(marketId, emergency) {
    this.pausedMarkets.set(marketId, {
      emergencyId: emergency.emergencyId,
      pausedAt: new Date(),
      reason: emergency.title
    });

    await Market.findOneAndUpdate(
      { marketId },
      {
        status: 'paused',
        pausedBy: 'emergency',
        pausedAt: new Date(),
        pauseReason: emergency.title,
        emergencyId: emergency.emergencyId
      }
    );

    logger.warn(`Market ${marketId} paused`, { emergencyId: emergency.emergencyId });
    return { success: true, marketId, paused: true };
  }

  async unpauseMarket(marketId) {
    this.pausedMarkets.delete(marketId);

    await Market.findOneAndUpdate(
      { marketId },
      {
        status: 'active',
        pausedBy: null,
        pausedAt: null,
        pauseReason: null,
        emergencyId: null
      }
    );

    logger.info(`Market ${marketId} unpaused`);
    return { success: true, marketId, unpaused: true };
  }

  async pausePlatform(emergency) {
    this.platformPaused = true;

    const markets = await Market.find({ status: 'active' });
    for (const market of markets) {
      this.pausedMarkets.set(market.marketId, {
        emergencyId: emergency.emergencyId,
        pausedAt: new Date(),
        reason: emergency.title
      });
    }

    try {
      await sorobanService.queryContract('MARKET_FACTORY', 'pause_contract', []);
    } catch (error) {
      logger.warn('Failed to pause market factory on-chain:', error.message);
    }

    this.broadcastPlatformPause(emergency);
    logger.warn(`Platform paused`, { emergencyId: emergency.emergencyId });
    return { success: true, platformPaused: true, marketsAffected: markets.length };
  }

  async unpausePlatform() {
    this.platformPaused = false;

    const pausedMarketIds = Array.from(this.pausedMarkets.keys());
    for (const marketId of pausedMarketIds) {
      this.pausedMarkets.delete(marketId);
    }

    try {
      await sorobanService.queryContract('MARKET_FACTORY', 'unpause_contract', []);
    } catch (error) {
      logger.warn('Failed to unpause market factory on-chain:', error.message);
    }

    this.broadcastPlatformUnpause();
    logger.info(`Platform unpaused, ${pausedMarketIds.length} markets restored`);
    return { success: true, platformUnpaused: true, marketsRestored: pausedMarketIds.length };
  }

  async triggerCircuitBreaker(poolId, reason) {
    await circuitBreakerService.triggerEmergencyPause(poolId, reason || 'Emergency control trigger');
    logger.warn(`Circuit breaker triggered for pool ${poolId}`);
    return { success: true, poolId, circuitBreakerTriggered: true };
  }

  async resetCircuitBreaker(poolId) {
    await circuitBreakerService.resetCircuitBreaker(poolId);
    logger.info(`Circuit breaker reset for pool ${poolId}`);
    return { success: true, poolId, circuitBreakerReset: true };
  }

  async emergencyWithdraw(parameters) {
    const { destinationAddress, amount, reason } = parameters;

    logger.warn(`Emergency withdraw initiated: ${amount} to ${destinationAddress}`, { reason });

    return {
      success: true,
      initiated: true,
      destinationAddress,
      amount,
      requiresMultisig: true,
      message: 'Emergency withdrawal requires multisig approval'
    };
  }

  async freezeAccount(accountAddress, reason) {
    this.frozenAccounts.add(accountAddress.toLowerCase());

    await User.findOneAndUpdate(
      { walletAddress: accountAddress.toLowerCase() },
      {
        frozen: true,
        frozenAt: new Date(),
        freezeReason: reason
      },
      { upsert: true }
    );

    logger.warn(`Account ${accountAddress} frozen`, { reason });
    return { success: true, accountAddress, frozen: true };
  }

  async unfreezeAccount(accountAddress) {
    this.frozenAccounts.delete(accountAddress.toLowerCase());

    await User.findOneAndUpdate(
      { walletAddress: accountAddress.toLowerCase() },
      {
        frozen: false,
        frozenAt: null,
        freezeReason: null
      }
    );

    logger.info(`Account ${accountAddress} unfrozen`);
    return { success: true, accountAddress, unfrozen: true };
  }

  async pauseTrading(emergency) {
    this.tradingPaused = true;

    try {
      await sorobanService.queryContract('AMM_POOL', 'activate_emergency_pause', []);
    } catch (error) {
      logger.warn('Failed to pause AMM on-chain:', error.message);
    }

    logger.warn(`Trading paused`, { emergencyId: emergency.emergencyId });
    return { success: true, tradingPaused: true };
  }

  async unpauseTrading() {
    this.tradingPaused = false;

    try {
      await sorobanService.queryContract('AMM_POOL', 'deactivate_emergency_pause', []);
    } catch (error) {
      logger.warn('Failed to unpause AMM on-chain:', error.message);
    }

    logger.info(`Trading unpaused`);
    return { success: true, tradingUnpaused: true };
  }

  async pauseOracle(oracleId, emergency) {
    this.oraclePaused = true;

    logger.warn(`Oracle ${oracleId} paused`, { emergencyId: emergency.emergencyId });
    return { success: true, oracleId, oraclePaused: true };
  }

  async unpauseOracle(oracleId) {
    this.oraclePaused = false;

    logger.info(`Oracle ${oracleId} unpaused`);
    return { success: true, oracleId, oracleUnpaused: true };
  }

  async reverseAction(emergencyId, actionId, actor) {
    const emergency = await this.getEmergency(emergencyId);
    const action = emergency.actions.find(a => a.actionId === actionId);

    if (!action) {
      throw new Error(`Action ${actionId} not found in emergency ${emergencyId}`);
    }

    if (!action.reversible) {
      throw new Error(`Action ${actionId} is not reversible`);
    }

    if (action.reversedAt) {
      throw new Error(`Action ${actionId} has already been reversed`);
    }

    const reverseActionName = this.getReverseAction(action.action);
    if (!reverseActionName) {
      throw new Error(`No reverse action available for ${action.action}`);
    }

    const result = await this.performAction(reverseActionName, action.parameters, emergency);

    action.reversedAt = new Date();
    action.reversedBy = {
      walletAddress: actor.walletAddress,
      role: actor.role || 'admin'
    };

    await emergency.addAction({
      action: reverseActionName,
      executedAt: new Date(),
      executedBy: {
        walletAddress: actor.walletAddress,
        role: actor.role || 'admin'
      },
      parameters: action.parameters,
      result,
      reversible: false
    });

    await emergency.save();

    await auditService.record({
      category: 'emergency',
      action: `emergency.${reverseActionName}`,
      status: result.success ? 'success' : 'failure',
      actor: {
        walletAddress: actor.walletAddress,
        isAdmin: true,
        ip: actor.ip
      },
      target: { type: 'emergency', id: emergencyId },
      description: `Emergency action ${action.action} reversed via ${reverseActionName}`,
      metadata: { emergencyId, originalActionId: actionId, reverseAction: reverseActionName }
    });

    return { emergency, reverseResult: result };
  }

  async resolveEmergency(emergencyId, resolutionNotes, actor) {
    const emergency = await this.getEmergency(emergencyId);

    await emergency.updateStatus('resolved', actor.walletAddress, resolutionNotes);

    this.activeEmergencies.delete(emergencyId);

    await this.autoResumeAfterResolution(emergency);

    await auditService.record({
      category: 'emergency',
      action: 'emergency.resolved',
      status: 'success',
      actor: {
        walletAddress: actor.walletAddress,
        isAdmin: true,
        ip: actor.ip
      },
      target: { type: 'emergency', id: emergencyId },
      description: `Emergency resolved: ${resolutionNotes}`,
      metadata: { emergencyId, resolutionNotes }
    });

    this.broadcastEmergencyResolved(emergency);
    logger.info(`Emergency ${emergencyId} resolved`);

    return emergency;
  }

  async autoResumeAfterResolution(emergency) {
    const pausedByThisEmergency = [];

    for (const [poolId, data] of this.pausedPools.entries()) {
      if (data.emergencyId === emergency.emergencyId) {
        pausedByThisEmergency.push({ type: 'pool', id: poolId });
      }
    }

    for (const [marketId, data] of this.pausedMarkets.entries()) {
      if (data.emergencyId === emergency.emergencyId) {
        pausedByThisEmergency.push({ type: 'market', id: marketId });
      }
    }

    logger.info(`Auto-resume check: ${pausedByThisEmergency.length} components were paused by this emergency`, {
      components: pausedByThisEmergency
    });

    return pausedByThisEmergency;
  }

  async createRecoveryPlan(emergencyId, steps, verifiedBy) {
    const emergency = await this.getEmergency(emergencyId);

    emergency.recoveryPlan = {
      steps: steps.map((step, index) => ({
        stepNumber: index + 1,
        description: step,
        status: 'pending'
      })),
      verifiedBy,
      verifiedAt: new Date(),
      verified: true
    };

    await emergency.updateStatus('mitigating', verifiedBy, 'Recovery plan created');
    await emergency.save();

    return emergency;
  }

  async completeRecoveryStep(emergencyId, stepNumber, completedBy) {
    const emergency = await this.getEmergency(emergencyId);

    if (!emergency.recoveryPlan || !emergency.recoveryPlan.steps) {
      throw new Error('No recovery plan exists for this emergency');
    }

    const step = emergency.recoveryPlan.steps.find(s => s.stepNumber === stepNumber);
    if (!step) {
      throw new Error(`Step ${stepNumber} not found in recovery plan`);
    }

    step.status = 'completed';
    step.completedAt = new Date();
    step.completedBy = completedBy;

    const allCompleted = emergency.recoveryPlan.steps.every(s => s.status === 'completed');
    if (allCompleted) {
      await emergency.updateStatus('resolved', completedBy, 'All recovery steps completed');
      this.activeEmergencies.delete(emergencyId);
    }

    await emergency.save();
    return emergency;
  }

  async getEmergency(emergencyId) {
    const emergency = await EmergencyEvent.findOne({ emergencyId });
    if (!emergency) {
      throw new Error(`Emergency ${emergencyId} not found`);
    }
    return emergency;
  }

  validateSeverity(severity) {
    if (!EMERGENCY_SEVERITY_LEVELS.includes(severity)) {
      throw new Error(`Invalid severity level: ${severity}. Must be 1-5`);
    }
  }

  validateEmergencyType(type) {
    if (!EMERGENCY_TYPES.includes(type)) {
      throw new Error(`Invalid emergency type: ${type}`);
    }
  }

  validateEmergencyAction(action) {
    if (!EMERGENCY_ACTIONS.includes(action)) {
      throw new Error(`Invalid emergency action: ${action}`);
    }
  }

  checkEmergencyPermission(actor, action, severity) {
    if (actor.role === 'superadmin') return true;

    if (severity >= 4 && actor.role !== 'superadmin') {
      return false;
    }

    if (['emergency_withdraw', 'freeze_account'].includes(action) && actor.role !== 'superadmin') {
      return false;
    }

    return true;
  }

  isActionReversible(action) {
    const reversibleActions = [
      'pause_pool', 'unpause_pool',
      'pause_market', 'unpause_market',
      'pause_platform', 'unpause_platform',
      'pause_trading', 'unpause_trading',
      'pause_oracle', 'unpause_oracle',
      'freeze_account', 'unfreeze_account',
      'circuit_breaker_trigger', 'circuit_breaker_reset'
    ];
    return reversibleActions.includes(action);
  }

  getReverseAction(action) {
    const reversals = {
      'pause_pool': 'unpause_pool',
      'unpause_pool': 'pause_pool',
      'pause_market': 'unpause_market',
      'unpause_market': 'pause_market',
      'pause_platform': 'unpause_platform',
      'unpause_platform': 'pause_platform',
      'pause_trading': 'unpause_trading',
      'unpause_trading': 'pause_trading',
      'pause_oracle': 'unpause_oracle',
      'unpause_oracle': 'pause_oracle',
      'freeze_account': 'unfreeze_account',
      'unfreeze_account': 'freeze_account',
      'circuit_breaker_trigger': 'circuit_breaker_reset',
      'circuit_breaker_reset': 'circuit_breaker_trigger'
    };
    return reversals[action] || null;
  }

  broadcastEmergencyAlert(emergency) {
    try {
      websocketHandler.broadcastToAdmins({
        type: 'emergency_alert',
        severity: emergency.severity,
        emergencyId: emergency.emergencyId,
        title: emergency.title,
        emergencyType: emergency.emergencyType,
        timestamp: new Date()
      });
    } catch (error) {
      logger.warn('Failed to broadcast emergency alert:', error.message);
    }
  }

  broadcastEmergencyAction(emergency, action, result) {
    try {
      websocketHandler.broadcastToAdmins({
        type: 'emergency_action',
        emergencyId: emergency.emergencyId,
        action,
        result: { success: result.success },
        timestamp: new Date()
      });
    } catch (error) {
      logger.warn('Failed to broadcast emergency action:', error.message);
    }
  }

  broadcastEmergencyResolved(emergency) {
    try {
      websocketHandler.broadcastToAdmins({
        type: 'emergency_resolved',
        emergencyId: emergency.emergencyId,
        title: emergency.title,
        timestamp: new Date()
      });
    } catch (error) {
      logger.warn('Failed to broadcast emergency resolved:', error.message);
    }
  }

  broadcastPlatformPause(emergency) {
    try {
      websocketHandler.broadcastToAll({
        type: 'platform_emergency_pause',
        emergencyId: emergency.emergencyId,
        title: emergency.title,
        message: 'Platform operations have been temporarily suspended for emergency maintenance.',
        timestamp: new Date()
      });
    } catch (error) {
      logger.warn('Failed to broadcast platform pause:', error.message);
    }
  }

  broadcastPlatformUnpause() {
    try {
      websocketHandler.broadcastToAll({
        type: 'platform_emergency_unpause',
        message: 'Platform operations have been restored.',
        timestamp: new Date()
      });
    } catch (error) {
      logger.warn('Failed to broadcast platform unpause:', error.message);
    }
  }

  getEmergencyStatus() {
    return {
      platformPaused: this.platformPaused,
      tradingPaused: this.tradingPaused,
      oraclePaused: this.oraclePaused,
      pausedPools: Array.from(this.pausedPools.entries()).map(([poolId, data]) => ({
        poolId,
        ...data
      })),
      pausedMarkets: Array.from(this.pausedMarkets.entries()).map(([marketId, data]) => ({
        marketId,
        ...data
      })),
      frozenAccounts: Array.from(this.frozenAccounts),
      activeEmergencies: Array.from(this.activeEmergencies.keys()),
      activeEmergencyCount: this.activeEmergencies.size
    };
  }

  isAccountFrozen(address) {
    return this.frozenAccounts.has(address?.toLowerCase());
  }

  isMarketPaused(marketId) {
    return this.pausedMarkets.has(marketId);
  }

  isPoolPaused(poolId) {
    return this.pausedPools.has(poolId);
  }

  isTradingPaused() {
    return this.tradingPaused || this.platformPaused;
  }

  isOraclePaused() {
    return this.oraclePaused;
  }
}

module.exports = new EmergencyControlService();
