export interface SampleMarketplaceListing {
  id: string;
  name: string;
  description: string | null;
  framework: string;
  progressScore: number;
  founderName: string | null;
  whyBuilt?: string | null;
  tractionSignals: Array<{ type: string; description: string }>;
  valuationLow: number | null;
  valuationHigh: number | null;
  linkedAssets?: Array<{ type: string; url: string; label?: string }>;
  recentActivity?: Array<{ type: string; description: string; createdAt: string }>;
  createdAt: string;
  updatedAt: string;
}

export const SAMPLE_MARKETPLACE_LISTINGS: SampleMarketplaceListing[] = [
  {
    id: "sample-1",
    name: "Brillance SaaS Landing Page",
    description: "Streamline your billing process with seamless automation. Production-ready Next.js app.",
    framework: "nextjs",
    progressScore: 72,
    founderName: "Ataeru",
    whyBuilt: "To help small teams automate billing without engineering overhead.",
    tractionSignals: [
      { type: "feature", description: "Stripe integration shipped" },
      { type: "customer", description: "5 beta signups" },
    ],
    valuationLow: 2500,
    valuationHigh: 5000,
    linkedAssets: [],
    recentActivity: [],
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "sample-2",
    name: "AI Gateway Starter",
    description: "Connect to multiple AI services with a unified interface. Great for product teams.",
    framework: "nextjs",
    progressScore: 58,
    founderName: "Zenode",
    whyBuilt: "Unify AI provider APIs for faster product iteration.",
    tractionSignals: [
      { type: "feature", description: "OpenAI + Anthropic providers" },
      { type: "feature", description: "Usage dashboard" },
    ],
    valuationLow: 1500,
    valuationHigh: 3500,
    linkedAssets: [],
    recentActivity: [],
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "sample-3",
    name: "E-commerce Store",
    description: "Full-featured online store with cart, checkout, and payment. Built with Next.js.",
    framework: "nextjs",
    progressScore: 85,
    founderName: "Shopify Pro",
    whyBuilt: "Demo a complete storefront for client pitches.",
    tractionSignals: [
      { type: "revenue", description: "First sale logged" },
      { type: "customer", description: "10 users" },
      { type: "feature", description: "Checkout flow" },
    ],
    valuationLow: 5000,
    valuationHigh: 10000,
    linkedAssets: [],
    recentActivity: [],
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "sample-4",
    name: "Task Manager",
    description: "Collaborative task management with real-time updates. React + TypeScript.",
    framework: "react",
    progressScore: 45,
    founderName: "Productivity Labs",
    whyBuilt: "Internal tool that we productized.",
    tractionSignals: [{ type: "feature", description: "Real-time sync MVP" }],
    valuationLow: 800,
    valuationHigh: 2000,
    linkedAssets: [],
    recentActivity: [],
    createdAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "sample-5",
    name: "Portfolio Site",
    description: "Beautiful portfolio showcase with animations. Vue 3 + Vite.",
    framework: "vue",
    progressScore: 62,
    founderName: "Design Co",
    whyBuilt: "Showcase our design and front-end capability.",
    tractionSignals: [
      { type: "feature", description: "Dark mode" },
      { type: "feature", description: "Contact form" },
    ],
    valuationLow: 1200,
    valuationHigh: 2800,
    linkedAssets: [],
    recentActivity: [],
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export function getSampleListingById(id: string): SampleMarketplaceListing | null {
  return SAMPLE_MARKETPLACE_LISTINGS.find((s) => s.id === id) ?? null;
}
