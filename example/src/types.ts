export interface Product {
  name: string;
  price: number;
  description: string;
  inStock: boolean;
  category: "electronics" | "clothing" | "books" | "food";
  tags: string[];
  rating: number;
  imageUrl: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface User {
  name: string;
  email: string;
  avatar: string | null;
  role: "admin" | "customer";
  address: Address | null;
}

export interface Address {
  street: string;
  city: string;
  zip: string;
  country: string;
}

export interface StorePage {
  title: string;
  description: string;
  products: Product[];
  featuredProduct: Product | null;
  categories: string[];
}

export interface CartPage {
  user: User;
  items: CartItem[];
  couponCode: string | null;
  currency: string;
}

export interface UserProfile {
  user: User;
  orderCount: number;
  memberSince: string;
  recentOrders: Order[];
}

export interface Order {
  id: string;
  date: string;
  total: number;
  status: "pending" | "shipped" | "delivered" | "cancelled";
  items: CartItem[];
}

export interface EmailData {
  recipient: string;
  subject: string;
  greeting: string;
  body: string;
  footerText: string;
  unsubscribeUrl: string;
}
