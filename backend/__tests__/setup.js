// Test setup and global mocks
const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  oracle: jest.fn()
};

// Mock mongoose
jest.mock('mongoose', () => {
  class MockSchema {
    constructor() {
      this.methods = {};
      this.statics = {};
    }

    index() {}
    pre() {}
    post() {}
    virtual() {
      return { get: jest.fn() };
    }
  }

  MockSchema.Types = {
    Mixed: Object,
    ObjectId: String
  };

  const collections = new Map();
  let nextId = 1;

  function getValue(doc, path) {
    return path.split('.').reduce((value, key) => value?.[key], doc);
  }

  function setValue(doc, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((current, key) => {
      current[key] = current[key] || {};
      return current[key];
    }, doc);
    target[last] = value;
  }

  function matches(doc, filter = {}) {
    return Object.entries(filter).every(([key, expected]) => {
      const actual = getValue(doc, key);
      if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date)) {
        if ('$in' in expected && !expected.$in.includes(actual)) return false;
        if ('$ne' in expected && actual === expected.$ne) return false;
        if ('$gte' in expected && actual < expected.$gte) return false;
        if ('$gt' in expected && actual <= expected.$gt) return false;
        if ('$lte' in expected && actual > expected.$lte) return false;
        if ('$lt' in expected && actual >= expected.$lt) return false;
        return true;
      }
      return actual === expected;
    });
  }

  function makeQuery(value) {
    const query = {
      sort(sortSpec = {}) {
        if (Array.isArray(value)) {
          const [[field, direction]] = Object.entries(sortSpec);
          value = [...value].sort((a, b) => {
            const left = getValue(a, field);
            const right = getValue(b, field);
            if (left === right) return 0;
            return (left > right ? 1 : -1) * direction;
          });
        }
        return query;
      },
      limit(count) {
        if (Array.isArray(value)) value = value.slice(0, count);
        return query;
      },
      skip(count) {
        if (Array.isArray(value)) value = value.slice(count);
        return query;
      },
      populate() {
        return query;
      },
      select() {
        return query;
      },
      lean() {
        return Promise.resolve(value);
      },
      then(resolve, reject) {
        return Promise.resolve(value).then(resolve, reject);
      },
      catch(reject) {
        return Promise.resolve(value).catch(reject);
      },
      finally(onFinally) {
        return Promise.resolve(value).finally(onFinally);
      }
    };
    return query;
  }

  function evalExpression(doc, expression) {
    if (typeof expression === 'number') return expression;
    if (typeof expression === 'string') {
      return expression.startsWith('$') ? getValue(doc, expression.slice(1)) : expression;
    }
    if (expression && typeof expression === 'object' && '$cond' in expression) {
      const [condition, truthy, falsy] = expression.$cond;
      return evalCondition(doc, condition) ? evalExpression(doc, truthy) : evalExpression(doc, falsy);
    }
    if (expression && typeof expression === 'object' && '$ifNull' in expression) {
      const [valueExpression, fallback] = expression.$ifNull;
      const value = evalExpression(doc, valueExpression);
      return value === null || value === undefined ? evalExpression(doc, fallback) : value;
    }
    if (expression && typeof expression === 'object') {
      return Object.fromEntries(
        Object.entries(expression).map(([key, value]) => [key, evalExpression(doc, value)])
      );
    }
    return expression;
  }

  function evalCondition(doc, condition) {
    if (condition && typeof condition === 'object' && '$in' in condition) {
      const [valueExpression, values] = condition.$in;
      return values.includes(evalExpression(doc, valueExpression));
    }
    return Boolean(condition);
  }

  function aggregateRows(rows, pipeline = []) {
    return pipeline.reduce((current, stage) => {
      if (stage.$match) {
        return current.filter((doc) => matches(doc, stage.$match));
      }

      if (stage.$group) {
        const groups = new Map();
        current.forEach((doc) => {
          const groupId = evalExpression(doc, stage.$group._id);
          const groupKey = JSON.stringify(groupId);
          if (!groups.has(groupKey)) groups.set(groupKey, { _id: groupId });
          const aggregate = groups.get(groupKey);

          Object.entries(stage.$group).forEach(([field, spec]) => {
            if (field === '_id') return;
            if ('$sum' in spec) {
              aggregate[field] = (aggregate[field] || 0) + Number(evalExpression(doc, spec.$sum) || 0);
            } else if ('$avg' in spec) {
              const stateKey = `__${field}`;
              aggregate[stateKey] = aggregate[stateKey] || { total: 0, count: 0 };
              aggregate[stateKey].total += Number(evalExpression(doc, spec.$avg) || 0);
              aggregate[stateKey].count += 1;
              aggregate[field] = aggregate[stateKey].total / aggregate[stateKey].count;
            } else if ('$max' in spec) {
              const value = evalExpression(doc, spec.$max);
              aggregate[field] = aggregate[field] === undefined ? value : Math.max(aggregate[field], value);
            } else if ('$min' in spec) {
              const value = evalExpression(doc, spec.$min);
              aggregate[field] = aggregate[field] === undefined ? value : Math.min(aggregate[field], value);
            } else if ('$push' in spec) {
              aggregate[field] = aggregate[field] || [];
              aggregate[field].push(evalExpression(doc, spec.$push));
            }
          });
        });

        return Array.from(groups.values()).map((doc) => {
          Object.keys(doc).forEach((key) => {
            if (key.startsWith('__')) delete doc[key];
          });
          return doc;
        });
      }

      if (stage.$sort) {
        const [[field, direction]] = Object.entries(stage.$sort);
        return [...current].sort((a, b) => {
          const left = getValue(a, field);
          const right = getValue(b, field);
          if (left === right) return 0;
          return (left > right ? 1 : -1) * direction;
        });
      }

      if (stage.$limit) {
        return current.slice(0, stage.$limit);
      }

      return current;
    }, [...rows]);
  }

  function applyUpdate(doc, update = {}) {
    if (update.$setOnInsert) {
      Object.entries(update.$setOnInsert).forEach(([key, value]) => {
        if (getValue(doc, key) === undefined) setValue(doc, key, value);
      });
    }
    if (update.$set) {
      Object.entries(update.$set).forEach(([key, value]) => setValue(doc, key, value));
    }
    if (update.$inc) {
      Object.entries(update.$inc).forEach(([key, value]) => setValue(doc, key, (getValue(doc, key) || 0) + value));
    }
    Object.entries(update).forEach(([key, value]) => {
      if (!key.startsWith('$')) setValue(doc, key, value);
    });
  }

  function createModel(modelName, schema) {
    const rows = collections.get(modelName) || [];
    collections.set(modelName, rows);

    class MockModel {
      constructor(data = {}) {
        Object.assign(this, data);
        this._id = this._id || `${modelName}_${nextId++}`;
        this.createdAt = this.createdAt || new Date();
        this.updatedAt = this.updatedAt || new Date();
      }

      async save() {
        const existingIndex = rows.findIndex((doc) => doc._id === this._id);
        if (existingIndex >= 0) rows[existingIndex] = this;
        else rows.push(this);
        return this;
      }
    }

    Object.assign(MockModel.prototype, schema?.methods || {});
    Object.assign(MockModel, schema?.statics || {});
    MockModel.modelName = modelName;
    MockModel.create = jest.fn(async (data) => {
      if (Array.isArray(data)) {
        return Promise.all(data.map((item) => MockModel.create(item)));
      }
      const doc = new MockModel(data);
      rows.push(doc);
      return doc;
    });
    MockModel.insertMany = jest.fn(async (items = []) => Promise.all(items.map((item) => MockModel.create(item))));
    MockModel.deleteMany = jest.fn(async (filter = {}) => {
      const before = rows.length;
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (matches(rows[index], filter)) rows.splice(index, 1);
      }
      return { deletedCount: before - rows.length };
    });
    MockModel.deleteOne = jest.fn(async (filter = {}) => {
      const index = rows.findIndex((doc) => matches(doc, filter));
      if (index >= 0) rows.splice(index, 1);
      return { deletedCount: index >= 0 ? 1 : 0 };
    });
    MockModel.find = jest.fn((filter = {}) => makeQuery(rows.filter((doc) => matches(doc, filter))));
    MockModel.findOne = jest.fn((filter = {}) => makeQuery(rows.find((doc) => matches(doc, filter)) || null));
    MockModel.findById = jest.fn((id) => makeQuery(rows.find((doc) => doc._id === id) || null));
    MockModel.findByIdAndUpdate = jest.fn(async (id, update = {}, options = {}) => {
      let doc = rows.find((item) => item._id === id);
      if (!doc && options.upsert) {
        doc = new MockModel({ _id: id });
        rows.push(doc);
      }
      if (doc) applyUpdate(doc, update);
      return doc;
    });
    MockModel.findOneAndUpdate = jest.fn(async (filter = {}, update = {}, options = {}) => {
      let doc = rows.find((item) => matches(item, filter));
      if (!doc && options.upsert) {
        doc = new MockModel(filter);
        rows.push(doc);
      }
      if (doc) applyUpdate(doc, update);
      return doc;
    });
    MockModel.updateOne = jest.fn(async (filter = {}, update = {}, options = {}) => {
      let doc = rows.find((item) => matches(item, filter));
      const created = !doc && options.upsert;
      if (created) {
        doc = new MockModel(filter);
        rows.push(doc);
      }
      if (doc) applyUpdate(doc, update);
      return { modifiedCount: doc && !created ? 1 : 0, upsertedCount: created ? 1 : 0 };
    });
    MockModel.updateMany = jest.fn(async (filter = {}, update = {}) => {
      const docs = rows.filter((doc) => matches(doc, filter));
      docs.forEach((doc) => applyUpdate(doc, update));
      return { modifiedCount: docs.length };
    });
    MockModel.countDocuments = jest.fn(async (filter = {}) => rows.filter((doc) => matches(doc, filter)).length);
    MockModel.aggregate = jest.fn(async (pipeline = []) => aggregateRows(rows, pipeline));

    return MockModel;
  }

  return {
    connect: jest.fn().mockResolvedValue(true),
    connection: {
      close: jest.fn().mockResolvedValue(true)
    },
    Schema: MockSchema,
    model: jest.fn(createModel)
  };
});

// Mock config modules
jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  oracle: jest.fn()
}));

jest.mock('../src/config/contracts', () => ({
  getNetworkConfig: jest.fn().mockReturnValue({
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
    horizonUrl: 'https://horizon-testnet.stellar.org'
  }),
  CURRENT_NETWORK: 'testnet',
  DEPLOYED_CONTRACTS: {
    PREDICTION_MARKET_TEMPLATE: 'CB7HZPDQXQ7ZQOJ7EYV4NQJXK7EYV4NQJXK7EYV4NQJXK7EYV4NQJXK7EY'
  },
  XDR_HELPERS: {},
  getContractAddress: jest.fn().mockReturnValue('CA7D3F7B7D3F7B7D3F7B7D3F7B7D3F7B7D3F'),
  getContractFunction: jest.fn().mockReturnValue('test_function'),
  validateAllContracts: jest.fn().mockReturnValue(true)
}));

jest.mock('../src/config/database', () => ({
  connect: jest.fn().mockResolvedValue(true),
  disconnect: jest.fn().mockResolvedValue(true)
}));

// Global test utilities
global.testUtils = {
  createMockRequest: (overrides = {}) => ({
    params: {},
    query: {},
    body: {},
    user: null,
    headers: {},
    ...overrides
  }),
  createMockResponse: () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    res.set = jest.fn().mockReturnValue(res);
    return res;
  },
  createMockUser: (overrides = {}) => ({
    _id: 'user123',
    walletAddress: 'GABC123456789',
    email: 'test@example.com',
    createdAt: new Date(),
    ...overrides
  }),
  createMockMarket: (overrides = {}) => ({
    _id: 'market123',
    marketId: 'MKT001',
    question: 'Will BTC reach $100k by 2025?',
    description: 'Test market description',
    category: 'crypto',
    status: 'active',
    endDate: new Date('2025-12-31'),
    resolutionDate: new Date('2026-01-01'),
    outcomes: [
      { id: 'yes', label: 'Yes', probability: 0.5 },
      { id: 'no', label: 'No', probability: 0.5 }
    ],
    totalVolume: 10000,
    ...overrides
  })
};

// Suppress console during tests unless verbose
const originalConsole = global.console;
beforeAll(() => {
  if (!process.env.VERBOSE_TEST) {
    global.console = {
      ...originalConsole,
      log: jest.fn(),
      debug: jest.fn()
    };
  }
});

afterAll(() => {
  global.console = originalConsole;
});
