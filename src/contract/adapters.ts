// Adapter interfaces. Each has a Fake (src/adapters/fake) and later a Real implementation.
// Agents only ever talk to these interfaces, never to vendor SDKs directly.

export interface ShopifyAdapter {
  createPage(title: string, body: string): Promise<{ id: string }>;
  createProduct(title: string, priceCents: number): Promise<{ id: string }>;
  listOrders(): Promise<{ id: string; totalCents: number; status: string }[]>;
  refund(orderId: string, amountCents: number): Promise<{ ok: boolean }>;
}

export interface PodAdapter {
  createMockup(designUrl: string, productType: string): Promise<{ mockupUrl: string }>;
  costFor(productType: string): Promise<number>; // cents
  fulfill(orderId: string): Promise<{ trackingNumber: string }>;
}

export interface AdsAdapter {
  launchCampaign(name: string, dailyBudgetCents: number): Promise<{ id: string }>;
  setBudget(campaignId: string, dailyBudgetCents: number): Promise<void>;
  getStats(campaignId: string): Promise<{ spendCents: number; clicks: number; purchases: number }>;
}

export interface EmailAdapter {
  send(to: string, subject: string, body: string): Promise<{ id: string }>;
  inbox(): Promise<{ from: string; subject: string; body: string; orderId?: string }[]>;
}

export interface Adapters {
  shopify: ShopifyAdapter;
  pod: PodAdapter;
  ads: AdsAdapter;
  email: EmailAdapter;
}
