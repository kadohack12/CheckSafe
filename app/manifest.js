import {
  SITE_DESCRIPTION,
  SITE_LANG,
  SITE_NAME,
} from "@/lib/constants";

/** Web app manifest — helps installability and mobile search presentation. */
export default function manifest() {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#1e3a8a",
    lang: SITE_LANG,
    categories: ["security", "utilities", "productivity"],
    icons: [
      {
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
    ],
  };
}
