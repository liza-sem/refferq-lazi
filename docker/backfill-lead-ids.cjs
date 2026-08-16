const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateLeadPublicId() {
  const bytes = crypto.randomBytes(4);
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `LD-${code}`;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const missing = await prisma.referral.findMany({
      where: { publicId: null },
      select: { id: true },
    });
    if (missing.length === 0) {
      console.log('Lead public IDs: all referrals already have one');
      return;
    }

    let filled = 0;
    for (const row of missing) {
      let publicId = generateLeadPublicId();
      for (let attempt = 0; attempt < 8; attempt++) {
        const taken = await prisma.referral.findUnique({ where: { publicId } });
        if (!taken) break;
        publicId = generateLeadPublicId();
      }
      await prisma.referral.update({
        where: { id: row.id },
        data: { publicId },
      });
      filled++;
    }
    console.log(`Lead public IDs: assigned ${filled}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Lead public ID backfill failed:', error);
  process.exit(1);
});
