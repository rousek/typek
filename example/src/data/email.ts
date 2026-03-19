import type { EmailData } from "../models/pages.js";

export const emailData: EmailData = {
  recipient: "alice@example.com",
  subject: "Your order has shipped!",
  greeting: "Hi Alice,",
  body: "Great news! Your order #ORD-002 has been shipped and is on its way. You can expect delivery within 3-5 business days. Track your package using the link in your account dashboard.",
  footerText: "You are receiving this email because you made a purchase at TechStyle Store.",
  unsubscribeUrl: "https://example.com/unsubscribe?token=abc123",
  layout: {
    title: "Your order has shipped!",
    heading: "Order Notification",
  },
};
