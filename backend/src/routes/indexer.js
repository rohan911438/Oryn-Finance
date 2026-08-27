const express = require('express');
const router = express.Router();
const { authenticate: auth, requireAdmin: adminAuth } = require('../middleware/auth');
const deterministicIndexer = require('../services/deterministicMarketStateIndexer');
const { IndexerHealth, ChainReorg, Market, Trade, IndexedEvent } = require('../models');

router.get('/status', auth, async (req, res) => {
  try {
    const status = await deterministicIndexer.getIndexerStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get indexer status'
    });
  }
});

router.get('/health', auth, async (req, res) => {
  try {
    const health = await IndexerHealth.findOne({ 
      indexerId: 'deterministic-market-state-indexer' 
    }).sort({ lastHealthCheck: -1 });

    if (!health) {
      return res.json({
        success: true,
        data: {
          status: 'unknown',
          message: 'No health data available'
        }
      });
    }

    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get indexer health'
    });
  }
});

router.get('/health/history', auth, async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    
    const history = await IndexerHealth.find({ 
      indexerId: 'deterministic-market-state-indexer' 
    })
    .sort({ lastHealthCheck: -1 })
    .limit(parseInt(limit));

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get health history'
    });
  }
});

router.get('/stats', auth, async (req, res) => {
  try {
    const [marketCount, tradeCount, eventCount, positionCount] = await Promise.all([
      Market.countDocuments(),
      Trade.countDocuments(),
      IndexedEvent.countDocuments(),
      require('../models').Position.countDocuments()
    ]);

    const eventsByType = await IndexedEvent.aggregate([
      {
        $group: {
          _id: '$eventType',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const recentEvents = await IndexedEvent.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('txHash topic eventType ledger createdAt');

    res.json({
      success: true,
      data: {
        counts: {
          markets: marketCount,
          trades: tradeCount,
          events: eventCount,
          positions: positionCount
        },
        eventsByType,
        recentEvents
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get indexer stats'
    });
  }
});

router.get('/reorgs', auth, async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    
    const query = {};
    if (status) query.status = status;

    const reorgs = await ChainReorg.find(query)
      .sort({ detectedAt: -1 })
      .limit(parseInt(limit));

    const stats = await ChainReorg.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        reorgs,
        stats
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get reorg data'
    });
  }
});

router.get('/reorgs/:reorgId', auth, async (req, res) => {
  try {
    const reorg = await ChainReorg.findOne({ 
      reorgId: req.params.reorgId 
    });

    if (!reorg) {
      return res.status(404).json({
        success: false,
        error: 'Reorg not found'
      });
    }

    res.json({
      success: true,
      data: reorg
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get reorg details'
    });
  }
});

router.post('/reconstruct/:marketId', auth, async (req, res) => {
  try {
    const { marketId } = req.params;
    
    const state = await deterministicIndexer.reconstructMarketState(marketId);
    
    res.json({
      success: true,
      data: {
        marketId,
        reconstructedState: state
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to reconstruct market state'
    });
  }
});

router.post('/start', adminAuth, async (req, res) => {
  try {
    await deterministicIndexer.start();
    
    res.json({
      success: true,
      message: 'Deterministic market state indexer started'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to start indexer'
    });
  }
});

router.post('/stop', adminAuth, async (req, res) => {
  try {
    deterministicIndexer.stop();
    
    res.json({
      success: true,
      message: 'Deterministic market state indexer stopped'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to stop indexer'
    });
  }
});

router.get('/market/:marketId/events', auth, async (req, res) => {
  try {
    const { marketId } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const events = await IndexedEvent.find({ marketId })
      .sort({ ledger: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit));

    const total = await IndexedEvent.countDocuments({ marketId });

    res.json({
      success: true,
      data: {
        events,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get market events'
    });
  }
});

router.get('/market/:marketId/state', auth, async (req, res) => {
  try {
    const { marketId } = req.params;
    
    const market = await Market.findOne({ marketId });
    const events = await IndexedEvent.find({ marketId })
      .sort({ ledger: 1 });

    res.json({
      success: true,
      data: {
        market,
        eventCount: events.length,
        events: events.slice(-10)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get market state'
    });
  }
});

module.exports = router;
