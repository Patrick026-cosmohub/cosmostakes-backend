export const REFUJ_PLATFORM_GAMES = {
  firekirin: { name: "Fire Kirin", provider: "firekirin" },
  milkyway: { name: "Milky Way", provider: "milkyway" },
  orionstars: { name: "Orion Stars", provider: "orionstars" },
  pandamaster: { name: "Panda Master", provider: "pandamaster" },
  lasvegassweeps: { name: "Las Vegas Sweeps", provider: "lasvegassweeps" },
  highstakes: { name: "High Stakes", provider: "highstakes" },
} as const;

export type RefujPlatform = keyof typeof REFUJ_PLATFORM_GAMES;

export function isRefujPlatform(platform: string): platform is RefujPlatform {
  return platform in REFUJ_PLATFORM_GAMES;
}

function compact(value?: string | null) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export async function getRefujIntegration(platform: RefujPlatform) {
  const spec = REFUJ_PLATFORM_GAMES[platform];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: games, error: gameError } = await supabaseAdmin
    .from("games")
    .select("id,name,provider")
    .or(`provider.eq.${spec.provider},name.eq.${spec.name}`);
  if (gameError) throw new Error(gameError.message);

  const game =
    (games ?? []).find((g: any) => compact(g.provider) === compact(spec.provider) || compact(g.name) === compact(spec.name)) ??
    null;
  if (!game) throw new Error(`${spec.name} is not configured in games.`);

  const { data: integration, error: integrationError } = await supabaseAdmin
    .from("platform_integrations")
    .select("api_endpoint,api_key,secret_key")
    .eq("game_id", (game as any).id)
    .maybeSingle();
  if (integrationError) throw new Error(integrationError.message);
  if (!integration?.api_key || !integration?.secret_key) {
    throw new Error(`${spec.name} REFUJ agent credentials are not configured.`);
  }

  return {
    gameName: spec.name,
    gameCode: (game as any).provider,
    apiBase: integration.api_endpoint,
    gameUser: integration.api_key,
    gamePass: integration.secret_key,
  };
}
