/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 15 moved this out of `experimental`
  serverExternalPackages: ["@anthropic-ai/sdk"],
  // `loadCorpus` reads data/corpus/*.json with a dynamic path, which file tracing can't see.
  outputFileTracingIncludes: {
    "/api/brands/[id]/run": ["./data/corpus/**"],
    "/api/analyse-brand": ["./data/corpus/**"],
  },
};

module.exports = nextConfig;
