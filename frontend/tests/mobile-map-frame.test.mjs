import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readMobileImpactInspectorTop, readMobileMapFrameInsets } from '../src/hooks/mobileMapFrame.ts';

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

test('impact camera reserves the settled inspector height throughout its slide-in animation', () => {
  const previous = globalThis.window;
  let animatedTop = 780;
  const inspector = { getBoundingClientRect: () => ({ top: animatedTop, height: 390 }) };
  const viewport = {
    closest: () => ({ querySelector: () => inspector }),
    getBoundingClientRect: () => ({ top: 0, bottom: 780 }),
  };
  try {
    globalThis.window = { innerWidth: 360, innerHeight: 780 };
    for (animatedTop of [780, 620, 390]) {
      assert.equal(readMobileImpactInspectorTop(viewport, 780), 390);
    }
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

test('cached search framing does not shrink an impact or station inspector camera', () => {
  const previous = globalThis.window;
  let inspector = false;
  let overviewVisible = true;
  const minimum = { getBoundingClientRect: () => ({ height: 176 }) };
  const sheet = { querySelector: () => minimum };
  const chips = { getBoundingClientRect: () => ({ height: 40, bottom: 112 }) };
  const shell = {
    getAttribute: () => 'ttc',
    classList: { contains: name => name === 'mobile-map-inspector' && inspector },
    querySelector: selector => overviewVisible
      ? (selector === '.mobile-app-chip-scroll' ? chips : sheet) : null,
  };
  const viewport = {
    closest: () => shell,
    getBoundingClientRect: () => ({ top: 0, bottom: inspector ? 425 : 850 }),
  };
  try {
    globalThis.window = { innerWidth: 393, innerHeight: 850, getComputedStyle: () => ({ bottom: '70px' }) };
    const overviewInsets = { top: 112, bottom: 246 };
    assert.deepEqual(readMobileMapFrameInsets(viewport), overviewInsets);
    overviewVisible = false;
    assert.deepEqual(readMobileMapFrameInsets(viewport), overviewInsets, 'search retains the overview frame');
    inspector = true;
    assert.equal(readMobileMapFrameInsets(viewport), null, 'inspector uses its own frame');
    overviewVisible = true;
    assert.equal(readMobileMapFrameInsets(viewport), null, 'outgoing overview DOM cannot override inspector framing');
    inspector = false;
    overviewVisible = false;
    assert.deepEqual(readMobileMapFrameInsets(viewport), overviewInsets, 'inspector leaves the search cache intact');
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});
