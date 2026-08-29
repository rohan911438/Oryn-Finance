const { createAxios } = require('./http');

async function getContractTransactions({ horizonUrl, contractId, limit = 200, order = 'desc' }) {
  const client = createAxios({ baseURL: horizonUrl });
  // /accounts/{contract_id}/transactions?limit=200&order=desc
  const resp = await client.get(`/accounts/${contractId}/transactions`, {
    params: { limit, order }
  });

  // Horizon returns embedded transactions: { _embedded: { records: [...] } }
  const records = resp.data?._embedded?.records || [];
  return records;
}

module.exports = { getContractTransactions };

