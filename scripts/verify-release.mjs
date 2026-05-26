import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exePath = path.join(repoRoot, 'release', 'win-unpacked', 'WebWaifu 4.exe');

function getArg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n$ ${options.label ?? [command, ...args].join(' ')}`);
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env, ...(options.env ?? {}) },
      shell: options.shell ?? process.platform === 'win32',
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with ${signal ?? code}`));
    });
  });
}

function getJson(url, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('timeout', () => {
      request.destroy(new Error(`Timed out fetching ${url}`));
    });
    request.on('error', reject);
  });
}

async function waitForHealth(port, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      await getJson(`http://127.0.0.1:${port}/health`);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(
    `Packaged backend did not become healthy on ${port}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function killPackagedRuntime() {
  const escapedRoot = repoRoot.replace(/'/g, "''");
  const command = `
$ProgressPreference = 'SilentlyContinue'
$releaseRoot = '${escapedRoot}\\release\\win-unpacked\\*'
$desktopRuntimeNode = '${escapedRoot}\\release\\win-unpacked\\resources\\desktop-runtime\\node.exe'
$targets = Get-Process | Where-Object {
  ($_.ProcessName -eq 'WebWaifu 4' -and $_.Path -like $releaseRoot) -or
  ($_.ProcessName -eq 'node' -and $_.Path -like $desktopRuntimeNode) -or
  ($_.Path -like $releaseRoot)
}
if ($targets) {
  $targets | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
}
`;
  const encoded = Buffer.from(command, 'utf16le').toString('base64');
  await run(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-OutputFormat',
      'Text',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encoded,
    ],
    {
      label: 'stop packaged WebWaifu runtime',
      shell: false,
    },
  );
}

async function runPackagedAiSmoke(backupPath) {
  await killPackagedRuntime();
  const child = spawn(exePath, [], {
    cwd: repoRoot,
    detached: false,
    shell: false,
    stdio: 'ignore',
    windowsHide: true,
  });
  try {
    await waitForHealth(8797);
    await run('npm', ['run', 'smoke:packaged-ai', '--', '--backup', backupPath]);
  } finally {
    if (!child.killed) {
      child.kill();
    }
    await killPackagedRuntime();
  }
}

async function main() {
  const backupPath = getArg('--backup') || process.env.WEBWAIFU_RELEASE_BACKUP || '';
  const skipPackagedAi = hasFlag('--skip-packaged-ai');
  if (!skipPackagedAi && !backupPath) {
    throw new Error(
      'Missing --backup. Pass --backup <local-transfer-backup.json>, set WEBWAIFU_RELEASE_BACKUP, or use --skip-packaged-ai.',
    );
  }

  await run('git', ['diff', '--check']);
  await run('npx', ['tsc', '--noEmit']);
  await run('npm', ['test', '--', '--run']);
  await run('npm', ['run', 'probe:ladybug-memory']);
  await killPackagedRuntime();
  await run('npm', ['run', 'desktop:pack']);
  await killPackagedRuntime();
  await run('npm', ['run', 'smoke:packaged-ui']);
  await run('npm', ['run', 'smoke:packaged-ui:desktop']);
  await run('npm', ['run', 'smoke:desktop-port-fallback']);
  await run('npm', ['run', 'smoke:desktop-relaunch']);
  if (!skipPackagedAi) {
    await runPackagedAiSmoke(backupPath);
  }
}

main().catch(async (error) => {
  await killPackagedRuntime().catch(() => {});
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
