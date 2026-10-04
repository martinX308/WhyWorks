import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
const bundled = join(
  homedir(),
  '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node',
);
const executable =
  process.env.NODE24_BIN ||
  (Number(process.versions.node.split('.')[0]) >= 24
    ? process.execPath
    : existsSync(bundled)
      ? bundled
      : null);
if (!executable) {
  console.error('Node >=24 erforderlich. NODE24_BIN setzen oder Node 24 in PATH verwenden.');
  process.exit(1);
}
const version = spawnSync(executable, ['--version'], { encoding: 'utf8' });
if (version.status !== 0 || Number(version.stdout.trim().replace(/^v/, '').split('.')[0]) < 24) {
  console.error('NODE24_BIN muss auf Node >=24 zeigen.');
  process.exit(1);
}
const result = spawnSync(executable, process.argv.slice(2), {
  stdio: 'inherit',
  env: { ...process.env, PATH: dirname(executable) + ':' + process.env.PATH },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
