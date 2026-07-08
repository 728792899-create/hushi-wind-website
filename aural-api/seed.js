const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('⏳ 正在向 AURAL 数据库注入数据...');

  // 1. 清理旧数据（防止重复运行报错）
  await prisma.product.deleteMany();
  await prisma.article.deleteMany();

  // 2. 注入核心产品：C3X 三角钢琴
  const c3x = await prisma.product.create({
    data: {
      title: 'C3X 旗舰三角钢琴',
      slug: 'c3x',
      type: 'piano',
      categoryName: 'Piano',
      description: '作为 C 系列的巅峰之作，C3X 拥有极其丰富的共鸣与细腻的触感。它不仅仅是一件乐器，更是连接你与观众灵魂的桥梁。纯手工甄选云杉木音板，带来无与伦比的动态范围。',
      // 暂时留空，前端会自动显示我们在 Vue 里写好的那张绝美占位图
      imageUrl: null 
    }
  });
  console.log(`✅ 成功上架乐器: ${c3x.title}`);

  // 3. 注入第一条品牌视野（新闻）
  const news = await prisma.article.create({
    data: {
      title: '2026 AURAL 声学技术革新发布会圆满落幕',
      description: '在东京的年度发布会上，AURAL 展示了如何将百年传统木工与现代精密数字传感技术完美结合。',
      category: 'Event',
      date: '2026-03-08',
      imageUrl: null
    }
  });
  console.log(`✅ 成功发布新闻: ${news.title}`);

  console.log('🎉 数据库初始化大功告成！');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });