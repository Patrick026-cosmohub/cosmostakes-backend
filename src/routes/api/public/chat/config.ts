import { createFileRoute } from "@tanstack/react-router";
import { cors204, jsonOk } from "./-_helpers.server";

const DEFAULT_QUICK_REPLIES = [
  { id: "deposit", label: "Deposit / Load" },
  { id: "cashout", label: "Redeem / Cashout" },
  { id: "create_username", label: "Create Username" },
  { id: "game_issue", label: "Game Issue" },
  { id: "promotion", label: "Bonus / Promotion" },
  { id: "talk_to_staff", label: "Talk to Staff" },
];

export const Route = createFileRoute("/api/public/chat/config")({
  server: {
    handlers: {
      OPTIONS: () => cors204(),
      GET: async () => {
        return jsonOk({
          enabled: true,
          greeting: "Hi 👋 Welcome to Cosmo Stakes Support. How can we help you today?",
          quick_replies: DEFAULT_QUICK_REPLIES,
          offline_message: null,
        });
      },
    },
  },
});
