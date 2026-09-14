import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();

function executable(name) {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  return resolve(root, 'node_modules', '.bin', `${name}${suffix}`);
}

export function runNode(script, args = []) {
  return run(process.execPath, [resolve(root, script), ...args]);
}

export function runTool(name, args = []) {
  return run(executable(name), args);
}

export function run(command, args = []) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} terminated by ${signal}`));
      } else if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}`));
      } else {
        resolvePromise();
      }
    });
  });
}

export async function runSteps(steps) {
  for (const { label, task } of steps) {
    console.log(`\n==> ${label}`);
    await task();
  }
}
