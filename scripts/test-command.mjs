import { spawn } from 'node:child_process';
import { testEnvironment } from './test-env.mjs';

const env = testEnvironment();
const commands = {
  migrate: ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  integration: ['node_modules/vitest/vitest.mjs', 'run'],
  browser: ['node_modules/@playwright/test/cli.js', 'test'],
};
const args = commands[process.argv[2]];
if (!args) throw new Error('Expected migrate, integration, or browser');
const child = spawn(process.execPath, args, { env, stdio: 'inherit' });
child.on('exit', code => process.exit(code ?? 1));
