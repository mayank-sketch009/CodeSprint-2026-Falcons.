import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, errorResponse, normalizePhone, success } from "../lib.js";
import { authenticate, phoneSchema, requireRoles, validate } from "../middleware.js";

const router = Router();
const officerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: phoneSchema,
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
});

router.use(authenticate, requireRoles("ADMIN"));

router.get("/analytics", asyncHandler(async (_req, res) => {
  const [totalComplaints, openComplaints, byFraudType, byStatus, resolved, identifiers, monthlyTrend] = await Promise.all([
    prisma.complaint.count(),
    prisma.complaint.count({ where: { status: { notIn: ["RESOLVED", "CLOSED", "REJECTED"] } } }),
    prisma.complaint.groupBy({ by: ["fraudType"], _count: { _all: true } }),
    prisma.complaint.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.complaint.findMany({ where: { status: { in: ["RESOLVED", "CLOSED"] }, resolvedAt: { not: null } }, select: { createdAt: true, resolvedAt: true } }),
    prisma.suspectIdentifier.findMany({
      where: { complaintLinks: { some: {} } },
      select: { type: true, value: true, _count: { select: { complaintLinks: true } } },
      orderBy: { complaintLinks: { _count: "desc" } },
      take: 8,
    }),
    Promise.all(Array.from({ length: 6 }, (_, index) => {
      const start = new Date();
      start.setDate(1);
      start.setMonth(start.getMonth() - (5 - index));
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      return prisma.complaint.count({ where: { createdAt: { gte: start, lt: end } } }).then((count) => ({
        month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
        count,
      }));
    })),
  ]);
  const durations = resolved.map((item) => (item.resolvedAt.getTime() - item.createdAt.getTime()) / 86_400_000).filter((value) => value >= 0);
  success(res, {
    totalComplaints,
    openComplaints,
    averageResolutionDays: durations.length ? Math.round((durations.reduce((sum, value) => sum + value, 0) / durations.length) * 10) / 10 : null,
    byFraudType: byFraudType.map((item) => ({ fraudType: item.fraudType, count: item._count._all })),
    byStatus: byStatus.map((item) => ({ status: item.status, count: item._count._all })),
    monthlyTrend,
    topIdentifiers: identifiers.filter((item) => item._count.complaintLinks > 1).map((item) => ({ type: item.type, value: item.value, count: item._count.complaintLinks })),
  });
}));

router.get("/officers", asyncHandler(async (_req, res) => {
  const officers = await prisma.user.findMany({
    where: { role: "OFFICER" },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, phone: true, email: true, createdAt: true },
  });
  success(res, officers);
}));

router.post("/officers", validate(officerSchema), asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing?.role === "ADMIN") throw errorResponse(409, "ROLE_CONFLICT", "An administrator account cannot be changed to an officer.");
  const officer = await prisma.user.upsert({
    where: { phone },
    create: { phone, name: req.body.name, email: req.body.email || null, role: "OFFICER" },
    update: { name: req.body.name, email: req.body.email || null, role: "OFFICER" },
    select: { id: true, name: true, phone: true, email: true, createdAt: true },
  });
  await prisma.officerAuditLog.create({ data: { actorId: req.user.sub, action: "OFFICER_ACCOUNT_CREATED", metadata: { officerId: officer.id } } });
  success(res, { officer }, existing ? 200 : 201);
}));

export default router;
