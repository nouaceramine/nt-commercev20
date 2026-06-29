import { useEffect } from "react";

/**
 * Lightweight per-page SEO meta hook — no library dependency.
 *
 * Sets:
 *   • document.title
 *   • <meta name="description">
 *   • <meta name="keywords">         (optional)
 *   • <link rel="canonical">
 *   • Open Graph:  og:title, og:description, og:url, og:type, og:image
 *   • Twitter Card: twitter:card, twitter:title, twitter:description, twitter:image
 *
 * Usage in a page component:
 *   useDocumentMeta({
 *     title: "تسجيل جديد - NT Commerce",
 *     description: "اشترك في NT Commerce — نظام نقاط بيع متكامل للسوق الجزائري.",
 *     canonical: "https://nt-v16-staging.emergent.host/register",
 *   });
 *
 * Why no react-helmet? Saves ~30KB and avoids version conflicts.
 * Mutating <head> in useEffect is standard and works fine for SEO crawlers
 * once the page is hydrated (Google fully renders JS now).
 */

function setOrCreateTag(selector, attrName, attrValue, content) {
  if (typeof document === "undefined") return;
  let el = document.querySelector(selector);
  if (!el) {
    el = document.createElement(selector.startsWith("meta") ? "meta" : "link");
    if (attrName) el.setAttribute(attrName, attrValue);
    document.head.appendChild(el);
  }
  if (selector.startsWith("link")) {
    el.setAttribute("href", content);
  } else {
    el.setAttribute("content", content);
  }
}

export function useDocumentMeta({
  title,
  description,
  keywords,
  canonical,
  ogImage = "https://nt-v16-staging.emergent.host/icon-512.png",
  ogType = "website",
} = {}) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const previousTitle = document.title;

    if (title) document.title = title;
    if (description) {
      setOrCreateTag('meta[name="description"]', "name", "description", description);
    }
    if (keywords) {
      setOrCreateTag('meta[name="keywords"]', "name", "keywords", keywords);
    }
    if (canonical) {
      setOrCreateTag('link[rel="canonical"]', "rel", "canonical", canonical);
    }

    // Open Graph
    if (title) setOrCreateTag('meta[property="og:title"]', "property", "og:title", title);
    if (description) setOrCreateTag('meta[property="og:description"]', "property", "og:description", description);
    if (canonical) setOrCreateTag('meta[property="og:url"]', "property", "og:url", canonical);
    setOrCreateTag('meta[property="og:type"]', "property", "og:type", ogType);
    setOrCreateTag('meta[property="og:image"]', "property", "og:image", ogImage);
    setOrCreateTag('meta[property="og:site_name"]', "property", "og:site_name", "NT Commerce");

    // Twitter Card
    setOrCreateTag('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
    if (title) setOrCreateTag('meta[name="twitter:title"]', "name", "twitter:title", title);
    if (description) setOrCreateTag('meta[name="twitter:description"]', "name", "twitter:description", description);
    setOrCreateTag('meta[name="twitter:image"]', "name", "twitter:image", ogImage);

    return () => {
      document.title = previousTitle;
    };
  }, [title, description, keywords, canonical, ogImage, ogType]);
}

export default useDocumentMeta;
