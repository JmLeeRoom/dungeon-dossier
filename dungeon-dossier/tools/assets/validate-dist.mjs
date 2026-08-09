import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ASSETS_ROOT = path.join(PROJECT_ROOT, 'assets');
const DIST_ROOT = path.join(PROJECT_ROOT, 'dist');

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(target)));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

function relativePosix(root, file) {
  return path.relative(root, file).replaceAll('\\', '/');
}

async function digest(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

function groupByDigest(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const paths = grouped.get(row.digest) ?? [];
    paths.push(row.path);
    grouped.set(row.digest, paths);
  }
  return grouped;
}

async function main() {
  if (!(await stat(DIST_ROOT).catch(() => undefined))?.isDirectory()) {
    throw new Error('dist/ does not exist; run the Vite build first.');
  }

  const sourceFiles = await filesBelow(ASSETS_ROOT);
  const distFiles = await filesBelow(DIST_ROOT);
  const sourcePngCandidates = sourceFiles.filter(
    (file) => path.extname(file).toLowerCase() === '.png',
  );
  const sourcePngs = sourcePngCandidates.filter((file) => path.extname(file) === '.png');
  const distPngCandidates = distFiles.filter((file) => path.extname(file).toLowerCase() === '.png');
  const invalidCase = distPngCandidates.filter((file) => path.extname(file) !== '.png');
  const forbidden = distFiles.filter((file) => {
    const relative = relativePosix(DIST_ROOT, file);
    const extension = path.extname(file).toLowerCase();
    return extension === '.psd' || extension === '.pur' ||
      relative.toLowerCase().split('/').includes('ref');
  });

  const [sourceRows, distRows] = await Promise.all([
    Promise.all(
      sourcePngs.map(async (file) => ({
        path: relativePosix(ASSETS_ROOT, file),
        digest: await digest(file),
      })),
    ),
    Promise.all(
      distPngCandidates.map(async (file) => ({
        path: relativePosix(DIST_ROOT, file),
        digest: await digest(file),
      })),
    ),
  ]);
  const sourceByDigest = groupByDigest(sourceRows);
  const distByDigest = groupByDigest(distRows);
  const duplicateDistDigests = [...distByDigest].filter(([, paths]) => paths.length > 1);
  const missingDigests = [...sourceByDigest.keys()].filter((hash) => !distByDigest.has(hash));
  const extraDigests = [...distByDigest.keys()].filter((hash) => !sourceByDigest.has(hash));
  const problems = [];

  const invalidSourceCase = sourcePngCandidates.filter((file) => path.extname(file) !== '.png');
  if (invalidSourceCase.length > 0) {
    problems.push(
      `uppercase source PNG extensions: ${invalidSourceCase.map((file) => relativePosix(ASSETS_ROOT, file)).join(', ')}`,
    );
  }
  if (await stat(path.join(DIST_ROOT, 'assets')).catch(() => undefined)) {
    problems.push('dist/assets exists; source assets must not be copied beside hashed Vite output');
  }
  if (invalidCase.length > 0) {
    problems.push(`uppercase PNG extensions: ${invalidCase.map((file) => relativePosix(DIST_ROOT, file)).join(', ')}`);
  }
  if (forbidden.length > 0) {
    problems.push(`forbidden dist files: ${forbidden.map((file) => relativePosix(DIST_ROOT, file)).join(', ')}`);
  }
  if (duplicateDistDigests.length > 0) {
    problems.push(
      `duplicate PNG digest groups: ${duplicateDistDigests.map(([, paths]) => paths.join(' = ')).join('; ')}`,
    );
  }
  if (missingDigests.length > 0) {
    problems.push(`source PNG digests absent from dist: ${missingDigests.length}`);
  }
  if (extraDigests.length > 0) {
    problems.push(`dist PNG digests absent from assets/: ${extraDigests.length}`);
  }
  if (distRows.length !== sourceByDigest.size) {
    problems.push(
      `dist emits ${distRows.length} PNGs for ${sourceByDigest.size} unique source PNG digests`,
    );
  }

  if (problems.length > 0) {
    throw new Error(`Distribution asset validation failed:\n- ${problems.join('\n- ')}`);
  }

  console.log(
    `Distribution assets OK (${sourceRows.length} source PNGs, ` +
      `${sourceByDigest.size} unique digests, ${distRows.length} hashed outputs, 0 duplicates).`,
  );
}

await main();
