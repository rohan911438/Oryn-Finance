const { IndexedEvent } = require('../models');
const logger = require('../config/logger');
const { ValidationError, BadRequestError } = require('../middleware/errorHandler');

class TransactionHistoryController {
  /**
   * Get transaction history with pagination and filtering
   */
  static async getTransactionHistory(req, res) {
    try {
      const {
        userAddress,
        eventType,
        marketId,
        contractName,
        status,
        reconciliationStatus,
        startDate,
        endDate,
        page = 1,
        limit = 50,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build query
      const query = {};

      if (userAddress) {
        query.userAddress = userAddress;
      }

      if (eventType) {
        query.eventType = eventType;
      }

      if (marketId) {
        query.marketId = marketId;
      }

      if (contractName) {
        query.contractName = contractName;
      }

      if (status) {
        query.status = status;
      }

      if (reconciliationStatus) {
        query.reconciliationStatus = reconciliationStatus;
      }

      // Date range filtering
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
          query.createdAt.$gte = new Date(startDate);
        }
        if (endDate) {
          query.createdAt.$lte = new Date(endDate);
        }
      }

      // Pagination setup
      const pageNum = parseInt(page);
      const limitNum = Math.min(parseInt(limit), 100); // Max 100 per page
      const skip = (pageNum - 1) * limitNum;

      // Sort setup
      const sortOptions = {};
      sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Execute query with pagination
      const [events, total] = await Promise.all([
        IndexedEvent.find(query)
          .sort(sortOptions)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        IndexedEvent.countDocuments(query)
      ]);

      // Format response
      const formattedEvents = events.map(event => ({
        id: event._id,
        contractId: event.contractId,
        contractName: event.contractName,
        topic: event.topic,
        eventType: event.eventType,
        txHash: event.txHash,
        ledger: event.ledger,
        userAddress: event.userAddress,
        marketId: event.marketId,
        amount: event.amount ? event.amount.toString() : null,
        tokenType: event.tokenType,
        status: event.status,
        reconciliationStatus: event.reconciliationStatus,
        payload: event.payload,
        processedAt: event.processedAt,
        createdAt: event.createdAt,
        blockTimestamp: event.blockTimestamp,
        fee: event.fee ? event.fee.toString() : null
      }));

      res.json({
        success: true,
        data: {
          events: formattedEvents,
          pagination: {
            currentPage: pageNum,
            totalPages: Math.ceil(total / limitNum),
            totalItems: total,
            itemsPerPage: limitNum,
            hasNextPage: pageNum < Math.ceil(total / limitNum),
            hasPreviousPage: pageNum > 1
          }
        }
      });
    } catch (error) {
      logger.error('Failed to get transaction history:', error);
      throw new BadRequestError(`Failed to get transaction history: ${error.message}`);
    }
  }

  /**
   * Get transaction history by user address
   */
  static async getUserTransactionHistory(req, res) {
    try {
      const { userAddress } = req.params;
      const {
        eventType,
        marketId,
        page = 1,
        limit = 50,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      if (!userAddress) {
        throw new ValidationError('User address is required');
      }

      // Build query
      const query = { userAddress };

      if (eventType) {
        query.eventType = eventType;
      }

      if (marketId) {
        query.marketId = marketId;
      }

      // Pagination setup
      const pageNum = parseInt(page);
      const limitNum = Math.min(parseInt(limit), 100);
      const skip = (pageNum - 1) * limitNum;

      // Sort setup
      const sortOptions = {};
      sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Execute query
      const [events, total] = await Promise.all([
        IndexedEvent.find(query)
          .sort(sortOptions)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        IndexedEvent.countDocuments(query)
      ]);

      // Calculate summary statistics
      const stats = await IndexedEvent.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$eventType',
            count: { $sum: 1 },
            totalAmount: {
              $sum: { $ifNull: ['$amount', 0] }
            }
          }
        }
      ]);

      // Format response
      const formattedEvents = events.map(event => ({
        id: event._id,
        contractId: event.contractId,
        contractName: event.contractName,
        topic: event.topic,
        eventType: event.eventType,
        txHash: event.txHash,
        ledger: event.ledger,
        marketId: event.marketId,
        amount: event.amount ? event.amount.toString() : null,
        tokenType: event.tokenType,
        status: event.status,
        processedAt: event.processedAt,
        createdAt: event.createdAt
      }));

      res.json({
        success: true,
        data: {
          userAddress,
          events: formattedEvents,
          statistics: stats.map(stat => ({
            eventType: stat._id,
            count: stat.count,
            totalAmount: stat.totalAmount.toString()
          })),
          pagination: {
            currentPage: pageNum,
            totalPages: Math.ceil(total / limitNum),
            totalItems: total,
            itemsPerPage: limitNum,
            hasNextPage: pageNum < Math.ceil(total / limitNum),
            hasPreviousPage: pageNum > 1
          }
        }
      });
    } catch (error) {
      logger.error('Failed to get user transaction history:', error);
      throw new BadRequestError(`Failed to get user transaction history: ${error.message}`);
    }
  }

  /**
   * Get transaction history by market
   */
  static async getMarketTransactionHistory(req, res) {
    try {
      const { marketId } = req.params;
      const {
        eventType,
        page = 1,
        limit = 50,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      if (!marketId) {
        throw new ValidationError('Market ID is required');
      }

      // Build query
      const query = { marketId };

      if (eventType) {
        query.eventType = eventType;
      }

      // Pagination setup
      const pageNum = parseInt(page);
      const limitNum = Math.min(parseInt(limit), 100);
      const skip = (pageNum - 1) * limitNum;

      // Sort setup
      const sortOptions = {};
      sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Execute query
      const [events, total] = await Promise.all([
        IndexedEvent.find(query)
          .sort(sortOptions)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        IndexedEvent.countDocuments(query)
      ]);

      // Format response
      const formattedEvents = events.map(event => ({
        id: event._id,
        contractId: event.contractId,
        contractName: event.contractName,
        topic: event.topic,
        eventType: event.eventType,
        txHash: event.txHash,
        ledger: event.ledger,
        userAddress: event.userAddress,
        amount: event.amount ? event.amount.toString() : null,
        tokenType: event.tokenType,
        status: event.status,
        processedAt: event.processedAt,
        createdAt: event.createdAt
      }));

      res.json({
        success: true,
        data: {
          marketId,
          events: formattedEvents,
          pagination: {
            currentPage: pageNum,
            totalPages: Math.ceil(total / limitNum),
            totalItems: total,
            itemsPerPage: limitNum,
            hasNextPage: pageNum < Math.ceil(total / limitNum),
            hasPreviousPage: pageNum > 1
          }
        }
      });
    } catch (error) {
      logger.error('Failed to get market transaction history:', error);
      throw new BadRequestError(`Failed to get market transaction history: ${error.message}`);
    }
  }

  /**
   * Get transaction by hash
   */
  static async getTransactionByHash(req, res) {
    try {
      const { txHash } = req.params;

      if (!txHash) {
        throw new ValidationError('Transaction hash is required');
      }

      const event = await IndexedEvent.findOne({ txHash }).lean();

      if (!event) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'TRANSACTION_NOT_FOUND',
            message: 'Transaction not found'
          }
        });
      }

      res.json({
        success: true,
        data: {
          id: event._id,
          contractId: event.contractId,
          contractName: event.contractName,
          topic: event.topic,
          eventType: event.eventType,
          txHash: event.txHash,
          ledger: event.ledger,
          userAddress: event.userAddress,
          marketId: event.marketId,
          amount: event.amount ? event.amount.toString() : null,
          tokenType: event.tokenType,
          status: event.status,
          reconciliationStatus: event.reconciliationStatus,
          reconciliationAttempts: event.reconciliationAttempts,
          lastReconciledAt: event.lastReconciledAt,
          reconciliationError: event.reconciliationError,
          payload: event.payload,
          processedAt: event.processedAt,
          createdAt: event.createdAt,
          updatedAt: event.updatedAt,
          blockTimestamp: event.blockTimestamp,
          fee: event.fee ? event.fee.toString() : null
        }
      });
    } catch (error) {
      logger.error('Failed to get transaction by hash:', error);
      throw new BadRequestError(`Failed to get transaction: ${error.message}`);
    }
  }

  /**
   * Get transaction statistics
   */
  static async getTransactionStatistics(req, res) {
    try {
      const {
        userAddress,
        marketId,
        eventType,
        startDate,
        endDate
      } = req.query;

      // Build query
      const query = {};

      if (userAddress) {
        query.userAddress = userAddress;
      }

      if (marketId) {
        query.marketId = marketId;
      }

      if (eventType) {
        query.eventType = eventType;
      }

      // Date range filtering
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
          query.createdAt.$gte = new Date(startDate);
        }
        if (endDate) {
          query.createdAt.$lte = new Date(endDate);
        }
      }

      // Get statistics
      const [
        totalEvents,
        eventTypeStats,
        statusStats,
        reconciliationStats,
        volumeStats
      ] = await Promise.all([
        IndexedEvent.countDocuments(query),
        IndexedEvent.aggregate([
          { $match: query },
          {
            $group: {
              _id: '$eventType',
              count: { $sum: 1 }
            }
          }
        ]),
        IndexedEvent.aggregate([
          { $match: query },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ]),
        IndexedEvent.aggregate([
          { $match: query },
          {
            $group: {
              _id: '$reconciliationStatus',
              count: { $sum: 1 }
            }
          }
        ]),
        IndexedEvent.aggregate([
          { $match: query },
          {
            $group: {
              _id: null,
              totalVolume: { $sum: { $ifNull: ['$amount', 0] } },
              avgAmount: { $avg: { $ifNull: ['$amount', 0] } }
            }
          }
        ])
      ]);

      res.json({
        success: true,
        data: {
          totalEvents,
          byEventType: eventTypeStats.map(stat => ({
            eventType: stat._id,
            count: stat.count
          })),
          byStatus: statusStats.map(stat => ({
            status: stat._id,
            count: stat.count
          })),
          byReconciliationStatus: reconciliationStats.map(stat => ({
            reconciliationStatus: stat._id,
            count: stat.count
          })),
          volume: volumeStats[0] ? {
            totalVolume: volumeStats[0].totalVolume.toString(),
            avgAmount: volumeStats[0].avgAmount.toString()
          } : {
            totalVolume: '0',
            avgAmount: '0'
          }
        }
      });
    } catch (error) {
      logger.error('Failed to get transaction statistics:', error);
      throw new BadRequestError(`Failed to get transaction statistics: ${error.message}`);
    }
  }

  /**
   * Get investment events
   */
  static async getInvestmentEvents(req, res) {
    try {
      const {
        userAddress,
        marketId,
        page = 1,
        limit = 50
      } = req.query;

      const query = { eventType: 'investment' };

      if (userAddress) {
        query.userAddress = userAddress;
      }

      if (marketId) {
        query.marketId = marketId;
      }

      const pageNum = parseInt(page);
      const limitNum = Math.min(parseInt(limit), 100);
      const skip = (pageNum - 1) * limitNum;

      const [events, total] = await Promise.all([
        IndexedEvent.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        IndexedEvent.countDocuments(query)
      ]);

      const formattedEvents = events.map(event => ({
        id: event._id,
        contractId: event.contractId,
        contractName: event.contractName,
        eventType: event.eventType,
        txHash: event.txHash,
        ledger: event.ledger,
        userAddress: event.userAddress,
        marketId: event.marketId,
        amount: event.amount ? event.amount.toString() : null,
        tokenType: event.tokenType,
        processedAt: event.processedAt,
        createdAt: event.createdAt,
        payload: event.payload
      }));

      res.json({
        success: true,
        data: {
          events: formattedEvents,
          pagination: {
            currentPage: pageNum,
            totalPages: Math.ceil(total / limitNum),
            totalItems: total,
            itemsPerPage: limitNum
          }
        }
      });
    } catch (error) {
      logger.error('Failed to get investment events:', error);
      throw new BadRequestError(`Failed to get investment events: ${error.message}`);
    }
  }

  /**
   * Get withdrawal events
   */
  static async getWithdrawalEvents(req, res) {
    try {
      const {
        userAddress,
        marketId,
        page = 1,
        limit = 50
      } = req.query;

      const query = { eventType: 'withdrawal' };

      if (userAddress) {
        query.userAddress = userAddress;
      }

      if (marketId) {
        query.marketId = marketId;
      }

      const pageNum = parseInt(page);
      const limitNum = Math.min(parseInt(limit), 100);
      const skip = (pageNum - 1) * limitNum;

      const [events, total] = await Promise.all([
        IndexedEvent.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        IndexedEvent.countDocuments(query)
      ]);

      const formattedEvents = events.map(event => ({
        id: event._id,
        contractId: event.contractId,
        contractName: event.contractName,
        eventType: event.eventType,
        txHash: event.txHash,
        ledger: event.ledger,
        userAddress: event.userAddress,
        marketId: event.marketId,
        amount: event.amount ? event.amount.toString() : null,
        tokenType: event.tokenType,
        processedAt: event.processedAt,
        createdAt: event.createdAt,
        payload: event.payload
      }));

      res.json({
        success: true,
        data: {
          events: formattedEvents,
          pagination: {
            currentPage: pageNum,
            totalPages: Math.ceil(total / limitNum),
            totalItems: total,
            itemsPerPage: limitNum
          }
        }
      });
    } catch (error) {
      logger.error('Failed to get withdrawal events:', error);
      throw new BadRequestError(`Failed to get withdrawal events: ${error.message}`);
    }
  }
}

module.exports = TransactionHistoryController;
