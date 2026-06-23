export interface ShortUrl {
  id: string;           // The short code (e.g. "x7y8z" or "my-custom-alias")
  targetUrl: string;    // Original destination URL
  title?: string;       // Fetched title of the destination webpage
  clicks: number;       // Click count tracker
  createdAt: string;    // ISO date string of creation
  userId: string;       // User token ID (for history filtering)
  customAlias?: boolean;// Label indicating if custom alias was used
  expiresAt?: string;   // Optional expiration date
  password?: string;    // Optional password layer
  tags?: string[];      // Optional categorization tags
  campaign?: string;    // Optional campaign name
  customDomain?: string;// Branded custom domain if configured
  clicksHistory?: {
    timestamp: string;
    referrer: string;
    browser: string;
    device: string;
    country: string;
  }[];
}

export interface ShortenRequest {
  targetUrl: string;
  customAlias?: string;
  userId: string;
  expiresAt?: string;
  password?: string;
  tags?: string[];
  campaign?: string;
  customDomain?: string;
}

export interface AnalyticsRecord {
  timestamp: string;
  referrer: string;
  userAgent: string;
  browser?: string;
  device?: string;
  country?: string;
}

export interface UserAccount {
  userId: string;
  email: string;
  password?: string;
  apiTokens: string[];
  createdAt: string;
  subscriptionStatus?: "free" | "active" | "past_due" | "canceled" | "complimentary";
  plan?: "free" | "pro";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  freeAccess?: boolean;
  customDomains?: string[];
}

export interface AuthResponse {
  success: boolean;
  error?: string;
  user?: {
    userId: string;
    email: string;
    apiTokens: string[];
    subscriptionStatus?: UserAccount["subscriptionStatus"];
    plan?: UserAccount["plan"];
    freeAccess?: boolean;
  };
}
