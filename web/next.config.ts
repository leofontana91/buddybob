import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "host", value: "www.buddybob.app" }],
        destination: "https://buddybob.app",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.buddybob.app" }],
        destination: "https://buddybob.app/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
