const mongoose = require('mongoose');
const { Market, Position, User, MarketEvent } = require('../models');
const logger = require('../config/logger');
const sorobanService = require('./sorobanService');
const stellarService = require('./stellarService');

class AtomicSettlementService {
  /**
   * Settles a market atomically.
   */
  async settleMarket(marketId, outcome, resolvedBy, resolutionSource = null) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1. Lock and validate market
      const market = await Market.findOne({ marketId }).session(session);
      
      if (!market) {
        throw new Error('Market not found');
      }
      
      if (market.status === 'resolved') {
        throw new Error('Market is already resolved');
      }

      // 2. Resolve on Soroban (external operation, do before DB commits)
      let transactionHash = null;
      if (market.metadata?.contractAddress) {
        const resolveResult = await sorobanService.resolveMarket(
          stellarService.adminKeypair,
          market.metadata.contractAddress,
          outcome
        );
        transactionHash = resolveResult.transactionHash;
      }

      const resolvePayload = {
        outcome,
        resolvedBy,
        resolutionTxHash: transactionHash,
        resolvedAt: new Date()
      };

      // 3. Append events using the session
      await this.appendEventWithSession(session, marketId, 'MARKET_RESOLVED', resolvePayload, resolvedBy);
      if (resolutionSource) {
        await this.appendEventWithSession(session, marketId, 'MARKET_UPDATED', { 'metadata.resolutionSource': resolutionSource }, resolvedBy);
      }

      // 4. Update Market Read Model
      market.status = 'resolved';
      market.resolvedOutcome = outcome;
      market.resolvedAt = resolvePayload.resolvedAt;
      market.resolvedBy = resolvedBy;
      market.resolutionTransactionHash = transactionHash;
      if (resolutionSource) {
        if (!market.metadata) market.metadata = {};
        market.metadata.resolutionSource = resolutionSource;
      }
      await market.save({ session });

      // 5. Calculate payouts and settle positions
      const positions = await Position.find({ marketId, status: 'active' }).session(session);
      
      for (const position of positions) {
        position.settle(outcome, 1.0); // Assuming 1 USDC payout
        await position.save({ session });

        const user = await User.findOne({ walletAddress: position.userWalletAddress }).session(session);
        if (user) {
          user.statistics.totalPredictions += 1;
          if ((outcome === 'yes' && position.tokenType === 'yes') ||
              (outcome === 'no' && position.tokenType === 'no')) {
            user.statistics.successfulPredictions += 1;
          }
          user.addProfitLoss(position.realizedPnL);
          user.recomputeReputationFromStats();
          await user.save({ session });
        }
      }

      // 6. Commit transaction
      await session.commitTransaction();
      
      logger.info(`Market ${marketId} atomically settled with outcome: ${outcome}`);
      
      return market;
    } catch (error) {
      await session.abortTransaction();
      logger.error(`Atomic settlement failed for market ${marketId}:`, error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  async appendEventWithSession(session, marketId, eventType, payload, actorAddress) {
    const lastEvent = await MarketEvent.findOne({ marketId }).session(session).sort({ sequenceNumber: -1 }).limit(1);
    const sequenceNumber = lastEvent ? lastEvent.sequenceNumber + 1 : 1;
    const event = new MarketEvent({
      marketId,
      eventType,
      schemaVersion: 1,
      payload,
      actorAddress,
      sequenceNumber
    });
    await event.save({ session });
    return event;
  }
}

module.exports = new AtomicSettlementService();
