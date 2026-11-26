import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, errorResponse, normalizePhone, success, randomOtp } from "../lib.js";
import { phoneSchema, validate } from "../middleware.js";
import { smsService } from "../services/sms.js";

const router = Router();
const sendSchema = z.object({ phone: phoneSchema });
const verifySchema = z.object({ phone: phoneSchema, otp: z.string().trim().regex(/^\d{6}$/) });
const devUsers = new Map();

async function findOrCreateDevUser(phone) {
  if (!devUsers.has(phone)) {
    const role = phone === "+919000000002" ? "OFFICER" : phone === "+919000000003" ? "ADMIN" : "VICTIM";
    const names = {
      VICTIM: "Demo Victim",
      OFFICER: "Demo Officer",
      ADMIN: "Demo Admin",
    };
    devUsers.set(phone, { id: `dev-${phone.slice(-10)}`, phone, name: names[role], role, email: role === "VICTIM" ? null : `${role.toLowerCase()}@example.test` });
  }
  return devUsers.get(phone);
}

async function databaseAuthAvailable() {
  return Boolean(process.env.DATABASE_URL);
}

router.post("/send-otp", validate(sendSchema), asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (!(await databaseAuthAvailable())) {
    await smsService.sendOtp(phone, "123456");
    return success(res, { message: "The demo one-time code is 123456.", expiresInSeconds: 300 });
  }
  const recent = await prisma.otpSession.findFirst({
    where: { phone, createdAt: { gte: new Date(Date.now() - 60_000) } },
    orderBy: { createdAt: "desc" },
  });
  if (recent) throw errorResponse(429, "OTP_COOLDOWN", "Please wait a minute before requesting another code.");

  const mock = process.env.NODE_ENV !== "production" && process.env.OTP_MOCK !== "false";
  const otp = mock ? "123456" : randomOtp();
  try {
    await smsService.sendOtp(phone, otp);
  } catch {
    throw errorResponse(503, "OTP_DELIVERY_FAILED", "We could not send a verification code right now. Please try again later.");
  }
  const user = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
  await prisma.otpSession.updateMany({ where: { phone, consumedAt: null }, data: { consumedAt: new Date() } });
  await prisma.otpSession.create({
    data: {
      phone,
      codeHash: await bcrypt.hash(otp, 10),
      expiresAt: new Date(Date.now() + Number(process.env.OTP_TTL_MINUTES || 5) * 60_000),
      userId: user?.id,
    },
  });
  success(res, { message: "If this number can receive messages, a one-time code has been sent.", expiresInSeconds: Number(process.env.OTP_TTL_MINUTES || 5) * 60 });
}));

router.post("/verify-otp", validate(verifySchema), asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (!(await databaseAuthAvailable())) {
    if (req.body.otp !== "123456") throw errorResponse(400, "OTP_INVALID", "That code is not correct. In development, use 123456.");
    const user = await findOrCreateDevUser(phone);
    const token = jwt.sign({ sub: user.id, role: user.role, phone: user.phone }, process.env.JWT_SECRET, { expiresIn: "12h", issuer: "fraud-response-tracker" });
    return success(res, { token, user });
  }
  const session = await prisma.otpSession.findFirst({ where: { phone, consumedAt: null }, orderBy: { createdAt: "desc" } });
  if (!session || session.expiresAt < new Date() || session.attempts >= 5) {
    throw errorResponse(400, "OTP_INVALID", "This code has expired or cannot be used. Request a new code.");
  }
  const valid = await bcrypt.compare(req.body.otp, session.codeHash);
  if (!valid) {
    await prisma.otpSession.update({ where: { id: session.id }, data: { attempts: { increment: 1 } } });
    throw errorResponse(400, "OTP_INVALID", "That code is not correct. Please check it and try again.");
  }
  const user = await prisma.$transaction(async (tx) => {
    await tx.otpSession.update({ where: { id: session.id }, data: { consumedAt: new Date() } });
    return tx.user.upsert({
      where: { phone },
      create: { phone },
      update: {},
      select: { id: true, phone: true, name: true, role: true, email: true },
    });
  });
  const token = jwt.sign({ sub: user.id, role: user.role, phone: user.phone }, process.env.JWT_SECRET, { expiresIn: "12h", issuer: "fraud-response-tracker" });
  success(res, { token, user });
}));

export default router;
