import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  
  images: {
    domains: ["kycapi.bunlong.uk", "kyc-python-api.bunlong.uk"],
  },
};

export default nextConfig;
