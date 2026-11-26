import nodemailer from "nodemailer";

let transport;
function getTransport() {
  if (!process.env.SMTP_HOST) return null;
  if (!transport) transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

export async function sendEmail({ to, subject, text }) {
  const mailer = getTransport();
  if (!mailer || !to) return false;
  await mailer.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
  return true;
}
