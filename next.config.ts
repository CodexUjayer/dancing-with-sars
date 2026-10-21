import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  allowedDevOrigins: [
    "preview-chat-ca731d67-7f62-4769-9f93-1b67049681df.space-z.ai",
    "*.space-z.ai",
  ],
};

export default nextConfig;
