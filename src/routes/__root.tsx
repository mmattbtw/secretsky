/// <reference types="vite/client" />
import {
  HeadContent,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { pageHead } from "~/site-meta";
import appCss from "~/styles/app.css?url";

export const Route = createRootRoute({
  head: () => {
    const siteHead = pageHead();
    return {
      meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "application-name", content: "secretsky" },
      { name: "apple-mobile-web-app-title", content: "secretsky" },
      { name: "theme-color", content: "#fff" },
      ...siteHead.meta,
    ],
      links: [{ rel: "stylesheet", href: appCss }],
    };
  },
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
