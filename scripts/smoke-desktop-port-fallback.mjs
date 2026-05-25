import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);

function getArg(name, fallback = '') {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] || fallback;
}

function getRepoRoot() {
  return path.resolve(process.cwd());
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createPortBlocker(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => socket.destroy());
    server.once('error', reject);
    server.listen({ exclusive: true, port }, () => resolve(server));
  });
}

function requestJson(url, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        try {
          resolve({ body: JSON.parse(body), status: response.statusCode ?? 0 });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy(new Error(`Timed out requesting ${url}`));
    });
  });
}

async function waitForHealth(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await requestJson(`http://127.0.0.1:${port}/health`);
      if (result.status === 200 && result.body?.ok === true) {
        return result.body;
      }
      lastError = new Error(`HTTP ${result.status}`);
    } catch (error) {
      lastError = error;
    }
    await wait(500);
  }
  throw new Error(
    `Desktop backend did not become healthy on ${port}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function closeServer(server) {
  await new Promise((resolve) => server.close(resolve));
}

function killProcessTree(pid) {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // Process already exited.
  }
}

async function main() {
  const repoRoot = getRepoRoot();
  const requestedPort = Number.parseInt(getArg('--requested-port', '8797'), 10);
  const expectedPort = Number.parseInt(getArg('--expected-port', String(requestedPort + 1)), 10);
  const timeoutMs = Number.parseInt(getArg('--timeout-ms', '40000'), 10);
  const exePath =
    getArg('--exe') || path.join(repoRoot, 'release', 'win-unpacked', 'WebWaifu 4.exe');

  if (!Number.isFinite(requestedPort) || !Number.isFinite(expectedPort)) {
    throw new Error('Ports must be valid numbers.');
  }
  if (!fs.existsSync(exePath)) {
    throw new Error(`Packaged EXE is missing: ${exePath}`);
  }

  const blocker = await createPortBlocker(requestedPort);
  let appProcess = null;
  try {
    appProcess = spawn(exePath, [], {
      cwd: path.dirname(exePath),
      detached: false,
      stdio: 'ignore',
      windowsHide: true,
    });

    const health = await waitForHealth(expectedPort, timeoutMs);
    console.log(
      JSON.stringify(
        {
          expectedPort,
          health,
          ok: true,
          requestedPort,
        },
        null,
        2,
      ),
    );
  } finally {
    await closeServer(blocker).catch(() => undefined);
    if (appProcess?.pid) {
      killProcessTree(appProcess.pid);
      await wait(1000);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
