// ShutterBook: admin creates photographer credentials directly; no invite email is sent.
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
  const { data: { user }, error: userError } = await adminClient.auth.getUser(authHeader.slice(7));
  if (userError || !user || !adminEmail || user.email?.trim().toLowerCase() !== adminEmail) {
    return reply({ error: "Admin access only. Check SHUTTERBOOK_ADMIN_EMAIL." }, 403);
  }

  let body: { display_name?: string; username?: string; password?: string; location?: string; bio?: string; portfolio_url?: string };
  try { body = await req.json(); } catch { return reply({ error: "Invalid JSON." }, 400); }
  const name = body.display_name?.trim();
  const username = body.username?.trim().toLowerCase();
  const password = body.password || "";
  if (!name || name.length < 2) return reply({ error: "Enter a photographer name (at least 2 characters)." }, 400);
  if (!username || username.length > 80 || !/^[\p{L}\p{N}][\p{L}\p{N} ._@+-]*$/u.test(username)) {
    return reply({ error: "Enter a username using letters, numbers, spaces, dots, underscores, @, +, or hyphens (up to 80 characters)." }, 400);
  }
  if (password.length < 8) return reply({ error: "Temporary password must be at least 8 characters." }, 400);

  // Reserved synthetic address enables Supabase email/password auth without sending any email.
  const authEmail = username + "@login.shutterbook.invalid";
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: { display_name: name, username, role: "photographer" },
  });
  if (createError || !created.user) {
    return reply({ error: createError?.message || "Supabase did not create the login." }, 400);
  }

  const profileData = {
    user_id: created.user.id,
    display_name: name,
    location: body.location?.trim() || null,
    bio: body.bio?.trim() || null,
    portfolio_urls: body.portfolio_url?.trim() ? [body.portfolio_url.trim()] : [],
    active: true,
  };
  const { data: profile, error: profileError } = await adminClient.from("photographers")
    .insert(profileData).select("id,display_name,location,user_id,active").single();

  if (profileError) {
    // Avoid leaving a detached login behind when profile creation fails.
    await adminClient.auth.admin.deleteUser(created.user.id);
    return reply({ error: "Could not save photographer profile: " + profileError.message }, 400);
  }

  return reply({
    ok: true,
    profile,
    username,
    message: "Photographer account created and linked. No email was sent. Share the username and temporary password privately.",
  });
});

function reply(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
