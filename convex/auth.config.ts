import type { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      domain: "https://perfect-midge-5189.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;