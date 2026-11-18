// Fake adapters: deterministic, in-memory, no network. Everyone builds against these from day one.

import type {
  Adapters, AdsAdapter, EmailAdapter, PodAdapter, ShopifyAdapter,
} from '../../contract/adapters.ts';

let n = 0;
const id = (p: string) => `${p}_${++n}`;

export class FakeShopify implements ShopifyAdapter {
  pages: { id: string; title: string }[] = [];
  products: { id: string; title: string; priceCents: number }[] = [];
  orders = [
    { id: 'ord_1001', totalCents: 2899, status: 'paid' },
    { id: 'ord_1002', totalCents: 3499, status: 'paid' },
  ];
  async createPage(title: string) { const p = { id: id('page'), title }; this.pages.push(p); return p; }
  async createProduct(title: string, priceCents: number) {
    const p = { id: id('prod'), title, priceCents }; this.products.push(p); return p;
  }
  async listOrders() { return this.orders; }
  async refund(orderId: string) {
    const o = this.orders.find(x => x.id === orderId);
    if (o) o.status = 'refunded';
    return { ok: !!o };
  }
}

export class FakePod implements PodAdapter {
  async createMockup(designUrl: string, productType: string) {
    return { mockupUrl: `https://fake-pod.local/${productType}/${encodeURIComponent(designUrl)}.png` };
  }
  async costFor(productType: string) { return productType === 'hoodie' ? 2200 : 1150; }
  async fulfill() { return { trackingNumber: id('TRACK') }; }
}

export class FakeAds implements AdsAdapter {
  campaigns = new Map<string, { name: string; dailyBudgetCents: number }>();
  async launchCampaign(name: string, dailyBudgetCents: number) {
    const c = { id: id('camp') }; this.campaigns.set(c.id, { name, dailyBudgetCents }); return c;
  }
  async setBudget(campaignId: string, dailyBudgetCents: number) {
    const c = this.campaigns.get(campaignId); if (c) c.dailyBudgetCents = dailyBudgetCents;
  }
  async getStats() { return { spendCents: 1840, clicks: 212, purchases: 3 }; }
}

export class FakeEmail implements EmailAdapter {
  sent: { to: string; subject: string }[] = [];
  async send(to: string, subject: string) { this.sent.push({ to, subject }); return { id: id('msg') }; }
  async inbox() {
    return [
      { from: 'maya@example.com', subject: 'Where is my order?', body: 'Ordered 5 days ago', orderId: 'ord_1001' },
      { from: 'leo@example.com', subject: 'Refund please', body: 'Wrong size', orderId: 'ord_1002' },
    ];
  }
}

export function fakeAdapters(): Adapters {
  return { shopify: new FakeShopify(), pod: new FakePod(), ads: new FakeAds(), email: new FakeEmail() };
}
