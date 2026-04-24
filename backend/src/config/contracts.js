/**
 * Oryn Finance - Deployed Contract Addresses and Configuration
 * 
 * This file serves as the single source of truth for all deployed 
 * Soroban smart contract addresses on Stellar testnet.
 * 
 * Contract addresses extracted from deployment logs:
 * Date: January 25, 2026
 */

const StellarSdk = require('stellar-sdk');

// Network Configuration
const NETWORK_CONFIG = {
  testnet: {
    network: 'testnet',
    passphrase: StellarSdk.Networks.TESTNET,
    horizonUrl: 'https://horizon-testnet.stellar.org',
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
  },
  mainnet: {
    network: 'mainnet',
    passphrase: StellarSdk.Networks.PUBLIC,
    horizonUrl: 'https://horizon.stellar.org',
    sorobanRpcUrl: 'https://soroban-rpc.stellar.org',
  }
};

// Current Network (defaults to testnet for development)
const CURRENT_NETWORK = process.env.STELLAR_NETWORK || 'testnet';

// Deployed Contract Addresses on Stellar Testnet
const DEPLOYED_CONTRACTS = {
  // Core Protocol Contracts
  MARKET_FACTORY: 'CCUENLYBXW3WTWBUD2TZLX3EWI7WFD223TW4LSBNQQ5W26B2Q2WNSM6M',
  PREDICTION_MARKET_TEMPLATE: 'CCDPJ2UFUE5WNDSCIRPXQAT2XU7JZEIJMRNKIO4ANT5MWJNKDXJ4JUQ7',
  AMM_POOL: 'CBVTPYDEAQJL377TFTF6YND4BCMMPR2NR2O22EDPQ77AG7AVCILGUTIA',
  ORACLE_RESOLVER: 'CDCL4MFB6RMCEAY32FOSQFFVDEQO3OXGCRP7YIUXCOVOAREYRQ2PMOOB',
  ACCESS_CONTROL: 'CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', // To be deployed

  // Governance & Token Contracts
  GOVERNANCE: 'CADJ4FBXLAZLGOASYLXDSQUV6ACB6EPVW2RBMYHUSUQUPOIM4CTFRKR5',
  REPUTATION: 'CCGZV643TWW6IGYKUHYYCJABYBNJ5DOAQJXJIQNIUAXBJSDIVADLJB37',
  PREDICTION_TOKEN: 'CCK6QOIU5U3BKRGXAX4O6FJFZVZZNTVQ6TTTJC3TAI4UYLYTSO6Z6HTZ',

  // Risk Management & Advanced Features
  INSURANCE: 'CAC647C2R33OCEHXUE3KWCBA4QTG5YYHCXJNLLG7JZ7NVQDSXOFZ25VS',
  ZK_VERIFIER: 'CD32VRK27G26QZNLT2AW35X7IVFPU76GAEOH5XLUH7XRROVH26GRSIOW',
  X402_INTEGRATION: 'CBKSOAE52ONGDTGGB6CAZAGYEKMJ54WFIDW3U6PBL4FUP75G2H3LWVHS',

  // Treasury Contract (to be deployed)
  TREASURY: process.env.TREASURY_CONTRACT || null,
};

// Contract Function Mappings
const CONTRACT_FUNCTIONS = {
  MARKET_FACTORY: {
    initialize: 'initialize',
    createMarket: 'create_market',
    getMarket: 'get_market',
    getAllMarkets: 'get_all_markets',
    pauseContract: 'pause_contract',
    unpauseContract: 'unpause_contract',
    grantUserRole: 'grant_user_role',
    revokeUserRole: 'revoke_user_role',
    blacklistUser: 'blacklist_user',
  },

  ACCESS_CONTROL: {
    initialize: 'initialize',
    grantRole: 'grant_role',
    revokeRole: 'revoke_role',
    hasPermission: 'has_permission',
    requirePermission: 'require_permission',
    checkRole: 'check_role',
    requireRole: 'require_role',
    pauseContract: 'pause_contract',
    unpauseContract: 'unpause_contract',
    blacklistUser: 'blacklist_user',
    unblacklistUser: 'unblacklist_user',
    getUserRole: 'get_user_role',
    getUserPermissions: 'get_user_permissions',
    getRoleMembers: 'get_role_members',
    getRolePermissions: 'get_role_permissions',
    isPaused: 'is_paused',
  },

  PREDICTION_MARKET: {
    initialize: 'initialize',
    buy: 'buy',
    sell: 'sell',
    resolve: 'resolve',
    claim: 'claim',
    getPosition: 'get_position',
    getMarket: 'get_market',
  },

  AMM_POOL: {
    initialize: 'initialize',
    addLiquidity: 'add_liquidity',
    swap: 'swap',
    getPrice: 'get_price',
    getReserves: 'get_reserves',
  },

  ORACLE_RESOLVER: {
    initialize: 'initialize',
    registerOracle: 'register_oracle',
    submitResolution: 'submit_resolution',
    finalize: 'finalize',
    dispute: 'dispute',
  },

  GOVERNANCE: {
    initialize: 'initialize',
    stake: 'stake',
    propose: 'propose',
    vote: 'vote',
    execute: 'execute',
  },

  REPUTATION: {
    initialize: 'initialize',
    updateReputation: 'update_reputation',
    getReputation: 'get_reputation',
  },

  INSURANCE: {
    initialize: 'initialize',
    purchaseInsurance: 'purchase_insurance',
    submitClaim: 'submit_claim',
    assessMarketRisk: 'assess_market_risk',
  },

  ZK_VERIFIER: {
    initialize: 'initialize',
    registerVerificationKey: 'register_verification_key',
    verifyPredictionProof: 'verify_prediction_proof',
    revealPrediction: 'reveal_prediction',
  },

  X402_INTEGRATION: {
    submitPrivateOrder: 'submit_private_order',
    batchOrders: 'batch_orders',
    executeOrder: 'execute_order',
  },
};

// Contract Event Types for Indexing
const CONTRACT_EVENTS = {
  MARKET_CREATED: 'market_created',
  MARKET_RESOLVED: 'market_resolved',
  TRADE_EXECUTED: 'trade_executed',
  LIQUIDITY_ADDED: 'liquidity_added',
  ORACLE_PROPOSED: 'oracle_proposed',
  ORACLE_DISPUTED: 'oracle_disputed',
  ORACLE_FINALIZED: 'oracle_finalized',
  PROPOSAL_CREATED: 'proposal_created',
  VOTE_CAST: 'vote_cast',
  REPUTATION_UPDATED: 'reputation_updated',
  INSURANCE_PURCHASED: 'insurance_purchased',
  CLAIM_SUBMITTED: 'claim_submitted',
  PRIVATE_ORDER_SUBMITTED: 'private_order_submitted',
  ZK_PROOF_VERIFIED: 'zk_proof_verified',
};

// XDR Argument Helper Functions
const XDR_HELPERS = {
  /**
   * Convert JavaScript values to Stellar XDR ScVals
   */
  toXdr: {
    string: (value) => StellarSdk.nativeToScVal(value, { type: 'string' }),
    number: (value) => StellarSdk.nativeToScVal(value, { type: 'i128' }),
    bigint: (value) => StellarSdk.nativeToScVal(value, { type: 'i128' }),
    boolean: (value) => StellarSdk.nativeToScVal(value, { type: 'bool' }),
    address: (value) => StellarSdk.nativeToScVal(value, { type: 'address' }),
    bytes: (value) => StellarSdk.nativeToScVal(value, { type: 'bytes' }),
    symbol: (value) => StellarSdk.nativeToScVal(value, { type: 'symbol' }),
  },

  /**
   * Convert XDR ScVals back to JavaScript values
   */
  fromXdr: {
    string: (scval) => StellarSdk.scValToNative(scval),
    number: (scval) => StellarSdk.scValToNative(scval),
    boolean: (scval) => StellarSdk.scValToNative(scval),
    address: (scval) => StellarSdk.scValToNative(scval),
    bytes: (scval) => StellarSdk.scValToNative(scval),
  }
};

// Validation Functions
const validateContractAddress = (address) => {
  try {
    StellarSdk.StrKey.decodeContract(address);
    return true;
  } catch (error) {
    return false;
  }
};

const validateAllContracts = () => {
  const invalidContracts = [];

  Object.entries(DEPLOYED_CONTRACTS).forEach(([name, address]) => {
    if (address && !validateContractAddress(address)) {
      invalidContracts.push({ name, address });
    }
  });

  if (invalidContracts.length > 0) {
    console.warn('Invalid contract addresses found:', invalidContracts);
  }

  return invalidContracts.length === 0;
};

// Contract Helper Functions
const getContractAddress = (contractName) => {
  const address = DEPLOYED_CONTRACTS[contractName];
  if (!address) {
    throw new Error(`Contract ${contractName} not found or not deployed`);
  }
  if (!validateContractAddress(address)) {
    throw new Error(`Invalid contract address for ${contractName}: ${address}`);
  }
  return address;
};

const getNetworkConfig = (network = CURRENT_NETWORK) => {
  const config = NETWORK_CONFIG[network];
  if (!config) {
    throw new Error(`Network configuration not found for: ${network}`);
  }
  return config;
};

const getContractFunction = (contractName, functionName) => {
  const functions = CONTRACT_FUNCTIONS[contractName];
  if (!functions) {
    throw new Error(`No functions defined for contract: ${contractName}`);
  }

  const actualFunction = functions[functionName];
  if (!actualFunction) {
    throw new Error(`Function ${functionName} not found for contract ${contractName}`);
  }

  return actualFunction;
};

// Export Configuration
module.exports = {
  // Core Configuration
  NETWORK_CONFIG,
  CURRENT_NETWORK,
  DEPLOYED_CONTRACTS,
  CONTRACT_FUNCTIONS,
  CONTRACT_EVENTS,
  XDR_HELPERS,

  // Helper Functions
  validateContractAddress,
  validateAllContracts,
  getContractAddress,
  getNetworkConfig,
  getContractFunction,

  // Commonly Used Values
  STELLAR_TESTNET_PASSPHRASE: StellarSdk.Networks.TESTNET,
  STELLAR_MAINNET_PASSPHRASE: StellarSdk.Networks.PUBLIC,
  SOROBAN_RPC_URL: getNetworkConfig().sorobanRpcUrl,
  HORIZON_URL: getNetworkConfig().horizonUrl,

  // Contract Categories for Easy Access
  CORE_CONTRACTS: [
    'MARKET_FACTORY',
    'PREDICTION_MARKET_TEMPLATE',
    'AMM_POOL',
    'ORACLE_RESOLVER'
  ],

  GOVERNANCE_CONTRACTS: [
    'GOVERNANCE',
    'REPUTATION',
    'PREDICTION_TOKEN'
  ],

  ADVANCED_CONTRACTS: [
    'INSURANCE',
    'ZK_VERIFIER',
    'X402_INTEGRATION'
  ]
};

// Validate all contracts on module load
validateAllContracts();