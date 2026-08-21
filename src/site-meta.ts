const SITE_NAME = "secretsky";
const SITE_URL = "https://secretsky.at";
const DEFAULT_DESCRIPTION =
  "Private microblogging for mutual follows, built on ATProto Spaces.";
const OG_IMAGE_URL = `${SITE_URL}/secretsky-og.jpg`;

export function pageHead({
  title = SITE_NAME,
  description = DEFAULT_DESCRIPTION,
  path = "/",
  robots = "index, follow",
  type = "website",
}: {
  title?: string;
  description?: string;
  path?: string;
  robots?: string;
  type?: "website" | "profile" | "article";
} = {}) {
  const documentTitle = title === SITE_NAME ? SITE_NAME : `${title} | ${SITE_NAME}`;
  const url = new URL(path, SITE_URL).href;

  return {
    meta: [
      { title: documentTitle },
      { name: "description", content: description },
      { name: "robots", content: robots },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:title", content: documentTitle },
      { property: "og:description", content: description },
      { property: "og:type", content: type },
      { property: "og:url", content: url },
      { property: "og:image", content: OG_IMAGE_URL },
      { property: "og:image:secure_url", content: OG_IMAGE_URL },
      { property: "og:image:type", content: "image/jpeg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content: "secretsky, private microblogging",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: documentTitle },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: OG_IMAGE_URL },
      {
        name: "twitter:image:alt",
        content: "secretsky, private microblogging",
      },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}
