import jwt from "jsonwebtoken";
import { z } from "zod";
import { errorResponse } from "./lib.js";

export function authenticate(req, _res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return next(errorResponse(401, "AUTH_REQUIRED", "Please sign in to continue."));
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(errorResponse(401, "INVALID_SESSION", "Your session is invalid or has expired. Please sign in again."));
  }
}

export function optionalAuthenticate(req, _res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return next();
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); } catch { /* Treat an expired optional session as signed out. */ }
  next();
}

export function requireRoles(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(errorResponse(401, "AUTH_REQUIRED", "Please sign in to continue."));
    if (!roles.includes(req.user.role)) return next(errorResponse(403, "FORBIDDEN", "You do not have permission to do that."));
    next();
  };
}

export function validate(schema, source = "body") {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(errorResponse(400, "VALIDATION_ERROR", "Please check the information and try again.", result.error.flatten()));
    }
    req[source] = result.data;
    next();
  };
}

export const phoneSchema = z.string().trim().min(10).max(16).regex(/^\+?[0-9 -]+$/).transform((value) => value.replace(/[ -]/g, ""));
