const path = require('path');
const fs = require('fs');
const { exportJson, exportCsv } = require('./csv');
const { flatten } = require('../utils/flatten');

function writeOutput({ exportFormat, output, payload }) {
  if (!output) return { exported: false };

  const ext = path.extname(output).toLowerCase();
  const format = exportFormat || (ext === '.csv' ? 'csv' : 'json');

  if (format === 'csv') {
    const rows = Array.isArray(payload) ? payload : payload?.rows || [];
    const flatRows = rows.map((r) => flatten(r));
    exportCsv(flatRows, { outputPath: output });
    return { exported: true, format: 'csv', output };
  }

  exportJson(payload, { outputPath: output });
  return { exported: true, format: 'json', output };
}

module.exports = { writeOutput };

