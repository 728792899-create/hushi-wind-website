const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const stringify = (value) => JSON.stringify(value);

const productUpgrades = [
  {
    slug: 'c3-studio-grand',
    gallery: [
      '/uploads/1772967193183-617508991.jpg',
      '/uploads/1773650487859.jpg',
      '/uploads/1773375182990.jpg'
    ],
    specs: [
      { label: '产品类型', value: '专业三角钢琴' },
      { label: '琴体长度', value: '186 cm' },
      { label: '键盘规格', value: '88 键渐进配重' },
      { label: '音板材料', value: '精选云杉实木音板' },
      { label: '踏板系统', value: '三踏板，含延音与弱音控制' },
      { label: '建议空间', value: '25-45 平方米琴房 / 录音棚' }
    ],
    features: [
      '云杉实木音板带来稳定、宽阔的共鸣响应。',
      '硬枫击弦机提升触键反馈和动态控制。',
      '低频下潜沉稳，中高频清晰，适合独奏和录音采样。',
      '出厂前完成整音、调律和关键结构检验。'
    ],
    scenes: ['专业琴房', '录音棚采样', '高阶家庭演奏', '小型音乐厅'],
    warranty: '整琴 5 年有限保修，击弦机与踏板系统提供 2 年服务支持。'
  },
  {
    slug: 'u1-artist-upright',
    gallery: [
      '/uploads/1772967221158-963061751.jpg',
      '/uploads/1773650449627.jpg',
      '/uploads/1773375905075.jpg'
    ],
    specs: [
      { label: '产品类型', value: '专业立式钢琴' },
      { label: '琴体高度', value: '121 cm' },
      { label: '键盘规格', value: '88 键标准键盘' },
      { label: '踏板系统', value: '三踏板，含练习弱音功能' },
      { label: '键盖设计', value: '缓降键盖' },
      { label: '建议空间', value: '家庭练习室 / 音乐教室 / 琴行' }
    ],
    features: [
      '紧凑琴体保留充足共鸣体积，适合长期练习。',
      '触键响应均衡，便于学生建立稳定手感。',
      '音色明亮但不过度尖锐，适合教学和家庭环境。',
      '结构稳定，便于调律维护和日常保养。'
    ],
    scenes: ['音乐教室', '家庭练习', '琴行体验', '小型演出'],
    warranty: '整琴 5 年有限保修，首次到家稳定后可预约调律服务。'
  },
  {
    slug: 't6-electric-guitar',
    gallery: [
      '/uploads/1772966710039-910609896.jpg',
      '/uploads/1773386572437.jpg',
      '/uploads/1773390996325.jpg'
    ],
    specs: [
      { label: '产品类型', value: '实心电吉他' },
      { label: '有效弦长', value: '25.5 英寸' },
      { label: '品数', value: '22 品' },
      { label: '拾音器', value: '双线圈拾音器' },
      { label: '切换方式', value: '三段式拾音切换' },
      { label: '适合风格', value: '流行 / 摇滚 / Fusion / 现场演出' }
    ],
    features: [
      '轻量化琴体降低长时间演出负担。',
      '舒适 C 型琴颈提升复杂把位转换的顺畅度。',
      '双拾音器配置覆盖清音、过载与融合类音色。',
      '硬件与电路稳定，适合舞台和录音室使用。'
    ],
    scenes: ['现场演出', '录音室', '排练房', '独立音乐制作'],
    warranty: '主体与硬件 2 年有限保修，电子部件提供 1 年服务支持。'
  },
  {
    slug: 'dx-88-stage-keyboard',
    gallery: [
      '/uploads/1772967354613-986647367.jpg',
      '/uploads/1773483351136.png',
      '/uploads/1773375244153.jpg'
    ],
    specs: [
      { label: '产品类型', value: '88 键舞台键盘' },
      { label: '键床', value: 'GHS 逐级配重' },
      { label: '复音数', value: '128 复音' },
      { label: '音色结构', value: '钢琴 / 电钢 / 合成器分层' },
      { label: '连接', value: 'USB-MIDI，平衡线路输出' },
      { label: '控制', value: '快速分区、双声部分层' }
    ],
    features: [
      '88 键配重键床兼顾钢琴手感与舞台便携性。',
      '钢琴、电钢与合成器音色覆盖排练、巡演和编曲。',
      '快速分区控制便于现场切换音色层。',
      '低延迟输出适合返听、MIDI 控制和现场扩声。'
    ],
    scenes: ['巡演舞台', '音乐制作', '排练室', '教会与活动演出'],
    warranty: '主机 2 年有限保修，电源适配器和接口部件提供 1 年服务支持。'
  }
];

const faqCategories = [
  { sortOrder: 1, category: 'warranty' },
  { sortOrder: 2, category: 'maintenance' },
  { sortOrder: 3, category: 'software' },
  { sortOrder: 4, category: 'experience' },
  { sortOrder: 5, category: 'delivery' },
  { sortOrder: 6, category: 'repair' }
];

async function upgradeProducts() {
  for (const item of productUpgrades) {
    await prisma.product.update({
      where: { slug: item.slug },
      data: {
        gallery: stringify(item.gallery),
        specs: stringify(item.specs),
        features: stringify(item.features),
        scenes: stringify(item.scenes),
        warranty: item.warranty
      }
    });
  }
}

async function upgradeFaqs() {
  for (const item of faqCategories) {
    await prisma.supportFaq.updateMany({
      where: { sortOrder: item.sortOrder },
      data: { category: item.category }
    });
  }
}

async function main() {
  await upgradeProducts();
  await upgradeFaqs();
  console.log('Structured product parameters, galleries and FAQ categories upgraded.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
