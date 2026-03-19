import type { CartItem } from "./product.js";

export interface Order {
  id: string;
  date: string;
  total: number;
  status: "pending" | "shipped" | "delivered" | "cancelled";
  items: CartItem[];
}
