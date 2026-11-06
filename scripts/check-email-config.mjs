import nextEnv from '@next/env';
import { passwordEmailSettings } from '../src/server/password-email-config.mjs';

const inherited = new Set(Object.keys(process.env));
const result = nextEnv.loadEnvConfig(process.cwd(), true, {
  info() {},
  error() { console.error('Could not load an environment file. Check its formatting; values are hidden.'); },
});
console.log('Configuration files:', result.loadedEnvFiles.map(file => file.path).join(', ') || '(none)');
const { config, invalid } = passwordEmailSettings();
if (config) {
  console.log('Password recovery settings are valid. SMTP connectivity has not been tested.');
} else {
  console.log('Password recovery is unavailable. Check these setting names (values are hidden):');
  for (const key of invalid) console.log(`- ${key}${inherited.has(key) ? ' (inherited from the shell; overrides .env)' : ''}`);
  process.exitCode = 1;
}
