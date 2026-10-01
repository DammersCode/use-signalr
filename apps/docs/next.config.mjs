import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  devIndicators: false,
  async redirects() {
    return [{ source: "/docs", destination: "/docs/react", permanent: false }];
  },
  async rewrites() {
    return [{ source: "/docs/:path*.md", destination: "/llms.mdx/docs/:path*/content.md" }];
  },
};

export default withMDX(config);
