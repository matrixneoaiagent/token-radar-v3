// Local replica of the seven-row token-radar-01 gate. It is not the sealed scorer; it checks the
// same contract against the same snapshot so a build can be verified before it is handed over.
//
//   node tools/gate.mjs --out out --snapshot ../token-radar/token-radar-01-kit/input/snapshot.json

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildDossier } from '../vendor/makefun-board.ts';

const args = process.argv.slice(2);
function arg(name, fallback) {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && at + 1 < args.length ? args[at + 1] : fallback;
}
const out = arg('out', 'out');
const snapshotPath = arg('snapshot', '../token-radar/token-radar-01-kit/input/snapshot.json');
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));

const PLAIN = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const IMAGE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const HTTP = /https?:\/\//i;
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(18)} ${detail}\n`);
}

/** Every regular file under `dir`, relative, skipping names that start with a dot. */
function walk(dir, base = dir, found = []) {
  if (!existsSync(dir)) return found;
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const path = join(dir, name);
    const st = lstatSync(path);
    if (st.isDirectory()) walk(path, base, found);
    else found.push({ path, rel: relative(base, path), st });
  }
  return found;
}

function checkDashboardFiles() {
  const dir = join(out, 'dashboard');
  if (!existsSync(dir)) return record('dashboard_files', false, 'dashboard/ is missing');
  const files = walk(dir);
  if (!files.some((f) => f.rel === 'index.html')) return record('dashboard_files', false, 'dashboard/index.html is missing');
  if (!files.some((f) => f.rel.endsWith('.css'))) return record('dashboard_files', false, 'dashboard/ has no .css file');
  if (!files.some((f) => f.rel.endsWith('.js'))) return record('dashboard_files', false, 'dashboard/ has no .js file');
  if (files.length > 400) return record('dashboard_files', false, `dashboard/ holds ${files.length} files, over 400`);
  let bytes = 0;
  for (const f of files) {
    bytes += f.st.size;
    if (!f.st.isFile()) return record('dashboard_files', false, `${f.rel} is not a regular file`);
    if (!PLAIN.test(f.rel.split('/').pop())) return record('dashboard_files', false, `${f.rel}: name is not letters, digits and . _ -`);
    const relParts = f.rel.split('/');
    if (relParts.slice(0, -1).some((p) => p.startsWith('.'))) return record('dashboard_files', false, `${f.rel}: dot directory`);
  }
  if (bytes > 4_194_304) return record('dashboard_files', false, `dashboard/ holds ${bytes} bytes, over 4 MiB`);

  function scanText(rel, text) {
    if (rel.endsWith('.html')) {
      // Attribute values, style bodies and inline-script imports.
      const attr = /=\s*(?:"([^"]*)"|'([^']*)')/g;
      let m;
      while ((m = attr.exec(text)) !== null) {
        const value = m[1] ?? m[2] ?? '';
        if (HTTP.test(value)) return `${rel}: an attribute value names a network address`;
      }
      const style = /<style[^>]*>([\s\S]*?)<\/style>/gi;
      while ((m = style.exec(text)) !== null) {
        if (HTTP.test(m[1])) return `${rel}: a <style> body names a network address`;
      }
      const script = /<script[^>]*>([\s\S]*?)<\/script>/gi;
      while ((m = script.exec(text)) !== null) {
        if (/\b(?:import|export)\s+[^;]*?from\s*['"]https?:\/\//i.test(m[1]) || /\bimport\s*\(\s*['"]https?:\/\//i.test(m[1])) {
          return `${rel}: an inline script import names a network address`;
        }
      }
    }
    if (rel.endsWith('.css')) {
      if (HTTP.test(text)) return `${rel}: a CSS file names a network address`;
    }
    if (rel.endsWith('.js') || rel.endsWith('.mjs')) {
      if (/\b(?:import|export)\s+(?:[^'"]*?\s+from\s*)?['"]https?:\/\//i.test(text)) return `${rel}: an import names a network address`;
      if (/\brequire\s*\(\s*['"]https?:\/\//i.test(text)) return `${rel}: a require names a network address`;
      if (/\bimport\s*\(\s*['"]https?:\/\//i.test(text)) return `${rel}: a dynamic import names a network address`;
    }
    return null;
  }
  for (const f of files) {
    const ext = f.rel.split('.').pop();
    if (!['html', 'css', 'js', 'mjs'].includes(ext)) continue;
    const issue = scanText(f.rel, readFileSync(f.path, 'utf8'));
    if (issue !== null) return record('dashboard_files', false, issue);
  }
  record('dashboard_files', true, `${files.length} files, ${bytes} bytes, no network address`);
}

function boardRows() {
  const raw = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8'));
  return Array.isArray(raw) ? raw : raw.rows;
}
function checkBoardFile() {
  const path = join(out, 'board.json');
  if (!existsSync(path)) return record('board_file', false, 'board.json is missing');
  const size = statSync(path).size;
  if (size > 8 * 1024 * 1024) return record('board_file', false, `board.json is ${size} bytes, over 8 MiB`);
  let rows;
  try { rows = boardRows(); } catch { return record('board_file', false, 'board.json is not UTF-8 JSON'); }
  if (!Array.isArray(rows)) return record('board_file', false, 'board.json has no rows array');
  if (rows.length < 100 || rows.length > 4000) return record('board_file', false, `board holds ${rows.length} rows, not 100 to 4000`);
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set();
  for (const [i, r] of rows.entries()) {
    if (typeof r.slug !== 'string' || r.slug.length < 1 || r.slug.length > 128 || /\s/.test(r.slug)) return record('board_file', false, `row ${i + 1} has an invalid slug`);
    if (!known.has(r.slug)) return record('board_file', false, `row ${i + 1} names a slug the snapshot does not list: ${r.slug}`);
    if (seen.has(r.slug)) return record('board_file', false, `slug ${r.slug} appears twice`);
    seen.add(r.slug);
    if (typeof r.name !== 'string' || r.name.length === 0) return record('board_file', false, `${r.slug} has no name`);
    if (!Number.isSafeInteger(r.rank) || r.rank <= 0) return record('board_file', false, `${r.slug} has rank ${r.rank}`);
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) return record('board_file', false, `${r.slug} has implied value ${r.implied_value_usd}`);
    if (!Array.isArray(r.farm_steps)) return record('board_file', false, `${r.slug} has no farm_steps array`);
  }
  const values = new Set(rows.map((r) => r.implied_value_usd));
  if (rows.length >= 2 && values.size === 1) return record('board_file', false, 'every row has the same implied value');
  record('board_file', true, `${rows.length} rows, ${size} bytes`);
}
function checkSortedByValue() {
  const rows = boardRows();
  const ranks = rows.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return record('sorted_by_value', false, `rank ${i + 1} is ${ranks[i]}`);
  }
  const byRank = rows.slice().sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) {
    if (byRank[i].implied_value_usd > byRank[i - 1].implied_value_usd) {
      return record('sorted_by_value', false, `rank ${byRank[i].rank} has ${byRank[i].implied_value_usd}, above rank ${byRank[i - 1].rank}'s ${byRank[i - 1].implied_value_usd}`);
    }
  }
  if (byRank.length >= 2 && byRank[0].implied_value_usd === byRank[byRank.length - 1].implied_value_usd) {
    return record('sorted_by_value', false, 'every row has the same implied value');
  }
  record('sorted_by_value', true, `ranks 1..${rows.length}, implied value non-increasing`);
}
function checkCoverage() {
  const rows = boardRows();
  const have = new Set(rows.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !have.has(s));
  if (missing.length > 0) return record('coverage', false, `${missing.length} watchlist slugs missing: ${missing.slice(0, 5).join(', ')}`);
  record('coverage', true, `${snapshot.watchlist.length} / ${snapshot.watchlist.length} watchlist slugs present`);
}
function checkFarmSteps() {
  const rows = boardRows();
  for (const r of rows) {
    if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) return record('farm_steps', false, `${r.slug} has ${Array.isArray(r.farm_steps) ? r.farm_steps.length : 'no'} farm steps`);
    for (const s of r.farm_steps) {
      if (typeof s !== 'string') return record('farm_steps', false, `${r.slug} has a non-string farm step`);
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return record('farm_steps', false, `${r.slug} has a farm step of ${t.length} characters`);
    }
  }
  record('farm_steps', true, `${rows.length} rows, 3..12 steps, 20..600 characters each`);
}

function pngSize(buf) {
  if (buf.length < 24) return null;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(sig)) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height, whole: buf.includes(Buffer.from('IEND')) };
}
function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  let width = 0;
  let height = 0;
  while (i + 3 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0xd9) { i += 2; continue; }
    if (i + 4 > buf.length) break;
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) break;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      height = buf.readUInt16BE(i + 5);
      width = buf.readUInt16BE(i + 7);
      break;
    }
    i += 2 + len;
  }
  const whole = buf.length > 4 && buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9;
  return width > 0 && height > 0 ? { width, height, whole } : null;
}
function checkScreenshots() {
  const dir = join(out, 'screenshots');
  if (!existsSync(dir)) return record('screenshots', false, 'screenshots/ is missing');
  const names = readdirSync(dir).filter((n) => !n.startsWith('.'));
  if (names.length < 3 || names.length > 4) return record('screenshots', false, `${names.length} images, not 3 or 4`);
  for (const name of names) {
    if (!IMAGE.test(name)) return record('screenshots', false, `${name}: name is not letters, digits and . _ -`);
    const path = join(dir, name);
    if (!lstatSync(path).isFile()) return record('screenshots', false, `${name} is not a regular file`);
    if (statSync(path).size > 524_288) return record('screenshots', false, `${name} is over 512 KiB`);
    const buf = readFileSync(path);
    const dims = name.toLowerCase().endsWith('.png') ? pngSize(buf) : jpegSize(buf);
    if (dims === null || !dims.whole) return record('screenshots', false, `${name} is not a whole PNG or JPEG`);
    const long = Math.max(dims.width, dims.height);
    const short = Math.min(dims.width, dims.height);
    if (long > 1440) return record('screenshots', false, `${name} is ${dims.width}x${dims.height}, long side over 1440`);
    if (short < 800) return record('screenshots', false, `${name} is ${dims.width}x${dims.height}, short side under 800`);
  }
  record('screenshots', true, `${names.length} images, within 512 KiB and 1440x800`);
}
async function checkDossier() {
  const path = join(out, 'dossier.json');
  if (!existsSync(path)) return record('dossier_matches', false, 'dossier.json is missing');
  const want = Buffer.from(buildDossier(out, { text_max_bytes: 65_536 }));
  const got = readFileSync(path);
  const same = want.length === got.length && want.equals(got);
  if (!same) return record('dossier_matches', false, `dossier.json differs from buildDossier (${got.length} vs ${want.length} bytes)`);
  record('dossier_matches', true, `${got.length} bytes, byte-identical to buildDossier`);
}

checkDashboardFiles();
checkBoardFile();
checkSortedByValue();
checkCoverage();
checkFarmSteps();
checkScreenshots();
await checkDossier();

const failed = results.filter((r) => !r.ok);
process.stdout.write(`\n${results.length - failed.length}/${results.length} checks pass${failed.length ? `: ${failed.map((f) => f.name).join(', ')}` : ''}\n`);
process.exit(failed.length === 0 ? 0 : 1);
