import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, cleanText, errorResponse, success } from "../lib.js";
import { authenticate, optionalAuthenticate, validate } from "../middleware.js";
import { answerChat, classifyFraud } from "../services/ai.js";
import { checkScam } from "../services/scamCheck.js";
import { getDevComplaint, isDevFallback, listDevComplaints } from "../devStore.js";

const router = Router();
const textSchema = z.object({ text: z.string().trim().min(4).max(5000) });
const scamSchema = textSchema.extend({ language: z.enum(["en", "hi"]).optional() });
const messageSchema = z.object({ message: z.string().trim().min(2).max(1000) });

router.post("/classify", validate(z.object({ description: z.string().trim().min(10).max(1500) })), asyncHandler(async (req, res) => {
  const result = await classifyFraud(cleanText(req.body.description));
  success(res, result);
}));

router.post("/scam-check", validate(scamSchema), asyncHandler(async (req, res) => {
  const result = await checkScam(cleanText(req.body.text), req.body.language || "en");
  success(res, result);
}));

router.post("/chat", optionalAuthenticate, validate(messageSchema.extend({ language: z.enum(["en", "hi"]).optional() })), asyncHandler(async (req, res) => {
  const message = cleanText(req.body.message);
  const language = req.body.language || "en";
  const reference = message.match(/\bFRT-\d{4}-\d{6}\b/i)?.[0]?.toUpperCase();
  if (/\b(case|complaint|report)\b/i.test(message)) {
    if (!req.user || req.user.role !== "VICTIM") {
      return success(res, { answer: language === "hi"
        ? "शिकायत देखने के लिए उसी फोन नंबर से साइन इन करें जिसका उपयोग रिपोर्ट करते समय किया था। अभी पैसे गए हों तो 1930 और अपने बैंक से संपर्क करें।"
        : "To look up a complaint, sign in with the phone number used to report it. If money was just taken, call 1930 and contact your bank now." });
    }
    const complaint = isDevFallback()
      ? (() => {
        const items = listDevComplaints(req.user.sub);
        const found = reference ? items.find((item) => item.caseId === reference) : items[0];
        if (!found) return null;
        const full = getDevComplaint(found.id);
        return { caseId: full.caseId, status: full.status, summary: full.summary, updatedAt: full.updatedAt };
      })()
      : reference
      ? await prisma.complaint.findFirst({ where: { caseId: reference, userId: req.user.sub }, select: { caseId: true, status: true, summary: true, updatedAt: true } })
      : await prisma.complaint.findFirst({ where: { userId: req.user.sub }, orderBy: { updatedAt: "desc" }, select: { caseId: true, status: true, summary: true, updatedAt: true } });
    if (!complaint) return success(res, { answer: language === "hi"
      ? "आपके खाते में यह शिकायत नहीं मिली। उसी फोन नंबर से साइन इन करें जिसका उपयोग रिपोर्ट करते समय किया था।"
      : "I couldn’t find a complaint under your account. Check that you signed in with the same phone number used to report it." });
    const statusEn = complaint.status.toLowerCase().replaceAll("_", " ");
    const statusHi = { SUBMITTED: "जमा की गई", UNDER_REVIEW: "समीक्षा में", EVIDENCE_REQUESTED: "सबूत मांगे गए", FORWARDED: "आगे भेजी गई", ACTION_TAKEN: "कार्रवाई हुई", RESOLVED: "हल की गई", CLOSED: "बंद", REJECTED: "स्वीकार नहीं हुई" }[complaint.status];
    return success(res, { answer: language === "hi"
      ? `आपका केस ${complaint.caseId} (${complaint.summary}) अभी ${statusHi} है। आखिरी अपडेट ${complaint.updatedAt.toLocaleDateString("hi-IN")} को था। पूरी समयरेखा के लिए मेरी शिकायतें खोलें।`
      : `Your case ${complaint.caseId} (“${complaint.summary}”) is currently ${statusEn}. Last updated ${complaint.updatedAt.toLocaleDateString("en-IN")}. Open My complaints for the full timeline.` });
  }
  try {
    const response = await answerChat(message, language);
    if (response) return success(res, { answer: response });
  } catch (error) {
    console.error("Chat AI unavailable; using local guidance:", error.message);
  }
  const answer = language === "hi"
    ? /\b(?:money|paid|transferred|upi|payment|bank)\b/i.test(message)
      ? "अभी पैसे भेजे गए हों तो तुरंत 1930 पर कॉल करें और बैंक के आधिकारिक नंबर पर संपर्क करें। लेन-देन संदर्भ और संदेश संभालकर रखें। यह सेवा मार्गदर्शन देती है, आधिकारिक रिपोर्ट का विकल्प नहीं है।"
      : /\b(?:password|link|phish|otp|account)\b/i.test(message)
        ? "संदिग्ध लिंक न खोलें और OTP, PIN या पासवर्ड साझा न करें। पासवर्ड दर्ज किया हो तो भरोसेमंद डिवाइस से बदलें और संबंधित सेवा से संपर्क करें।"
        : "संदेश, लिंक और भुगतान संदर्भ संभालकर रखें। पैसे गए हों तो 1930 और बैंक से तुरंत संपर्क करें। आधिकारिक साइबर क्राइम पोर्टल पर भी रिपोर्ट करें।"
    : /\b(?:money|paid|transferred|upi|payment|bank)\b/i.test(message)
      ? "If money was just transferred, call 1930 now and contact your bank through its official number. Keep the transaction reference and messages. This service is for guidance and does not replace an official report."
      : /\b(?:password|link|phish|otp|account)\b/i.test(message)
        ? "Do not open suspicious links or share an OTP, PIN or password. If you entered a password, change it from a trusted device and contact the affected service using its official app or website."
        : "Save the messages, links and payment references. If money was taken, call 1930 and your bank right away. You can report the incident here and follow updates, but also use the official cybercrime portal.";
  success(res, { answer });
}));

export default router;
