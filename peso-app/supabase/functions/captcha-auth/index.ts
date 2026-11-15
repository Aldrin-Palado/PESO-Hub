type RecaptchaVerification = {
  success: boolean;
  hostname?: string;
};

type AuthResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  expires_at?: number;
  user?: unknown;
  msg?: string;
  message?: string;
  error_description?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const allowedHostnames = (Deno.env.get("RECAPTCHA_ALLOWED_HOSTNAMES") ?? "")
  .split(",")
  .map((hostname) => hostname.trim().toLowerCase())
  .filter(Boolean);

function corsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };

  if (!origin) return headers;
  try {
    const originHostname = new URL(origin).hostname.toLowerCase();
    if (allowedHostnames.includes(originHostname)) {
      headers["Access-Control-Allow-Origin"] = origin;
    }
  } catch {
    // Invalid Origin values are not granted cross-origin access.
  }
  return headers;
}

function jsonResponse(
  body: unknown,
  status: number,
  headers: Record<string, string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

async function verifyRecaptcha(token: string): Promise<boolean> {
  const secret = Deno.env.get("RECAPTCHA_SECRET_KEY");
  if (!secret || allowedHostnames.length === 0) {
    console.error("CAPTCHA authentication is missing server configuration.");
    throw new Error("CAPTCHA verification is not configured.");
  }

  const body = new URLSearchParams({ secret, response: token });
  const response = await fetch(
    "https://www.google.com/recaptcha/api/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) {
    console.error("Google reCAPTCHA verification request failed.");
    throw new Error("Unable to verify the CAPTCHA. Please try again.");
  }

  const result = await response.json() as RecaptchaVerification;
  if (
    result.success !== true ||
    typeof result.hostname !== "string" ||
    !allowedHostnames.includes(result.hostname.toLowerCase())
  ) {
    return false;
  }
  return true;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  const headers = corsHeaders(origin);
  const respond = (body: unknown, status = 200) =>
    jsonResponse(body, status, headers);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") {
    return respond({ error: "Method not allowed." }, 405);
  }
  if (
    origin &&
    !headers["Access-Control-Allow-Origin"]
  ) {
    return respond({ error: "Origin is not allowed." }, 403);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey =
    Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    console.error("CAPTCHA authentication is missing Supabase configuration.");
    return respond({ error: "Sign-in is not configured." }, 500);
  }

  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return respond({ error: "Invalid request." }, 400);
  }

  if (!isRecord(rawPayload)) {
    return respond({ error: "Invalid request." }, 400);
  }
  const payload = rawPayload;

  if (
    (payload.mode !== "password" && payload.mode !== "verify") ||
    typeof payload.captchaToken !== "string" ||
    payload.captchaToken.length === 0 ||
    payload.captchaToken.length > 4096
  ) {
    return respond({ error: "A valid CAPTCHA response is required." }, 400);
  }

  const mode = payload.mode;
  const captchaToken = payload.captchaToken;
  let email: string | null = null;
  let password: string | null = null;
  if (mode === "password") {
    if (
      typeof payload.email !== "string" ||
      typeof payload.password !== "string" ||
      payload.email.length > 320 ||
      payload.password.length === 0 ||
      payload.password.length > 1024
    ) {
      return respond({ error: "Email and password are required." }, 400);
    }
    email = payload.email.trim();
    password = payload.password;
    if (!email) {
      return respond({ error: "Email and password are required." }, 400);
    }
  }

  try {
    const captchaValid = await verifyRecaptcha(captchaToken);
    if (!captchaValid) {
      return respond({ error: "CAPTCHA verification failed. Please try again." }, 400);
    }

    if (mode === "verify") {
      return respond({ verified: true });
    }
    if (email === null || password === null) {
      return respond({ error: "Email and password are required." }, 400);
    }

    const authResponse = await fetch(
      `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    const authResult = await authResponse.json() as AuthResponse;
    if (!authResponse.ok) {
      const errorMessage =
        authResult.msg ?? authResult.message ?? authResult.error_description;
      return respond(
        {
          error:
            errorMessage === "Invalid login credentials"
              ? errorMessage
              : errorMessage ?? "Unable to sign in. Please try again.",
        },
        authResponse.status,
      );
    }

    if (!authResult.access_token || !authResult.refresh_token) {
      console.error("Supabase Auth returned an incomplete login session.");
      return respond({ error: "Unable to create a login session." }, 502);
    }

    return respond({
      access_token: authResult.access_token,
      refresh_token: authResult.refresh_token,
    });
  } catch (error) {
    console.error(
      "CAPTCHA authentication request failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return respond(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to verify CAPTCHA and sign in.",
      },
      500,
    );
  }
});
