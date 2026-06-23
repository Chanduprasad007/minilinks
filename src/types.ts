export interface ShortUrl {
  id: string;           // The short code (e.g. "x7y8z" or "my-custom-alias")
  targetUrl: string;    // Original destination URL
  title?: string;       // Fetched title of the destination webpage
  clicks: number;       // Click count tracker
  createdAt: string;    // ISO date string of creation
  userId: string;       // User token ID (for history filtering)
  customAlias?: boolean;// Label indicating if custom alias was used
}

export interface ShortenRequest {
  targetUrl: string;
  customAlias?: string;
  userId: string;
}

export interface AnalyticsRecord {
  timestamp: string;
  referrer: string;
  userAgent: string;
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
