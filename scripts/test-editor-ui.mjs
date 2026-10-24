#!/usr/bin/env node
/* test-editor-ui.mjs: drive a REAL VS Code or VSCodium like a person would.
 *
 *   node scripts/test-editor-ui.mjs
 *
 * Launches the editor with the extension loaded and a debugging port, then uses Playwright over the
 * Chrome DevTools Protocol (the editor is Electron) to type, hover, press F1, click inside the designer
 * webview, and read the result back out of the open file. It needs a display and an editor, so it is not part
 * of test-all.mjs: run it by hand before you publish the extension, together with test-in-editor.mjs. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { findEditor, scratchWorkspace, editorArgs, launchDetached } from './lib/editor.mjs';

const PORT = 9400 + Math.floor(Math.random() * 400);
const editor = findEditor();
if (!editor) { console.error('No VS Code or VSCodium found. Install one, or set DSSL_EDITOR to its command.'); process.exit(2); }
const { dir, ws } = scratchWorkspace('ui');
const child = launchDetached(editor, editorArgs(editor, dir, ws, [`--remote-debugging-port=${PORT}`]));
child.unref();

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log(`  ok  ${n}`); } else { fail++; console.log(`FAIL  ${n}${x !== undefined ? '; ' + x : ''}`); } };
const done = async (browser, code) => { try { await browser.close(); } catch { /* already gone */ } try { editor.kill(); child.kill(); } catch { /* ignore */ } console.log(`\n${pass} passed, ${fail} failed (clicking through a real editor)`); process.exit(code); };

let browser = null;
for (let i = 0; i < 60 && !browser; i++) {
  try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); } catch { await new Promise((r) => setTimeout(r, 1000)); }
}
if (!browser) { console.error('could not reach the editor'); editor.kill(); process.exit(1); }
const page = browser.contexts()[0].pages()[0];
await page.waitForTimeout(4500);
await page.click('.notification-toast .monaco-button:has-text("Never")').catch(() => {});
const editorText = () => page.evaluate(() => [...document.querySelectorAll('.monaco-editor .view-line')].map((l) => l.textContent.replace(/ /g, ' ')).join('\n'));
const webview = () => page.frames().filter((x) => /vscode-webview/.test(x.url())).pop();
const palette = async (text) => { await page.keyboard.press('F1'); await page.waitForTimeout(500); await page.keyboard.type(text); await page.waitForTimeout(700); await page.keyboard.press('Enter'); await page.waitForTimeout(3500); };

try {
  // completions in a one-line rule, the case a real editor found broken
  await page.click('.monaco-editor .view-lines'); await page.keyboard.press('Control+End');
  await page.keyboard.type('\n.t { texture: ');
  await page.keyboard.press('Control+Space'); await page.waitForTimeout(1500);
  const list1 = await page.locator('.suggest-widget .monaco-list-row').allTextContents();
  ok('one-line rule: "texture: " offers texture words first, not pseudo-elements', list1.length > 3 && list1.slice(0, 8).every((t) => /texture (preset|setting|generator)|blend mode/.test(t)) && !list1.some((t) => /::after/.test(t)), list1.slice(0, 6).join(' | '));
  await page.keyboard.type('oa'); await page.waitForTimeout(700);
  const list2 = await page.locator('.suggest-widget .monaco-list-row').allTextContents();
  ok('typing "oa" narrows it to oak and oak-planks', list2.some((t) => /^oak\b/.test(t)) && list2.some((t) => /oak-planks/.test(t)), list2.join(' | '));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+K'); await page.waitForTimeout(300);   // delete the scratch line

  // hover
  await page.mouse.move(470, 348); await page.waitForTimeout(1800);
  const hover = await page.locator('.monaco-hover').allTextContents();
  ok('hovering "texture" shows the documentation widget', hover.some((t) => /generated texture/i.test(t)), hover.join('|').slice(0, 120));
  await page.mouse.move(900, 700); await page.waitForTimeout(300);

  // problems: the status bar counts what the squiggles say
  const status = (await page.locator('.statusbar').innerText()).replace(/\s+/g, ' ');
  ok('the status bar counts the errors and the warning', /[3-9]/.test(status) && /1/.test(status), status.slice(0, 60));

  // the designer
  await palette('DSSL: Design a texture');
  let f = webview();
  ok('"DSSL: Design a texture" opens the designer on the Texture tab', f && /Textures/.test(await f.locator('body').innerText()));
  const tile = async (name) => { const t = webview().locator(`.tile[data-name="${name}"]`); await t.scrollIntoViewIfNeeded(); await t.click(); await page.waitForTimeout(500); };
  await tile('oak-planks');
  const txt = await webview().locator('body').innerText();
  ok('wood settings appear for a wood preset (planks, knots, figure, mirror tile)', ['planks', 'knots', 'figure', 'mirror tile'].every((w) => txt.includes(w)));
  await tile('grain');
  ok('and are hidden for grain', !(await webview().locator('body').innerText()).includes('knots'));
  await tile('oak-planks');
  await webview().locator('select').filter({ has: webview().locator('option[value="both"]') }).first().selectOption('both'); await page.waitForTimeout(500);
  const dsslOut = await webview().locator('textarea').last().inputValue();
  ok('choosing the mirror writes symmetrical into the DSSL', /^texture: oak-planks symmetrical$/.test(dsslOut.trim()), dsslOut);
  ok('and the panel says it compiles', /compiles/.test(await webview().locator('body').innerText()));

  // insert, then load it back
  await page.click('.monaco-editor .view-lines'); await page.keyboard.press('Control+End');
  await webview().getByRole('button', { name: 'Insert at cursor' }).click(); await page.waitForTimeout(800);
  ok('"Insert at cursor" puts the line into the open file', /texture: oak-planks symmetrical/.test(await editorText()));
  await page.click('.monaco-editor .view-lines'); await page.keyboard.press('Control+End'); await page.keyboard.press('Shift+Home'); await page.waitForTimeout(200);
  await tile('grain');
  await webview().getByRole('button', { name: 'Load from selection' }).click(); await page.waitForTimeout(800);
  ok('"Load from selection" reads the line back into the controls', /oak-planks symmetrical/.test(await webview().locator('textarea').last().inputValue()));

  // the other tabs
  await webview().getByRole('button', { name: 'Slider' }).first().click(); await page.waitForTimeout(800);
  ok('the slider tab shows a live preview slider that compiles', (await webview().locator('#pv').count()) === 1 && /compiles/.test(await webview().locator('body').innerText()));
  await webview().getByRole('button', { name: 'Aura' }).first().click(); await page.waitForTimeout(800);
  ok('the aura tab compiles too', /compiles/.test(await webview().locator('body').innerText()));
  await done(browser, fail ? 1 : 0);
} catch (e) {
  fail++; console.log('FAIL  the run threw: ' + (e && e.message ? e.message.split('\n')[0] : e));
  await page.screenshot({ path: dir + '/failure.png' }).catch(() => {});
  console.log('  a screenshot of the editor is at ' + dir + '/failure.png');
  await done(browser, 1);
}
