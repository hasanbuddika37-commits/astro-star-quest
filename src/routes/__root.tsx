import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
      },
      { name: "theme-color", content: "#0f0820" },
      { title: "AstroBlitz — Earn Crypto Rewards" },
      {
        name: "description",
        content:
          "Play fun rocket games, watch ads, invite friends and earn real crypto rewards on AstroBlitz.",
      },
      { property: "og:title", content: "AstroBlitz — Earn Crypto Rewards" },
      { property: "og:description", content: "Astro Blitz Quest is a Telegram mini-app game for earning rewards through gameplay and ads." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "AstroBlitz — Earn Crypto Rewards" },
      { name: "description", content: "Astro Blitz Quest is a Telegram mini-app game for earning rewards through gameplay and ads." },
      { name: "twitter:description", content: "Astro Blitz Quest is a Telegram mini-app game for earning rewards through gameplay and ads." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e701ef31-f104-4f11-a5a1-b4905cd12d80/id-preview-8b22fa49--1441f38c-c668-45e2-b6bb-6c92dfd1ac3e.lovable.app-1780920684590.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e701ef31-f104-4f11-a5a1-b4905cd12d80/id-preview-8b22fa49--1441f38c-c668-45e2-b6bb-6c92dfd1ac3e.lovable.app-1780920684590.png" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
    scripts: [
      { src: "https://telegram.org/js/telegram-web-app.js", async: true },
      { src: "https://sad.adsgram.ai/js/sad.min.js", async: true },
      { src: "https://libtl.com/sdk.js", async: true, "data-zone": "11115938", "data-sdk": "show_11115938" } as never,
      { src: "https://ad.gigapub.tech/script?id=6929", async: true },
      { src: "https://sdk.taddy.pro/web/taddy.min.js", async: true, "data-pub-id": "ce8790eb749918b088605145e3626fd9" } as never,
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
