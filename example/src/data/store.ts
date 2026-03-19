import type { StorePage } from "../models/pages.js";
import { laptop, jacket, novel, coffee, headphones, sneakers } from "./products.js";

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
