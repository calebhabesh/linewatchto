import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readMobileMapFrameInsets } from '../src/hooks/mobileMapFrame.ts';

test('mobile default frame uses shortcuts and overview height independently of sheet translation', () => {
  const previous = globalThis.window;
  const minimum = { getBoundingClientRect: () => ({ height: 176 }) };
  const sheet = { querySelector: () => minimum };
  const chips = { getBoundingClientRect: () => ({ bottom: 112 }) };
  const viewport = {
    closest: () => ({ querySelector: selector => selector === '.mobile-app-chip-scroll' ? chips : sheet }),
    getBoundingClientRect: () => ({ top: 0, bottom: 850 }),
  };
  try {
    globalThis.window = { innerWidth: 393, innerHeight: 850, getComputedStyle: () => ({ bottom: '70px' }) };
    assert.deepEqual(readMobileMapFrameInsets(viewport), { top: 112, bottom: 246 });
    // A dragged/expanded sheet's position must never be read.
    sheet.getBoundingClientRect = () => { throw new Error('custom sheet position read'); };
    assert.deepEqual(readMobileMapFrameInsets(viewport), { top: 112, bottom: 246 });
    globalThis.window.innerWidth = 1280;
    assert.equal(readMobileMapFrameInsets(viewport), null);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});
