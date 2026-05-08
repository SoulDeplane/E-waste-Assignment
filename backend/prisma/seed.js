require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Seeds the platform admin user from SEED_ADMIN_* env vars and marks them email-verified.
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@ewaste.local';
  const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe!123';
  const name = process.env.SEED_ADMIN_NAME || 'Platform Admin';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (!existing.emailVerifiedAt) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { emailVerifiedAt: new Date() }
      });
      console.log(`Admin already exists; marked email verified: ${email}`);
    } else {
      console.log(`Admin already exists: ${email}`);
    }
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: { name, email, passwordHash, role: 'admin', emailVerifiedAt: new Date() }
  });
  console.log(`Seeded admin: ${email} / ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
