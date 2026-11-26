import { prisma } from "../db.js";
import { sendEmail } from "./mailer.js";
import { smsService } from "./sms.js";

export async function notifyUser({ userId, complaintId, title, message }) {
  const notification = await prisma.notification.create({
    data: { userId, complaintId, title, message },
    include: { user: { select: { email: true, phone: true } } },
  });
  try {
    await sendEmail({ to: notification.user.email, subject: title, text: message });
  } catch (error) {
    console.error("Email notification delivery failed:", error.message);
  }
  try {
    await smsService.sendNotification(notification.user.phone, `${title}. ${message}`);
  } catch (error) {
    console.error("SMS notification delivery failed:", error.message);
  }
  return notification;
}
