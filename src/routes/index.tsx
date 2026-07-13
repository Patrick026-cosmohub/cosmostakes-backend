import { createFileRoute } from "@tanstack/react-router";
import { redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && window.location.hostname === "payout.cosmostakes.net") {
      throw redirect({ to: "/payouts" });
    }
    throw redirect({ to: "/dashboard" });
  },
});
