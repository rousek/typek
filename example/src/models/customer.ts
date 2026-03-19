import type { PageLayout } from "./layout.js";

export interface Company {
  companyName: string;
  registrationNumber: string;
  revenue: number;
  contactEmail: string;
}

export interface Person {
  firstName: string;
  lastName: string;
  age: number;
  phone: string;
}

export type Customer = Company | Person;

export interface ContactsPage {
  customers: Customer[];
  layout: PageLayout;
}
