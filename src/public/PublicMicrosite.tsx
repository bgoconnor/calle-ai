import { useState } from "react";
import type { CSSProperties } from "react";
import type { LocalizedText, PublishedSite } from "./types";
import "./public-site.css";
import "./testimonials.css";

type Props = { site: PublishedSite };
type Language = "es" | "en";
const t = (value: LocalizedText, lang: Language) => value[lang];

function safeCustomDocument(site: PublishedSite, lang: Language) {
  const page = site.customPage;
  if (!page) return "";
  const html = page.html
    .replace(/<\/?(?:html|head|body)[^>]*>/gi, "")
    .replace(
      /<(?:script|iframe|object|embed|form|style)\b[\s\S]*?<\/(?:script|iframe|object|embed|form|style)>/gi,
      "",
    )
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "");
  const css = page.css
    .replace(/@import[^;]+;/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/<\/style/gi, "");
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;min-height:100%}[data-language="es"] [data-lang="en"],[data-language="en"] [data-lang="es"]{display:none!important}${css}</style></head><body><div data-language="${lang}">${html}</div></body></html>`;
}

function CustomMicrosite({ site }: Props) {
  const [lang, setLang] = useState<Language>("es");
  return (
    <main className="custom-site-shell">
      <div className="custom-site-controls">
        <strong>{site.business.name}</strong>
        <div className="language-switch">
          <button
            className={lang === "es" ? "active" : ""}
            onClick={() => setLang("es")}
          >
            ES
          </button>
          <button
            className={lang === "en" ? "active" : ""}
            onClick={() => setLang("en")}
          >
            EN
          </button>
        </div>
      </div>
      <iframe
        key={lang}
        title={`${site.business.name} website`}
        sandbox="allow-popups"
        srcDoc={safeCustomDocument(site, lang)}
      />
    </main>
  );
}

export function PublicMicrosite({ site }: Props) {
  if (site.customPage?.contractVersion === "custom-microsite.v1")
    return <CustomMicrosite site={site} />;
  const [lang, setLang] = useState<Language>("es");
  const [openTestimonial, setOpenTestimonial] = useState<string | null>(null);
  const isRestaurant = site.kind === "restaurant";
  const contact = site.business.contact;
  const brand = site.brand;
  const style = brand
    ? ({
        "--ink": brand.palette.ink,
        "--paper": brand.palette.paper,
        "--accent": brand.palette.accent,
        "--sun": brand.palette.highlight,
        "--leaf": brand.palette.secondary,
      } as CSSProperties)
    : undefined;
  return (
    <main
      className={`public-site ${site.theme} treatment-${brand?.imageTreatment ?? "arched"} density-${brand?.menuDensity ?? "balanced"}`}
      style={style}
      lang={lang}
    >
      <div className="site-texture" />
      <header className="site-nav">
        <a className="site-logo" href="#top" aria-label={site.business.name}>
          {site.business.name}
          <span>✦</span>
        </a>
        <div className="language-switch" aria-label="Language selector">
          <button
            className={lang === "es" ? "active" : ""}
            onClick={() => setLang("es")}
          >
            ES
          </button>
          <button
            className={lang === "en" ? "active" : ""}
            onClick={() => setLang("en")}
          >
            EN
          </button>
        </div>
      </header>
      <section className="site-hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">{t(site.business.eyebrow, lang)}</p>
          <h1>{t(site.hero.title, lang)}</h1>
          <p className="hero-subtitle">{t(site.hero.subtitle, lang)}</p>
          <a className="button primary" href="#menu">
            {t(site.hero.cta, lang)} <span>↓</span>
          </a>
        </div>
        <div className="hero-image-wrap">
          <img src={site.hero.image} alt="" className="hero-image" />
          {brand?.sticker && (
            <div className="hero-sticker">{t(brand.sticker, lang)}</div>
          )}
        </div>
      </section>
      <section className="site-story">
        <p className="section-kicker">
          {isRestaurant
            ? lang === "es"
              ? "Nuestra mesa"
              : "Our table"
            : lang === "es"
              ? "Nuestro espacio"
              : "Our space"}
        </p>
        <p>{t(site.story, lang)}</p>
      </section>
      {site.guide && (
        <section className="site-guide">
          <div>
            <p className="section-kicker">
              {lang === "es" ? "Una recomendación" : "A good place to start"}
            </p>
            <h2>{t(site.guide.title, lang)}</h2>
            <p>{t(site.guide.body, lang)}</p>
          </div>
          <ul>
            {site.guide.picks.map((pick) => (
              <li key={pick}>✦ {pick}</li>
            ))}
          </ul>
        </section>
      )}
      <section className="site-catalog" id="menu">
        <div className="catalog-intro">
          <p className="section-kicker">
            {isRestaurant
              ? lang === "es"
                ? "El menú"
                : "The menu"
              : lang === "es"
                ? "Servicios"
                : "Services"}
          </p>
          <h2>
            {brand?.menuHeading
              ? t(brand.menuHeading, lang)
              : isRestaurant
                ? lang === "es"
                  ? "Descubre el menú."
                  : "Explore the menu."
                : lang === "es"
                  ? "Descubre los servicios."
                  : "Explore our services."}
          </h2>
        </div>
        <div className="catalog-grid">
          {site.sections.map((section) => (
            <div
              className="catalog-section"
              key={section.id ?? section.title.es}
            >
              <h3>{t(section.title, lang)}</h3>
              {section.items.map((item) => {
                const itemId = item.id ?? `${section.title.es}-${item.name.es}`;
                const testimonialId = `testimonial-${itemId}`;
                return (
                  <article className="catalog-item" key={itemId}>
                    <div className="item-title">
                      <h4>{t(item.name, lang)}</h4>
                      {item.price && <span>{item.price}</span>}
                    </div>
                    <p>{t(item.description, lang)}</p>
                    {item.tag && <small>{t(item.tag, lang)}</small>}
                    {item.note && <em>{t(item.note, lang)}</em>}
                    {item.testimonial && (
                      <div
                        className={`item-testimonial ${openTestimonial === itemId ? "open" : ""}`}
                      >
                        <button
                          type="button"
                          aria-expanded={openTestimonial === itemId}
                          aria-controls={testimonialId}
                          onClick={() =>
                            setOpenTestimonial(
                              openTestimonial === itemId ? null : itemId,
                            )
                          }
                        >
                          ✦ {lang === "es" ? "Lo que dicen" : "What diners say"}
                        </button>
                        <aside id={testimonialId}>
                          <blockquote>“{item.testimonial.quote}”</blockquote>
                          <a
                            href={item.testimonial.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {item.testimonial.authorDisplayName
                              ? `${item.testimonial.authorDisplayName} · `
                              : ""}
                            {item.testimonial.sourceName} ↗
                          </a>
                        </aside>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ))}
        </div>
      </section>
      <section className="site-details">
        <div className="details-card">
          <p className="section-kicker">
            {lang === "es" ? "Visítanos" : "Visit us"}
          </p>
          <h2>
            {contact.address}
            <br />
            {contact.city}
          </h2>
          <a
            className="button secondary"
            target="_blank"
            rel="noreferrer"
            href={contact.mapsUrl}
          >
            {lang === "es" ? "Cómo llegar" : "Get directions"} ↗
          </a>
        </div>
        <div className="details-card details-list">
          <p className="section-kicker">
            {lang === "es" ? "Horario" : "Hours"}
          </p>
          {contact.hours.map((slot) => (
            <p key={slot.hours}>
              <strong>{t(slot.days, lang)}</strong>
              <span>{slot.hours}</span>
            </p>
          ))}
          <a href={`tel:${contact.phone.replace(/\D/g, "")}`}>
            {contact.phone}
          </a>
        </div>
      </section>
      <section className="site-faq">
        <p className="section-kicker">FAQ</p>
        <h2>{lang === "es" ? "Antes de venir" : "Before you visit"}</h2>
        <div>
          {site.faqs.map((faq) => (
            <details key={faq.question.es}>
              <summary>
                {t(faq.question, lang)} <span>+</span>
              </summary>
              <p>{t(faq.answer, lang)}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="site-cta">
        <h2>
          {isRestaurant
            ? lang === "es"
              ? "¿Listo para comer?"
              : "Ready to eat?"
            : lang === "es"
              ? "¿Lista para tu próximo look?"
              : "Ready for your next look?"}
        </h2>
        <a
          href={`tel:${contact.phone.replace(/\D/g, "")}`}
          className="button primary"
        >
          {lang === "es" ? "Llamar ahora" : "Call now"} ↗
        </a>
      </section>
      <footer>
        <p>{site.conceptLabel}</p>
        <p>
          Built with <span>✦</span> Calle AI
        </p>
      </footer>
    </main>
  );
}
