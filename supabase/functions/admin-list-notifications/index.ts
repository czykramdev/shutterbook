import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SHUTTERBOOK_SERVICE_ROLE_KEY");
  const adminEmail = (Deno.env.get("SHUTTERBOOK_ADMIN_EMAIL") || "").trim().toLowerCase();
  const authHeader = req.headers.get("Authorization");
  if (!url || !anonKey || !serviceKey || !adminEmail || !authHeader) return respond({ error: "Missing configuration or authorization." }, 401);

  const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user || (user.email || "").toLowerCase() !== adminEmail) return respond({ error: "Admin only." }, 403);

  const db = createClient(url, serviceKey);
  const { data, error } = await db.from("notifications")
    .select("id,title,message,booking_id,read_at,created_at")
    .eq("recipient_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return respond({ error: error.message }, 500);
  return respond({ notifications: data || [] });
});