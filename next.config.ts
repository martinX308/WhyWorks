import type { NextConfig } from 'next';
const config: NextConfig = {
  distDir: process.env.BLUEPRINT_NEXT_DIST_DIR || '.next',
  serverExternalPackages: ['node:sqlite'],
  poweredByHeader: false,
};
export default config;
