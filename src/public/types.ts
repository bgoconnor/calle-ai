export type LocalizedText = { es: string; en: string };

export type SiteContact = {
  address: string;
  city: string;
  phone: string;
  mapsUrl: string;
  hours: Array<{ days: LocalizedText; hours: string }>;
};

export type SiteItem = {
  name: LocalizedText;
  description: LocalizedText;
  price?: string;
  note?: LocalizedText;
  tag?: LocalizedText;
};

export type SiteSection = {
  title: LocalizedText;
  items: SiteItem[];
};

export type PublishedSite = {
  slug: string;
  kind: "restaurant" | "salon";
  business: { name: string; eyebrow: LocalizedText; contact: SiteContact };
  theme: "yucatasia" | "chelys";
  hero: { title: LocalizedText; subtitle: LocalizedText; cta: LocalizedText; image: string };
  story: LocalizedText;
  sections: SiteSection[];
  guide?: { title: LocalizedText; body: LocalizedText; picks: string[] };
  faqs: Array<{ question: LocalizedText; answer: LocalizedText }>;
  conceptLabel?: string;
};
