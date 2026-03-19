import type { UserProfile } from "../models/pages.js";
import { laptop, novel, headphones, jacket, sneakers } from "./products.js";

export const profileData: UserProfile = {
  user: {
    name: "Alice Johnson",
    email: "alice@example.com",
    avatar: "https://picsum.photos/seed/alice/80/80",
    role: "customer",
    address: {
      street: "742 Evergreen Terrace",
      city: "Springfield",
      zip: "62704",
      country: "United States",
    },
  },
  orderCount: 3,
  memberSince: "January 2024",
  layout: {
    title: "Alice Johnson — Profile",
    heading: "My Profile",
  },
  recentOrders: [
    {
      id: "ORD-001",
      date: "2025-03-15",
      total: 1324.98,
      status: "delivered",
      items: [
        { product: laptop, quantity: 1 },
        { product: novel, quantity: 1 },
      ],
    },
    {
      id: "ORD-002",
      date: "2025-03-10",
      total: 349.00,
      status: "shipped",
      items: [
        { product: headphones, quantity: 1 },
      ],
    },
    {
      id: "ORD-003",
      date: "2025-02-28",
      total: 318.00,
      status: "pending",
      items: [
        { product: jacket, quantity: 1 },
        { product: sneakers, quantity: 1 },
      ],
    },
  ],
};
