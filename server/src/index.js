import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { prisma } from "./db.js";
import { errorResponse } from "./lib.js";
import authRouter from "./routes/auth.js";
import complaintRouter from "./routes/complaints.js";
import officerRouter from "./routes/officer.js";
import adminRouter from "./routes/admin.js";
import notificationRouter from "./routes/notifications.js";
import toolsRouter from "./routes/tools.js";

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be set to a random value of at least 32 characters.");
}

const app = express();
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
const configuredClientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";
app.use(cors({
  origin(origin, callback) {
    const isLocalDevelopmentOrigin = process.env.NODE_ENV !== "production"
      && /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin || "");
    callback(null, !origin || origin === configuredClientOrigin || isLocalDevelopmentOrigin);
  },
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));

const otpSendLimit = rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: "draft-7", legacyHeaders: false, message: { error: { code: "RATE_LIMITED", message: "Too many code requests. Wait a little and try again." } } });
const otpVerifyLimit = rateLimit({ windowMs: 10 * 60_000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false, message: { error: { code: "RATE_LIMITED", message: "Too many verification attempts. Wait a little and try again." } } });
const chatLimit = rateLimit({ windowMs: 10 * 60_000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false, message: { error: { code: "RATE_LIMITED", message: "Quick help is temporarily busy. Please try again later." } } });

app.get("/health", (_req, res) => res.json({ status: "ok", service: "fraud-response-tracker-api" }));
app.use("/api/v1/auth/send-otp", otpSendLimit);
app.use("/api/v1/auth/verify-otp", otpVerifyLimit);
app.use("/api/v1/tools/chat", chatLimit);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/complaints", complaintRouter);
app.use("/api/v1/officer", officerRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/notifications", notificationRouter);
app.use("/api/v1/tools", toolsRouter);

app.use((_req, _res, next) => next(errorResponse(404, "NOT_FOUND", "This API endpoint does not exist.")));
app.use((error, _req, res, _next) => {
  if (res.headersSent) return;
  const status = error.status || (error.code === "LIMIT_FILE_SIZE" ? 413 : error.code === "LIMIT_FILE_COUNT" ? 400 : 500);
  if (status >= 500) console.error("API request failed:", error);
  res.status(status).json({
    error: {
      code: error.code || "INTERNAL_ERROR",
      message: status >= 500 ? "Something went wrong. Please try again." : error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  });
});

const port = Number(process.env.PORT || 4000);
const server = app.listen(port, () => console.info(`Fraud Response Tracker API listening on http://localhost:${port}`));

async function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
