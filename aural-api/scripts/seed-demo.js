const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'demo_admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'DemoPass_2026!';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    salt,
    hash: crypto.pbkdf2Sync(String(password), salt, 120000, 64, 'sha512').toString('hex'),
  };
}

async function resetContent() {
  await prisma.inquiry.deleteMany();
  await prisma.artistApplication.deleteMany();
  await prisma.product.deleteMany();
  await prisma.article.deleteMany();
  await prisma.artist.deleteMany();
  await prisma.supportFaq.deleteMany();
  await prisma.supportDownload.deleteMany();
  await prisma.audioSolution.deleteMany();
  await prisma.audioStat.deleteMany();
  await prisma.brandTimeline.deleteMany();
  await prisma.ecosystemService.deleteMany();
  await prisma.quickGuide.deleteMany();
  await prisma.pageContent.deleteMany();
}

async function seedAdmin() {
  const { salt, hash } = hashPassword(ADMIN_PASSWORD);
  await prisma.adminUser.upsert({
    where: { username: ADMIN_USERNAME },
    update: {
      displayName: 'Demo Admin',
      role: 'super_admin',
      status: 'active',
      passwordSalt: salt,
      passwordHash: hash,
      tokenVersion: { increment: 1 },
      failedLoginCount: 0,
      lockedUntil: null,
    },
    create: {
      username: ADMIN_USERNAME,
      displayName: 'Demo Admin',
      role: 'super_admin',
      status: 'active',
      passwordSalt: salt,
      passwordHash: hash,
    },
  });
}

async function main() {
  console.log('Seeding public demo data...');
  await resetContent();
  await seedAdmin();

  await prisma.systemConfig.upsert({
    where: { id: 1 },
    update: {
      aboutTitle: '胡氏管乐演示站',
      aboutText: '这是用于本地演示的脱敏数据，展示官网、CMS 后台和 API 的完整交付结构。',
      contactEmail: 'demo@example.com',
      contactPhone: '000-0000-0000',
      footerText: 'Demo content for local review.',
      coreTechTitle: '声学设计与数字化服务',
      coreTechDesc: '用结构化内容管理产品、案例、支持资料和客户线索。',
    },
    create: {
      id: 1,
      aboutTitle: '胡氏管乐演示站',
      aboutText: '这是用于本地演示的脱敏数据，展示官网、CMS 后台和 API 的完整交付结构。',
      contactEmail: 'demo@example.com',
      contactPhone: '000-0000-0000',
      footerText: 'Demo content for local review.',
      coreTechTitle: '声学设计与数字化服务',
      coreTechDesc: '用结构化内容管理产品、案例、支持资料和客户线索。',
    },
  });

  await prisma.product.createMany({
    data: [
      {
        title: 'Demo Pro 单簧管',
        slug: 'demo-pro-clarinet',
        sku: 'DEMO-CL-001',
        model: 'Demo Pro',
        color: 'Black',
        type: 'woodwind',
        categoryName: '单簧管',
        description: '用于本地演示的脱敏产品数据，展示产品目录、详情页和后台内容维护能力。',
        specs: JSON.stringify(['ABS 管体', '镀镍按键', '适合教学与演出']),
        features: JSON.stringify(['稳定音准', '维护方便', '入门友好']),
        scenes: JSON.stringify(['音乐教室', '社团排练', '小型演出']),
        price: 1680,
        quantity: 20,
        isFeatured: true,
        status: 'published',
        seoTitle: 'Demo Pro 单簧管',
        seoDescription: '脱敏演示产品。',
        publishedAt: new Date(),
      },
      {
        title: 'Demo Stage 长笛',
        slug: 'demo-stage-flute',
        sku: 'DEMO-FL-002',
        model: 'Demo Stage',
        color: 'Silver',
        type: 'woodwind',
        categoryName: '长笛',
        description: '适合展示分类、库存、价格和 SEO 字段的演示长笛产品。',
        specs: JSON.stringify(['闭孔设计', 'C 尾管', '银色外观']),
        features: JSON.stringify(['响应灵敏', '音色明亮', '便于保养']),
        scenes: JSON.stringify(['独奏练习', '管乐团', '校园演出']),
        price: 2380,
        quantity: 12,
        isFeatured: true,
        status: 'published',
        seoTitle: 'Demo Stage 长笛',
        seoDescription: '脱敏演示产品。',
        publishedAt: new Date(),
      },
    ],
  });

  await prisma.article.createMany({
    data: [
      {
        title: '如何为校园管乐团选择第一批乐器',
        slug: 'campus-band-buying-guide',
        description: '从预算、维护、音准和教学场景出发，整理一套可落地的采购思路。',
        category: 'Guide',
        date: '2026-06-01',
        status: 'published',
        publishedAt: new Date(),
      },
      {
        title: '后台 CMS 如何支持官网内容持续更新',
        slug: 'cms-content-workflow',
        description: '用产品、文章、资源和线索表单构成一个小型业务网站的运营闭环。',
        category: 'Case',
        date: '2026-06-10',
        status: 'published',
        publishedAt: new Date(),
      },
    ],
  });

  await prisma.supportFaq.createMany({
    data: [
      { question: '这份数据是真实客户资料吗？', answer: '不是。公开仓库只包含脱敏演示数据。', category: 'demo', sortOrder: 1 },
      { question: '后台演示账号如何获取？', answer: '演示账号仅在本地运行说明（README / 终端 seed 输出）中提供，不在前台公开展示。', category: 'demo', sortOrder: 2 },
    ],
  });

  await prisma.pageContent.createMany({
    data: [
      { slug: 'about-demo', title: '关于演示站', content: '该页面用于展示 CMS 页面内容管理能力。', status: 'published' },
      { slug: 'privacy-demo', title: '隐私与公开说明', content: '公开版本不包含真实客户数据、生产密钥或真实上传资源。', status: 'published' },
    ],
  });

  console.log(`Demo seed complete. Admin: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
