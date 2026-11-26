import { explainScam } from "./ai.js";

const urgency = /\b(urgent|immediately|within \d+ (?:minutes?|hours?)|account (?:blocked|suspended)|act now|last warning|expire(?:s|d)? today)\b/i;
const credentials = /\b(otp|one[- ]time password|upi pin|pin|password|cvv|card number|verify your account|kyc update)\b/i;
const shortened = /\b(bit\.ly|tinyurl\.com|t\.co|is\.gd|cutt\.ly|goo\.gl|rb\.gy|shorturl\.at)\b/i;
const riskyTld = /\.(?:zip|mov|click|top|work|xyz|gq|tk|ml|cf|ga)(?:[/:?#]|$)/i;
const urlPattern = /(?:https?:\/\/)?(?:[\w-]+\.)+[a-z]{2,}(?:\/[^\s]*)?/gi;
const knownBrands = ["google", "amazon", "paytm", "phonepe", "sbi", "hdfc", "icici", "flipkart", "microsoft", "apple"];

function findLookalikes(text) {
  const urls = text.match(urlPattern) || [];
  return urls.filter((url) => {
    const host = url.replace(/^https?:\/\//i, "").split(/[/?#]/)[0].toLowerCase();
    const labels = host.split(".");
    return knownBrands.some((brand) => host.includes(brand) && !host.endsWith(`${brand}.com`) && !host.endsWith(`${brand}.in`) && !(labels.length === 2 && labels[0] === brand));
  });
}

export async function checkScam(text, language = "en") {
  const reasons = [];
  if (urgency.test(text)) reasons.push({ code: "urgency", message: "The message pressures you to act quickly." });
  if (credentials.test(text)) reasons.push({ code: "credentials", message: "It asks for sensitive sign-in or payment details." });
  if (shortened.test(text)) reasons.push({ code: "shortened_link", message: "The link uses a shortened address that hides its destination." });
  if (riskyTld.test(text)) reasons.push({ code: "risky_tld", message: "The link uses a web address ending often abused in scams." });
  const lookalikes = findLookalikes(text);
  if (lookalikes.length) reasons.push({ code: "lookalike_domain", message: "A web address may be imitating a familiar brand." });
  const urls = text.match(urlPattern) || [];
  if (urls.some((url) => url.startsWith("http://"))) reasons.push({ code: "insecure_link", message: "The link does not use a secure HTTPS connection." });
  const risk = reasons.length >= 2 ? "HIGH" : reasons.length === 1 ? "MEDIUM" : "LOW";
  let explanation = null;
  try { explanation = await explainScam(text, language); } catch (error) { console.error("AI scam explanation unavailable:", error.message); }
  const summary = language === "hi"
    ? {
      HIGH: "ये संकेत स्कैम में आम हैं। स्वतंत्र रूप से जाँच करने तक जवाब न दें और लिंक न खोलें।",
      MEDIUM: "इस संदेश में चेतावनी का संकेत है। जवाब देने या लिंक खोलने से पहले स्वतंत्र रूप से जाँचें।",
      LOW: "आम चेतावनी संकेत नहीं मिले, पर इससे संदेश सुरक्षित साबित नहीं होता।",
    }[risk]
    : risk === "HIGH"
      ? "These signals are common in scams. Do not reply or open the link until you verify it independently."
      : risk === "MEDIUM"
        ? "This message has a warning sign. Verify it independently before responding or opening a link."
        : "We did not find common warning signs, but this does not prove the message is safe.";
  return {
    risk,
    reasonCodes: reasons.map(({ code }) => code),
    reasons: reasons.map(({ message }) => message),
    summary,
    explanation,
  };
}
