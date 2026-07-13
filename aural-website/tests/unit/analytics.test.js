import { describe, expect, it } from 'vitest'
import { conversionEvents, isMixpanelAllowed, sanitizeAnalyticsMetadata } from '../../app/lib/analytics'

describe('conversion analytics privacy model', () => {
  it('defines the complete browse-to-inquiry funnel', () => {
    expect(Object.values(conversionEvents)).toEqual([
      'product_view', 'product_search', 'product_compare',
      'resource_download', 'inquiry_start', 'inquiry_submit'
    ])
  })

  it('removes direct personal data while retaining useful dimensions', () => {
    expect(sanitizeAnalyticsMetadata({ productId: 3, phone: '13800138000', customer_name: '测试客户', nested: { email: 'test@example.com', stage: 'quote' } })).toEqual({
      productId: 3,
      nested: { stage: 'quote' }
    })
  })

  it('requires explicit consent before forwarding to Mixpanel', () => {
    expect(isMixpanelAllowed({ getItem: () => 'granted' })).toBe(true)
    expect(isMixpanelAllowed({ getItem: () => null })).toBe(false)
  })
})
