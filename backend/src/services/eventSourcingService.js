const { Market, MarketEvent, MarketSnapshot } = require('../models');
const logger = require('../config/logger');

class EventSourcingService {
  /**
   * Appends a new event to the event store and projects it onto the read model.
   *
   * @param {string} marketId The ID of the market.
   * @param {string} eventType The type of the event (e.g., 'MARKET_CREATED').
   * @param {object} payload The event payload.
   * @param {string} actorAddress The address of the actor initiating the event.
   * @returns {object} The appended event.
   */
  async appendEvent(marketId, eventType, payload, actorAddress = null) {
    try {
      // Determine the next sequence number for this market
      const lastEvent = await MarketEvent.findOne({ marketId })
        .sort({ sequenceNumber: -1 })
        .limit(1);
      
      const sequenceNumber = lastEvent ? lastEvent.sequenceNumber + 1 : 1;

      // Create and save the new event
      const event = new MarketEvent({
        marketId,
        eventType,
        schemaVersion: 1,
        payload,
        actorAddress,
        sequenceNumber
      });

      await event.save();
      logger.debug('Appended event', { eventType, marketId, sequenceNumber });

      // Synchronous projection to update the read model
      await this.projectEvent(event);

      return event;
    } catch (error) {
      logger.error('Failed to append event', { eventType, marketId, error: error.message });
      throw error;
    }
  }

  /**
   * Projects a single event onto the Market read model.
   */
  async projectEvent(event) {
    const { marketId, eventType, payload } = event;

    try {
      switch (eventType) {
        case 'MARKET_CREATED': {
          const newMarket = new Market(payload);
          await newMarket.save();
          break;
        }
        case 'MARKET_UPDATED': {
          await Market.findOneAndUpdate({ marketId }, { $set: payload });
          break;
        }
        case 'MARKET_RESOLVED': {
          await Market.findOneAndUpdate({ marketId }, {
            status: 'resolved',
            resolvedOutcome: payload.outcome,
            resolvedAt: payload.resolvedAt || new Date(),
            resolvedBy: payload.resolvedBy,
            resolutionTransactionHash: payload.resolutionTransactionHash
          });
          break;
        }
        case 'PRICES_UPDATED': {
          const market = await Market.findOne({ marketId });
          if (market) {
            market.updatePrices(payload.yesPrice, payload.noPrice);
            await market.save();
          }
          break;
        }
        case 'TRADE_EXECUTED': {
          const market = await Market.findOne({ marketId });
          if (market) {
            market.addTrade(payload.amount);
            await market.save();
          }
          break;
        }
        default:
          logger.debug(`No projection handler for event type: ${eventType}`);
      }
    } catch (error) {
      logger.error('Failed to project event', { eventType, marketId, error: error.message });
      throw error;
    }
  }

  /**
   * Rebuilds the Market state from the event store.
   *
   * @param {string} marketId The ID of the market to rebuild.
   * @returns {object} The reconstructed market data.
   */
  async replayMarket(marketId) {
    let state = {};
    let lastSequence = 0;

    // Check for a recent snapshot
    const snapshot = await MarketSnapshot.findOne({ marketId });
    if (snapshot) {
      state = { ...snapshot.stateData };
      lastSequence = snapshot.lastEventSequenceNumber;
    }

    // Fetch all events after the snapshot
    const events = await MarketEvent.find({
      marketId,
      sequenceNumber: { $gt: lastSequence }
    }).sort({ sequenceNumber: 1 });

    for (const event of events) {
      state = this.applyEventToState(state, event);
    }

    return state;
  }

  /**
   * Applies an event to a raw state object (used during replay).
   */
  applyEventToState(state, event) {
    const { eventType, payload } = event;

    switch (eventType) {
      case 'MARKET_CREATED':
        return { ...payload };
      case 'MARKET_UPDATED':
        return { ...state, ...payload };
      case 'MARKET_RESOLVED':
        return {
          ...state,
          status: 'resolved',
          resolvedOutcome: payload.outcome,
          resolvedAt: payload.resolvedAt || new Date(),
          resolvedBy: payload.resolvedBy,
          resolutionTransactionHash: payload.resolutionTransactionHash
        };
      case 'PRICES_UPDATED':
        // NOTE: In a true pure function replay, you'd manage priceHistory array manually here
        return {
          ...state,
          currentYesPrice: payload.yesPrice,
          currentNoPrice: payload.noPrice,
        };
      case 'TRADE_EXECUTED':
        return {
          ...state,
          totalTrades: (state.totalTrades || 0) + 1,
          totalVolume: (state.totalVolume || 0) + payload.amount,
        };
      default:
        return state;
    }
  }

  /**
   * Generates a snapshot for a market to speed up future replays.
   */
  async generateSnapshot(marketId) {
    try {
      const state = await this.replayMarket(marketId);
      const lastEvent = await MarketEvent.findOne({ marketId }).sort({ sequenceNumber: -1 }).limit(1);
      
      if (!lastEvent) {
        return null;
      }

      const snapshot = await MarketSnapshot.findOneAndUpdate(
        { marketId },
        {
          stateData: state,
          lastEventSequenceNumber: lastEvent.sequenceNumber,
          timestamp: new Date()
        },
        { upsert: true, new: true }
      );

      logger.info('Generated snapshot', { marketId, sequenceNumber: lastEvent.sequenceNumber });
      return snapshot;
    } catch (error) {
      logger.error('Failed to generate snapshot', { marketId, error: error.message });
      throw error;
    }
  }

  /**
   * Recovers all markets by wiping the Market read models and rebuilding them from events.
   * This is a dangerous operation typically only used in emergency recovery scenarios.
   */
  async recoverAllMarkets() {
    logger.warn('Starting full market recovery from event store...');
    try {
      // Get all unique market IDs from the event store
      const marketIds = await MarketEvent.distinct('marketId');
      
      // Wipe current read models
      await Market.deleteMany({});
      logger.info(`Cleared all existing market read models.`);

      let recoveredCount = 0;
      for (const marketId of marketIds) {
        const rebuiltState = await this.replayMarket(marketId);
        if (rebuiltState && rebuiltState.marketId) {
          const market = new Market(rebuiltState);
          await market.save();
          recoveredCount++;
        }
      }

      logger.info(`Successfully recovered ${recoveredCount} markets from event store.`);
      return { success: true, recoveredCount };
    } catch (error) {
      logger.error('Market recovery failed:', error);
      throw error;
    }
  }
}

module.exports = new EventSourcingService();
