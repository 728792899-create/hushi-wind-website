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
  // Demo seeding is intentionally destructive and must return a repeatedly
  // used local database to the same fictional baseline. Production never runs
  // this command.
  await prisma.alertRecord.deleteMany();
  await prisma.apiRequestLog.deleteMany();
  await prisma.analyticsEvent.deleteMany();
  await prisma.backupRecord.deleteMany();
  await prisma.contentVersion.deleteMany();
  await prisma.exportRecord.deleteMany();
  await prisma.operationLog.deleteMany();
  await prisma.loginRecord.deleteMany();
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
  await prisma.adminUser.deleteMany({ where: { username: { not: ADMIN_USERNAME } } });
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
  console.log('Preparing fictional portfolio data...');
  await resetContent();
  await seedAdmin();
  console.log(`Base seed complete. Admin: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
