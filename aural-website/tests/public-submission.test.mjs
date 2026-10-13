import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { effectScope, reactive, ref, watch } from 'vue'
import { resetSubmittedFields } from '../app/utils/supportSubmission.js'
import { createSubmissionAttempt } from '../app/utils/submissionAttempt.js'

const guardSource = await fs.readFile(new URL('../app/composables/useFormGuard.js', import.meta.url), 'utf8')
const realFormGuard = route => Function('ref', 'useRoute', 'useState', guardSource.replace('export const useFormGuard', 'const useFormGuard') + '\nreturn useFormGuard;')(
  ref, () => route, () => ref(0)
)

const sources = {
  artist: await fs.readFile(new URL('../app/pages/artists.vue', import.meta.url), 'utf8'),
  product: await fs.readFile(new URL('../app/pages/products/[id].vue', import.meta.url), 'utf8')
}

function fixture(kind) {
  let resolve, reject
  const response = new Promise((yes, no) => { resolve = yes; reject = no })
  const form = kind === 'artist'
    ? { name: '原始艺名', email: 'original@example.invalid', phone: '', portfolioUrl: 'https://example.invalid/portfolio', message: '原始申请' }
    : { name: '原始姓名', phone: '13800000000', city: '原始城市', budget: '1-5 万', preferredTime: '周末', message: '原始咨询' }
  const busy = { value: false }, open = { value: true }, session = { value: 1 }, guide = { value: false }
  const product = { value: { id: 12, title: '原始产品' } }, modalType = { value: 'appointment' }
  const requests = [], events = [], notices = []
  let closed = 0, resets = 0, guards = 0
  const close = () => { closed++; open.value = false; session.value++ }
  const scope = {
    form, formData: form, isSubmitting: busy, showApplyModal: open, isModalOpen: open,
    applicationSession: session, inquirySession: session, showSuccessGuide: guide, product, modalType,
    formErrors: {}, clearFormErrors() {}, resetSubmittedFields,
    resetForm: () => Object.keys(form).forEach(key => { form[key] = '' }),
    canSubmit: () => { guards++; return { ok: true } },
    getTrackingPayload: () => ({ pagePath: kind === 'artist' ? '/artists?source=original' : '/products/original?source=original', source: 'original' }),
    getGuardPayload: () => ({ submissionId: 'fixture-submission' }), resetGuard: () => { resets++ },
    artistApplicationsUrl: { value: '/api/artist-applications' }, inquiryUrl: { value: '/api/inquiries' },
    artistApplyHistory: { closeDirect: close }, inquiryOverlayHistory: { closeDirect: close },
    track: (event, payload) => events.push({ event, payload }),
    triggerToast: (message, type) => notices.push({ message, type }),
    showToast: (message, type) => notices.push({ message, type }),
    $fetch: async (url, options) => { requests.push({ url, body: options.body }); return response }
  }
  scope.submissionAttempt = createSubmissionAttempt(scope.getGuardPayload)
  const start = kind === 'artist' ? 'const submitApplication =' : 'const handleSubmit ='
  const name = kind === 'artist' ? 'submitApplication' : 'handleSubmit'
  const offset = sources[kind].indexOf(start)
  const body = sources[kind].slice(offset, sources[kind].indexOf('\n}', offset) + 2)
  assert.ok(body.startsWith(start), `real ${kind} submit function must be present`)
  const submit = Function(...Object.keys(scope), `${body}\nreturn ${name}`)(...Object.values(scope))
  return { form, busy, open, session, guide, product, modalType, requests, events, notices, submit, resolve, reject,
    counts: () => ({ closed, resets, guards }) }
}

for (const kind of ['artist', 'product']) {
  test(`${kind}: real modal lifecycle invalidates close/reopen while preserving an uncertain retry key`, () => {
    const source = sources[kind], effects = effectScope(), focusBindings = [], route = reactive({ params: { id: 'original' }, query: {} })
    const scope = {
      ref, reactive, watch, route, product: { value: { id: 12, title: '原始产品' } }, track() {}, clearFormErrors() {},
      useOverlayLock() {}, useDialogFocus: (...args) => focusBindings.push(args),
      useOverlayHistory: (key, open, close) => ({ closeDirect: close, closeViaHistory: close }),
      useFormGuard: realFormGuard(route), createSubmissionAttempt
    }
    const body = kind === 'artist'
      ? source.slice(source.indexOf('const showArtistModal ='), source.indexOf('const submitApplication ='))
      : source.slice(source.indexOf('const isModalOpen ='), source.indexOf('const trackedProductKeys ='))
        + source.slice(source.indexOf('const openModal ='), source.indexOf('const showToast ='))
    const result = kind === 'artist'
      ? '{ open: openApplyModal, close: closeApplyModal, shown: showApplyModal, session: applicationSession, getGuardPayload }'
      : '{ open: openModal, close: closeModal, shown: isModalOpen, session: inquirySession, getGuardPayload }'
    try {
      const lifecycle = effects.run(() => Function(...Object.keys(scope), body + `\nreturn ${result}`)(...Object.values(scope)))
      lifecycle.open('appointment')
      const firstSession = lifecycle.session.value
      const originalGuard = lifecycle.getGuardPayload()
      lifecycle.close(); lifecycle.open('quote')
      assert.equal(lifecycle.shown.value, true)
      assert.ok(lifecycle.session.value > firstSession)
      assert.deepEqual(lifecycle.getGuardPayload(), originalGuard)
      assert.equal(focusBindings.length, 2)
      if (kind === 'product') {
        const reopened = lifecycle.session.value
        route.params.id = 'next-product'
        assert.equal(lifecycle.shown.value, false)
        assert.ok(lifecycle.session.value > reopened)
      }
    } finally { effects.stop() }
  })

  test(`${kind}: uncertain retries retain their id, changed content gets a new id, and confirmed success retires it`, async () => {
    const f = fixture(kind)
    f.reject({ status: 503 }); await f.submit()
    const first = f.requests[0].body.submissionId
    f.session.value += 2
    await f.submit()
    assert.equal(f.requests.at(-1).body.submissionId, first)
    f.form.message = '另一份内容'; await f.submit()
    assert.notEqual(f.requests.at(-1).body.submissionId, first)
    f.form.message = kind === 'artist' ? '原始申请' : '原始咨询'; await f.submit()
    assert.equal(f.requests.at(-1).body.submissionId, first)

    const success = fixture(kind), original = { ...success.form }
    success.resolve(); await success.submit()
    const completedId = success.requests[0].body.submissionId
    Object.assign(success.form, original); success.open.value = true; success.session.value++
    await success.submit()
    assert.notEqual(success.requests.at(-1).body.submissionId, completedId)
  })

  test(`${kind}: real submit blocks a concurrent second request before consuming its guard`, async () => {
    const f = fixture(kind)
    const first = f.submit(), second = f.submit()
    const callsWhilePending = f.requests.length, guardsWhilePending = f.counts().guards
    f.resolve(); await Promise.all([first, second])
    assert.equal(callsWhilePending, 1)
    assert.equal(guardsWhilePending, 1)
    assert.equal(f.busy.value, false)
  })

  test(`${kind}: successful delayed response preserves newer input and leaves its dialog open`, async () => {
    const f = fixture(kind), originalName = f.form.name
    const submitted = f.submit()
    f.form.name = '等待期间的新姓名'; f.form.message = '等待期间的新内容'
    f.resolve(); await submitted
    assert.equal(f.form.name, '等待期间的新姓名')
    assert.equal(f.form.message, '等待期间的新内容')
    assert.equal(f.form[kind === 'artist' ? 'email' : 'city'], '')
    assert.equal(f.open.value, true)
    assert.equal(f.guide.value, false)
    assert.equal(f.counts().closed, 0)
    assert.equal(f.requests[0].body[kind === 'artist' ? 'name' : 'customerName'], originalName)
    const event = f.events.find(item => item.event === 'form_submit')
    assert.equal(event.payload.entityTitle, kind === 'artist' ? originalName : '原始产品')
    assert.equal(event.payload.source, 'original')
  })

  test(`${kind}: an old successful session cannot clear or close a reopened dialog`, async () => {
    const f = fixture(kind), pending = f.submit()
    f.session.value += 2
    f.form.name = '新会话姓名'; f.form.message = '新会话草稿'
    const reopened = { ...f.form }
    f.resolve(); await pending
    assert.deepEqual(f.form, reopened)
    assert.equal(f.open.value, true)
    assert.equal(f.guide.value, false)
    assert.equal(f.notices.length, 0)
    assert.equal(f.counts().closed, 0)
    assert.equal(f.counts().resets, 0)
    assert.equal(f.events.filter(item => item.event === 'form_submit').length, 1)
  })

  test(`${kind}: a late failure describes the submitted entity without showing an error in a newer session`, async () => {
    const f = fixture(kind), originalName = f.form.name, pending = f.submit()
    f.session.value++
    f.form.name = '新会话姓名'; f.product.value = { id: 99, title: '另一个产品' }; f.modalType.value = 'quote'
    f.reject({ status: 503, data: { error: { message: '本地合成失败' } } }); await pending
    assert.equal(f.notices.length, 0)
    assert.equal(f.form.name, '新会话姓名')
    assert.equal(f.busy.value, false)
    const event = f.events.find(item => item.event === 'form_submit_failed')
    assert.equal(event.payload.entityTitle, kind === 'artist' ? originalName : '原始产品')
    assert.equal(event.payload.ctaName, kind === 'artist' ? 'artist-application' : 'appointment')
    assert.equal(event.payload.pagePath, kind === 'artist' ? '/artists?source=original' : '/products/original?source=original')
    if (kind === 'product') assert.equal(event.payload.entityId, '12')
  })

  test(`${kind}: unchanged successful submission resets its own form and closes only that dialog`, async () => {
    const f = fixture(kind), pending = f.submit()
    f.resolve(); await pending
    assert.ok(Object.values(f.form).every(value => value === ''))
    assert.equal(f.open.value, false)
    assert.equal(f.counts().closed, 1)
    assert.equal(f.counts().resets, 1)
    assert.equal(f.guide.value, kind === 'product')
    assert.equal(f.notices.length, 1)
  })

  test(`${kind}: current-session failure preserves fields and exposes the server message`, async () => {
    const f = fixture(kind), original = { ...f.form }, pending = f.submit()
    f.reject({ status: 500, data: { error: { message: '本地合成失败' } } }); await pending
    assert.deepEqual(f.form, original)
    assert.equal(f.open.value, true)
    assert.deepEqual(f.notices, [{ message: '本地合成失败', type: 'error' }])
    assert.equal(f.counts().resets, 0)
    assert.equal(f.busy.value, false)
  })
}

test('product: changing the submitted product title or request type does not reuse an uncertain receipt', async () => {
  const f = fixture('product')
  f.reject({ status: 503 }); await f.submit()
  const first = f.requests[0].body.submissionId
  f.product.value.title = '更新后的产品名称'; await f.submit()
  const renamed = f.requests.at(-1).body.submissionId
  assert.notEqual(renamed, first)
  assert.equal(f.requests.at(-1).body.productTitle, '更新后的产品名称')
  f.modalType.value = 'quote'; await f.submit()
  assert.notEqual(f.requests.at(-1).body.submissionId, renamed)
  assert.equal(f.requests.at(-1).body.inquiryType, 'quote')
})
