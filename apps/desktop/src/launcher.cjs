const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const WEB_URL = process.env.ZIVITH_WEB_URL ?? 'http://127.0.0.1:3100';
const WEB_PORT = Number(new URL(WEB_URL).port || 80);
const START_TIMEOUT_MS = 180_000;

function isRepoRoot(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    return pkg.name === 'zivith' && Boolean(pkg.scripts?.desktop);
  } catch {
    return false;
  }
}

function walkUp(start) {
  let current = path.resolve(start);
  for (let i = 0; i < 10; i += 1) {
    if (isRepoRoot(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function findRepoRoot() {
  const envRoot = process.env.ZIVITH_ROOT?.trim();
  if (envRoot && isRepoRoot(envRoot)) return envRoot;
  const starts = [
    process.cwd(),
    path.join(__dirname, '..'),
    path.join(__dirname, '../..'),
    path.join(__dirname, '../../..'),
    path.dirname(process.execPath),
  ];
  for (const start of starts) {
    const found = walkUp(start);
    if (found) return found;
  }
  return null;
}

function withLaunchPath(env) {
  const extras = [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : '',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'pnpm') : '',
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'nodejs') : '',
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Docker', 'Docker', 'resources', 'bin') : '',
  ].filter(Boolean);
  const current = env.PATH || env.Path || '';
  const existingNodeOptions = env.NODE_OPTIONS ?? '';
  const nodeOptions = /\b--max-old-space-size=/.test(existingNodeOptions)
    ? existingNodeOptions
    : [existingNodeOptions, '--max-old-space-size=8192'].filter(Boolean).join(' ');
  return {
    ...env,
    npm_config_engine_strict: 'false',
    NODE_OPTIONS: nodeOptions,
    PATH: [...extras, current].join(path.delimiter),
  };
}

function resolvePnpm() {
  const candidates = [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'npm', 'pnpm.cmd') : '',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'pnpm', 'pnpm.cmd') : '',
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'nodejs', 'pnpm.cmd') : '',
  ].filter(Boolean);
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function desktopLogPath(repoRoot) {
  return path.join(repoRoot, '.data', 'zivith-desktop.log');
}

function probeTcp(port) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const socket = net.connect({ host: '127.0.0.1', port }, () => {
      socket.end();
      finish(true);
    });
    socket.setTimeout(400, () => {
      socket.destroy();
      finish(false);
    });
    socket.on('error', () => {
      socket.destroy();
      finish(false);
    });
  });
}

function waitForTcp(timeoutMs, onTick) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    let settled = false;
    const succeed = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const attempt = async () => {
      if (settled) return;
      if (Date.now() - started > timeoutMs) {
        fail(new Error(`等待 ${WEB_URL} 超时`));
        return;
      }
      if (onTick) onTick();
      if (await probeTcp(WEB_PORT)) {
        succeed();
        return;
      }
      setTimeout(() => {
        void attempt();
      }, 400);
    };
    void attempt();
  });
}

function spawnHidden(command, args, options) {
  return spawn(command, args, {
    shell: true,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function stopProcessTree(child) {
  if (!child?.pid || child.killed) return;
  if (process.platform === 'win32') {
    spawnHidden('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    return;
  }
  child.kill('SIGTERM');
}

function ensureDocker(repoRoot, onStatus) {
  onStatus('正在启动本地数据库…');
  return new Promise((resolve) => {
    const child = spawnHidden(
      'docker',
      ['compose', 'up', '-d', 'postgres', 'redis', 'minio'],
      { cwd: repoRoot, env: withLaunchPath(process.env) },
    );
    child.stdout?.resume();
    child.stderr?.resume();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    child.on('error', finish);
    child.on('exit', finish);
    setTimeout(finish, 20_000);
  });
}

function attachLog(child, logPath) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const stream = fs.createWriteStream(logPath, { flags: 'a' });
  stream.write(`\n--- ${new Date().toISOString()} ---\n`);
  const chunks = [];
  const onData = (chunk) => {
    stream.write(chunk);
    chunks.push(String(chunk));
    if (chunks.length > 40) chunks.shift();
  };
  child.stdout?.on('data', onData);
  child.stderr?.on('data', onData);
  child.on('close', () => stream.end());
  return {
    tail() {
      return chunks.join('').trim().slice(-800);
    },
  };
}

function startDevServers(repoRoot) {
  const pnpm = resolvePnpm();
  const quoted = pnpm.includes(' ') ? `"${pnpm}"` : pnpm;
  const command = `${quoted} --config.engine-strict=false --filter @zivith/api --filter @zivith/web --parallel run dev`;
  return spawnHidden(command, [], {
    cwd: repoRoot,
    env: withLaunchPath(process.env),
  });
}

async function prepareApp({ onStatus }) {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    throw new Error('找不到 Zivith 仓库。请从仓库目录启动，或设置 ZIVITH_ROOT。');
  }
  const logPath = desktopLogPath(repoRoot);
  await ensureDocker(repoRoot, onStatus);
  onStatus('正在启动应用…');
  let child = null;
  let keepChild = false;
  if (!(await probeTcp(WEB_PORT))) {
    child = startDevServers(repoRoot);
    const log = attachLog(child, logPath);
    child.on('error', (error) => {
      onStatus(error instanceof Error ? error.message : '无法启动 pnpm');
    });
    onStatus('正在编译界面…');
    try {
      await waitForTcp(START_TIMEOUT_MS, () => {
        onStatus('正在编译界面…');
      });
    } catch (error) {
      keepChild = true;
      const detail = log.tail();
      const suffix = detail ? `\n${detail}` : '';
      throw new Error(
        `${error instanceof Error ? error.message : '启动失败'}。界面还在后台编译，请稍等再打开一次。日志：${logPath}${suffix}`,
      );
    }
  }
  return { repoRoot, child, keepChild, webUrl: WEB_URL, logPath };
}

module.exports = {
  WEB_URL,
  WEB_PORT,
  findRepoRoot,
  prepareApp,
  stopProcessTree,
};

if (require.main === module && process.argv.includes('--check')) {
  const root = findRepoRoot();
  process.stdout.write(`${root ?? '(not found)'}\n`);
  process.exit(root ? 0 : 1);
}
