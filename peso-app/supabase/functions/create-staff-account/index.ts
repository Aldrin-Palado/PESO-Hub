import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ success: false, message: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_SECRET_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(
        { success: false, message: "Staff account service is not configured." },
        500,
      );
    }

    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return jsonResponse(
        { success: false, message: "You must be logged in." },
        401,
      );
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userResult, error: userError } =
      await userClient.auth.getUser();

    if (userError || !userResult.user) {
      return jsonResponse(
        { success: false, message: "You must be logged in." },
        401,
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: admin, error: adminError } = await adminClient
      .from("peso_admin")
      .select("admin_id, user_id, full_name, email, is_active")
      .eq("user_id", userResult.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (adminError) {
      return jsonResponse(
        {
          success: false,
          message: "Unable to verify administrator account.",
          error: adminError.message,
        },
        500,
      );
    }
    if (!admin) {
      return jsonResponse(
        {
          success: false,
          message: "Access denied. Only the PESO Admin can create staff accounts.",
        },
        403,
      );
    }

    const body = await request.json() as {
      full_name?: string;
      email?: string;
      password?: string;
      contact_no?: string;
    };
    const fullName = body.full_name?.trim();
    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    const contactNumber = body.contact_no?.trim() || null;

    if (!fullName || !email || typeof password !== "string" || !password) {
      return jsonResponse(
        {
          success: false,
          message: "Full name, email, and password are required.",
        },
        400,
      );
    }

    const passwordError =
      password.length < 8
        ? "Password must contain at least 8 characters."
        : !/[A-Z]/.test(password)
          ? "Password must contain at least one uppercase letter."
          : !/[a-z]/.test(password)
            ? "Password must contain at least one lowercase letter."
            : !/[0-9]/.test(password)
              ? "Password must contain at least one number."
              : !/[\p{P}\p{S}]/u.test(password)
                ? "Password must contain at least one special character."
                : /\s/.test(password)
                  ? "Password must not contain spaces."
                  : null;

    if (passwordError) {
      return jsonResponse({ success: false, message: passwordError }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse(
        { success: false, message: "Please provide a valid email address." },
        400,
      );
    }

    const { data: existingStaff, error: existingError } = await adminClient
      .from("peso_staff")
      .select("peso_staff_id")
      .eq("email", email)
      .maybeSingle();

    if (existingError) {
      return jsonResponse(
        {
          success: false,
          message: "Unable to check existing staff accounts.",
          error: existingError.message,
        },
        500,
      );
    }
    if (existingStaff) {
      return jsonResponse(
        {
          success: false,
          message: "A PESO staff account with this email already exists.",
        },
        409,
      );
    }

    const { data: authData, error: authError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, role: "peso_staff" },
      });

    if (authError || !authData.user) {
      return jsonResponse(
        {
          success: false,
          message: authError?.message || "Unable to create authentication account.",
        },
        400,
      );
    }

    const newUser = authData.user;
    const { data: staff, error: staffError } = await adminClient
      .from("peso_staff")
      .insert({
        user_id: newUser.id,
        admin_id: admin.admin_id,
        full_name: fullName,
        email,
        contact_no: contactNumber,
        is_active: true,
      })
      .select()
      .single();

    if (staffError || !staff) {
      await adminClient.auth.admin.deleteUser(newUser.id).catch(() => undefined);
      return jsonResponse(
        {
          success: false,
          message: "Staff profile could not be created.",
          error: staffError?.message || "Unknown staff profile error.",
        },
        500,
      );
    }

    const { error: permissionError } = await adminClient
      .from("staff_permissions")
      .insert({
        peso_staff_id: staff.peso_staff_id,
        dashboard_overview: false,
        analytics: false,
        job_posts: false,
        job_application: false,
        employers: false,
        job_seekers: false,
        messages: false,
        notifications: false,
        peso_posts: false,
      });

    if (permissionError) {
      await adminClient
        .from("peso_staff")
        .delete()
        .eq("peso_staff_id", staff.peso_staff_id);
      await adminClient.auth.admin.deleteUser(newUser.id).catch(() => undefined);
      return jsonResponse(
        {
          success: false,
          message: "Staff account was not completed because permissions could not be created.",
          error: permissionError.message,
        },
        500,
      );
    }

    await adminClient.from("admin_activity_log").insert({
      admin_id: admin.admin_id,
      peso_staff_id: staff.peso_staff_id,
      action: "CREATE_STAFF_ACCOUNT",
      details: { staff_name: fullName, staff_email: email },
    });

    return jsonResponse(
      {
        success: true,
        message: "PESO Staff account created successfully.",
        staff: {
          peso_staff_id: staff.peso_staff_id,
          user_id: staff.user_id,
          full_name: staff.full_name,
          email: staff.email,
          contact_no: staff.contact_no,
          is_active: staff.is_active,
        },
      },
      201,
    );
  } catch (error) {
    console.error("Unexpected staff-account function error:", error);
    return jsonResponse(
      {
        success: false,
        message: error instanceof Error ? error.message : "An unexpected error occurred.",
      },
      500,
    );
  }
});
