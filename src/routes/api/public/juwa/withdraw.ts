import { createFileRoute } from "@tanstack/react-router";
import { handleTxn } from "./recharge";

export const Route = createFileRoute("/api/public/juwa/withdraw")({
  server: {
    handlers: {
      POST: ({ request }) => handleTxn(request, "withdraw", "/api/external/withdraw", "wd"),
    },
  },
});
