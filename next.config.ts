import type { NextConfig } from "next";
import { execSync } from "child_process";

const gitSha = (() => {
  try { return execSync("git rev-parse --short HEAD").toString().trim(); }
  catch { return "unknown"; }
})();

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_GIT_SHA: gitSha,
  },
};

export default nextConfig;
