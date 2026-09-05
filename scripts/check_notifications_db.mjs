import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const subs = await prisma.pushSubscription.findMany();
  const logs = await prisma.notificationLog.findMany();
  const personalSchedules = await prisma.userPersonalSchedule.findMany();
  const appointments = await prisma.scheduledAppointment.findMany();

  console.log("=== PUSH SUBSCRIPTIONS ===");
  console.log("Count:", subs.length);
  console.log(JSON.stringify(subs, null, 2));

  console.log("\n=== NOTIFICATION LOGS ===");
  console.log("Count:", logs.length);
  console.log(JSON.stringify(logs, null, 2));

  console.log("\n=== USER PERSONAL SCHEDULES ===");
  console.log("Count:", personalSchedules.length);
  console.log(JSON.stringify(personalSchedules, null, 2));

  console.log("\n=== SCHEDULED APPOINTMENTS ===");
  console.log("Count:", appointments.length);
  console.log(JSON.stringify(appointments, null, 2));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
