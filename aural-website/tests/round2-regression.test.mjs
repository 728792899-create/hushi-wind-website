import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fetchCompleteList } from '../app/utils/fetchCompleteList.js';
import { resetSubmittedFields } from '../app/utils/supportSubmission.js';
import { supportCopy } from '../app/utils/supportFlow.js';
import { activateDialog } from '../app/utils/dialogFocus.js';

test('public collection loader finds records beyond fifty and rejects failures on later pages', async () => {
  const pages = [];
  const result = await fetchCompleteList('/api/items', async (url, { query }) => {
    pages.push(query.page);
    return { data: Array.from({ length: query.page === 1 ? 100 : 5 }, (_, i) => ({ id: (query.page - 1) * 100 + i + 1 })), meta: { pagination: { page: query.page, pageCount: 2 } } };
  });
  assert.deepEqual(pages, [1, 2]); assert.equal(result.data.at(-1).id, 105);
  await assert.rejects(fetchCompleteList('/api/items', async (url, { query }) => {
    if (query.page === 2) throw Error('offline');
    return { data: [{ id: 1 }], meta: { pagination: { pageCount: 2 } } };
  }), /offline/);
  await assert.rejects(fetchCompleteList('/api/items', async () => ({ error: 'bad' })));
});

test('real support submit function keeps request type, blocks duplicates and preserves newer input', async () => {
  const source = await fs.readFile(new URL('../app/pages/support.vue', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('const handleFormSubmit ='), source.indexOf('const modalTitle ='));
  const form = { serviceType: 'experience', customerName: '测试人员', contactInfo: '13800138000', productTitle: 'C3', city: '上海', preferredTime: '', serialNumber: '', purchaseChannel: '', message: '预约说明' };
  let release, calls = 0, submittedBody;
  const pending = new Promise(resolve => release = resolve), notices = [];
  const busy = { value: false }, error = { value: '' };
  const scope = { contactForm: form, isSubmittingContact: busy, supportSubmitError: error, supportCopy, resetSubmittedFields,
    canSubmit: () => ({ ok: true }), triggerToast: (text, kind) => notices.push([text, kind]), inquiriesUrl: { value: '/api/inquiries' },
    serviceTypeLabels: { experience: '试奏与门店咨询', repair: '故障报修' }, getTrackingPayload: () => ({}), getGuardPayload: () => ({}),
    $fetch: async (url, options) => { calls++; submittedBody = options.body; await pending; }, track() {}, resetGuard() {}, closeModal() {} };
  const submit = Function(...Object.keys(scope), body + '\nreturn handleFormSubmit;')(...Object.values(scope));
  const first = submit(); assert.equal(busy.value, true);
  await submit(); assert.equal(calls, 1);
  form.serviceType = 'repair'; form.message = '等待期间新填写的内容';
  release(); await first;
  assert.equal(submittedBody.inquiryType, 'appointment');
  assert.match(notices.at(-1)[0], /预约/); assert.doesNotMatch(notices.at(-1)[0], /维修/);
  assert.equal(form.message, '等待期间新填写的内容'); assert.equal(busy.value, false);
});

test('dialog traps Tab, handles Escape and restores previous focus and inert state', () => {
  const listeners = new Map(), background = { inert: false, tagName: 'MAIN' }, alreadyInert = { inert: true, tagName: 'ASIDE' };
  const doc = { body: { children: [] }, activeElement: null, addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) };
  const button = name => ({ name, tabIndex: 0, isConnected: true, matches: () => false, closest: () => null, getClientRects: () => [1], focus() { doc.activeElement = this; } });
  const opener = button('opener'), first = button('first'), last = button('last'); doc.activeElement = opener;
  const dialog = { parentElement: doc.body, querySelectorAll: () => [first, last], contains: node => [first, last].includes(node), focus() { doc.activeElement = this; } };
  doc.body.children = [background, alreadyInert, dialog];
  let closed = 0;
  const release = activateDialog(dialog, () => closed++, doc);
  assert.equal(doc.activeElement, first); assert.equal(background.inert, true);
  const key = (value, shiftKey = false) => listeners.get('keydown')({ key: value, shiftKey, preventDefault() {}, stopPropagation() {} });
  key('Tab', true); assert.equal(doc.activeElement, last);
  key('Tab'); assert.equal(doc.activeElement, first);
  key('Escape'); assert.equal(closed, 1);
  release(); assert.equal(doc.activeElement, opener); assert.equal(background.inert, false); assert.equal(alreadyInert.inert, true);
});
