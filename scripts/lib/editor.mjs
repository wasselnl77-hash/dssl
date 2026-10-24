/* editor.mjs: find a VS Code or VSCodium to run the extension tests in, and launch it with a throwaway profile. */
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ext = path.join(root, 'dssl-vscode');
const which = (cmd) => spawnSync('sh', ['-c', `command -v ${cmd}`], { encoding: 'utf8' }).stdout.trim();

/** { cmd, pre, kill } or null. pre = arguments that go before the editor's own (flatpak needs them) */
export function findEditor(extraEnv = {}) {
  if (process.env.DSSL_EDITOR) return { cmd: process.env.DSSL_EDITOR, pre: [], kill: () => {} };
  for (const c of ['codium', 'code']) if (which(c)) return { cmd: c, pre: [], kill: () => {} };
  if (which('flatpak') && /com\.vscodium\.codium/.test(spawnSync('flatpak', ['list', '--app'], { encoding: 'utf8' }).stdout)) {
    const envs = Object.entries(extraEnv).map(([k, v]) => `--env=${k}=${v}`);
    return { cmd: 'flatpak', pre: ['run', ...envs, 'com.vscodium.codium'], kill: () => spawnSync('flatpak', ['kill', 'com.vscodium.codium']) };
  }
  return null;
}

/** a clean scratch profile + workspace copy of the fixtures, so the editor never touches your own settings */
export function scratchWorkspace(name) {
  const dir = path.join(root, '.vsc-test', name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(dir, 'ws'), { recursive: true });
  cpSync(path.join(ext, 'test/host/fixtures'), path.join(dir, 'ws'), { recursive: true });
  return { dir, ws: path.join(dir, 'ws') };
}

export function editorArgs(editor, dir, ws, more = []) {
  return [...editor.pre, `--user-data-dir=${path.join(dir, 'user')}`, `--extensions-dir=${path.join(dir, 'extensions')}`,
    `--extensionDevelopmentPath=${ext}`, '--disable-workspace-trust', '--new-window', '--disable-gpu', ...more, ws, path.join(ws, 'sample.dssl')];
}

export const launchDetached = (editor, args, env = {}) => spawn(editor.cmd, args, { stdio: 'ignore', detached: true, env: { ...process.env, ...env } });
