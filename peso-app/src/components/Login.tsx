
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthSideImage from "./AuthSideImage";
import PesoLogo from "./PesoLogo";
import { supabase } from "../services/supabase";
import AppIcon from "./AppIcon";
import Captcha from "./Captcha";

const googleLogo = new URL(
  "../assets/images/google.png",
  import.meta.url
).href;

type AuthStep = "credentials" | "captcha";
type AuthMethod = "password" | "google";

function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const sessionExpired =
    location.state !== null &&
    typeof location.state === "object" &&
    "sessionExpired" in location.state &&
    location.state.sessionExpired === true;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  const [authStep, setAuthStep] = useState<AuthStep>("credentials");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("password");

  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  const [error, setError] = useState("");

  const authInProgressRef = useRef(false);
  const lastSubmittedCaptchaTokenRef = useRef("");

  // Reset CAPTCHA and invalidate previous token.
  const resetCaptcha = () => {
    lastSubmittedCaptchaTokenRef.current = "";
    setCaptchaToken("");
    setCaptchaResetKey((current) => current + 1);
  };

  // Display CAPTCHA after choosing an authentication method.
  const showCaptcha = (method: AuthMethod) => {
    if (loading || oauthLoading || authInProgressRef.current) return;

    setAuthMethod(method);
    setError("");
    resetCaptcha();
    setAuthStep("captcha");
  };

  // Return to login credentials.
  const backToCredentials = () => {
    if (loading || oauthLoading) return;

    resetCaptcha();
    setError("");
    setAuthMethod("password");
    setAuthStep("credentials");
  };

  // Extract Supabase Edge Function error.
  const getErrorMessage = async (
    loginError: {
      message: string;
      context?: unknown;
    }
  ) => {
    let message = loginError.message;

    if (loginError.context instanceof Response) {
      try {
        const responseBody: unknown =
          await loginError.context.clone().json();

        if (
          responseBody &&
          typeof responseBody === "object" &&
          "error" in responseBody &&
          typeof responseBody.error === "string"
        ) {
          message = responseBody.error;
        }
      } catch {
        // Retain original error.
      }
    }

    if (message === "Invalid login credentials") {
      return "Invalid email or password. Please check your credentials.";
    }

    return message;
  };

  // Role-based navigation.
  const routeAuthenticatedUser = async (user: { id: string }) => {
    // Superadmin
    const { data: admin, error: adminError } = await supabase
      .from("peso_admin")
      .select("admin_id, user_id, full_name, email, is_active")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminError) {
      console.error("Admin profile lookup error:", adminError);
      throw new Error(
        "Your login was accepted, but we could not verify your Admin profile."
      );
    }

    if (admin) {
      if (!admin.is_active) {
        await supabase.auth.signOut();
        alert("This Admin account is inactive. Please contact the system administrator.");
        navigate("/", { replace: true });
        return;
      }

      navigate("/superadmin", { replace: true });
      return;
    }

    // Staff
    const { data: staff, error: staffError } = await supabase
      .from("peso_staff")
      .select("peso_staff_id, user_id, full_name, email, is_active")
      .eq("user_id", user.id)
      .maybeSingle();

    if (staffError) {
      console.error("Staff profile lookup error:", staffError);
      throw new Error(
        "Your login was accepted, but we could not verify your Staff profile."
      );
    }

    if (staff) {
      if (!staff.is_active) {
        await supabase.auth.signOut();
        alert("This Staff account is inactive. Please contact the Admin.");
        navigate("/", { replace: true });
        return;
      }

      navigate("/superadmin", { replace: true });
      return;
    }

    // Job Seeker
    const { data: jobSeeker, error: jobSeekerError } = await supabase
      .from("job_seeker")
      .select("job_seeker_id, user_id, full_name, email, is_active")
      .eq("user_id", user.id)
      .maybeSingle();

    if (jobSeekerError) {
      console.error("Job Seeker profile lookup error:", jobSeekerError);
      throw new Error(
        "Your login was accepted, but we could not verify your Job Seeker profile."
      );
    }

    if (jobSeeker) {
      if (!jobSeeker.is_active) {
        await supabase.auth.signOut();
        alert("This Job Seeker account is inactive.");
        navigate("/", { replace: true });
        return;
      }

      const state = location.state;

      const returnToPath =
        state &&
        typeof state === "object" &&
        "returnTo" in state &&
        typeof state.returnTo === "string"
          ? state.returnTo
          : "";

      const returnTo =
        returnToPath.startsWith("/jobs") ||
        /^\/jobseeker\?job=[0-9a-f-]{36}$/i.test(returnToPath)
          ? returnToPath
          : "/jobseeker";

      navigate(returnTo, { replace: true });
      return;
    }

    // Employer
    const { data: employer, error: employerError } = await supabase
      .from("employer")
      .select("employer_id, user_id, name, email, is_verified")
      .eq("user_id", user.id)
      .maybeSingle();

    if (employerError) {
      console.error("Employer profile lookup error:", employerError);
      throw new Error(
        "Your login was accepted, but we could not verify your Employer profile."
      );
    }

    if (employer) {
      navigate("/employer", { replace: true });
      return;
    }

    await supabase.auth.signOut();

    alert(
      "Your account is authenticated, but no PESO profile was found. Please contact the Admin."
    );

    navigate("/", { replace: true });
  };

  // Check existing session and OAuth authentication.
  useEffect(() => {
    let isMounted = true;

    const checkStoredSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isMounted || !session?.user) return;

      try {
        await routeAuthenticatedUser(session.user);
      } catch (err) {
        console.error("Session redirect error:", err);
        await supabase.auth.signOut();
      }
    };

    void checkStoredSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        event === "SIGNED_IN" &&
        session?.user &&
        !authInProgressRef.current
      ) {
        void Promise.resolve().then(async () => {
          if (!isMounted || authInProgressRef.current) return;

          try {
            await routeAuthenticatedUser(session.user);
          } catch (err) {
            console.error("Authentication redirect error:", err);
            await supabase.auth.signOut();
          }
        });
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [navigate, location.state]);

  // Email and password authentication.
  const handleLogin = async (
    e?: React.FormEvent<HTMLFormElement>,
    verifiedCaptchaToken = captchaToken,
  ) => {
    e?.preventDefault();

    if (authInProgressRef.current || loading || oauthLoading) return;

    // First step: show CAPTCHA.
    if (authStep === "credentials") {
      if (!email.trim() || !password) {
        setError("Please enter your email and password.");
        return;
      }

      showCaptcha("password");
      return;
    }

    if (authMethod !== "password") return;

    if (!verifiedCaptchaToken) {
      setError("Please complete the CAPTCHA verification.");
      return;
    }

    if (lastSubmittedCaptchaTokenRef.current === verifiedCaptchaToken) return;

    const submittedToken = verifiedCaptchaToken;

    authInProgressRef.current = true;
    lastSubmittedCaptchaTokenRef.current = submittedToken;

    setCaptchaToken("");
    setError("");
    setLoading(true);

    try {
      // Verify CAPTCHA and authenticate through Edge Function.
      const { data, error: loginError } =
        await supabase.functions.invoke<{
          access_token?: string;
          refresh_token?: string;
        }>("captcha-auth", {
          body: {
            mode: "password",
            email: email.trim(),
            password,
            captchaToken: submittedToken,
          },
        });

      if (loginError) {
        throw new Error(await getErrorMessage(loginError));
      }

      if (!data?.access_token || !data?.refresh_token) {
        throw new Error(
          "Sign in failed. Supabase did not return a valid session."
        );
      }

      // Establish Supabase session.
      const { data: sessionData, error: sessionError } =
        await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });

      if (sessionError) throw sessionError;

      if (!sessionData.user) {
        throw new Error("Supabase did not return an authenticated user.");
      }

      // Redirect according to account role.
      await routeAuthenticatedUser(sessionData.user);

    } catch (err) {
      console.error("Login error:", err);

      const message =
        err instanceof Error
          ? err.message
          : "Something went wrong while logging in. Please try again.";

      setError(message);

      await supabase.auth.signOut();

    } finally {
      resetCaptcha();
      setLoading(false);
      authInProgressRef.current = false;
    }
  };

  // Google OAuth after CAPTCHA verification.
  const signInWithGoogle = async (verifiedCaptchaToken = captchaToken) => {
    if (authInProgressRef.current || loading || oauthLoading) return;

    if (!verifiedCaptchaToken) {
      setError("Please complete the CAPTCHA verification.");
      return;
    }

    if (lastSubmittedCaptchaTokenRef.current === verifiedCaptchaToken) return;

    const submittedToken = verifiedCaptchaToken;

    authInProgressRef.current = true;
    lastSubmittedCaptchaTokenRef.current = submittedToken;

    setCaptchaToken("");
    setError("");
    setOauthLoading(true);

    try {
      // Verify CAPTCHA before initiating Google OAuth.
      const { error: captchaError } = await supabase.functions.invoke(
        "captcha-auth",
        {
          body: {
            mode: "verify",
            captchaToken: submittedToken,
          },
        }
      );

      if (captchaError) {
        throw new Error(await getErrorMessage(captchaError));
      }

      // Initiate Google OAuth.
      const { error: oauthError } =
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: `${window.location.origin}/auth/callback`,
          },
        });

      if (oauthError) throw oauthError;

      // Browser redirects to Google.

    } catch (err) {
      console.error("Google OAuth error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to sign in with Google. Please try again."
      );

      resetCaptcha();
      setOauthLoading(false);
      authInProgressRef.current = false;
    }
  };

  return (
    <div className="whirl-page-background min-h-screen">
      <main className="grid min-h-screen lg:grid-cols-2">

        <AuthSideImage />

        <section className="flex min-h-[calc(100dvh-19rem)] flex-col justify-center bg-white/85 px-5 py-10 backdrop-blur-sm sm:px-10 lg:min-h-screen lg:px-12 xl:px-20">

          <div className="mx-auto w-full max-w-[33rem]">

            <PesoLogo
              size="auth"
              showName
              subtitle="Municipality of Mabini, Batangas"
              className="mb-8"
            />

            {/* Page heading */}
            <div className="mb-8">
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#102A4C] sm:text-4xl">
                {authStep === "credentials"
                  ? "Sign in"
                  : "Verify you're human"}
              </h2>

              <p className="mt-3 text-sm leading-6 text-slate-500 sm:text-base">
                {authStep === "credentials"
                  ? "Access your PESO MABINI account to continue."
                  : "Complete the security verification below before continuing."}
              </p>
            </div>

            {/* Session expiration notice */}
            {sessionExpired && (
              <p
                role="status"
                className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900"
              >
                Your session expired after 30 minutes of inactivity.
                Please sign in again.
              </p>
            )}

            <form onSubmit={handleLogin} className="space-y-5">

              {authStep === "credentials" ? (
                <>
                  {/* Email */}
                  <div>
                    <label
                      htmlFor="login-email"
                      className="mb-2 block text-sm font-medium text-slate-800"
                    >
                      Email address
                    </label>

                    <input
                      id="login-email"
                      type="email"
                      autoComplete="username"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="Enter your email"
                      required
                      disabled={loading || oauthLoading}
                      className="w-full rounded-2xl border border-[#D5DEEB] bg-white px-5 py-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#315FEA] focus:ring-4 focus:ring-[#315FEA]/10 disabled:bg-slate-100"
                    />
                  </div>

                  {/* Password */}
                  <div>
                    <label
                      htmlFor="login-password"
                      className="mb-2 block text-sm font-medium text-slate-800"
                    >
                      Password
                    </label>

                    <div className="relative">
                      <input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Enter your password"
                        required
                        disabled={loading || oauthLoading}
                        className="w-full rounded-2xl border border-[#D5DEEB] bg-white px-5 py-4 pr-20 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#315FEA] focus:ring-4 focus:ring-[#315FEA]/10 disabled:bg-slate-100"
                      />

                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        disabled={loading || oauthLoading}
                        className="absolute right-5 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500 transition hover:text-[#315FEA]"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>

                    <div className="mt-2 text-right">
                      <Link
                        to="/forgot-password"
                        className="text-sm font-medium text-[#315FEA] transition hover:text-[#123B70]"
                      >
                        Forgot Password?
                      </Link>
                    </div>
                  </div>

                  {/* Remember me */}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="remember"
                      className="h-4 w-4 rounded border-slate-300 accent-[#315FEA] focus:ring-[#315FEA]"
                    />

                    <label
                      htmlFor="remember"
                      className="text-sm text-slate-600"
                    >
                      Keep me signed in
                    </label>
                  </div>

                  {/* Continue */}
                  <button
                    type="submit"
                    disabled={loading || oauthLoading}
                    className="w-full rounded-2xl bg-[#315FEA] px-5 py-4 text-base font-semibold text-white shadow-[0_12px_24px_-12px_rgba(49,95,234,0.75)] transition hover:bg-[#244FD4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315FEA] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Continue
                  </button>

                  {/* Login error */}
                  {error && (
                    <p role="alert" className="text-sm text-red-700">
                      {error}
                    </p>
                  )}

                  {/* Divider */}
                  <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <span className="h-px flex-1 bg-slate-200" />
                    Or
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>

                  {/* Google OAuth */}
                  <button
                    type="button"
                    onClick={() => showCaptcha("google")}
                    disabled={loading || oauthLoading}
                    className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-[#D5DEEB] bg-white px-5 py-4 text-base font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                  >
                    <img
                      src={googleLogo}
                      alt=""
                      aria-hidden="true"
                      className="h-9 w-9 object-contain"
                    />

                    Continue with Google
                  </button>
                </>
              ) : (
                <>
                  {/* CAPTCHA verification */}
                  <div className="rounded-2xl border border-[#D5DEEB] bg-white p-5 sm:p-7">

                    <div className="mb-5 text-center">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
                        <AppIcon
                          name="shieldCheck"
                          className="h-6 w-6 text-[#315FEA]"
                        />
                      </div>

                      <h3 className="text-lg font-semibold text-[#102A4C]">
                        Security Verification
                      </h3>

                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        Please confirm that you are human to securely
                        continue to your PESO-Hub account.
                      </p>
                    </div>

                    <Captcha
                      onVerify={(token) => {
                        setCaptchaToken(token);
                        if (token) {
                          setError("");
                          if (authMethod === "google") {
                            void signInWithGoogle(token);
                          } else {
                            void handleLogin(undefined, token);
                          }
                        }
                      }}
                      onExpire={() => {
                        setCaptchaToken("");
                        setError(
                          "Your CAPTCHA has expired. Please verify again."
                        );
                      }}
                      onError={() => {
                        // Captcha.tsx displays its own loading error.
                        // Do not display a second generic error here.
                        setCaptchaToken("");
                      }}
                      resetKey={captchaResetKey}
                      theme="light"
                      size="normal"
                      className="flex justify-center"
                    />

                  </div>

                  {/* Authentication error */}
                  {error && (
                    <p
                      role="alert"
                      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                    >
                      {error}
                    </p>
                  )}

                  {/* Continue automatically after CAPTCHA verification. */}
                  {authMethod === "password" ? (
                    <p
                      role="status"
                      className="text-center text-sm font-medium text-slate-600"
                    >
                      {loading
                        ? "Signing you in..."
                        : "Complete the CAPTCHA to sign in automatically."}
                    </p>
                  ) : (
                    <p
                      role="status"
                      className="text-center text-sm font-medium text-slate-600"
                    >
                      {oauthLoading
                        ? "Opening Google..."
                        : "Complete the CAPTCHA to continue with Google automatically."}
                    </p>
                  )}

                  {/* Back */}
                  <button
                    type="button"
                    onClick={backToCredentials}
                    disabled={loading || oauthLoading}
                    className="w-full rounded-2xl border border-[#D5DEEB] bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Back
                  </button>
                </>
              )}

            </form>

            {/* Registration */}
            <div className="mt-8 pt-2 text-center">
              <p className="text-sm text-slate-500">
                Don’t have an account?{" "}

                <Link
                  to="/register"
                  className="font-semibold text-[#315FEA] underline decoration-[#315FEA]/40 underline-offset-4 transition hover:text-[#123B70]"
                >
                  Create an account
                </Link>
              </p>
            </div>

            <p className="mt-4 text-center text-xs leading-5 text-slate-500">
              Your information is protected and used only to provide
              employment services.
            </p>

            {/* Return to Home */}
            <Link
              to="/"
              className="mx-auto mt-5 inline-flex items-center justify-center gap-2 rounded-full border border-[#D5DEEB] bg-white px-6 py-3 text-sm font-semibold text-[#3156A2] shadow-sm transition hover:border-[#315FEA]/40 hover:text-[#244FD4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315FEA]"
            >
              <AppIcon name="arrowLeft" className="h-4 w-4" />
              Return to Home
            </Link>

          </div>
        </section>
      </main>
    </div>
  );
}

export default Login;
