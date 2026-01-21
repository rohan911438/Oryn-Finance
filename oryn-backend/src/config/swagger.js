const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Oryn Finance API',
      version: '1.0.0',
      description: 'Comprehensive API for Oryn Finance prediction market platform',
      contact: {
        name: 'Oryn Finance Team',
        email: 'api@oryn.finance',
        url: 'https://oryn.finance'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'production' ? 'https://api.oryn.finance' : 'http://localhost:5000',
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        Market: {
          type: 'object',
          properties: {
            marketId: {
              type: 'string',
              description: 'Unique market identifier'
            },
            question: {
              type: 'string',
              description: 'Market question'
            },
            category: {
              type: 'string',
              enum: ['sports', 'politics', 'crypto', 'entertainment', 'economics', 'technology', 'other']
            },
            status: {
              type: 'string',
              enum: ['active', 'resolved', 'cancelled', 'expired']
            },
            currentYesPrice: {
              type: 'number',
              minimum: 0,
              maximum: 1
            },
            currentNoPrice: {
              type: 'number',
              minimum: 0,
              maximum: 1
            },
            totalVolume: {
              type: 'number',
              minimum: 0
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            expiresAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Trade: {
          type: 'object',
          properties: {
            tradeId: {
              type: 'string'
            },
            marketId: {
              type: 'string'
            },
            tokenType: {
              type: 'string',
              enum: ['yes', 'no']
            },
            tradeType: {
              type: 'string',
              enum: ['buy', 'sell']
            },
            amount: {
              type: 'number',
              minimum: 0
            },
            price: {
              type: 'number',
              minimum: 0,
              maximum: 1
            },
            status: {
              type: 'string',
              enum: ['pending', 'confirmed', 'failed']
            },
            timestamp: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        User: {
          type: 'object',
          properties: {
            walletAddress: {
              type: 'string',
              pattern: '^G[A-Z2-7]{55}$'
            },
            username: {
              type: 'string'
            },
            statistics: {
              type: 'object',
              properties: {
                totalVolume: { type: 'number' },
                totalTrades: { type: 'number' },
                profitLoss: { type: 'number' },
                winRate: { type: 'number' }
              }
            },
            reputationScore: {
              type: 'number',
              minimum: 0,
              maximum: 1000
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string'
                },
                message: {
                  type: 'string'
                }
              }
            }
          }
        },
        Success: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            data: {
              type: 'object'
            },
            message: {
              type: 'string'
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./src/routes/*.js', './src/controllers/*.js'] // paths to files containing OpenAPI definitions
};

const specs = swaggerJsdoc(options);

module.exports = specs;