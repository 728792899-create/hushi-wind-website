import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ProductCard from '../../app/components/ProductCard.vue'

const NuxtLink = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>'
}

describe('ProductCard', () => {
  it('renders a descriptive image and accessible product link', () => {
    const wrapper = mount(ProductCard, {
      props: { title: 'DX-88 舞台键盘', description: '88 键配重键盘', imageUrl: '/dx.webp', link: '/products/dx-88' },
      global: { components: { NuxtLink } }
    })
    const image = wrapper.get('img')
    expect(image.attributes('alt')).toBe('DX-88 舞台键盘')
    expect(image.attributes('loading')).toBe('lazy')
    expect(wrapper.get('a').attributes('href')).toBe('/products/dx-88')
    expect(wrapper.get('h3').text()).toContain('DX-88')
  })

  it('keeps a visible text fallback when no image exists', () => {
    const wrapper = mount(ProductCard, {
      props: { title: '无图产品', description: '说明', imageText: '产品图片待补充' },
      global: { components: { NuxtLink } }
    })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('产品图片待补充')
  })
})
