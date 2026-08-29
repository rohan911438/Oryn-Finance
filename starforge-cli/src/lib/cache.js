const fs = require('fs');
const path = require('path');


function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function getCachePath({ cacheDir, key }) {
  const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(cacheDir, safeKey + '.json');
}

function isFresh(filePath, ttlSeconds) {
  if (!fs.existsSync(filePath)) return false;
  const stat = fs.statSync(filePath);
  const ageSeconds = (Date.now() - stat.mtimeMs) / 1000;
  return ageSeconds <= ttlSeconds;
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function getDefaultCacheDir() {
  const home = process.env.HOME || process.env.USERPROFILE;
  return path.join(home || '.', '.starforge', 'cache');
}

module.exports = {
  ensureDir,
  getCachePath,
  isFresh,
  readJson,
  writeJson,
  getDefaultCacheDir
};

