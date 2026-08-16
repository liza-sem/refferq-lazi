const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function main() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  const name = process.env.ADMIN_NAME || 'LAZI';

  if (!email || !password) {
    console.log('Skipping admin bootstrap (ADMIN_EMAIL / ADMIN_PASSWORD not set)');
    return;
  }

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.role !== 'ADMIN' || existing.status !== 'ACTIVE') {
        await prisma.user.update({
          where: { email },
          data: { role: 'ADMIN', status: 'ACTIVE' },
        });
        console.log(`Promoted existing user ${email} to ADMIN`);
      } else {
        console.log(`Admin ${email} already exists`);
      }
      return;
    }

    const hash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: {
        email,
        password: hash,
        name,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });
    console.log(`Created admin ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Admin bootstrap failed:', error);
  process.exit(1);
});
