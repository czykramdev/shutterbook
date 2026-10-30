import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const send = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  const authorization = req.headers.get("Authorization");
  if (!authorization) return send({ error: "Not signed in" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const adminEmail = (Deno.env.get("SHUTTERBOOK_ADMIN_EMAIL") || "").trim().toLowerCase();
  const auth = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: authError } = await auth.auth.getUser();
  if (authError || !user) return send({ error: "Invalid session" }, 401);
  if (!adminEmail || (user.email || "").toLowerCase() !== adminEmail) return send({ error: "Admin only" }, 403);
  const db = createClient(url, Deno.env.get("SHUTTERBOOK_SERVICE_ROLE_KEY")!);
  const { data, error } = await db.from("bookings")
    .select("id,photographer_id,customer_name,customer_email,customer_phone,event_type,event_date,start_at,end_at,location,notes,status,created_at,photographers(display_name)")
    .order("created_at", { ascending: false });
  if (error) return send({ error: error.message }, 500);
  return send({ bookings: data || [] });
});