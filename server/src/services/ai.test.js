import test from "node:test";
import assert from "node:assert/strict";
import { classifyByKeywords } from "./ai.js";
import { checkScam } from "./scamCheck.js";

test("classifies common fraud descriptions using local keywords", () => {
  assert.equal(classifyByKeywords("I scanned a UPI QR code and sent money"), "UPI_QR");
  assert.equal(classifyByKeywords("A fake job on Telegram asked for a task fee"), "JOB_INVESTMENT");
  assert.equal(classifyByKeywords("A bank transaction appeared that I did not make"), "ONLINE_BANKING");
});

test("flags urgency, credential requests and shortened links as high risk", async () => {
  const result = await checkScam("URGENT: your bank account is blocked. Send your OTP now at https://bit.ly/security");
  assert.equal(result.risk, "HIGH");
  assert.ok(result.reasons.length >= 3);
  assert.match(result.summary, /common in scams|do not reply/i);
});

test("keeps a clean message at a lower heuristic risk without claiming it is safe", async () => {
  const result = await checkScam("Your monthly account statement is ready in the official app.");
  assert.equal(result.risk, "LOW");
  assert.match(result.summary, /does not prove/i);
});
