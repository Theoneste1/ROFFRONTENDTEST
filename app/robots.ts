import type { MetadataRoute } from "next";
import { PRIVATE_PREFIXES, SITE_URL, indexingAllowed } from "@/lib/site/seo";

/** /robots.txt: the public pages may be listed, the signed-in areas never; a copy outside production is not listed at all. */
export default function robots(): MetadataRoute.Robots {
  if (!indexingAllowed()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE_PREFIXES.map((p) => `${p}/`) },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
