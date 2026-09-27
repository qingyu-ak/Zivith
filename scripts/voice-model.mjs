#!/usr/bin/env node
// ADR-0017 V1 — 下载语音识别模型并做 sha256 校验(fail closed)。
// 校验不过 = 语音能力保持禁用;本脚本退出码非零,setup 中按尽力而为调用。
//
// 优先按单文件从 HuggingFace(镜像回退)下载 int8 文件(≈190MB);
// 全部失败再回退 GitHub 发布归档(≈511MB)解包。
// 模型规格(文件、sha256、镜像 URL)单一来源:scripts/voice-model.json。
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const spec = JSON.parse(readFileSync(path.join(scriptDir, 'voice-model.json'), 'utf8'));

const targetDir = process.env.ZIVITH_VOICE_MODEL_DIR
  ? path.resolve(process.env.ZIVITH_VOICE_MODEL_DIR)
  : path.join(repoRoot, '.voice-models', spec.modelId);

function sha256File(file) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolveHash(hash.digest('hex')));
  });
}

async function downloadTo(url, dest) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} for ${url}`);
  await pipeline(response.body, createWriteStream(dest));
}

async function verify(file, expected) {
  const actual = await sha256File(file);
  if (actual !== expected) {
    rmSync(file, { force: true });
    throw new Error(`sha256 mismatch for ${path.basename(file)}: ${actual}`);
  }
}

async function fetchArchiveAndExtract() {
  console.log('单文件源不可用,回退 GitHub 归档(≈511MB)…');
  mkdirSync(targetDir, { recursive: true });
  const tmp = mkdtempSync(path.join(targetDir, 'download-'));
  try {
    const archive = path.join(tmp, 'model.tar.bz2');
    const archiveUrl = spec.archive.url.replaceAll('{modelId}', spec.modelId);
    await downloadTo(archiveUrl, archive);
    const archiveHash = await sha256File(archive);
    if (archiveHash !== spec.archive.sha256) {
      throw new Error(`archive sha256 mismatch: ${archiveHash}`);
    }
    await execFileAsync('tar', ['-xf', archive, '-C', tmp]);
    const extracted = path.join(tmp, spec.modelId);
    for (const file of spec.files) {
      copyFileSync(path.join(extracted, file.name), path.join(targetDir, file.name));
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

let missing = 0;
for (const file of spec.files) {
  const dest = path.join(targetDir, file.name);
  if (existsSync(dest) && statSync(dest).size === file.bytes) {
    if ((await sha256File(dest)) === file.sha256) {
      console.log(`已就绪: ${file.name}`);
      continue;
    }
    console.log(`校验不符,重新下载: ${file.name}`);
  } else {
    console.log(`下载: ${file.name} (${(file.bytes / 1024 / 1024).toFixed(1)}MB)`);
  }
  mkdirSync(targetDir, { recursive: true });
  let lastError = null;
  for (const template of spec.fileSources) {
    const url = template.replaceAll('{modelId}', spec.modelId).replaceAll('{file}', file.name);
    try {
      await downloadTo(url, dest);
      await verify(dest, file.sha256);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      console.log(`  源失败: ${error.message}`);
    }
  }
  if (lastError) {
    missing += 1;
    console.error(`✗ ${file.name}: 所有镜像失败`);
  }
}

if (missing > 0) {
  try {
    await fetchArchiveAndExtract();
    for (const file of spec.files) {
      await verify(path.join(targetDir, file.name), file.sha256);
    }
    missing = 0;
  } catch (error) {
    console.error(`归档回退失败: ${error.message}`);
  }
}

if (missing > 0) {
  console.error('语音模型未就绪;语音输入将保持禁用(ADR-0017 fail closed)。');
  process.exit(1);
}
console.log(`语音模型已就绪: ${targetDir}`);
