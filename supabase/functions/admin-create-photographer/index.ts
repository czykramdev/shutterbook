// Supabase Edge Function: admin-create-photographer
// Creates/invites a photographer Auth user and links their profile to that account.
// Deploy: supabase functions deploy admin-create-photographer
// Configure secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SHUTTERBOOK_ADMIN_EMAIL
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "POST required" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const adminEmail = (Deno.env.get("SHUTTERBOOK_ADMIN_EMAIL") || "").toLowerCase();
  if (!url || !serviceKey) return reply({ error: "Server configuration is incomplete." }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return reply({ error: "Sign in as admin first." }, 401);

  const adminClient = createClient(url, serviceKey);
  const token = authHeader.slice(7);
  const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
  if (userError || !user || !adminEmail || user.email?.toLowerCase() !== adminEmail) {
    return reply({ error: "Admin access only." }, 403);
  }

  let body: { display_name?: string; email?: string; location?: string; bio?: string; portfolio_url?: string };
  try { body = await req.json(); } catch { return reply({ error: "Invalid JSON." }, 400); }

  const name = body.display_name?.trim();
  if (!name || name.length < 2) return reply({ error: "Enter a photographer name (at least 2 characters)." }, 400);

  const { data: profile, error: profileError } = await adminClient.from("photographers").insert({
    user_id: null,
    display_name: name,
    location: body.location?.trim() || null,
    bio: body.bio?.trim() || null,
    portfolio_urls: body.portfolio_url?.trim() ? [body.portfolio_url.trim()] : [],
    active: true,
  }).select("id,display_name,location,user_id,active").single();

  if (profileError) return reply({ error: profileError.message }, 400);
  return reply({ ok: true, profile, invited_email: email });
});

function reply(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
