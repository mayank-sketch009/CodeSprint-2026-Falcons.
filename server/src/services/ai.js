const TYPES = ["UPI_QR", "FAKE_SHOPPING", "PHISHING", "SOCIAL_MEDIA", "JOB_INVESTMENT", "ONLINE_BANKING", "OTHER"];

function redactForAi(text) {
  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted email or UPI ID]")
    .replace(/\b(?:https?:\/\/|www\.)[^\s]+/gi, "[redacted link]")
    .replace(/\b(?:\d[\s-]?){9,18}\b/g, "[redacted number]")
    .replace(/\b[A-Z]{2,8}\d{6,}\b/gi, "[redacted reference]");
}

export function classifyByKeywords(text = "") {
  const value = text.toLowerCase();
  const rules = [
    ["UPI_QR", /upi|qr code|qr scan|collect request|vpa|transaction id|utr/],
    ["FAKE_SHOPPING", /shopping|online store|order|delivery|seller|e-commerce|website.*product/],
    ["PHISHING", /phishing|link|sms|text message|password|kyc|electricity|otp/],
    ["SOCIAL_MEDIA", /instagram|facebook|social media|profile|impersonat|whatsapp account/],
    ["JOB_INVESTMENT", /job|investment|crypto|trading|telegram|task|scheme|returns/],
    ["ONLINE_BANKING", /bank|debit card|credit card|net banking|account|unauthorized transaction/],
  ];
  return rules.find(([, pattern]) => pattern.test(value))?.[0] || "OTHER";
}

async function askClaude(prompt, maxTokens = 180) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  if (!response.ok) throw new Error(`AI service returned ${response.status}`);
  const result = await response.json();
  return result.content?.filter((item) => item.type === "text").map((item) => item.text).join("\n") || null;
}

export async function classifyFraud(text) {
  const fallback = classifyByKeywords(text);
  if (!process.env.ANTHROPIC_API_KEY) return { fraudType: fallback, source: "keywords" };
  try {
    const answer = await askClaude(`Classify this report description into exactly one label from ${TYPES.join(", ")}. Reply with only the label. Description: ${redactForAi(text).slice(0, 1200)}`, 40);
    const label = answer?.trim().toUpperCase();
    return { fraudType: TYPES.includes(label) ? label : fallback, source: TYPES.includes(label) ? "ai" : "keywords" };
  } catch (error) {
    console.error("AI classification failed; using keyword fallback:", error.message);
    return { fraudType: fallback, source: "keywords" };
  }
}

export async function explainScam(text, language = "en") {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const languageInstruction = language === "hi" ? "Respond in simple Hindi." : "Respond in simple English.";
  return askClaude(`${languageInstruction} In no more than 35 words, explain why this message may be suspicious. Do not claim certainty and do not tell the user to click anything. Text: ${redactForAi(text).slice(0, 1500)}`, 90);
}

export async function answerChat(text, language = "en") {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const languageInstruction = language === "hi" ? "Respond in simple Hindi." : "Respond in simple English.";
  return askClaude(`${languageInstruction} You are a brief, calm safety guide for people affected by online fraud in India. Answer in at most 60 words, use simple language, never claim official authority, never promise money recovery, and direct urgent financial fraud to call 1930 and contact their bank. Do not ask for PINs, passwords, OTPs, or full card details. User: ${redactForAi(text).slice(0, 1000)}`, 130);
}
