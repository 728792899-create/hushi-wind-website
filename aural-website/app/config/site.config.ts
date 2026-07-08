export const siteConfig = {
  name: '胡氏管乐',
  nameEn: 'HUSHI WIND',
  description: '胡氏管乐提供原声钢琴、吉他、合成器与专业音响系统，覆盖演奏、录音、教学与现场扩声场景。',

  services: [
    {
      icon: 'CARE',
      title: '胡氏管乐 Care+',
      desc: '专业维护与保养服务，延长乐器使用寿命',
      link: '/support'
    },
    {
      icon: 'DELIVERY',
      title: '全国配送',
      desc: '覆盖全国主要城市，快速安全送达',
      link: '/support'
    },
    {
      icon: 'TRIAL',
      title: '预约试奏',
      desc: '线下体验中心，专业顾问一对一服务',
      link: '/support'
    },
    {
      icon: 'WARRANTY',
      title: '品质保障',
      desc: '正品保证，完善的售后服务体系',
      link: '/info/warranty'
    }
  ],

  hotSearchTags: [
    '单簧管',
    '长笛',
    '萨克斯',
    '保养',
    '售后',
    '预约试奏'
  ],

  brandAssets: {
    heroPiano: 'hero-concert-grand-piano.jpg',
    productPiano: 'product-c3-grand-piano-main.jpg',
    heroGuitar: 'hero-acoustic-guitar.jpg',
    productGuitar: 'product-ls-ta-guitar-main.jpg',
    heroSynth: 'hero-modular-synthesizer.jpg',
    productSynth: 'product-montage-m-synth-main.jpg',
    heroAudio: 'hero-line-array-speakers.jpg',
    productAudio: 'product-dxr-series-speakers-main.jpg',
    brandStory: 'brand-story-hero.jpg',
    aboutHero: 'about-hero.jpg'
  }
}

export const useSiteConfig = () => {
  return siteConfig
}
