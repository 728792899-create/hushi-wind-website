const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const uploadDir = path.join(__dirname, '..', 'uploads');
const assetDir = path.join(uploadDir, 'real-assets');
const resourceDir = path.join(uploadDir, 'resources');
const toJson = (value) => JSON.stringify(value);

const imageAssets = {
  heroConcert: {
    file: 'hero-concert-grand-piano.jpg',
    url: 'https://images.unsplash.com/photo-1507838153414-b4b713384a76?fm=jpg&fit=crop&w=2200&q=82',
    sourcePage: 'https://unsplash.com/s/photos/concert-piano',
    credit: 'Unsplash public image CDN, used under the Unsplash License',
    description: 'Concert piano atmosphere for the homepage hero.'
  },
  grandPianoMain: {
    file: 'product-c3-grand-piano-main.jpg',
    url: 'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?fm=jpg&fit=crop&w=1800&q=82',
    sourcePage: 'https://unsplash.com/s/photos/grand-piano',
    credit: 'Unsplash public image CDN, used under the Unsplash License',
    description: 'Grand piano and keyboard detail for the C3 Studio Grand.'
  },
  pianoDetail: {
    file: 'product-c3-piano-detail.jpg',
    url: 'https://images.pexels.com/photos/164936/pexels-photo-164936.jpeg?auto=compress&cs=tinysrgb&w=1800',
    sourcePage: 'https://www.pexels.com/search/piano/',
    credit: 'Pexels image, used under the Pexels License',
    description: 'Piano detail for product gallery and craft section.'
  },
  uprightPiano: {
    file: 'product-u1-upright-piano.jpg',
    url: 'https://images.pexels.com/photos/1293551/pexels-photo-1293551.jpeg?auto=compress&cs=tinysrgb&w=1800',
    sourcePage: 'https://www.pexels.com/search/upright%20piano/',
    credit: 'Pexels image, used under the Pexels License',
    description: 'Piano room image for the U1 Artist Upright.'
  },
  musicClassroom: {
    file: 'product-u1-music-classroom.jpg',
    url: 'https://images.pexels.com/photos/3355317/pexels-photo-3355317.jpeg?auto=compress&cs=tinysrgb&w=1800',
    sourcePage: 'https://www.pexels.com/search/music%20classroom/',
    credit: 'Pexels image, used under the Pexels License',
    description: 'Education and practice space image.'
  },
  guitarMain: {
    file: 'product-t6-electric-guitar-main.jpg',
    url: 'https://images.pexels.com/photos/7715349/pexels-photo-7715349.jpeg?auto=compress&cs=tinysrgb&w=1800',
    sourcePage: 'https://www.pexels.com/photo/man-playing-guitar-on-the-stage-7715349/',
    credit: 'Pexels image, used under the Pexels License',
    description: 'Stage guitar performance for the T6 Electric Guitar.'
  },
  guitarDetail: {
    file: 'product-t6-guitar-detail.jpg',
    url: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?fm=jpg&fit=crop&w=1800&q=82',
    sourcePage: 'https://unsplash.com/s/photos/electric-guitar',
    credit: 'Unsplash public image CDN, used under the Unsplash License',
    description: 'Electric guitar detail for gallery usage.'
  },
  keyboardMain: {
    file: 'product-dx88-stage-keyboard-main.jpg',
    url: 'https://images.pexels.com/photos/7096811/pexels-photo-7096811.jpeg?auto=compress&cs=tinysrgb&w=1800',
    sourcePage: 'https://www.pexels.com/photo/a-person-playing-keyboard-synthesizer-7096811/',
    credit: 'Pexels image, used under the Pexels License',
    description: 'Stage keyboard and synthesizer image for DX-88.'
  },
  keyboardStudio: {
    file: 'product-dx88-keyboard-studio.jpg',
    url: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?fm=jpg&fit=crop&w=1800&q=82',
    sourcePage: 'https://unsplash.com/s/photos/music-studio',
    credit: 'Unsplash public image CDN, used under the Unsplash License',
    description: 'Studio production image for keyboard gallery.'
  },
  coreWorkshop: {
    file: 'home-core-acoustic-craft.jpg',
    url: 'https://images.unsplash.com/photo-1513883049090-d0b7439799bf?fm=jpg&fit=crop&w=1800&q=82',
    sourcePage: 'https://unsplash.com/s/photos/piano-craft',
    credit: 'Unsplash public image CDN, used under the Unsplash License',
    description: 'Acoustic craft image for the homepage core section.'
  },
  coreRoom: {
    file: 'home-core-showroom-background.jpg',
    url: 'https://images.pexels.com/photos/167636/pexels-photo-167636.jpeg?auto=compress&cs=tinysrgb&w=2200',
    sourcePage: 'https://www.pexels.com/search/concert/',
    credit: 'Pexels image, used under the Pexels License',
    description: 'Concert and listening room background.'
  },
  quoteStage: {
    file: 'home-quote-performance-stage.jpg',
    url: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?fm=jpg&fit=crop&w=2200&q=82',
    sourcePage: 'https://unsplash.com/s/photos/live-music',
    credit: 'Unsplash public image CDN, used under the Unsplash License',
    description: 'Live performance background for brand quote.'
  },
  artistsHero: {
    file: 'artists-hero-performance.jpg',
    url: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?fm=jpg&fit=crop&w=2200&q=82',
    sourcePage: 'https://unsplash.com/s/photos/musician-stage',
    credit: 'Unsplash public image CDN, used under the Unsplash License',
    description: 'Artist program hero image.'
  },
  artistPiano: {
    file: 'artist-lin-zhiyuan-piano.jpg',
    url: 'https://images.unsplash.com/photo-1552422535-c45813c61732?fm=jpg&fit=crop&w=1400&q=82',
    sourcePage: 'https://unsplash.com/s/photos/pianist',
    credit: 'Unsplash public image CDN, used under the Unsplash License',
    description: 'Pianist portrait-style performance image.'
  },
  artistGuitar: {
    file: 'artist-chen-yichuan-guitar.jpg',
    url: 'https://images.unsplash.com/photo-1564186763535-ebb21ef5277f?fm=jpg&fit=crop&w=1400&q=82',
    sourcePage: 'https://unsplash.com/s/photos/guitarist',
    credit: 'Unsplash public image CDN, used under the Unsplash License',
    description: 'Guitarist performance image.'
  },
  artistKeyboard: {
    file: 'artist-zhou-nianan-keyboard.jpg',
    url: 'https://images.pexels.com/photos/7096811/pexels-photo-7096811.jpeg?auto=compress&cs=tinysrgb&w=1400',
    sourcePage: 'https://www.pexels.com/photo/a-person-playing-keyboard-synthesizer-7096811/',
    credit: 'Pexels image, used under the Pexels License',
    description: 'Keyboard player image.'
  },
  audioHero: {
    file: 'audio-hero-recording-studio.jpg',
    url: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?fm=jpg&fit=crop&w=2200&q=82',
    sourcePage: 'https://unsplash.com/s/photos/recording-studio',
    credit: 'Unsplash public image CDN, used under the Unsplash License',
    description: 'Professional recording studio hero image.'
  },
  audioConsole: {
    file: 'audio-solution-console.jpg',
    url: 'https://images.pexels.com/photos/36269938/pexels-photo-36269938.jpeg?auto=compress&cs=tinysrgb&w=1800',
    sourcePage: 'https://www.pexels.com/photo/audio-engineer-mixing-in-professional-studio-36269938/',
    credit: 'Pexels image, used under the Pexels License',
    description: 'Audio engineer and mixing console.'
  },
  audioLive: {
    file: 'audio-solution-live-stage.jpg',
    url: 'https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?fm=jpg&fit=crop&w=1800&q=82',
    sourcePage: 'https://unsplash.com/s/photos/live-sound',
    credit: 'Unsplash public image CDN, used under the Unsplash License',
    description: 'Live sound and venue environment.'
  },
  supportHero: {
    file: 'support-hero-service-desk.jpg',
    url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?fm=jpg&fit=crop&w=2200&q=82',
    sourcePage: 'https://unsplash.com/s/photos/audio-equipment',
    credit: 'Unsplash public image CDN, used under the Unsplash License',
    description: 'Support and audio equipment hero image.'
  }
};

const pexelsFallbackAssets = {
  heroConcert: ['https://images.pexels.com/photos/1293551/pexels-photo-1293551.jpeg?auto=compress&cs=tinysrgb&w=2200', 'https://www.pexels.com/search/grand%20piano/', 'Concert grand piano performance for the homepage hero.'],
  grandPianoMain: ['https://images.pexels.com/photos/1293551/pexels-photo-1293551.jpeg?auto=compress&cs=tinysrgb&w=1800', 'https://www.pexels.com/search/grand%20piano/', 'Grand piano performance for the C3 Studio Grand.'],
  pianoDetail: ['https://images.pexels.com/photos/210764/pexels-photo-210764.jpeg?auto=compress&cs=tinysrgb&w=1800', 'https://www.pexels.com/search/piano%20sheet%20music/', 'Piano keys and sheet music detail.'],
  uprightPiano: ['https://images.pexels.com/photos/210764/pexels-photo-210764.jpeg?auto=compress&cs=tinysrgb&w=1800', 'https://www.pexels.com/search/piano/', 'Piano keyboard detail for upright practice context.'],
  musicClassroom: ['https://images.pexels.com/photos/7096811/pexels-photo-7096811.jpeg?auto=compress&cs=tinysrgb&w=1800', 'https://www.pexels.com/photo/a-person-playing-keyboard-synthesizer-7096811/', 'Digital music learning and production desk.'],
  guitarMain: ['https://images.pexels.com/photos/3355317/pexels-photo-3355317.jpeg?auto=compress&cs=tinysrgb&w=1800', 'https://www.pexels.com/search/electric%20guitar/', 'Electric guitar close-up for the T6 Electric Guitar.'],
  guitarDetail: ['https://images.pexels.com/photos/258283/pexels-photo-258283.jpeg?auto=compress&cs=tinysrgb&w=1800', 'https://www.pexels.com/search/guitar%20close%20up/', 'String instrument detail for guitar gallery.'],
  keyboardMain: ['https://images.pexels.com/photos/7096811/pexels-photo-7096811.jpeg?auto=compress&cs=tinysrgb&w=1800', 'https://www.pexels.com/photo/a-person-playing-keyboard-synthesizer-7096811/', 'Stage keyboard and MIDI controller image for DX-88.'],
  keyboardStudio: ['https://images.pexels.com/photos/36269938/pexels-photo-36269938.jpeg?auto=compress&cs=tinysrgb&w=1800', 'https://www.pexels.com/photo/audio-engineer-mixing-in-professional-studio-36269938/', 'Studio production and monitoring image.'],
  coreWorkshop: ['https://images.pexels.com/photos/210764/pexels-photo-210764.jpeg?auto=compress&cs=tinysrgb&w=1800', 'https://www.pexels.com/search/piano%20craft/', 'Piano craft and notation detail for acoustic section.'],
  coreRoom: ['https://images.pexels.com/photos/167636/pexels-photo-167636.jpeg?auto=compress&cs=tinysrgb&w=2200', 'https://www.pexels.com/search/concert%20stage/', 'Live venue background for core technology.'],
  quoteStage: ['https://images.pexels.com/photos/167636/pexels-photo-167636.jpeg?auto=compress&cs=tinysrgb&w=2200', 'https://www.pexels.com/search/concert%20stage/', 'Live performance background for brand quote.'],
  artistsHero: ['https://images.pexels.com/photos/167636/pexels-photo-167636.jpeg?auto=compress&cs=tinysrgb&w=2200', 'https://www.pexels.com/search/concert%20stage/', 'Artist stage hero image.'],
  artistPiano: ['https://images.pexels.com/photos/1293551/pexels-photo-1293551.jpeg?auto=compress&cs=tinysrgb&w=1400', 'https://www.pexels.com/search/pianist/', 'Pianist performance image.'],
  artistGuitar: ['https://images.pexels.com/photos/7715349/pexels-photo-7715349.jpeg?auto=compress&cs=tinysrgb&w=1400', 'https://www.pexels.com/photo/man-playing-guitar-on-the-stage-7715349/', 'Guitarist performance image.'],
  artistKeyboard: ['https://images.pexels.com/photos/7096811/pexels-photo-7096811.jpeg?auto=compress&cs=tinysrgb&w=1400', 'https://www.pexels.com/photo/a-person-playing-keyboard-synthesizer-7096811/', 'Keyboard player and production image.'],
  audioHero: ['https://images.pexels.com/photos/36269938/pexels-photo-36269938.jpeg?auto=compress&cs=tinysrgb&w=2200', 'https://www.pexels.com/photo/audio-engineer-mixing-in-professional-studio-36269938/', 'Professional recording studio hero image.'],
  audioConsole: ['https://images.pexels.com/photos/36269938/pexels-photo-36269938.jpeg?auto=compress&cs=tinysrgb&w=1800', 'https://www.pexels.com/photo/audio-engineer-mixing-in-professional-studio-36269938/', 'Audio engineer and mixing console.'],
  audioLive: ['https://images.pexels.com/photos/167636/pexels-photo-167636.jpeg?auto=compress&cs=tinysrgb&w=1800', 'https://www.pexels.com/search/live%20sound/', 'Live sound and stage lighting environment.'],
  supportHero: ['https://images.pexels.com/photos/36269938/pexels-photo-36269938.jpeg?auto=compress&cs=tinysrgb&w=2200', 'https://www.pexels.com/photo/audio-engineer-mixing-in-professional-studio-36269938/', 'Support and professional audio service hero image.']
};

Object.entries(pexelsFallbackAssets).forEach(([key, [url, sourcePage, description]]) => {
  Object.assign(imageAssets[key], {
    url,
    sourcePage,
    credit: 'Pexels image, used under the Pexels License',
    description
  });
});

const img = (key) => `/uploads/real-assets/${imageAssets[key].file}`;

async function downloadAsset(key, asset) {
  const destination = path.join(assetDir, asset.file);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(asset.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'HUSHI WIND content asset updater/1.0',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(destination, buffer);
    return { key, ok: true, bytes: buffer.length };
  } finally {
    clearTimeout(timeout);
  }
}

function writeResource(filename, title, sections) {
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; color: #151515; background: #f7f7f5; line-height: 1.75; }
    main { max-width: 860px; margin: 0 auto; padding: 56px 28px 72px; background: #fff; min-height: 100vh; }
    h1 { font-family: Georgia, "Times New Roman", serif; font-size: 38px; line-height: 1.15; margin: 0 0 12px; }
    h2 { font-size: 20px; margin: 34px 0 10px; }
    p { margin: 0 0 12px; color: #444; }
    ul { padding-left: 20px; margin: 10px 0 0; color: #444; }
    .meta { color: #777; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 36px; }
    .notice { border-left: 3px solid #111; padding: 14px 18px; background: #f3f3f0; margin: 28px 0; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <div class="meta">HUSHI WIND / Hushi Wind Support Library / 2026 Edition</div>
    ${sections.map((section) => `
      <section>
        <h2>${section.heading}</h2>
        ${section.body ? `<p>${section.body}</p>` : ''}
        ${section.items ? `<ul>${section.items.map((item) => `<li>${item}</li>`).join('')}</ul>` : ''}
      </section>`).join('')}
    <div class="notice">本资料用于产品使用与售后沟通参考。涉及上门调律、拆装、供电检测或复杂维修时，请联系授权服务人员。</div>
  </main>
</body>
</html>`;
  const destination = path.join(resourceDir, filename);
  fs.writeFileSync(destination, html, 'utf8');
  return { fileUrl: `/uploads/resources/${filename}`, size: `${Math.max(1, Math.round(Buffer.byteLength(html) / 1024))} KB` };
}

async function upsertByFind(model, where, data) {
  const existing = await prisma[model].findFirst({ where });
  if (existing) return prisma[model].update({ where: { id: existing.id }, data });
  return prisma[model].create({ data: { ...where, ...data } });
}

async function main() {
  fs.mkdirSync(assetDir, { recursive: true });
  fs.mkdirSync(resourceDir, { recursive: true });

  const downloadResults = [];
  for (const [key, asset] of Object.entries(imageAssets)) {
    try {
      downloadResults.push(await downloadAsset(key, asset));
      console.log(`downloaded ${key}`);
    } catch (error) {
      console.warn(`failed ${key}: ${error.message}`);
      throw error;
    }
  }

  const careGuide = writeResource('c3-u1-care-guide.html', 'C3 / U1 原声钢琴保养指南', [
    { heading: '适用型号', body: 'C3 Studio Grand、U1 Artist Upright 以及同类原声钢琴。' },
    { heading: '环境建议', items: ['室内相对湿度建议保持在 45% 到 65%。', '避免阳光直射、空调直吹和暖气片近距离烘烤。', '新琴到家 2 到 4 周后建议安排首次调律。'] },
    { heading: '日常清洁', items: ['键盘使用柔软干布轻拭，避免酒精、含氯清洁剂和大量水分。', '外壳可使用微湿软布后再干布收尾。', '长期不用时保持通风并定期检查防潮状态。'] },
    { heading: '服务周期', body: '家庭练习建议每 6 到 12 个月调律一次；教学、琴行和演出空间建议每 3 到 6 个月检查一次。' }
  ]);

  const quickStart = writeResource('dx88-quickstart.html', 'DX-88 Stage Keyboard 快速上手手册', [
    { heading: '基础连接', items: ['连接原装电源后再接入音频线和 USB-MIDI。', '主输出建议接入调音台的平衡线路输入。', '首次开机将主音量保持在 30% 以下，再逐步提升。'] },
    { heading: '演出准备', items: ['为常用音色建立 Set List，按曲目顺序排序。', '使用 Split / Layer 前确认左右手分区和音量平衡。', '演出前保存一份备份工程到 U 盘或电脑。'] },
    { heading: '维护建议', body: '避免潮湿、粉尘和高温运输环境；接口处如出现噪声，优先检查线材、电源地线和调音台增益。' }
  ]);

  const servicePack = writeResource('service-pack.html', '胡氏管乐售后资料包', [
    { heading: '资料包内容', items: ['保修登记所需信息清单。', '上门服务前的环境与通道确认表。', '维修工单提交示例。', '常见耗材与配件咨询入口。'] },
    { heading: '提交工单前', body: '请准备产品型号、序列号、购买凭证、所在城市、故障描述以及一张清晰的产品现状照片。' },
    { heading: '服务响应', body: '常规咨询会在 1 个工作日内跟进；紧急演出场景请在工单中标明演出日期和场地联系人。' }
  ]);

  await prisma.systemConfig.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      heroImageUrl: img('heroConcert'),
      aboutTitle: '让每一次触键，都有被听见的重量',
      aboutText: '胡氏管乐以原声钢琴工艺为根基，延伸到舞台键盘、吉他与专业音频系统，为演奏者、教育空间和现场工作者提供稳定、细腻、可长期维护的声音装备。',
      contactEmail: 'service@hushiguanle.com',
      contactPhone: '400-888-7726',
      footerText: '© 2026 胡氏管乐 HUSHI WIND Instruments. All rights reserved.'
    },
    update: {
      heroImageUrl: img('heroConcert'),
      aboutTitle: '让每一次触键，都有被听见的重量',
      aboutText: '胡氏管乐以原声钢琴工艺为根基，延伸到舞台键盘、吉他与专业音频系统，为演奏者、教育空间和现场工作者提供稳定、细腻、可长期维护的声音装备。',
      coreTechImageUrl: img('pianoDetail'),
      coreTechTitle: '从木材共鸣到舞台信号\n每一处都为声音服务',
      coreTechDesc: '我们关注的不只是参数，而是演奏者真实感受到的触键、动态、延音、拾音稳定性和空间响应。每件产品都经过材料筛选、结构校准、声学检验和长期维护验证。',
      coreTechLinkText: '了解我们的声学工艺',
      coreTechBgColor: '#080808',
      coreTechBgImageUrl: img('coreRoom'),
      quoteText: '真正可靠的乐器，\n会让表达变得更自然。',
      quoteAuthor: '胡氏管乐技术服务团队',
      quoteBgImageUrl: img('quoteStage'),
      artistHeroImageUrl: img('artistsHero'),
      audioHeroImageUrl: img('audioHero'),
      supportHeroImageUrl: img('supportHero'),
      contactEmail: 'service@hushiguanle.com',
      contactPhone: '400-888-7726',
      footerText: '© 2026 胡氏管乐 HUSHI WIND Instruments. All rights reserved.'
    }
  });

  const products = [
    {
      slug: 'c3-studio-grand',
      title: 'C3 Studio Grand 三角钢琴',
      type: 'piano',
      categoryName: '原声钢琴',
      series: 'Heritage Grand',
      imageUrl: img('grandPianoMain'),
      gallery: [img('grandPianoMain'), img('pianoDetail'), img('coreWorkshop')],
      description: 'C3 Studio Grand 面向专业琴房、录音棚与高阶家庭演奏空间打造。精选云杉实木音板、硬枫击弦机与稳定背柱结构，带来清晰的中高频、沉稳的低频和可控的动态层次。',
      specs: [
        { label: '产品类型', value: '专业三角钢琴' },
        { label: '琴体长度', value: '186 cm' },
        { label: '键盘规格', value: '88 键渐进配重' },
        { label: '音板材料', value: '精选云杉实木音板' },
        { label: '踏板系统', value: '三踏板，含延音与弱音控制' },
        { label: '建议空间', value: '25-45 平方米琴房 / 录音棚' }
      ],
      features: ['云杉实木音板带来稳定、宽阔的共鸣响应。', '硬枫击弦机提升触键反馈和动态控制。', '低频下潜沉稳，中高频清晰，适合独奏和录音采样。', '出厂前完成整音、调律和关键结构检验。'],
      scenes: ['专业琴房', '录音棚采样', '高阶家庭演奏', '小型音乐厅'],
      warranty: '整琴 5 年有限保修，击弦机与踏板系统提供 2 年服务支持。',
      price: 128000,
      quantity: 3,
      isFeatured: true
    },
    {
      slug: 'u1-artist-upright',
      title: 'U1 Artist Upright 立式钢琴',
      type: 'piano',
      categoryName: '原声钢琴',
      series: 'Artist Upright',
      imageUrl: img('uprightPiano'),
      gallery: [img('uprightPiano'), img('musicClassroom'), img('pianoDetail')],
      description: 'U1 Artist Upright 为教学、练习与中小型演出空间设计。紧凑琴体内保留充足共鸣体积，触键响应均衡，音色明亮但不过度尖锐。',
      specs: [
        { label: '产品类型', value: '专业立式钢琴' },
        { label: '琴体高度', value: '121 cm' },
        { label: '键盘规格', value: '88 键标准键盘' },
        { label: '踏板系统', value: '三踏板，含练习弱音功能' },
        { label: '键盖设计', value: '缓降键盖' },
        { label: '建议空间', value: '家庭练习室 / 音乐教室 / 琴行' }
      ],
      features: ['紧凑琴体保留充足共鸣体积，适合长期练习。', '触键响应均衡，便于学生建立稳定手感。', '音色明亮但不过度尖锐，适合教学和家庭环境。', '结构稳定，便于调律维护和日常保养。'],
      scenes: ['音乐教室', '家庭练习', '琴行体验', '小型演出'],
      warranty: '整琴 5 年有限保修，首次到家稳定后可预约调律服务。',
      price: 46800,
      quantity: 8,
      isFeatured: true
    },
    {
      slug: 't6-electric-guitar',
      title: 'T6 Electric Guitar 电吉他',
      type: 'guitar',
      categoryName: '吉他与贝斯',
      series: 'T Series',
      imageUrl: img('guitarMain'),
      gallery: [img('guitarMain'), img('guitarDetail'), img('quoteStage')],
      description: 'T6 Electric Guitar 兼顾舞台表现与录音室稳定性。轻量化琴体、舒适 C 型琴颈和双拾音器配置，覆盖清音、过载与融合类音色。',
      specs: [
        { label: '产品类型', value: '实心电吉他' },
        { label: '有效弦长', value: '25.5 英寸' },
        { label: '品数', value: '22 品' },
        { label: '拾音器', value: '双线圈拾音器' },
        { label: '切换方式', value: '三段式拾音切换' },
        { label: '适合风格', value: '流行 / 摇滚 / Fusion / 现场演出' }
      ],
      features: ['轻量化琴体降低长时间演出负担。', '舒适 C 型琴颈提升复杂把位转换的顺畅度。', '双拾音器配置覆盖清音、过载与融合类音色。', '硬件与电路稳定，适合舞台和录音室使用。'],
      scenes: ['现场演出', '录音室', '排练房', '独立音乐制作'],
      warranty: '主体与硬件 2 年有限保修，电子部件提供 1 年服务支持。',
      price: 6800,
      quantity: 12,
      isFeatured: false
    },
    {
      slug: 'dx-88-stage-keyboard',
      title: 'DX-88 Stage Keyboard 舞台键盘',
      type: 'synth',
      categoryName: '电子键盘',
      series: 'DX Stage',
      imageUrl: img('keyboardMain'),
      gallery: [img('keyboardMain'), img('keyboardStudio'), img('audioConsole')],
      description: 'DX-88 Stage Keyboard 为现场键盘手和音乐制作人准备。88 键逐级配重键床、钢琴/电钢/合成器音色引擎与快速分区控制，让一台设备覆盖排练、巡演和编曲。',
      specs: [
        { label: '产品类型', value: '88 键舞台键盘' },
        { label: '键床', value: 'GHS 逐级配重' },
        { label: '复音数', value: '128 复音' },
        { label: '音色结构', value: '钢琴 / 电钢 / 合成器分层' },
        { label: '连接', value: 'USB-MIDI，平衡线路输出' },
        { label: '控制', value: '快速分区、双声部分层' }
      ],
      features: ['88 键配重键床兼顾钢琴手感与舞台便携性。', '钢琴、电钢与合成器音色覆盖排练、巡演和编曲。', '快速分区控制便于现场切换音色层。', '低延迟输出适合返听、MIDI 控制和现场扩声。'],
      scenes: ['巡演舞台', '音乐制作', '排练室', '教会与活动演出'],
      warranty: '主机 2 年有限保修，电源适配器和接口部件提供 1 年服务支持。',
      price: 12800,
      quantity: 6,
      isFeatured: true
    }
  ];

  for (const product of products) {
    await prisma.product.update({
      where: { slug: product.slug },
      data: {
        ...product,
        gallery: toJson(product.gallery),
        specs: toJson(product.specs),
        features: toJson(product.features),
        scenes: toJson(product.scenes),
        status: 'published'
      }
    });
  }

  const articles = [
    {
      title: '胡氏管乐发布 2026 声学产品矩阵',
      description: '围绕原声钢琴、舞台键盘与现代演出系统，胡氏管乐完成新一代产品矩阵升级，强调更稳定的触键响应、更真实的声学细节和更完整的售后服务体系。',
      category: 'Product Release',
      imageUrl: img('heroConcert'),
      date: '2026-03-16',
      status: 'published'
    },
    {
      title: '从琴房到舞台：如何选择适合你的第一件专业乐器',
      description: '我们整理了教学、家庭练习、录音棚和现场演出四类场景下的选型建议，帮助演奏者在预算、空间和音色需求之间做出更清晰的判断。',
      category: 'Guide',
      imageUrl: img('musicClassroom'),
      date: '2026-03-12',
      status: 'published'
    },
    {
      title: '胡氏管乐 Care+ 服务体系正式上线',
      description: '新的服务体系覆盖保修登记、在线工单、固件下载、视频教程和授权体验中心查询，帮助用户在购买后持续获得可靠支持。',
      category: 'Service',
      imageUrl: img('supportHero'),
      date: '2026-03-08',
      status: 'published'
    }
  ];

  for (const article of articles) {
    await upsertByFind('article', { title: article.title }, article);
  }

  const artists = [
    { name: '林知遥', role: '钢琴演奏家', imageUrl: img('artistPiano'), bio: '青年钢琴演奏家，长期活跃于室内乐、现代作品首演和录音棚项目。她偏好触键反馈清晰、动态范围宽阔的原声钢琴，并将 C3 Studio Grand 用于个人录音与小型音乐会。', equipment: 'C3 Studio Grand', sortOrder: 1 },
    { name: '陈亦川', role: '吉他手 / 制作人', imageUrl: img('artistGuitar'), bio: '独立音乐制作人与现场吉他手，参与多支乐队巡演和影视配乐录制。对设备的稳定性、拾音动态和舞台维护效率有极高要求。', equipment: 'T6 Electric Guitar', sortOrder: 2 },
    { name: '周念安', role: '键盘手', imageUrl: img('artistKeyboard'), bio: '职业键盘手，服务于音乐节、剧场演出和电视现场乐队。她使用 DX-88 Stage Keyboard 完成钢琴、电钢、Pad 与 Lead 音色的快速切换。', equipment: 'DX-88 Stage Keyboard', sortOrder: 3 }
  ];
  for (const artist of artists) await upsertByFind('artist', { name: artist.name }, artist);

  const downloads = [
    { name: 'C3 / U1 系列保养指南', type: 'HTML Guide', size: careGuide.size, fileUrl: careGuide.fileUrl, sortOrder: 1, status: 'published' },
    { name: 'DX-88 快速上手手册', type: 'HTML Manual', size: quickStart.size, fileUrl: quickStart.fileUrl, sortOrder: 2, status: 'published' },
    { name: '售后资料包', type: 'HTML Pack', size: servicePack.size, fileUrl: servicePack.fileUrl, sortOrder: 3, status: 'published' }
  ];
  for (const item of downloads) await upsertByFind('supportDownload', { name: item.name }, item);

  const audioSolutions = [
    { en: 'Live Reinforcement', title: '现场扩声系统', desc: '面向剧场、礼堂和中小型演出空间，提供从调音台、监听到主扩声的完整系统方案。', imageUrl: img('audioLive'), sortOrder: 1, status: 'published' },
    { en: 'Studio Monitoring', title: '录音室监听矩阵', desc: '为音乐制作、配音和后期工作流提供低延迟、低噪声、可校准的监听环境。', imageUrl: img('audioConsole'), sortOrder: 2, status: 'published' },
    { en: 'Education System', title: '音乐教育空间', desc: '适配琴房、排练室和数字音乐教室，兼顾耐用性、易维护性和教学管理效率。', imageUrl: img('musicClassroom'), sortOrder: 3, status: 'published' }
  ];
  for (const item of audioSolutions) await upsertByFind('audioSolution', { title: item.title }, item);

  const timelines = [
    { year: '1998', title: '第一间声学工坊成立', desc: '胡氏管乐从小型维修与调律工作室起步，专注于原声钢琴的音色整理、键盘手感和长期稳定性。', imageUrl: img('coreWorkshop'), sortOrder: 1, status: 'published' },
    { year: '2012', title: '进入专业舞台设备领域', desc: '团队将声学调校经验延伸到键盘、拾音和扩声系统，为演出空间提供更完整的声音解决方案。', imageUrl: img('audioLive'), sortOrder: 2, status: 'published' },
    { year: '2026', title: '构建产品与服务一体化平台', desc: '全新官网与后台系统上线，产品展示、预约咨询、支持下载和售后工单开始形成统一的数字化服务闭环。', imageUrl: img('supportHero'), sortOrder: 3, status: 'published' }
  ];
  for (const item of timelines) await upsertByFind('brandTimeline', { year: item.year }, item);

  const quickGuides = [
    { title: '三分钟完成舞台键盘基础连接', duration: '03:20', category: 'Keyboard', coverUrl: img('keyboardMain'), videoUrl: null, sortOrder: 1, status: 'published' },
    { title: '原声钢琴到家后的环境检查', duration: '04:10', category: 'Piano Care', coverUrl: img('uprightPiano'), videoUrl: null, sortOrder: 2, status: 'published' }
  ];
  for (const item of quickGuides) await upsertByFind('quickGuide', { title: item.title }, item);

  const faqs = [
    { question: '购买后如何登记保修？', answer: '请在支持页提交产品型号、序列号、购买凭证和联系方式。客服确认资料后会为产品建立保修档案，并发送后续维护建议。', category: 'warranty', sortOrder: 1, status: 'published' },
    { question: '原声钢琴多久需要调律一次？', answer: '新琴建议到家稳定 2 到 4 周后进行首次调律，之后根据湿度、使用频率和场地变化，每 6 到 12 个月安排一次专业调律。', category: 'maintenance', sortOrder: 2, status: 'published' },
    { question: '舞台键盘如何更新固件？', answer: '请在支持页下载对应型号的固件包，确认电源稳定后按说明进入更新模式。更新期间不要断电或拔出 USB 设备。', category: 'software', sortOrder: 3, status: 'published' },
    { question: '可以预约线下试奏或试听吗？', answer: '可以。进入产品详情页提交预约试奏，留下城市和期望时间，品牌顾问会协助匹配附近授权体验中心。', category: 'experience', sortOrder: 4, status: 'published' }
  ];
  for (const item of faqs) await upsertByFind('supportFaq', { question: item.question }, item);

  await prisma.pageContent.upsert({
    where: { slug: 'brand-story' },
    create: {
      slug: 'brand-story',
      title: '品牌故事',
      content: '胡氏管乐从原声钢琴调律与维修工坊起步，逐步建立覆盖原声乐器、舞台键盘、吉他与专业音频系统的产品体系。我们相信，真正可靠的乐器不只拥有漂亮的外观和参数，更应该在长期使用中保持稳定、可维护，并让演奏者专注于表达本身。',
      status: 'published'
    },
    update: {
      title: '品牌故事',
      content: '胡氏管乐从原声钢琴调律与维修工坊起步，逐步建立覆盖原声乐器、舞台键盘、吉他与专业音频系统的产品体系。我们相信，真正可靠的乐器不只拥有漂亮的外观和参数，更应该在长期使用中保持稳定、可维护，并让演奏者专注于表达本身。',
      status: 'published'
    }
  });

  const sourceLog = {
    updatedAt: new Date().toISOString(),
    licenses: {
      pexels: 'https://www.pexels.com/license/',
      unsplash: 'https://unsplash.com/license'
    },
    assets: Object.entries(imageAssets).map(([key, asset]) => ({
      key,
      fileUrl: `/uploads/real-assets/${asset.file}`,
      originalUrl: asset.url,
      sourcePage: asset.sourcePage,
      credit: asset.credit,
      description: asset.description
    })),
    downloads: [
      { name: 'C3 / U1 系列保养指南', fileUrl: careGuide.fileUrl },
      { name: 'DX-88 快速上手手册', fileUrl: quickStart.fileUrl },
      { name: '售后资料包', fileUrl: servicePack.fileUrl }
    ],
    downloadResults
  };
  fs.writeFileSync(path.join(uploadDir, 'asset-sources.json'), JSON.stringify(sourceLog, null, 2), 'utf8');

  console.log('Real asset upgrade completed.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
