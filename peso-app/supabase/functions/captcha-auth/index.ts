
type CaptchaVerification = {
  success: boolean;
  hostname?: string;
  "error-codes"?: string[];
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

type CaptchaResult =
  | { valid: true }
  | { valid: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

// ==================================================
// 1. ALLOWED ORIGINS
// ==================================================

// Exact website origins are used for CORS validation.
// Add your custom Vercel domains here if applicable.

const allowedOrigins = new Set([
  "https://peso-mabini-copy.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

// Optional additional origins from Supabase Function Secrets.
const additionalOrigins = (
  Deno.env.get("TURNSTILE_ALLOWED_ORIGINS") ?? ""
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

for (const origin of additionalOrigins) {
  try {
    allowedOrigins.add(new URL(origin).origin);
  } catch {
    console.warn("[CORS] Ignoring invalid configured origin.");
  }
}

// Allowed hostnames for Cloudflare Turnstile verification.
const allowedHostnames = (
  Deno.env.get("TURNSTILE_ALLOWED_HOSTNAMES") ??
  ""
)
  .split(",")
  .map((hostname) => hostname.trim().toLowerCase())
  .filter(Boolean);

// ==================================================
// 2. CORS CONFIGURATION
// ==================================================

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true;

  try {
    const normalizedOrigin = new URL(origin).origin;

    return allowedOrigins.has(normalizedOrigin);
  } catch {
    return false;
  }
}

function corsHeaders(
  origin: string | null
): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };

  if (origin && isOriginAllowed(origin)) {
    headers["Access-Control-Allow-Origin"] = new URL(origin).origin;
  }

  return headers;
}

// ==================================================
// 3. JSON RESPONSE
// ==================================================

function jsonResponse(
  body: unknown,
  status: number,
  headers: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

// ==================================================
// 4. CLOUDFLARE TURNSTILE VERIFICATION
// ==================================================

async function verifyCaptchaToken(
  token: string
): Promise<CaptchaResult> {
  const secret =
    Deno.env.get("TURNSTILE_SECRET_KEY");

  if (!secret) {
    console.error(
      "[CAPTCHA] TURNSTILE_SECRET_KEY is missing."
    );

    throw new Error(
      "CAPTCHA verification is not configured. Please contact the administrator."
    );
  }

  const body = new URLSearchParams({
    secret,
    response: token,
  });

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(10000),
    }
  );

  if (!response.ok) {
    console.error(
      "[CAPTCHA] Cloudflare returned HTTP status:",
      response.status
    );

    throw new Error(
      "Unable to verify CAPTCHA. Please try again."
    );
  }

  const result =
    (await response.json()) as CaptchaVerification;

  if (result.success !== true) {
    const errorCodes = Array.isArray(result["error-codes"])
      ? result["error-codes"].filter(
          (code) => typeof code === "string"
        )
      : [];

    console.warn(
      "[CAPTCHA] Verification rejected:",
      errorCodes
    );

    if (errorCodes.includes("invalid-input-secret")) {
      return {
        valid: false,
        error:
          "Invalid Cloudflare Secret Key. Please contact the administrator.",
      };
    }

    if (
      errorCodes.includes("timeout-or-duplicate") ||
      errorCodes.includes("invalid-input-response")
    ) {
      return {
        valid: false,
        error:
          "Your CAPTCHA expired or was already used. Please verify again.",
      };
    }

    return {
      valid: false,
      error:
        "Cloudflare rejected the CAPTCHA verification. Please try again.",
    };
  }

  // Optional hostname validation.
  if (
    result.hostname &&
    allowedHostnames.length > 0 &&
    !allowedHostnames.includes(result.hostname.toLowerCase())
  ) {
    console.warn(
      "[CAPTCHA] Unexpected hostname:",
      result.hostname
    );

    return {
      valid: false,
      error:
        "CAPTCHA hostname validation failed. Please contact the administrator.",
    };
  }

  return { valid: true };
}

// ==================================================
// 5. MAIN EDGE FUNCTION
// ==================================================

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  const headers = corsHeaders(origin);

  const respond = (body: unknown, status = 200) =>
    jsonResponse(body, status, headers);

  console.log(
    `[CAPTCHA AUTH] ${request.method} request received.`
  );

  // ------------------------------------------------
  // CORS PREFLIGHT
  // ------------------------------------------------

  if (request.method === "OPTIONS") {
    if (origin && !isOriginAllowed(origin)) {
      console.warn(
        "[CORS] Rejected preflight origin:",
        origin
      );

      return new Response(null, {
        status: 403,
        headers,
      });
    }

    console.log("[CORS] Preflight request accepted.");

    return new Response(null, {
      status: 204,
      headers,
    });
  }

  // ------------------------------------------------
  // ALLOW POST ONLY
  // ------------------------------------------------

  if (request.method !== "POST") {
    return respond(
      { error: "Method not allowed." },
      405
    );
  }

  // ------------------------------------------------
  // VALIDATE ORIGIN
  // ------------------------------------------------

  if (origin && !isOriginAllowed(origin)) {
    console.warn(
      "[CORS] Rejected request origin:",
      origin
    );

    return respond(
      { error: "Origin is not allowed." },
      403
    );
  }

  // ------------------------------------------------
  // SUPABASE CONFIGURATION
  // ------------------------------------------------

  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  const supabaseKey =
    Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "[AUTH] Missing Supabase environment configuration."
    );

    return respond(
      { error: "Sign-in is not configured." },
      500
    );
  }

  // ------------------------------------------------
  // READ REQUEST BODY
  // ------------------------------------------------

  let rawPayload: unknown;

  try {
    rawPayload = await request.json();
  } catch {
    return respond(
      { error: "Invalid request body." },
      400
    );
  }

  if (!isRecord(rawPayload)) {
    return respond(
      { error: "Invalid request." },
      400
    );
  }

  const payload = rawPayload;

  // ------------------------------------------------
  // VALIDATE AUTHENTICATION MODE
  // ------------------------------------------------

  const mode = payload.mode;
  if (
    mode !== "password" &&
    mode !== "verify" &&
    mode !== "validate"
  ) {
    return respond(
      { error: "Invalid authentication mode." },
      400
    );
  }

  const captchaToken =
    typeof payload.captchaToken === "string"
      ? payload.captchaToken
      : "";
  if (
    mode !== "validate" &&
    (captchaToken.length === 0 || captchaToken.length > 4096)
  ) {
    return respond(
      { error: "A valid CAPTCHA response is required." },
      400
    );
  }

  let email: string | null = null;
  let password: string | null = null;

  // ------------------------------------------------
  // PASSWORD VALIDATION
  // ------------------------------------------------

  if (mode !== "verify") {
    if (
      typeof payload.email !== "string" ||
      typeof payload.password !== "string" ||
      payload.email.length > 320 ||
      payload.password.length === 0 ||
      payload.password.length > 1024
    ) {
      return respond(
        { error: "Email and password are required." },
        400
      );
    }

    email = payload.email.trim();
    password = payload.password;

    if (!email) {
      return respond(
        { error: "Email and password are required." },
        400
      );
    }
  }

  // ------------------------------------------------
  // VERIFY CAPTCHA AND AUTHENTICATE
  // ------------------------------------------------

  try {
    console.log(
      `[CAPTCHA AUTH] Processing mode: ${mode}`
    );

    if (mode !== "validate") {
      // Verify CAPTCHA before password authentication or OAuth.
      const captchaResult =
        await verifyCaptchaToken(captchaToken);

      if (!captchaResult.valid) {
        return respond(
          { error: captchaResult.error },
          400
        );
      }

      console.log(
        "[CAPTCHA AUTH] Cloudflare verification successful."
      );
    }

    // STEP 2: Google OAuth preliminary verification.
    if (mode === "verify") {
      return respond({
        success: true,
        verified: true,
        message: "CAPTCHA verification successful.",
      });
    }

    // STEP 3: Password authentication.
    if (email === null || password === null) {
      return respond(
        { error: "Email and password are required." },
        400
      );
    }

    const authUrl =
      `${supabaseUrl.replace(/\/+$/, "")}` +
      "/auth/v1/token?grant_type=password";

    const authResponse = await fetch(authUrl, {
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
      signal: AbortSignal.timeout(15000),
    });

    // STEP 4: Read Supabase Auth response.
    let authResult: AuthResponse = {};

    try {
      authResult =
        (await authResponse.json()) as AuthResponse;
    } catch {
      console.error(
        "[AUTH] Invalid Supabase authentication response."
      );

      return respond(
        { error: "Unable to process sign-in response." },
        502
      );
    }

    if (!authResponse.ok) {
      const errorMessage =
        authResult.msg ??
        authResult.message ??
        authResult.error_description;

      console.warn(
        "[AUTH] Authentication rejected:",
        authResponse.status,
        errorMessage
      );

      return respond(
        {
          error:
            errorMessage === "Invalid login credentials"
              ? "Invalid login credentials"
              : errorMessage ??
                "Unable to sign in. Please try again.",
        },
        authResponse.status
      );
    }

    // Validate the session before accepting the credentials.
    if (
      !authResult.access_token ||
      !authResult.refresh_token
    ) {
      console.error(
        "[AUTH] Supabase returned an incomplete session."
      );

      return respond(
        { error: "Unable to create a login session." },
        502
      );
    }

    if (mode === "validate") {
      const logoutUrl =
        `${supabaseUrl.replace(/\/+$/, "")}` +
        "/auth/v1/logout?scope=local";
      const logoutResponse = await fetch(logoutUrl, {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${authResult.access_token}`,
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!logoutResponse.ok) {
        console.error(
          "[AUTH] Could not revoke the pre-validation session:",
          logoutResponse.status,
        );
        return respond(
          { error: "Unable to validate credentials safely. Please try again." },
          502
        );
      }

      console.log("[AUTH] Password credentials validated.");
      return respond({ success: true, valid: true });
    }

    console.log(
      "[AUTH] Password authentication successful."
    );

    // STEP 6: Return session tokens.
    return respond({
      access_token: authResult.access_token,
      refresh_token: authResult.refresh_token,
    });

  } catch (error) {
    console.error(
      "[CAPTCHA AUTH] Request failed:",
      error instanceof Error
        ? error.message
        : "Unknown error"
    );

    return respond(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to verify CAPTCHA and sign in.",
      },
      500
    );
  }
});
