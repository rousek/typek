import type { CartPage } from "../models/pages.js";
import { laptop, novel, headphones } from "./products.js";

export const cartData: CartPage = {
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
  items: [
    { product: laptop, quantity: 1 },
    { product: novel, quantity: 2 },
    { product: headphones, quantity: 1 },
  ],
  couponCode: "SAVE20",
  currency: "$",
  layout: {
    title: "Shopping Cart — TechStyle",
    heading: "Shopping Cart",
  },
};
