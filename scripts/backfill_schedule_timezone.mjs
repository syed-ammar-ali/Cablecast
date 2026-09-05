import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Backfill existing user schedule items with India Standard Time offset (-330 minutes)
  const result = await prisma.userPersonalSchedule.updateMany({
    where: {
      timezoneOffset: null,
    },
    data: {
      timezoneOffset: -330,
    },
  });

  console.log(`Backfilled ${result.count} schedule items with timezoneOffset: -330 (IST).`);

  const updated = await prisma.userPersonalSchedule.findMany({
    select: {
      id: true,
      title: true,
      dayOfWeek: true,
      blockStartMinutes: true,
      timezoneOffset: true,
    },
  });
  console.log("Updated schedules:", JSON.stringify(updated, null, 2));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
