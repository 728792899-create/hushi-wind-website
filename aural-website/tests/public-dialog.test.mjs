import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { ref, shallowRef, watch, nextTick, toValue } from 'vue';
import { activateDialog } from '../app/utils/dialogFocus.js';

const source = await fs.readFile(process.env.DIALOG_COMPOSABLE_SOURCE || new URL('../app/composables/useDialogFocus.js', import.meta.url), 'utf8');
function harness() {
  const activations = [], releases = [], cleanups = [];
  const factory = Function('watch', 'nextTick', 'onBeforeUnmount', 'toValue', 'activateDialog',
    source.replace(/^import .*$/gm, '').replace('export function', 'function').replaceAll('import.meta.client', 'true') + '\nreturn useDialogFocus;');
  const useDialogFocus = factory(watch, nextTick, fn => cleanups.push(fn), toValue,
    (element, close) => { activations.push({ element, close }); return () => releases.push(element); });
  return { useDialogFocus, activations, releases, cleanups };
}
const flush = async () => { await nextTick(); await nextTick(); };

test('a lazy mounted open dialog activates when its template ref arrives and releases on unmount', async () => {
  const h = harness(), dialog = shallowRef(null), element = {};
  const close = () => {};
  h.useDialogFocus(() => true, dialog, close);
  await flush(); assert.equal(h.activations.length, 0);
  dialog.value = element; await flush();
  assert.equal(h.activations.length, 1); assert.equal(h.activations[0].element, element); assert.equal(h.activations[0].close, close);
  h.cleanups[0](); assert.deepEqual(h.releases, [element]);
});

test('dialog closing cancels pending activation and later reopens restore a single focus manager', async () => {
  const h = harness(), open = ref(false), dialog = shallowRef({});
  h.useDialogFocus(open, dialog, () => {});
  open.value = true; open.value = false; await flush(); assert.equal(h.activations.length, 0);
  open.value = true; await flush(); assert.equal(h.activations.length, 1);
  open.value = false; await flush(); assert.equal(h.releases.length, 1);
  open.value = true; h.cleanups[0](); await flush(); assert.equal(h.activations.length, 1);
});


test('changing a dialog view refocuses its surviving controls and releases the previous manager', async () => {
  const h = harness(), view = ref('quickstart'), dialog = shallowRef({});
  h.useDialogFocus(view, dialog, () => {});
  await flush(); assert.equal(h.activations.length, 1);
  view.value = 'videoPlayer'; await flush();
  assert.equal(h.activations.length, 2); assert.equal(h.releases.length, 1);
  view.value = false; await flush(); assert.equal(h.releases.length, 2);
  h.cleanups[0](); assert.equal(h.releases.length, 2);
});

function focusHarness(tags) {
  const listeners = new Map();
  const doc = {
    activeElement: null,
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: type => listeners.delete(type)
  };
  const element = (tagName, { controls = false, tabIndex = -1, explicitTabIndex = false } = {}) => ({
    tagName: tagName.toUpperCase(), controls, tabIndex, explicitTabIndex,
    children: [], parentElement: null, inert: false, isConnected: true,
    matches(selector) {
      return selector.split(',').some(part => {
        const choice = part.trim();
        if (choice === ':disabled') return false;
        if (choice === '[tabindex]') return this.explicitTabIndex;
        if (choice === 'video[controls]' || choice === 'audio[controls]') return this.controls && choice.startsWith(this.tagName.toLowerCase());
        return choice === this.tagName.toLowerCase();
      });
    },
    closest() { let node = this; while (node) { if (node.inert) return node; node = node.parentElement; } return null; },
    getClientRects: () => [1],
    contains(node) { return node === this || this.children.some(child => child.contains(node)); },
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); },
    querySelector: () => null,
    focus() { doc.activeElement = this; listeners.get('focusin')?.({ target: this }); }
  });
  doc.body = element('body');
  const background = element('main'), opener = element('button', { tabIndex: 0 });
  const dialog = element('section');
  const items = tags.map(tag => element(tag, { controls: tag === 'video' || tag === 'audio', tabIndex: 0 }));
  background.children = [opener]; opener.parentElement = background;
  dialog.children = items; items.forEach(item => { item.parentElement = dialog; });
  doc.body.children = [background, dialog]; background.parentElement = doc.body; dialog.parentElement = doc.body;
  doc.activeElement = opener;
  let closed = 0;
  const release = activateDialog(dialog, () => closed++, doc);
  const key = (key, shiftKey = false) => {
    let prevented = false;
    listeners.get('keydown')({ key, shiftKey, preventDefault() { prevented = true; }, stopPropagation() {} });
    return prevented;
  };
  return { doc, items, background, opener, release, key, listeners, closed: () => closed };
}

for (const mediaType of ['video', 'audio']) {
  test(`${mediaType} native controls keep Tab and Shift+Tab while adjacent dialog controls still wrap`, () => {
    const h = focusHarness(['button', mediaType, 'button']);
    const [closeButton, media, returnButton] = h.items;
    assert.equal(h.doc.activeElement, closeButton);
    media.focus();
    // Browsers expose the media element as activeElement throughout its native control sequence.
    for (const shiftKey of [false, false, true, true]) {
      assert.equal(h.key('Tab', shiftKey), false, 'native media control traversal must remain the browser default');
      assert.equal(h.doc.activeElement, media);
    }
    returnButton.focus();
    assert.equal(h.key('Tab'), true); assert.equal(h.doc.activeElement, closeButton);
    assert.equal(h.key('Tab', true), true); assert.equal(h.doc.activeElement, returnButton);
    h.opener.focus(); assert.equal(h.doc.activeElement, closeButton); assert.equal(h.background.inert, true);
    assert.equal(h.key('Escape'), true); assert.equal(h.closed(), 1);
    h.release();
    assert.equal(h.doc.activeElement, h.opener); assert.equal(h.background.inert, false); assert.equal(h.listeners.size, 0);
  });
}
