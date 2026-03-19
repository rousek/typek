import type { StorePage, CartPage, UserProfile, EmailData, Product } from "./types.js";

const laptop: Product = {
  name: "ProBook Laptop 15",
  price: 1299.99,
  description: "Powerful laptop with 16GB RAM, 512GB SSD, and a stunning 15-inch display.",
  inStock: true,
  category: "electronics",
  tags: ["laptop", "portable", "work"],
  rating: 4.5,
  imageUrl: "https://picsum.photos/seed/laptop/400/200",
};

const jacket: Product = {
  name: "Winter Parka",
  price: 189.00,
  description: "Warm and waterproof parka perfect for harsh winters.",
  inStock: true,
  category: "clothing",
  tags: ["winter", "waterproof", "warm"],
  rating: 4.2,
  imageUrl: "https://picsum.photos/seed/jacket/400/200",
};

const novel: Product = {
  name: "The Last Algorithm",
  price: 24.99,
  description: "A thrilling sci-fi novel about an AI that discovers consciousness.",
  inStock: true,
  category: "books",
  tags: ["sci-fi", "AI", "bestseller"],
  rating: 4.8,
  imageUrl: "https://picsum.photos/seed/book/400/200",
};

const coffee: Product = {
  name: "Premium Espresso Beans",
  price: 18.50,
  description: "Single-origin Ethiopian beans, dark roast, 500g bag.",
  inStock: false,
  category: "food",
  tags: ["coffee", "organic", "single-origin"],
  rating: 4.7,
  imageUrl: "https://picsum.photos/seed/coffee/400/200",
};

const headphones: Product = {
  name: "Noise-Cancelling Headphones",
  price: 349.00,
  description: "Over-ear headphones with 30-hour battery life and ANC.",
  inStock: true,
  category: "electronics",
  tags: ["audio", "wireless", "noise-cancelling"],
  rating: 4.6,
  imageUrl: "https://picsum.photos/seed/headphones/400/200",
};

const sneakers: Product = {
  name: "Urban Runner Sneakers",
  price: 129.00,
  description: "Lightweight running shoes with responsive cushioning.",
  inStock: true,
  category: "clothing",
  tags: ["shoes", "running", "lightweight"],
  rating: 4.3,
  imageUrl: "https://picsum.photos/seed/sneakers/400/200",
};

export const storeData: StorePage = {
  title: "TechStyle Store",
  description: "Your one-stop shop for electronics, clothing, books, and more.",
  products: [laptop, jacket, novel, coffee, headphones, sneakers],
  featuredProduct: laptop,
  categories: ["electronics", "clothing", "books", "food"],
  layout: {
    title: "TechStyle Store",
    heading: "Welcome to TechStyle",
  },
};

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
};

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

export const emailData: EmailData = {
  recipient: "alice@example.com",
  subject: "Your order has shipped!",
  greeting: "Hi Alice,",
  body: "Great news! Your order #ORD-002 has been shipped and is on its way. You can expect delivery within 3-5 business days. Track your package using the link in your account dashboard.",
  footerText: "You are receiving this email because you made a purchase at TechStyle Store.",
  unsubscribeUrl: "https://example.com/unsubscribe?token=abc123",
};
