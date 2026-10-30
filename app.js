/* ShutterBook Supabase connection.
 * The publishable/anon key is intended for browser use; protect data with RLS.
 */
(() => {
  const SUPABASE_URL = "https://gwjkfiiknvsdoedhwfgh.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3amtmaWlrbnZzZG9lZGh3ZmdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzMzA1ODYsImV4cCI6MjEwODkwNjU4Nn0.1i-KQpuog18J_quBdk2RhX9ZaDR7RmDQah0oaWOyfcE";

  if (!window.supabase || !window.supabase.createClient) {
    console.error("Supabase JS library did not load.");
    return;
  }
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  window.shutterbookSupabase = client;

  const photographerSelect = document.querySelector("#photographerSelect");
  const packageSelect = document.querySelector("#packageSelect");
  const dateInput = document.querySelector("#date");
  const timeSelect = document.querySelector("#time");

  function toIsoLocal(dateValue, timeValue) {
    const [monthDay, year] = [dateValue, ""];
    const parsed = new Date(dateValue + "T00:00:00");
    const timeMap = {
      "8:00 AM": [8, 0], "10:00 AM": [10, 0], "1:00 PM": [13, 0],
      "3:00 PM": [15, 0], "4:30 PM (Golden hour)": [16, 30]
    };
    const parts = timeMap[timeValue] || [10, 0];
    parsed.setHours(parts[0], parts[1], 0, 0);
    return parsed.toISOString();
  }

  function getDuration() {
    return {
      "Portrait Session": 120,
      "Couples & Engagement": 180,
      "Events & Celebrations": 240
    }[packageSelect.value] || 120;
  }

  async function loadPhotographers() {
    photographerSelect.innerHTML = '<option value="">Loading photographers…</option>';
    const { data, error } = await client
      .from("photographers")
      .select("id,display_name,location,bio")
      .eq("active", true)
      .order("display_name");
    if (error) {
      photographerSelect.innerHTML = '<option value="">Photographers could not load</option>';
      console.error(error);
      return;
    }
    photographerSelect.innerHTML = '<option value="">Choose a photographer</option>';
    (data || []).forEach((photographer) => {
      const option = document.createElement("option");
      option.value = photographer.id;
      option.textContent = photographer.display_name + (photographer.location ? " · " + photographer.location : "");
      photographerSelect.appendChild(option);
    });
    if (!data || data.length === 0) {
      photographerSelect.innerHTML = '<option value="">Photographers will appear here when added</option>';
    }
  }

  async function loadAvailability() {
    if (!dateInput.value || !photographerSelect.value) return;
    const startAt = toIsoLocal(dateInput.value, timeSelect.value);
    const endAt = new Date(new Date(startAt).getTime() + getDuration() * 60000).toISOString();
    const { data, error } = await client.rpc("available_photographers", {
      p_start_at: startAt,
      p_end_at: endAt
    });
    if (error) {
      console.warn("Availability check failed; final booking validation is still enforced by the database.", error);
      return;
    }
    const allowed = new Set((data || []).map((row) => row.id));
    const selectedStillAvailable = allowed.has(photographerSelect.value);
    Array.from(photographerSelect.options).forEach((option) => {
      if (option.value) option.disabled = !allowed.has(option.value);
    });
    if (!selectedStillAvailable) {
      photographerSelect.value = "";
      if (window.toast) window.toast("That photographer is not available for this time. Please choose another.");
    }
  }

  dateInput.addEventListener("change", loadAvailability);
  timeSelect.addEventListener("change", loadAvailability);
  photographerSelect.addEventListener("change", loadAvailability);
  packageSelect.addEventListener("change", loadAvailability);
  loadPhotographers();

  window.submitBooking = async function () {
    const name = document.querySelector("#name").value.trim();
    const email = document.querySelector("#email").value.trim();
    const photographerId = photographerSelect.value;
    const dateValue = dateInput.value;
    const venue = document.querySelector("#venue").value.trim();
    if (!name || !email || !document.querySelector("#email").checkValidity()) {
      if (window.toast) window.toast("Please enter your name and a valid email.");
      return;
    }
    if (!photographerId) {
      if (window.toast) window.toast("Please choose an available photographer.");
      return;
    }
    const startAt = toIsoLocal(dateValue, timeSelect.value);
    const endAt = new Date(new Date(startAt).getTime() + getDuration() * 60000).toISOString();
    const packageName = packageSelect.value;
    const { data, error } = await client.rpc("request_booking", {
      p_photographer_id: photographerId,
      p_package_id: null,
      p_client_name: name,
      p_client_email: email,
      p_client_phone: document.querySelector("#phone").value.trim(),
      p_event_type: packageName,
      p_event_location: venue,
      p_notes: document.querySelector("#notes").value.trim(),
      p_start_at: startAt,
      p_end_at: endAt
    });
    if (error) {
      console.error(error);
      if (window.toast) window.toast(error.message.includes("overlapping") ? "This time was just booked. Please choose another." : "Could not submit booking: " + error.message);
      return;
    }
    document.querySelector("#bookingForm").style.display = "none";
    document.querySelector("#success").style.display = "block";
    document.querySelector("#success p").textContent =
      "Your request was sent to the photographer. Your reference is " + data.id + ". They will contact you to confirm.";
  };
})();
