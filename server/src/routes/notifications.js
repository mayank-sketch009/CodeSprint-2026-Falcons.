import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler, errorResponse, success } from "../lib.js";
import { authenticate, validate } from "../middleware.js";
import { z } from "zod";
import { listDevNotifications, isDevFallback, markDevNotificationRead } from "../devStore.js";

const router = Router();
router.use(authenticate);

router.get("/", asyncHandler(async (req, res) => {
  if (isDevFallback()) return success(res, listDevNotifications(req.user.sub));
  const items = await prisma.notification.findMany({
    where: { userId: req.user.sub },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, complaintId: true, title: true, message: true, readAt: true, createdAt: true },
  });
  success(res, items);
}));

router.patch("/:id/read", validate(z.object({}).strict()), asyncHandler(async (req, res) => {
  if (isDevFallback()) {
    const notification = markDevNotificationRead(req.params.id, req.user.sub);
    if (!notification) throw errorResponse(404, "NOTIFICATION_NOT_FOUND", "That notification could not be found.");
    return success(res, { notification });
  }
  const result = await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.user.sub, readAt: null },
    data: { readAt: new Date() },
  });
  if (result.count === 0) {
    const existing = await prisma.notification.findFirst({ where: { id: req.params.id, userId: req.user.sub } });
    if (!existing) throw errorResponse(404, "NOTIFICATION_NOT_FOUND", "That notification could not be found.");
    return success(res, { notification: existing });
  }
  const notification = await prisma.notification.findFirst({ where: { id: req.params.id, userId: req.user.sub } });
  success(res, { notification });
}));

export default router;
