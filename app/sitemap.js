import { SITE_URL } from "@/lib/constants";

/** sitemap.xml — the app is a single page, so it holds a single entry. */
export default function sitemap() {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
