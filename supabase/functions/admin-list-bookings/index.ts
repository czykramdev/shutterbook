import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const send = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) return send({ error: "Not signed in" }, 401);

    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const adminEmail = (Deno.env.get("SHUTTERBOOK_ADMIN_EMAIL") || "").trim().toLowerCase();
    const serviceRoleKey = Deno.env.get("SHUTTERBOOK_SERVICE_ROLE_KEY");

    if (!url || !anon) {
      return send({ error: "Supabase URL or anon key is missing from the function environment." }, 500);
    }
    if (!serviceRoleKey) {
      return send({ error: "Missing SHUTTERBOOK_SERVICE_ROLE_KEY secret." }, 500);
    }

    const auth = createClient(url, anon, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: authError } = await auth.auth.getUser();

    if (authError || !user) return send({ error: "Invalid session", details: authError?.message }, 401);
    if (!adminEmail || (user.email || "").trim().toLowerCase() !== adminEmail) {
      return send({ error: "Admin only. Check SHUTTERBOOK_ADMIN_EMAIL." }, 403);
    }

    const db = createClient(url, serviceRoleKey);
    const { data, error } = await db
      .from("bookings")
      .select("id,photographer_id,customer_name:client_name,customer_email:client_email,customer_phone:client_phone,event_type,event_location:location,notes,status,created_at,start_at,end_at,photographers(display_name)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("admin-list-bookings database query failed:", error);
      return send({ error: "Could not query bookings", details: error.message, code: error.code }, 500);
    }

    return send({ bookings: data || [] });
  } catch (error) {
    console.error("admin-list-bookings unexpected error:", error);
    return send({
      error: "Unexpected error in admin-list-bookings",
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
