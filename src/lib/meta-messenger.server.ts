const PAGE_NAMES: Record<string, string> = {
  "612225081965764": "Cosmo Stakes",
  "1202283202961279": "Lucky Cosmo",
  "108251995706398": "Maya midnight 2.0",
  "886760014512587": "Cosmo Angel Gaming",
  "304589982739389": "Cosmo Royale",
  "111078998418501": "Cosmo Adriana Gaming",
  "101636812616119": "Ombre Gaming",
  "148199678368516": "Amiri gaming",
};

export type FacebookIdentity = {
  pageId: string;
  psid: string;
};

export type MetaUserProfile = {
  name: string | null;
  profilePic: string | null;
};

export function envTokenNameForPage(pageId: string) {
  return `META_PAGE_ACCESS_TOKEN_${pageId.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`;
}

export function pageNameForId(pageId: string) {
  return PAGE_NAMES[pageId] ?? `Facebook Page ${pageId.slice(-6)}`;
}

export function fallbackFacebookUserName(psid: string) {
  return `Facebook User ${psid.slice(-6)}`;
}

export function parseFacebookUsername(
  username: string | null | undefined,
): FacebookIdentity | null {
  if (!username?.startsWith("fb:")) return null;
  const parts = username.split(":");
  if (parts.length < 3) return null;
  const pageId = parts[1];
  const psid = parts.slice(2).join(":");
  return pageId && psid ? { pageId, psid } : null;
}

export async function getPageAccessToken(supabase: any, pageId: string) {
  let token =
    process.env[envTokenNameForPage(pageId)]?.trim() ||
    process.env.META_PAGE_ACCESS_TOKEN?.trim() ||
    "";

  if (token) return token;

  const { data, error } = await supabase
    .from("meta_pages" as never)
    .select("page_access_token")
    .eq("page_id", pageId)
    .eq("is_enabled", true)
    .maybeSingle();

  if (!error && (data as any)?.page_access_token) {
    token = String((data as any).page_access_token).trim();
  }

  return token || null;
}

export async function fetchMetaUserProfile(
  supabase: any,
  pageId: string,
  psid: string,
): Promise<MetaUserProfile | null> {
  const token = await getPageAccessToken(supabase, pageId);
  if (!token) return null;

  const graphVersion = process.env.META_GRAPH_API_VERSION?.trim() || "v25.0";
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(psid)}`);
  url.searchParams.set("fields", "first_name,last_name,name,profile_pic");
  url.searchParams.set("access_token", token);

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const profile = await response.json();
    const first = typeof profile?.first_name === "string" ? profile.first_name.trim() : "";
    const last = typeof profile?.last_name === "string" ? profile.last_name.trim() : "";
    const fullFromParts = [first, last].filter(Boolean).join(" ");
    const name =
      fullFromParts || (typeof profile?.name === "string" ? profile.name.trim() : "") || null;
    const profilePic =
      typeof profile?.profile_pic === "string" && profile.profile_pic.trim()
        ? profile.profile_pic.trim()
        : null;
    return { name, profilePic };
  } catch {
    return null;
  }
}

export function isLikelyImageUrl(url: string | null | undefined) {
  if (!url) return false;
  return /\.(apng|avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i.test(url) || url.includes("image");
}
