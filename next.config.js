/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 15 moved this out of `experimental`
  serverExternalPackages: ["@anthropic-ai/sdk"],
  // `loadCorpus` reads data/corpus/*.json with a dynamic path, which file tracing can't see.
  outputFileTracingIncludes: {
    "/api/brands/[id]/run": ["./data/corpus/**"],
    "/api/analyse-brand": ["./data/corpus/**"],
  },
  // Safe baseline headers. A Content-Security-Policy is deliberately not set here: it needs the
  // Supabase, image-host and Next inline-script allowances tested first, or it breaks the app.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
