import type { PageLayout } from "./layout.js";

// --- Role-based union types (duck typing) ---

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  role: "admin";
  avatar: string | null;
  isActive: boolean;
  isSuperAdmin: boolean;
  permissions: string[];
  lastLogin: string;
  address: UserAddress | null;
  preferences: UserPreferences;
  department: string;
  accessLevel: number;
}

export interface EditorUser {
  id: number;
  username: string;
  email: string;
  role: "editor";
  avatar: string | null;
  isActive: boolean;
  bio: string;
  assignedCategories: string[];
  lastLogin: string;
  address: UserAddress | null;
  preferences: UserPreferences;
  publishedCount: number;
  draftCount: number;
}

export interface ViewerUser {
  id: number;
  username: string;
  email: string;
  role: "viewer";
  avatar: string | null;
  isActive: boolean;
  registeredAt: string;
  lastLogin: string;
  address: UserAddress | null;
  preferences: UserPreferences;
  favoriteCount: number;
}

export type AppUser = AdminUser | EditorUser | ViewerUser;

// --- Deeply nested address ---

export interface UserAddress {
  street: string;
  city: CityInfo;
  zip: string;
  country: CountryInfo;
  isDefault: boolean;
}

export interface CityInfo {
  name: string;
  population: number;
  region: RegionInfo;
}

export interface RegionInfo {
  name: string;
  code: string;
  timezone: string;
}

export interface CountryInfo {
  name: string;
  code: string;
  currency: CurrencyInfo;
}

export interface CurrencyInfo {
  symbol: string;
  code: string;
  exchangeRate: number;
}

// --- User preferences (deeply nested) ---

export interface UserPreferences {
  theme: "light" | "dark" | "auto";
  language: string;
  notifications: NotificationSettings;
  display: DisplaySettings;
}

export interface NotificationSettings {
  email: boolean;
  push: boolean;
  sms: boolean;
  frequency: "instant" | "daily" | "weekly";
}

export interface DisplaySettings {
  itemsPerPage: number;
  compactMode: boolean;
  showSidebar: boolean;
}

// --- Product types ---

export interface ProductCategory {
  id: number;
  name: string;
  slug: string;
  parentCategory: string | null;
  productCount: number;
}

export interface ProductImage {
  url: string;
  alt: string;
  width: number;
  height: number;
  isPrimary: boolean;
}

export interface ProductVariant {
  sku: string;
  name: string;
  price: number;
  compareAtPrice: number | null;
  inStock: boolean;
  stockQuantity: number;
  attributes: VariantAttribute[];
}

export interface VariantAttribute {
  name: string;
  value: string;
}

export interface ProductReview {
  author: string;
  rating: number;
  title: string;
  body: string;
  date: string;
  verified: boolean;
  helpfulCount: number;
}

export interface Product {
  id: number;
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  price: number;
  compareAtPrice: number | null;
  category: ProductCategory;
  images: ProductImage[];
  variants: ProductVariant[];
  reviews: ProductReview[];
  averageRating: number;
  reviewCount: number;
  inStock: boolean;
  isFeatured: boolean;
  isOnSale: boolean;
  tags: string[];
  createdAt: string;
  weight: number;
  dimensions: ProductDimensions;
}

export interface ProductDimensions {
  length: number;
  width: number;
  height: number;
  unit: string;
}

// --- Order types ---

export interface OrderLineItem {
  product: Product;
  variant: ProductVariant | null;
  quantity: number;
  unitPrice: number;
  discount: number;
}

export interface ShippingInfo {
  method: string;
  carrier: string;
  trackingNumber: string | null;
  estimatedDelivery: string | null;
  cost: number;
  address: UserAddress;
}

export interface PaymentInfo {
  method: "credit_card" | "paypal" | "bank_transfer" | "crypto";
  status: "pending" | "completed" | "failed" | "refunded";
  transactionId: string;
  amount: number;
  currency: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  customer: AppUser;
  items: OrderLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded";
  shipping: ShippingInfo;
  payment: PaymentInfo;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- Analytics types ---

export interface AnalyticsMetric {
  label: string;
  value: number;
  previousValue: number;
  changePercent: number;
  trend: "up" | "down" | "flat";
}

export interface ChartDataPoint {
  label: string;
  value: number;
  color: string;
}

export interface AnalyticsPeriod {
  startDate: string;
  endDate: string;
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  conversionRate: number;
  topProducts: Product[];
  dailyData: ChartDataPoint[];
}

export interface AnalyticsDashboard {
  revenue: AnalyticsMetric;
  orders: AnalyticsMetric;
  customers: AnalyticsMetric;
  conversionRate: AnalyticsMetric;
  currentPeriod: AnalyticsPeriod;
  previousPeriod: AnalyticsPeriod;
  topCategories: ProductCategory[];
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  type: "order" | "review" | "signup" | "refund";
  description: string;
  timestamp: string;
  user: string;
  amount: number | null;
}

// --- Settings types ---

export interface GeneralSettings {
  siteName: string;
  siteUrl: string;
  adminEmail: string;
  timezone: string;
  dateFormat: string;
  maintenanceMode: boolean;
}

export interface EmailSettings {
  smtpHost: string;
  smtpPort: number;
  fromName: string;
  fromEmail: string;
  enableNotifications: boolean;
}

export interface PaymentSettings {
  enabledMethods: string[];
  defaultCurrency: string;
  taxRate: number;
  freeShippingThreshold: number | null;
}

export interface SettingsPanel {
  general: GeneralSettings;
  email: EmailSettings;
  payment: PaymentSettings;
  isDirty: boolean;
  lastSaved: string | null;
}

// --- Notification union ---

export interface OrderNotification {
  kind: "order";
  orderId: string;
  customerName: string;
  total: number;
  timestamp: string;
  isRead: boolean;
}

export interface ReviewNotification {
  kind: "review";
  productName: string;
  rating: number;
  reviewerName: string;
  timestamp: string;
  isRead: boolean;
}

export interface SystemNotification {
  kind: "system";
  title: string;
  message: string;
  severity: "info" | "warning" | "error";
  timestamp: string;
  isRead: boolean;
}

export type Notification = OrderNotification | ReviewNotification | SystemNotification;

// --- Card type for partial ---

export interface DashboardCard {
  title: string;
  value: string;
  subtitle: string;
  icon: string;
  color: string;
  trend: "up" | "down" | "flat";
  changePercent: number;
}

// --- Layout type ---

export interface BenchLayout {
  title: string;
  heading: string;
}

// --- Main benchmark page type ---

export interface BenchmarkPage {
  layout: BenchLayout;
  currentUser: AppUser;
  users: AppUser[];
  products: Product[];
  featuredProduct: Product | null;
  orders: Order[];
  recentOrders: Order[];
  analytics: AnalyticsDashboard;
  settings: SettingsPanel;
  notifications: Notification[];
  dashboardCards: DashboardCard[];
  categories: ProductCategory[];
  searchQuery: string;
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  isLoading: boolean;
  errorMessage: string | null;
  successMessage: string | null;
  showFilters: boolean;
  selectedCategory: string | null;
  sortBy: "name" | "price" | "date" | "rating";
  sortDirection: "asc" | "desc";
  currency: string;
  locale: string;
  buildVersion: string;
  rawHtmlBanner: string;
  debugInfo: string;
}
