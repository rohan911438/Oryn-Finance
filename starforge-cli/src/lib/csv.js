const fs = require('fs');
const path = require('path');
const { Parser } = require('json2csv');

function exportJson(json, { outputPath } = {}) {
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(json, null, 2), 'utf8');
  }
  return json;
}

function exportCsv(rows, { outputPath } = {}) {
  // rows: array of flat objects
  if (!rows || rows.length === 0) {
    if (outputPath) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, '', 'utf8');
    }
    return '';
  }

  const fields = Object.keys(rows[0]);
  const opts = { fields };
  const parser = new Parser(opts);
  const csv = parser.parse(rows);

  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, csv, 'utf8');
  }
  return csv;
}

module.exports = { exportJson, exportCsv };

