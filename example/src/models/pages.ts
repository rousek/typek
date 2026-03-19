import type { Product, CartItem } from "./product.js";
import type { User } from "./user.js";
import type { Order } from "./order.js";
import type { PageLayout } from "./layout.js";

export interface StorePage {
  title: string;
  description: string;
  products: Product[];
  featuredProduct: Product | null;
  categories: string[];
  layout: PageLayout;
}

export interface CartPage {
  user: User;
  items: CartItem[];
  couponCode: string | null;
  currency: string;
  layout: PageLayout;
}

export interface UserProfile {
  user: User;
  orderCount: number;
  memberSince: string;
  recentOrders: Order[];
  layout: PageLayout;
}

export interface EmailData {
  recipient: string;
  subject: string;
  greeting: string;
  body: string;
  footerText: string;
  unsubscribeUrl: string;
  layout: PageLayout;
}
