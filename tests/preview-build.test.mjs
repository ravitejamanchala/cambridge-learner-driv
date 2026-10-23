import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The build is run for real into a scratch folder: the point is what actually ships.
const build = (...flags) => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-build-'));
  execFileSync(process.execPath, ['tools/build_demo.mjs', '.', out, ...flags], { stdio: 'ignore' });
  const read = f => fs.readFileSync(path.join(out, f), 'utf8');
  return { config: read('auth-config.js'), html: read('index.html'), done: () => fs.rmSync(out, { recursive: true, force: true }) };
};

test('a production build ships the committed account configuration untouched', () => {
  const b = build();
  try {
    assert.equal(b.config, fs.readFileSync('auth-config.js', 'utf8'));
    assert.ok(!b.config.includes('PREVIEW'), 'production must never carry the preview flag');
    assert.ok(!b.html.includes('preview-tag'), 'production carries no preview label');
  } finally { b.done(); }
});

test('a preview build runs as a guest with no account service, and says it is a preview', () => {
  const b = build('--preview');
  try {
    assert.match(b.config, /"PREVIEW":true/);
    assert.ok(!/CLERK_PUBLISHABLE_KEY|API_BASE_URL/.test(b.config), 'a preview must not point at the live account service');
    assert.match(b.html, /class="preview-tag">Preview build/);
    assert.match(b.html, /body:not\(\[data-mode=lobby\]\) \.preview-tag\{display:none\}/, 'the label stays off the road while driving');
  } finally { b.done(); }
});
