// Read-only verification. A mismatch exits nonzero and never reseals history.
require('./load-env').loadEnvFile();
const { PrismaClient } = require('@prisma/client');
const { verifyAuditIntegrity } = require('../lib/audit-integrity');

async function main() {
  const db = new PrismaClient();
  try {
    console.log(JSON.stringify(await verifyAuditIntegrity(db), null, 2));
  } finally {
    await db.$disconnect();
  }
}
if (require.main === module) main().catch((error) => {
  console.error(error.code || 'AUDIT_VERIFICATION_ERROR', error.message);
  process.exitCode = 1;
});
module.exports = { main };
