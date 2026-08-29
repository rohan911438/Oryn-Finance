const axios = require('./http').createAxios;

const { createAxios } = require('./http');

function parseError(err) {
  return {
    message: err?.message || String(err),
    status: err?.response?.status,
    data: err?.response?.data
  };
}

async function getSorobanTransaction({ rpcUrl, txHash }) {
  // Soroban RPC (stellar rpc) is not standardized as a single endpoint, but common pattern is:
  // POST { jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [txHash] }
  // We use 'getTransaction' per task requirement.
  const client = createAxios({ baseURL: rpcUrl });
  const resp = await client.post('/', {
    jsonrpc: '2.0',
    id: 1,
    method: 'getTransaction',
    params: [txHash]
  });

  return resp.data?.result;
}

module.exports = {
  getSorobanTransaction,
  parseError
};

