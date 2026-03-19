import type { ContactsPage } from "../models/customer.js";

export const contactsData: ContactsPage = {
  customers: [
    {
      companyName: "Acme Corp",
      registrationNumber: "CZ12345678",
      revenue: 5200000,
      contactEmail: "info@acme.example.com",
    },
    {
      firstName: "Jan",
      lastName: "Novak",
      age: 34,
      phone: "+420 777 123 456",
    },
    {
      companyName: "Globex Inc",
      registrationNumber: "US98765432",
      revenue: 12800000,
      contactEmail: "hello@globex.example.com",
    },
    {
      firstName: "Eva",
      lastName: "Svobodova",
      age: 28,
      phone: "+420 608 987 654",
    },
  ],
  layout: {
    title: "Contacts",
    heading: "Our Contacts",
  },
};
