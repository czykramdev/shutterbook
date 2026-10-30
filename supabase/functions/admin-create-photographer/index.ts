// ShutterBook: create or repair a photographer login/profile link.
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
  const serviceKey = Deno.env.get("SHUTTERBOOK_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const adminEmail = (Deno.env.get("SHUTTERBOOK_ADMIN_EMAIL") || "").trim().toLowerCase();
  if (!url || !serviceKey) return reply({ error: "Server configuration is incomplete. Check the service-role secret." }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return reply({ error: "Sign in as admin first." }, 401);

  const adminClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = authHeader.slice(7);
  const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
  if (userError || !user || !adminEmail || user.email?.trim().toLowerCase() !== adminEmail) {
    return reply({ error: "Admin access only. Check SHUTTERBOOK_ADMIN_EMAIL." }, 403);
  }

  let body: { display_name?: string; email?: string; location?: string; bio?: string; portfolio_url?: string };
  try { body = await req.json(); } catch { return reply({ error: "Invalid JSON." }, 400); }

  const name = body.display_name?.trim();
  const email = body.email?.trim().toLowerCase();
  if (!name || name.length < 2) return reply({ error: "Enter a photographer name (at least 2 characters)." }, 400);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return reply({ error: "Enter a valid photographer email." }, 400);
  }

  // First try to invite a new Auth user. If an earlier attempt already created
  // the Auth user but failed before creating the roster row, repair that link.
  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { display_name: name, role: "photographer" },
    redirectTo: "https://czykramdev.github.io/shutterbook/photographer.html",
  });

  let authUser = invited?.user || null;
  let invitationSent = Boolean(authUser);

  if (!authUser && inviteError) {
    let page = 1;
    while (!authUser && page <= 20) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 500 });
      if (error) break;
      authUser = data.users.find((candidate) => candidate.email?.toLowerCase() === email) || null;
      if (data.users.length < 500) break;
      page++;
    }
    if (!authUser) return reply({ error: "Supabase could not invite this email: " + inviteError.message }, 400);
  }

  if (!authUser) return reply({ error: "Supabase did not return a photographer login." }, 500);

  const profileData = {
    user_id: authUser.id,
    display_name: name,
    location: body.location?.trim() || null,
    bio: body.bio?.trim() || null,
    portfolio_urls: body.portfolio_url?.trim() ? [body.portfolio_url.trim()] : [],
    active: true,
  };

  const { data: existingProfile, error: lookupError } = await adminClient
    .from("photographers").select("id").eq("user_id", authUser.id).maybeSingle();
  if (lookupError) return reply({ error: "Login exists, but profile lookup failed: " + lookupError.message }, 400);

  let profile;
  let profileError;
  if (existingProfile) {
    const result = await adminClient.from("photographers").update(profileData)
      .eq("id", existingProfile.id).select("id,display_name,location,user_id,active").single();
    profile = result.data; profileError = result.error;
  } else {
    const result = await adminClient.from("photographers").insert(profileData)
      .select("id,display_name,location,user_id,active").single();
    profile = result.data; profileError = result.error;
  }
  if (profileError) return reply({ error: "Login was created, but the photographer profile could not be linked: " + profileError.message }, 400);

  let setupLink: string | null = null;
  if (!invitationSent) {
    const { data: linkData } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: "https://czykramdev.github.io/shutterbook/photographer.html" },
    });
    setupLink = linkData?.properties?.action_link || null;
  }

  return reply({
    ok: true,
    profile,
    invited_email: email,
    invitation_sent: invitationSent,
    setup_link: setupLink,
    message: invitationSent
      ? "Photographer profile linked and invitation email sent."
      : "Existing Auth account linked to this photographer profile. Use the password-reset link if they need to set or reset their password.",
  });
});

function reply(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
