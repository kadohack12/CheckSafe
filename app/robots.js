import { SITE_URL } from "@/lib/constants";

/** robots.txt — let crawlers index the app, keep them out of the API. */
export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
