function flatten(obj, prefix = '', out = {}) {
  if (obj === null || obj === undefined) return out;
  if (typeof obj !== 'object') {
    out[prefix] = obj;
    return out;
  }

  if (Array.isArray(obj)) {
    out[prefix] = JSON.stringify(obj);
    return out;
  }

  for (const [k, v] of Object.entries(obj)) {
    const nextPrefix = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, nextPrefix, out);
    } else {
      out[nextPrefix] = v;
    }
  }
  return out;
}

module.exports = { flatten };

