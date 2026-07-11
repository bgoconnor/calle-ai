export type LocalizedText = { es: string; en: string };

export type SiteContact = {
  address: string;
  city: string;
  phone: string;
  mapsUrl: string;
  hours: Array<{ days: LocalizedText; hours: string }>;
};

export type SiteItem = {
  id?: string;
  name: LocalizedText;
  description: LocalizedText;
  price?: string;
  note?: LocalizedText;
  tag?: LocalizedText;
  testimonial?: {
    quote: string;
    authorDisplayName?: string | null;
    sourceName: string;
    sourceUrl: string;
    publishedAt?: string | null;
  } | null;
};

export type SiteSection = {
  id?: string;
  title: LocalizedText;
  items: SiteItem[];
};

export type PublishedSite = {
  slug: string;
  kind: "restaurant" | "salon";
  business: { name: string; eyebrow: LocalizedText; contact: SiteContact };
  theme: string;
  brand?: {
    personality: string;
    palette: {
      ink: string;
      paper: string;
      accent: string;
      highlight: string;
      secondary: string;
    };
    imageTreatment: "arched" | "rounded" | "editorial" | "organic";
    menuDensity: "airy" | "balanced" | "compact";
    menuHeading: LocalizedText;
    sticker: LocalizedText;
  };
  hero: {
    title: LocalizedText;
    subtitle: LocalizedText;
    cta: LocalizedText;
    image: string;
  };
  story: LocalizedText;
  sections: SiteSection[];
  guide?: { title: LocalizedText; body: LocalizedText; picks: string[] };
  faqs: Array<{ question: LocalizedText; answer: LocalizedText }>;
  conceptLabel?: string;
  customPage?: {
    contractVersion: "custom-microsite.v1";
    designRationale: string;
    html: string;
    css: string;
    contentManifest: { menuItemIds: string[]; sourceArtifactIds: string[] };
  };
};
