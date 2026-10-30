# ShutterBook admin Edge Function setup

The public GitHub Pages frontend must never contain the Supabase service-role key. This Edge Function checks the signed-in user's email against a server-side admin email secret, then uses the service role key to invite photographers and insert their linked profile.

## Deploy

1. Install Supabase CLI and link the project:
   `supabase login`
   `supabase link --project-ref gwjkfiiknvsdoedhwfgh`
2. Set secrets (use your actual admin login email):
   `supabase secrets set SHUTTERBOOK_ADMIN_EMAIL=your-admin-email@example.com`
   Set `SUPABASE_SERVICE_ROLE_KEY` to the service-role key from Supabase project API settings. Supabase provides SUPABASE_URL in Edge Function environment; if needed set it too.
3. Deploy:
   `supabase functions deploy admin-create-photographer`
4. Create an Auth account for the admin email in Supabase Authentication, then sign into `/admin.html`.

## Security notes
- The function validates the caller's JWT and exact admin email server-side.
- Never paste the service-role key into index.html/admin.html or commit it to GitHub.
- Supabase Auth email delivery must be configured to send invites.
