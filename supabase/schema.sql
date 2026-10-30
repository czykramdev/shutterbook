-- ShutterBook initial Supabase schema
-- Run this entire file in Supabase Dashboard > SQL Editor > New query.
-- Uses a photographer roster managed by the project owner/admin.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create table if not exists public.photographers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  display_name text not null,
  bio text,
  location text,
  avatar_url text,
  portfolio_urls text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  price numeric(12,2) not null check (price >= 0),
  duration_minutes integer not null default 120 check (duration_minutes > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.photographer_packages (
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  package_id uuid not null references public.packages(id) on delete cascade,
  primary key (photographer_id, package_id)
);

create table if not exists public.photographer_availability (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id),
  package_id uuid references public.packages(id),
  client_name text not null,
  client_email text not null,
  client_phone text,
  event_type text,
  event_location text not null,
  notes text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','confirmed','declined','cancelled','completed')),
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);

-- Prevent overlapping pending or confirmed bookings for the same photographer.
alter table public.bookings
  drop constraint if exists bookings_no_overlapping_active_times;
alter table public.bookings
  add constraint bookings_no_overlapping_active_times
  exclude using gist (
    photographer_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (status in ('pending','confirmed'));

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid references auth.users(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.photographers enable row level security;
alter table public.packages enable row level security;
alter table public.photographer_packages enable row level security;
alter table public.photographer_availability enable row level security;
alter table public.bookings enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "Public can view active photographers" on public.photographers;
create policy "Public can view active photographers"
  on public.photographers for select to anon, authenticated
  using (active = true);

drop policy if exists "Public can view active packages" on public.packages;
create policy "Public can view active packages"
  on public.packages for select to anon, authenticated
  using (active = true);

drop policy if exists "Public can view photographer package links" on public.photographer_packages;
create policy "Public can view photographer package links"
  on public.photographer_packages for select to anon, authenticated
  using (true);

drop policy if exists "Public can view availability" on public.photographer_availability;
create policy "Public can view availability"
  on public.photographer_availability for select to anon, authenticated
  using (is_available = true);

-- Booking creation is performed through the checked RPC below; direct table writes stay blocked.
drop policy if exists "Photographers can view their bookings" on public.bookings;
create policy "Photographers can view their bookings"
  on public.bookings for select to authenticated
  using (exists (
    select 1 from public.photographers p
    where p.id = bookings.photographer_id and p.user_id = auth.uid()
  ));

drop policy if exists "Photographers can update their bookings" on public.bookings;
create policy "Photographers can update their bookings"
  on public.bookings for update to authenticated
  using (exists (
    select 1 from public.photographers p
    where p.id = bookings.photographer_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.photographers p
    where p.id = bookings.photographer_id and p.user_id = auth.uid()
  ));

drop policy if exists "Photographers can view own notifications" on public.notifications;
create policy "Photographers can view own notifications"
  on public.notifications for select to authenticated
  using (recipient_user_id = auth.uid());

drop policy if exists "Photographers can mark own notifications read" on public.notifications;
create policy "Photographers can mark own notifications read"
  on public.notifications for update to authenticated
  using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

create or replace function public.request_booking(
  p_photographer_id uuid,
  p_package_id uuid,
  p_client_name text,
  p_client_email text,
  p_client_phone text,
  p_event_type text,
  p_event_location text,
  p_notes text,
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns public.bookings
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  created_booking public.bookings;
begin
  if length(trim(coalesce(p_client_name, ''))) < 2
     or length(trim(coalesce(p_client_email, ''))) < 5
     or length(trim(coalesce(p_event_location, ''))) < 2
     or p_end_at <= p_start_at then
    raise exception 'Please provide valid booking details.';
  end if;

  if not exists (
    select 1 from public.photographers p
    where p.id = p_photographer_id and p.active = true
  ) then
    raise exception 'Photographer is not available for booking.';
  end if;

  if p_package_id is not null and not exists (
    select 1 from public.packages pa
    join public.photographer_packages pp on pp.package_id = pa.id
    where pp.photographer_id = p_photographer_id
      and pa.id = p_package_id and pa.active = true
  ) then
    raise exception 'This package is not offered by the selected photographer.';
  end if;

  if exists (
    select 1 from public.photographer_availability a
    where a.photographer_id = p_photographer_id
      and a.is_available = false
      and tstzrange(a.start_at, a.end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')
  ) then
    raise exception 'Photographer is unavailable for that time.';
  end if;

  insert into public.bookings (
    photographer_id, package_id, client_name, client_email, client_phone,
    event_type, event_location, notes, start_at, end_at, status
  ) values (
    p_photographer_id, p_package_id, trim(p_client_name), lower(trim(p_client_email)),
    nullif(trim(coalesce(p_client_phone, '')), ''), nullif(trim(coalesce(p_event_type, '')), ''),
    trim(p_event_location), nullif(trim(coalesce(p_notes, '')), ''),
    p_start_at, p_end_at, 'pending'
  ) returning * into created_booking;

  insert into public.notifications (recipient_user_id, booking_id, title, message)
  select p.user_id, created_booking.id, 'New booking request',
         created_booking.client_name || ' requested ' || coalesce(pa.name, 'a photography session') || '.'
  from public.photographers p
  left join public.packages pa on pa.id = created_booking.package_id
  where p.id = created_booking.photographer_id and p.user_id is not null;

  return created_booking;
end;
$$;

revoke all on function public.request_booking(uuid,uuid,text,text,text,text,text,text,timestamptz,timestamptz) from public;
grant execute on function public.request_booking(uuid,uuid,text,text,text,text,text,text,timestamptz,timestamptz) to anon, authenticated;

grant select on public.photographers, public.packages, public.photographer_packages, public.photographer_availability to anon, authenticated;
grant select, update on public.bookings to authenticated;
grant select, update on public.notifications to authenticated;

-- Starter packages; adjust pricing/details in the Supabase dashboard.
insert into public.packages (name, description, price, duration_minutes)
values
  ('Portrait Session', 'Portrait photography session', 2500, 120),
  ('Couples & Engagement', 'Couples or engagement photography', 4500, 180),
  ('Events & Celebrations', 'Event photography coverage', 8000, 240)
on conflict (name) do nothing;
