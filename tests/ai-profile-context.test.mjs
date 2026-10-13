import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../ai-context.js', import.meta.url), 'utf8');

test('Kairos AI treats the current profile name as authoritative over stale chat memory', () => {
  assert.match(
    source,
    /Current profile values override any older or conflicting profile values in conversation history, summaries, or memory\./
  );
});
