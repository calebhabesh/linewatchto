import assert from 'node:assert/strict';
import { test } from 'node:test';
import { observeMapChooserKeepouts } from '../src/components/map-chooser-keepouts.ts';

test('closed chooser ignores pan attributes; opening measures, closing cancels and disconnects', () => {
  const originals = Object.fromEntries(['window', 'document', 'Element', 'MutationObserver', 'ResizeObserver'].map(key => [key, globalThis[key]]));
  const observers = [];
  const frames = new Map();
  let open = false, changes = 0, scans = 0, id = 0;
  class Node {
    matches() { return true; }
    querySelector() { return null; }
  }
  class Observer {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target, options) { this.options = options; }
    disconnect() { this.options = null; }
  }
  const events = { addEventListener() {}, removeEventListener() {} };
  try {
    globalThis.Element = Node;
    globalThis.MutationObserver = Observer;
    globalThis.ResizeObserver = Observer;
    globalThis.document = { ...events, body: {}, querySelector: () => open ? {} : null, querySelectorAll: () => { scans++; return []; } };
    globalThis.window = { ...events, requestAnimationFrame: cb => { frames.set(++id, cb); return id; }, cancelAnimationFrame: key => frames.delete(key) };
    const stop = observeMapChooserKeepouts(() => changes++);
    const attributes = observers[1], children = observers[2];
    assert.equal(attributes.options, undefined);
    assert.deepEqual(children.options, { childList: true, subtree: true });
    assert.equal(scans, 0);
    const mount = () => children.callback([{ type: 'childList', addedNodes: [new Node()], removedNodes: [] }]);
    open = true;
    mount();
    assert.equal(attributes.options.attributes, true);
    for (const [key, cb] of frames) { frames.delete(key); cb(); }
    assert.equal(changes, 1);
    assert.equal(scans, 1);
    attributes.callback([{ type: 'attributes', target: new Node(), addedNodes: [], removedNodes: [] }]);
    assert.equal(frames.size, 1);
    open = false;
    mount();
    assert.equal(frames.size, 0);
    assert.equal(attributes.options, null);
    assert.equal(observers[0].options, null);
    open = true;
    mount();
    assert.equal(frames.size, 1);
    stop();
    assert.equal(frames.size, 0);
    assert.equal(children.options, null);
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
