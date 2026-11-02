import { PrismaClient } from '@prisma/client';
import { closeSeedConnection, seed } from './seed';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Production bootstrap requires NODE_ENV=production');
  }

  const [users, courses, degrees, hackathons] = await Promise.all([
    prisma.user.count(),
    prisma.course.count(),
    prisma.nanoDegree.count(),
    prisma.hackathon.count(),
  ]);

  if (users + courses + degrees + hackathons > 0) {
    console.info('Production bootstrap skipped: business data already exists');
    return;
  }

  console.info('Empty production database detected; creating initial platform data');
  await seed();
}

main()
  .catch((error) => {
    console.error('Production bootstrap failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([prisma.$disconnect(), closeSeedConnection()]);
  });
