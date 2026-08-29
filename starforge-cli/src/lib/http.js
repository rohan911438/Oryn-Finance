const axios = require('axios');

function createAxios({ baseURL, timeoutMs = 30000 } = {}) {
  return axios.create({
    baseURL,
    timeout: timeoutMs,
    headers: {
      Accept: 'application/json'
    }
  });
}

module.exports = { createAxios };

