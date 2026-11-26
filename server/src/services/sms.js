export class SmsService {
  async sendOtp(phone, otp) {
    if (process.env.NODE_ENV !== "production" && process.env.OTP_MOCK !== "false") return;
    await this.send(phone, `Your Fraud Response Tracker verification code is ${otp}. It expires soon.`);
  }

  async sendNotification(phone, message) {
    if (process.env.NODE_ENV !== "production" && process.env.OTP_MOCK !== "false") {
      console.info(`[mock-sms] notification queued for phone ending ${phone.slice(-4)}`);
      return;
    }
    await this.send(phone, message);
  }

  async send(phone, message) {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM } = process.env;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM) {
      throw new Error("SMS delivery is not configured. Set Twilio credentials or enable OTP_MOCK in development.");
    }
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
    const form = new URLSearchParams({ To: phone, From: TWILIO_FROM, Body: message.slice(0, 1500) });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    if (!response.ok) throw new Error("The verification message could not be sent. Please try again later.");
  }
}

export const smsService = new SmsService();
