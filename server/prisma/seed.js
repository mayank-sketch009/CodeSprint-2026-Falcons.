import "dotenv/config";
import { prisma } from "../src/db.js";

const year = new Date().getFullYear();
const people = [
  { phone: "+919000000001", name: "Aarav Sharma", role: "VICTIM", email: "victim@example.test" },
  { phone: "+919000000002", name: "Meera Iyer", role: "OFFICER", email: "officer@example.test" },
  { phone: "+919000000003", name: "Devika Rao", role: "ADMIN", email: "admin@example.test" },
];

const types = ["UPI_QR", "FAKE_SHOPPING", "PHISHING", "SOCIAL_MEDIA", "JOB_INVESTMENT", "ONLINE_BANKING", "OTHER"];
const statuses = ["SUBMITTED", "UNDER_REVIEW", "EVIDENCE_REQUESTED", "FORWARDED", "ACTION_TAKEN", "RESOLVED", "CLOSED", "REJECTED"];

async function seed() {
  const users = {};
  for (const person of people) {
    users[person.role] = await prisma.user.upsert({
      where: { phone: person.phone },
      create: person,
      update: { name: person.name, email: person.email, role: person.role },
    });
  }
  const count = await prisma.complaint.count({ where: { userId: users.VICTIM.id } });
  if (count === 0) {
    for (let index = 0; index < 15; index += 1) {
      const fraudType = types[index % types.length];
      const status = statuses[index % statuses.length];
      const createdAt = new Date(Date.now() - index * 3 * 86_400_000);
      const transactionId = `DEMO${year}${String(index + 1).padStart(8, "0")}`;
      const summary = [
        "Unexpected UPI collect request after a marketplace conversation",
        "Online order was paid but the seller stopped responding",
        "A message asked me to verify my bank details through a link",
        "Someone used a copied profile to ask my family for money",
        "A task-based job offer asked for an upfront fee",
        "I noticed a bank transaction I did not make",
        "A seller promised a refund but asked me to scan a QR code",
      ][index % 7];
      const details = Object.fromEntries(Object.entries({
        amount: String(1800 + index * 675),
        incidentDate: createdAt.toISOString(),
        transactionId: index % 3 === 0 ? transactionId : undefined,
        suspectUpi: index % 4 === 0 ? "support@samplebank" : undefined,
        url: index % 5 === 0 ? "https://shop-example.test/order" : undefined,
        description: summary,
      }).filter(([, value]) => value !== undefined));
      const sequence = await prisma.caseSequence.upsert({
        where: { year },
        create: { year, nextNumber: index + 1 },
        update: { nextNumber: { increment: 1 } },
      });
      const complaint = await prisma.complaint.create({
        data: {
          caseId: `FRT-${year}-${String(sequence.nextNumber).padStart(6, "0")}`,
          userId: users.VICTIM.id,
          assignedToId: index % 2 === 0 ? users.OFFICER.id : null,
          fraudType,
          summary,
          amount: 1800 + index * 675,
          incidentAt: createdAt,
          details,
          status,
          resolvedAt: ["RESOLVED", "CLOSED"].includes(status) ? new Date(createdAt.getTime() + 2 * 86_400_000) : null,
          createdAt,
          history: {
            create: [
              { status: "SUBMITTED", note: "Your report was received.", createdAt },
              ...(status !== "SUBMITTED" ? [{ status, note: status === "EVIDENCE_REQUESTED" ? "Please attach the bank transaction confirmation if available." : "Your case status was updated by the review team.", createdAt: new Date(createdAt.getTime() + 24 * 60 * 60_000) }] : []),
            ],
          },
        },
      });
      const keys = [
        ["TRANSACTION_ID", details.transactionId],
        ["UPI_ID", details.suspectUpi],
        ["URL", details.url],
      ].filter(([, value]) => value);
      for (const [type, value] of keys) {
        const normalized = value.toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
        const identifier = await prisma.suspectIdentifier.upsert({
          where: { type_normalized: { type, normalized } },
          create: { type, value, normalized },
          update: {},
        });
        await prisma.complaintSuspectLink.create({ data: { complaintId: complaint.id, identifierId: identifier.id } });
      }
    }
    await prisma.notification.create({
      data: { userId: users.VICTIM.id, title: "Your demo workspace is ready", message: "Sample complaints are available to explore. Sign in with the demo phone number and OTP 123456." },
    });
  }
  console.info("Seed complete. Demo OTP: 123456.");
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
