
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthSideImage from "./AuthSideImage";
import PesoLogo from "./PesoLogo";
import { supabase } from "../services/supabase";
import AppIcon from "./AppIcon";
import Captcha from "./Captcha";

type AuthStep = "credentials" | "captcha";
type AuthMethod = "password" | "google";
type GoogleCredentialResponse = { credential?: string };
type GoogleButtonOptions = {
  type: "standard";
  theme: "outline";
  size: "large";
  text: "continue_with";
  shape: "rectangular";
  width: number;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
            auto_select: boolean;
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: GoogleButtonOptions,
          ) => void;
        };
      };
    };
  }
}

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";
const googleIdentityScriptUrl = "https://accounts.google.com/gsi/client";
const googleRegistrationRequiredMessage =
  "No PESO account is registered with this Google email. Please create an account first, then sign in with Google.";

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
  const [googleButtonError, setGoogleButtonError] = useState("");
  const [showGoogleRegistrationModal, setShowGoogleRegistrationModal] =
    useState(false);

  const authInProgressRef = useRef(false);
  const lastSubmittedCaptchaTokenRef = useRef("");
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googleIdTokenRef = useRef("");

  // Reset CAPTCHA and invalidate previous token.
  const resetCaptcha = () => {
    lastSubmittedCaptchaTokenRef.current = "";
    setCaptchaToken("");
    setCaptchaResetKey((current) => current + 1);
  };

  useEffect(() => {
    const buttonContainer = googleButtonRef.current;
    if (!buttonContainer) return;

    if (!googleClientId) {
      setGoogleButtonError(
        "Google sign-in is not configured. Set VITE_GOOGLE_CLIENT_ID and rebuild the app.",
      );
      return;
    }

    let active = true;
    let resizeObserver: ResizeObserver | null = null;
    let lastRenderedWidth = 0;
    let script = document.querySelector<HTMLScriptElement>(
      `script[src="${googleIdentityScriptUrl}"]`,
    );

    const renderGoogleButton = () => {
      if (!active || !window.google || !googleButtonRef.current) {
        return;
      }

      const container = googleButtonRef.current;
      const availableWidth = Math.floor(
        container.getBoundingClientRect().width,
      );

      // Google Identity Services adds approximately 20px to the iframe
      // width internally, so reserve that space to prevent horizontal clipping.
      const buttonWidth = Math.min(400, availableWidth - 20);

      // Google requires a minimum button width of 200px.
      if (buttonWidth < 200) return;

      // Avoid clearing and recreating the Google button when its width is unchanged.
      if (buttonWidth === lastRenderedWidth && container.childElementCount > 0) {
        return;
      }

      lastRenderedWidth = buttonWidth;
      container.innerHTML = "";

      window.google.accounts.id.renderButton(container, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        width: buttonWidth,
      });
    };

    const initializeGoogle = () => {
      if (!active || !window.google || !googleButtonRef.current) {
        return;
      }

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        auto_select: false,
        callback: (response) => {
          if (!response.credential) {
            setGoogleButtonError(
              "Google did not return an account token. Please try again.",
            );
            return;
          }

          googleIdTokenRef.current = response.credential;
          setGoogleButtonError("");
          setError("");
          setAuthMethod("google");
          setCaptchaToken("");
          setCaptchaResetKey((current) => current + 1);
          setAuthStep("captcha");
        },
      });

      renderGoogleButton();

      resizeObserver = new ResizeObserver(() => {
        renderGoogleButton();
      });
      resizeObserver.observe(buttonContainer);
    };

    const handleScriptError = () => {
      if (active) {
        setGoogleButtonError(
          "Google sign-in could not be loaded. Please try again.",
        );
      }
    };

    if (window.google) {
      initializeGoogle();
    } else if (script) {
      script.addEventListener("load", initializeGoogle);
      script.addEventListener("error", handleScriptError);
    } else {
      script = document.createElement("script");
      script.src = googleIdentityScriptUrl;
      script.async = true;
      script.defer = true;
      script.onload = initializeGoogle;
      script.onerror = handleScriptError;

      document.head.appendChild(script);
    }

    return () => {
      active = false;
      resizeObserver?.disconnect();
      if (script) {
        script.removeEventListener("load", initializeGoogle);
        script.removeEventListener("error", handleScriptError);
      }
    };
  }, [authStep]);

  useEffect(() => {
    if (!showGoogleRegistrationModal) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowGoogleRegistrationModal(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showGoogleRegistrationModal]);

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
      .select("employer_id, user_id, name, email, is_verified, is_active")
      .eq("user_id", user.id)
      .maybeSingle();

    if (employerError) {
      console.error("Employer profile lookup error:", employerError);
      throw new Error(
        "Your login was accepted, but we could not verify your Employer profile."
      );
    }

    if (employer) {
      if (employer.is_active === false) {
        await supabase.auth.signOut();
        alert("This Employer account is inactive. Please contact the Admin.");
        navigate("/", { replace: true });
        return;
      }

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

    // Validate credentials before allowing the password flow to continue to CAPTCHA.
    if (authStep === "credentials") {
      if (!email.trim() || !password) {
        setError("Please enter your email and password.");
        return;
      }

      authInProgressRef.current = true;
      setLoading(true);
      setError("");

      try {
        const { data, error: validationError } =
          await supabase.functions.invoke<{ valid?: boolean }>("captcha-auth", {
            body: {
              mode: "validate",
              email: email.trim(),
              password,
            },
          });

        if (validationError) {
          throw new Error(await getErrorMessage(validationError));
        }
        if (!data?.valid) {
          throw new Error("Unable to validate credentials. Please try again.");
        }

        setAuthMethod("password");
        resetCaptcha();
        setAuthStep("captcha");
      } catch (validationError) {
        console.error("Login credential validation error:", validationError);
        setError(
          validationError instanceof Error
            ? validationError.message
            : "Unable to validate your credentials. Please try again.",
        );
      } finally {
        setLoading(false);
        authInProgressRef.current = false;
      }
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

  // Authenticate the selected Google account only after CAPTCHA verification.
  const signInWithGoogle = async (verifiedCaptchaToken = captchaToken) => {
    if (authInProgressRef.current || loading || oauthLoading) return;

    const googleIdToken = googleIdTokenRef.current;
    if (!googleIdToken) {
      setError("Select a Google account before completing the CAPTCHA.");
      setAuthStep("credentials");
      return;
    }

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
      const { data: googleCheck, error: googleCheckError } =
        await supabase.functions.invoke<{ registered?: boolean }>(
          "captcha-auth",
          {
            body: {
              mode: "google",
              captchaToken: submittedToken,
              googleIdToken,
              googleClientId,
            },
          },
        );

      if (googleCheckError) {
        throw new Error(await getErrorMessage(googleCheckError));
      }
      if (!googleCheck?.registered) {
        throw new Error(googleRegistrationRequiredMessage);
      }

      const { data, error: googleError } =
        await supabase.auth.signInWithIdToken({
          provider: "google",
          token: googleIdToken,
        });
      if (googleError) throw googleError;
      if (!data.user) {
        throw new Error("Google sign-in did not return an authenticated user.");
      }

      googleIdTokenRef.current = "";
      await routeAuthenticatedUser(data.user);

    } catch (err) {
      console.error("Google OAuth error:", err);

      const message =
        err instanceof Error
          ? err.message
          : "Unable to sign in with Google. Please try again.";
      if (message === googleRegistrationRequiredMessage) {
        setShowGoogleRegistrationModal(true);
      } else {
        setError(message);
      }

      await supabase.auth.signOut();
      googleIdTokenRef.current = "";
      setAuthStep("credentials");
      setAuthMethod("password");
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
                    {loading ? "Checking credentials..." : "Continue"}
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
                  <div
                    className="mx-auto flex min-h-11 w-full min-w-0 justify-center overflow-visible"
                    style={{ maxWidth: "400px" }}
                  >
                    <div
                      ref={googleButtonRef}
                      id="google-sign-in-button"
                      className="w-full min-w-0 overflow-visible"
                      style={{
                        width: "100%",
                        maxWidth: "400px",
                        minWidth: 0,
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  {googleButtonError && (
                    <p role="alert" className="text-sm text-red-700">
                      {googleButtonError}
                    </p>
                  )}
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
                        ? "Verifying CAPTCHA and signing you in..."
                        : "Your Google account is selected. Complete the CAPTCHA to sign in automatically."}
                    </p>
                  )}

                </>
              )}

            </form>

            {/* Registration */}
            {authStep === "credentials" && (
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
            )}

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
      {showGoogleRegistrationModal && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowGoogleRegistrationModal(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="google-registration-title"
            aria-describedby="google-registration-description"
            className="relative my-auto w-full max-w-md rounded-3xl border border-slate-100 bg-white p-7 text-center shadow-2xl sm:p-9"
          >
            <button
              type="button"
              onClick={() => setShowGoogleRegistrationModal(false)}
              aria-label="Close registration message"
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-xl leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315FEA]"
            >
              &times;
            </button>

            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF3FF] text-[#315FEA]">
              <AppIcon name="user" className="h-7 w-7" />
            </div>
            <h2
              id="google-registration-title"
              className="text-2xl font-bold tracking-tight text-[#102A4C]"
            >
              Create your PESO account first
            </h2>
            <p
              id="google-registration-description"
              className="mt-3 text-sm leading-6 text-slate-600"
            >
              We couldn&apos;t find a PESO account for this Google email.
              Register first, then return here to sign in with Google.
            </p>

            <div className="mt-7 grid gap-3">
              <button
                type="button"
                autoFocus
                onClick={() => navigate("/register")}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#315FEA] px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#244FD4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315FEA]"
              >
                Create an account
                <AppIcon name="arrowRight" className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowGoogleRegistrationModal(false);
                  setAuthStep("credentials");
                  setAuthMethod("password");
                  setError("");
                  setGoogleButtonError("");
                  googleIdTokenRef.current = "";
                  resetCaptcha();
                }}
                className="w-full rounded-xl border border-[#D5DEEB] bg-white px-5 py-3.5 text-sm font-semibold text-[#3156A2] transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315FEA]"
              >
                Back to sign in
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default Login;
