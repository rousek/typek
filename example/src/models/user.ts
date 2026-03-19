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
