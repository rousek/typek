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
