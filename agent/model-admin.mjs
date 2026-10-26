import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stringify } from 'yaml';
import { agentDirectory, disabledTools } from './runtime.mjs';
export async function startModelAdmin({ home, publicUrl, key }) {
  const working = path.join(home, 'empty-workspace');
  await mkdir(working, { recursive: true, mode: 0o700 });
  const reservation = createServer();
  await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const patch = path.join(home, 'admin-guard.patch.yml');
  await writeFile(
    patch,
    stringify([
      ...[
        ...disabledTools,
        'workspace-files',
        'terminal-controller',
        'directory-picker',
        'cordis-host-runner',
        'cordis-client-runner',
        'ui-cordis',
        'plugin-manager',
        'tool-plugin-manager',
        'ui-plugin-manager',
        'entry-customization',
        'ui-settings-plugins',
        'ui-sidebar-files',
        'ui-sidebar-terminal',
        'ui-sidebar-documentpreview',
        'ui-open-in-app',
        'open-in-app',
      ].map((id) => ({ id, disabled: true })),
      {
        insert: [
          {
            id: 'qingsong-admin-guard',
            name: path.join(agentDirectory, 'teaching-plugin.mjs'),
          },
        ],
      },
    ]),
    { mode: 0o600 },
  );
  const child = spawn(
    process.execPath,
    [
      path.join(agentDirectory, 'node_modules/@deepseek-ai/dsh/lib/bin.js'),
      '--profile',
      'web',
      '--patch',
      patch,
      '--no-open',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--public-url',
      publicUrl,
      '--trusted-host',
      new URL(publicUrl).host,
    ],
    {
      cwd: working,
      env: {
        PATH: process.env.PATH,
        HOME: home,
        DSH_HOME: home,
        DSH_AGENTS_HOME: path.join(home, 'rules'),
        LANG: 'en_US.UTF-8',
        TZ: 'Asia/Shanghai',
        DSH_TELEMETRY_DISABLED: '1',
        QS_MODEL_KEY: key || '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  let exited = false;
  child.once('error', () => {
    if (!child.pid) exited = true;
  });
  child.once('exit', () => {
    exited = true;
  });
  child.stderr.on('data', () => {});
  let closing;
  const close = () =>
    (closing ??= (async () => {
      if (exited) return;
      await new Promise((resolve, reject) => {
        const kill = setTimeout(() => child.kill('SIGKILL'), 5000);
        const fail = setTimeout(
          () => reject(Error('ADMIN_EXIT_UNCONFIRMED')),
          10000,
        );
        child.once('exit', () => {
          clearTimeout(kill);
          clearTimeout(fail);
          resolve();
        });
        child.kill('SIGTERM');
      });
    })());
  let url;
  try {
    url = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error('MODEL_ADMIN_START_FAILED')),
        60000,
      );
      child.once('error', () => {
        clearTimeout(timer);
        reject(Error('MODEL_ADMIN_START_FAILED'));
      });
      child.once('exit', () => {
        clearTimeout(timer);
        reject(Error('MODEL_ADMIN_START_FAILED'));
      });
      child.stdout.on('data', (chunk) => {
        output = (
          output + chunk.toString().replace(/\x1b\[[0-9;]*m/g, '')
        ).slice(-32768);
        const urls =
          output
            .split('\n')
            .slice(0, -1)
            .join('\n')
            .match(/https?:\/\/[^\s<>"']+/g) || [];
        const match = urls.find(
          (u) =>
            u.startsWith(publicUrl) &&
            (u.includes('token=') || u.includes('auth=')),
        );
        if (match) {
          clearTimeout(timer);
          resolve(match);
        }
      });
    });
  } catch (error) {
    await close();
    throw error;
  }
  return { port, url, isAlive: () => !exited, close };
}
