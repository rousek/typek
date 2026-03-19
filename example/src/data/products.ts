import type { Product } from "../models/product.js";

export const laptop: Product = {
  name: "ProBook Laptop 15",
  price: 1299.99,
  description: "Powerful laptop with 16GB RAM, 512GB SSD, and a stunning 15-inch display.",
  inStock: true,
  category: "electronics",
  tags: ["laptop", "portable", "work"],
  rating: 4.5,
  imageUrl: "https://picsum.photos/seed/laptop/400/200",
};

export const jacket: Product = {
  name: "Winter Parka",
  price: 189.00,
  description: "Warm and waterproof parka perfect for harsh winters.",
  inStock: true,
  category: "clothing",
  tags: ["winter", "waterproof", "warm"],
  rating: 4.2,
  imageUrl: "https://picsum.photos/seed/jacket/400/200",
};

export const novel: Product = {
  name: "The Last Algorithm",
  price: 24.99,
  description: "A thrilling sci-fi novel about an AI that discovers consciousness.",
  inStock: true,
  category: "books",
  tags: ["sci-fi", "AI", "bestseller"],
  rating: 4.8,
  imageUrl: "https://picsum.photos/seed/book/400/200",
};

export const coffee: Product = {
  name: "Premium Espresso Beans",
  price: 18.50,
  description: "Single-origin Ethiopian beans, dark roast, 500g bag.",
  inStock: false,
  category: "food",
  tags: ["coffee", "organic", "single-origin"],
  rating: 4.7,
  imageUrl: "https://picsum.photos/seed/coffee/400/200",
};

export const headphones: Product = {
  name: "Noise-Cancelling Headphones",
  price: 349.00,
  description: "Over-ear headphones with 30-hour battery life and ANC.",
  inStock: true,
  category: "electronics",
  tags: ["audio", "wireless", "noise-cancelling"],
  rating: 4.6,
  imageUrl: "https://picsum.photos/seed/headphones/400/200",
};

export const sneakers: Product = {
  name: "Urban Runner Sneakers",
  price: 129.00,
  description: "Lightweight running shoes with responsive cushioning.",
  inStock: true,
  category: "clothing",
  tags: ["shoes", "running", "lightweight"],
  rating: 4.3,
  imageUrl: "https://picsum.photos/seed/sneakers/400/200",
};
