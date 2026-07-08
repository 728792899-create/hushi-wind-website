const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const TEST_TERM = '\u6d4b\u8bd5';

const products = [
  {
    title: 'C3 Studio Grand 三角钢琴',
    slug: 'c3-studio-grand',
    type: 'piano',
    categoryName: '原声钢琴',
    description:
      'C3 Studio Grand 面向专业琴房、录音棚与高阶家庭演奏空间打造。精选云杉实木音板、硬枫击弦机与稳定背柱结构，带来清晰的中高频、沉稳的低频和可控的动态层次。参考参数：长度 186cm，88 键渐进配重键盘，三踏板系统，适合古典、爵士与录音棚采样应用。',
    imageUrl: '/uploads/1772967193183-617508991.jpg',
    series: 'Heritage Grand',
    quantity: 3,
    price: 128000,
    isFeatured: true,
    status: 'active'
  },
  {
    title: 'U1 Artist Upright 立式钢琴',
    slug: 'u1-artist-upright',
    type: 'piano',
    categoryName: '原声钢琴',
    description:
      'U1 Artist Upright 为教学、练习与中小型演出空间设计。紧凑琴体内保留充足共鸣体积，触键响应均衡，音色明亮但不过度尖锐。参考参数：高度 121cm，88 键标准键盘，三踏板系统，缓降键盖，适合琴行、音乐教室与家庭长期使用。',
    imageUrl: '/uploads/1772967221158-963061751.jpg',
    series: 'Artist Upright',
    quantity: 8,
    price: 46800,
    isFeatured: true,
    status: 'active'
  },
  {
    title: 'T6 Electric Guitar 电吉他',
    slug: 't6-electric-guitar',
    type: 'guitar',
    categoryName: '吉他与贝斯',
    description:
      'T6 Electric Guitar 兼顾舞台表现与录音室稳定性。轻量化琴体、舒适 C 型琴颈和双拾音器配置，覆盖清音、过载与融合类音色。参考参数：25.5 英寸有效弦长，22 品，双线圈拾音器，三段式拾音切换，适合流行、摇滚、Fusion 与现场演出。',
    imageUrl: '/uploads/1772966710039-910609896.jpg',
    series: 'T Series',
    quantity: 12,
    price: 6800,
    isFeatured: false,
    status: 'active'
  },
  {
    title: 'DX-88 Stage Keyboard 舞台键盘',
    slug: 'dx-88-stage-keyboard',
    type: 'synth',
    categoryName: '电子键盘',
    description:
      'DX-88 Stage Keyboard 为现场键盘手和音乐制作人准备。88 键逐级配重键床、钢琴/电钢/合成器音色引擎与快速分区控制，让一台设备覆盖排练、巡演和编曲。参考参数：88 键 GHS 配重，128 复音，双声部分层，USB-MIDI，平衡线路输出。',
    imageUrl: '/uploads/1772967354613-986647367.jpg',
    series: 'DX Stage',
    quantity: 6,
    price: 12800,
    isFeatured: true,
    status: 'active'
  }
];

const articles = [
  {
    title: '胡氏管乐发布 2026 声学产品矩阵',
    description:
      '围绕原声钢琴、舞台键盘与现代演出系统，胡氏管乐完成新一代产品矩阵升级，强调更稳定的触键响应、更真实的声学细节和更完整的售后服务体系。',
    category: 'Product Release',
    imageUrl: '/uploads/1773375182990.jpg',
    date: '2026-03-16',
    views: 0
  },
  {
    title: '从琴房到舞台：如何选择适合你的第一件专业乐器',
    description:
      '我们整理了教学、家庭练习、录音棚和现场演出四类场景下的选型建议，帮助演奏者在预算、空间和音色需求之间做出更清晰的判断。',
    category: 'Guide',
    imageUrl: '/uploads/1773398020375.jpg',
    date: '2026-03-12',
    views: 0
  },
  {
    title: '胡氏管乐 Care+ 服务体系正式上线',
    description:
      '新的服务体系覆盖保修登记、在线工单、固件下载、视频教程和授权体验中心查询，帮助用户在购买后持续获得可靠支持。',
    category: 'Service',
    imageUrl: '/uploads/1773484189398.jpg',
    date: '2026-03-08',
    views: 0
  }
];

const faqs = [
  {
    question: '如何为胡氏管乐产品登记保修？',
    answer:
      '购买后请保留发票或电子订单，并在支持页提交产品型号、序列号和联系方式。客服确认资料后会为产品建立保修档案。',
    sortOrder: 1
  },
  {
    question: '原声钢琴多久需要调律一次？',
    answer:
      '新琴建议到家稳定 2 到 4 周后进行首次调律，之后根据湿度、使用频率和场地变化，每 6 到 12 个月安排一次专业调律。',
    sortOrder: 2
  },
  {
    question: '舞台键盘和合成器如何更新固件？',
    answer:
      '请在支持页下载对应型号的固件包，确认电源稳定后按说明进入更新模式。更新期间不要断电或拔出 USB 设备。',
    sortOrder: 3
  },
  {
    question: '可以预约线下试奏或试听吗？',
    answer:
      '可以。进入产品详情页提交“预约试奏”，留下城市和期望时间，品牌顾问会协助匹配附近授权体验中心。',
    sortOrder: 4
  },
  {
    question: '产品运输和安装由谁负责？',
    answer:
      '钢琴和大型音频设备建议由授权服务团队运输安装。顾问会根据楼层、通道宽度和使用场地提前确认方案。',
    sortOrder: 5
  },
  {
    question: '如果设备出现故障，应该如何报修？',
    answer:
      '请在支持页选择“Repair Service”提交工单，描述问题并留下联系方式。售后团队会根据故障类型安排远程排查或上门服务。',
    sortOrder: 6
  }
];

const services = [
  {
    icon: 'CARE',
    title: '胡氏管乐 Care+',
    desc: '覆盖保修登记、维修工单、调律预约和配件咨询，为乐器和音频设备提供持续服务。',
    link: '/support',
    sortOrder: 1
  },
  {
    icon: 'LIVE',
    title: '演出与扩声方案',
    desc: '为剧场、学校、Livehouse 和录音棚提供设备选型、系统调试与应用建议。',
    link: '/audio',
    sortOrder: 2
  },
  {
    icon: 'PRO',
    title: '艺术家合作计划',
    desc: '面向专业演奏者、制作人和教育者开放合作申请，共同探索声音表达的新边界。',
    link: '/artists',
    sortOrder: 3
  }
];

const audioSolutions = [
  {
    en: 'Live Reinforcement',
    title: '现场扩声系统',
    desc: '面向剧场、礼堂和中小型演出空间，提供从调音台、监听到主扩声的完整系统方案。',
    imageUrl: '/uploads/1773388068644.jpg',
    sortOrder: 1
  },
  {
    en: 'Studio Monitoring',
    title: '录音室监听矩阵',
    desc: '为音乐制作、配音和后期工作流提供低延迟、低噪声、可校准的监听环境。',
    imageUrl: '/uploads/1773390996325.jpg',
    sortOrder: 2
  },
  {
    en: 'Education System',
    title: '音乐教育空间',
    desc: '适配琴房、排练室和数字音乐教室，兼顾耐用性、易维护性和教学管理效率。',
    imageUrl: '/uploads/1773650449627.jpg',
    sortOrder: 3
  }
];

const audioStats = [
  { label: 'Processing Latency', value: '< 1.2ms', desc: '核心处理链路低延迟，适合现场返听和实时演奏。', sortOrder: 1 },
  { label: 'Sampling Rate', value: '96kHz', desc: '支持高解析度采样，保留更多瞬态与空间细节。', sortOrder: 2 },
  { label: 'Service Coverage', value: '48h', desc: '重点城市售后工单 48 小时内响应。', sortOrder: 3 }
];

const artists = [
  {
    name: '林知遥',
    role: '钢琴演奏家',
    imageUrl: '/uploads/1773375951949.jpg',
    bio:
      '青年钢琴演奏家，长期活跃于室内乐、现代作品首演和录音棚项目。她偏好触键反馈清晰、动态范围宽阔的原声钢琴，并将 C3 Studio Grand 用于个人录音与小型音乐会。',
    equipment: 'C3 Studio Grand',
    sortOrder: 1
  },
  {
    name: '陈亦川',
    role: '吉他手 / 制作人',
    imageUrl: '/uploads/1773479684791.jpg',
    bio:
      '独立音乐制作人与现场吉他手，参与多支乐队巡演和影视配乐录制。对设备的稳定性、拾音动态和舞台维护效率有极高要求。',
    equipment: 'T6 Electric Guitar',
    sortOrder: 2
  },
  {
    name: '周念安',
    role: '键盘手',
    imageUrl: '/uploads/1773479863248.jpg',
    bio:
      '职业键盘手，服务于音乐节、剧场演出和电视现场乐队。她使用 DX-88 Stage Keyboard 完成钢琴、电钢、Pad 与 Lead 音色的快速切换。',
    equipment: 'DX-88 Stage Keyboard',
    sortOrder: 3
  }
];

const downloads = [
  { name: 'C3 / U1 系列保养指南', size: '1.2 MB', type: 'PDF', fileUrl: null, sortOrder: 1 },
  { name: 'DX-88 快速上手手册', size: '2.4 MB', type: 'PDF', fileUrl: null, sortOrder: 2 },
  { name: '售后资料包', size: '0.80 MB', type: 'ZIP', fileUrl: '/uploads/1773387304215.rar', sortOrder: 3 }
];

const guides = [
  {
    title: '三分钟完成舞台键盘基础连接',
    duration: '03:20',
    category: 'Keyboard',
    coverUrl: '/uploads/1773386572437.jpg',
    videoUrl: '/uploads/1773386559093.mp4',
    sortOrder: 1
  },
  {
    title: '原声钢琴到家后的环境检查',
    duration: '04:10',
    category: 'Piano Care',
    coverUrl: '/uploads/1773390996325.jpg',
    videoUrl: null,
    sortOrder: 2
  }
];

const timelines = [
  {
    year: '1998',
    title: '第一间声学工坊成立',
    desc: '胡氏管乐从小型维修与调律工作室起步，专注于原声钢琴的音色整理、键盘手感和长期稳定性。',
    imageUrl: '/uploads/1773378562278.jpg',
    sortOrder: 1
  },
  {
    year: '2012',
    title: '进入专业舞台设备领域',
    desc: '团队将声学调校经验延伸到键盘、拾音和扩声系统，为演出空间提供更完整的声音解决方案。',
    imageUrl: '/uploads/1773398001725.jpeg',
    sortOrder: 2
  },
  {
    year: '2026',
    title: '构建产品与服务一体化平台',
    desc: '全新官网与后台系统上线，产品展示、预约咨询、支持下载和售后工单开始形成统一的数字化服务闭环。',
    imageUrl: '/uploads/1773484189398.jpg',
    sortOrder: 3
  }
];

const pages = [
  {
    slug: 'privacy',
    title: '隐私政策',
    content:
      '胡氏管乐仅收集完成产品咨询、预约试奏、售后服务和艺术家合作申请所必需的信息。我们不会出售用户资料，也不会将联系方式用于未经授权的营销活动。\n\n当您提交表单时，我们会保存姓名、联系方式、咨询内容和提交时间，用于客服回访和服务记录。您可以随时联系 service@hushiguanle.com 请求更新或删除相关信息。'
  },
  {
    slug: 'join-us',
    title: '加入我们',
    content:
      '我们欢迎热爱音乐、声学工程、产品设计和客户服务的人加入胡氏管乐。\n\n当前开放方向包括：产品顾问、调律与维修技师、内容运营、声学系统工程师、艺术家关系专员。请将个人资料与相关作品发送至 hr@hushiguanle.com。'
  },
  {
    slug: 'csr',
    title: '社会责任',
    content:
      '胡氏管乐关注可持续材料、音乐教育普及和长期可维修设计。我们会优先选择可追溯木材与耐用部件，减少一次性耗材，并通过校园项目支持青少年音乐教育。\n\n我们相信，一件好乐器不只服务一位演奏者，也应该在更长时间里陪伴更多声音被听见。'
  }
];

async function replaceTable(model, rows) {
  await prisma[model].deleteMany({});
  if (rows.length) {
    await prisma[model].createMany({ data: rows });
  }
}

async function upsertPrimaryProduct() {
  const primary = products[0];
  const existing = await prisma.product.findUnique({ where: { slug: primary.slug } });
  if (existing) {
    await prisma.product.update({ where: { slug: primary.slug }, data: primary });
    return;
  }

  const testSlot = await prisma.product.findFirst({
    where: {
      OR: [
        { slug: '00211' },
        { description: { contains: TEST_TERM } },
        { categoryName: { contains: TEST_TERM } }
      ]
    },
    orderBy: { id: 'asc' }
  });

  if (testSlot) {
    await prisma.product.update({ where: { id: testSlot.id }, data: primary });
  } else {
    await prisma.product.create({ data: primary });
  }
}

async function upsertRemainingProducts() {
  for (const product of products.slice(1)) {
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: product,
      create: product
    });
  }

  await prisma.product.deleteMany({
    where: {
      OR: [
        { title: { contains: TEST_TERM } },
        { description: { contains: TEST_TERM } },
        { categoryName: { contains: TEST_TERM } },
        { slug: '00211' }
      ]
    }
  });
}

async function main() {
  await prisma.systemConfig.upsert({
    where: { id: 1 },
    update: {
      heroImageUrl: '/uploads/1773374294655.png',
      aboutTitle: '让每一次触键，都有被听见的重量',
      aboutText:
        '胡氏管乐以原声工艺为根基，融合现代声学工程与数字化服务，为演奏者、教育者和舞台工作者提供稳定、细腻、可信赖的声音伙伴。',
      contactEmail: 'service@hushiguanle.com',
      contactPhone: '400-888-7726',
      footerText: '© 2026 胡氏管乐。保留所有权利。',
      coreTechImageUrl: '/uploads/1773650487859.jpg',
      coreTechTitle: '从木材共鸣到数字控制\n每一处都为声音服务',
      coreTechDesc:
        '我们关注的不只是参数，而是演奏者真实感受到的触键、动态、延音和空间响应。每件产品都经过材料筛选、结构校准、声学检验和长期稳定性验证。',
      coreTechLinkText: '了解我们的声学工艺',
      coreTechBgColor: '#0a0a0a',
      coreTechBgImageUrl: '/uploads/1773650472891.jpeg',
      quoteText: '真正可靠的乐器，\n会让表达变得更自然。',
      quoteAuthor: '胡氏管乐技术服务团队',
      quoteBgImageUrl: '/uploads/1773393601467.jpg',
      artistHeroImageUrl: '/uploads/1773482710405.jpg',
      audioHeroImageUrl: '/uploads/1773483351136.png',
      supportHeroImageUrl: '/uploads/1773484189398.jpg'
    },
    create: {
      id: 1,
      heroImageUrl: '/uploads/1773374294655.png',
      aboutTitle: '让每一次触键，都有被听见的重量',
      aboutText:
        '胡氏管乐以原声工艺为根基，融合现代声学工程与数字化服务，为演奏者、教育者和舞台工作者提供稳定、细腻、可信赖的声音伙伴。',
      contactEmail: 'service@hushiguanle.com',
      contactPhone: '400-888-7726',
      footerText: '© 2026 胡氏管乐。保留所有权利。',
      coreTechImageUrl: '/uploads/1773650487859.jpg',
      coreTechTitle: '从木材共鸣到数字控制\n每一处都为声音服务',
      coreTechDesc:
        '我们关注的不只是参数，而是演奏者真实感受到的触键、动态、延音和空间响应。每件产品都经过材料筛选、结构校准、声学检验和长期稳定性验证。',
      coreTechLinkText: '了解我们的声学工艺',
      coreTechBgColor: '#0a0a0a',
      coreTechBgImageUrl: '/uploads/1773650472891.jpeg',
      quoteText: '真正可靠的乐器，\n会让表达变得更自然。',
      quoteAuthor: '胡氏管乐技术服务团队',
      quoteBgImageUrl: '/uploads/1773393601467.jpg',
      artistHeroImageUrl: '/uploads/1773482710405.jpg',
      audioHeroImageUrl: '/uploads/1773483351136.png',
      supportHeroImageUrl: '/uploads/1773484189398.jpg'
    }
  });

  await upsertPrimaryProduct();
  await upsertRemainingProducts();

  await replaceTable('article', articles);
  await replaceTable('supportFaq', faqs);
  await replaceTable('ecosystemService', services);
  await replaceTable('audioSolution', audioSolutions);
  await replaceTable('audioStat', audioStats);
  await replaceTable('artist', artists);
  await replaceTable('supportDownload', downloads);
  await replaceTable('quickGuide', guides);
  await replaceTable('brandTimeline', timelines);
  await replaceTable('pageContent', pages);
}

main()
  .then(() => console.log('Content cleanup and first-pass production copy completed.'))
  .finally(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
