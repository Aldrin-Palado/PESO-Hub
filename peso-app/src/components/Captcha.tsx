import { useEffect, useRef, useState } from "react";

type RecaptchaRenderOptions = {
  sitekey: string;
  theme: "light" | "dark";
  size: "normal" | "compact";
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};

type RecaptchaApi = {
  ready: (callback: () => void) => void;
  render: (container: HTMLElement, options: RecaptchaRenderOptions) => number;
  reset: (widgetId?: number) => void;
};

declare global {
  interface Window {
    grecaptcha?: RecaptchaApi;
  }
}

type CaptchaProps = {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  siteKey?: string;
  theme?: "light" | "dark";
  size?: "normal" | "compact";
  resetKey?: number;
  className?: string;
};

const RECAPTCHA_SCRIPT_URL =
  "https://www.google.com/recaptcha/api.js?render=explicit";

let scriptPromise: Promise<RecaptchaApi> | undefined;

function loadRecaptcha(): Promise<RecaptchaApi> {
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<RecaptchaApi>((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(
      `script[src^="${RECAPTCHA_SCRIPT_URL}"]`,
    );
    const isNewScript = !script;

    if (!script) {
      script = document.createElement("script");
      script.src = RECAPTCHA_SCRIPT_URL;
      script.async = true;
      script.defer = true;
    }

    const currentScript = script;
    let settled = false;
    const cleanupListeners = () => {
      currentScript.removeEventListener("load", handleLoad);
      currentScript.removeEventListener("error", handleError);
    };
    const rejectLoad = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanupListeners();
      scriptPromise = undefined;
      reject(error);
    };
    const resolveWhenReady = () => {
      if (settled) return;
      const recaptcha = window.grecaptcha;
      if (!recaptcha || typeof recaptcha.ready !== "function") {
        rejectLoad(new Error("Google reCAPTCHA loaded without its ready API."));
        return;
      }

      recaptcha.ready(() => {
        if (settled) return;
        const readyRecaptcha = window.grecaptcha;
        if (
          readyRecaptcha &&
          typeof readyRecaptcha.render === "function" &&
          typeof readyRecaptcha.reset === "function"
        ) {
          settled = true;
          cleanupListeners();
          resolve(readyRecaptcha);
          return;
        }
        rejectLoad(
          new Error("Google reCAPTCHA is ready without the checkbox API."),
        );
      });
    };
    const handleLoad = () => {
      resolveWhenReady();
    };
    const handleError = () => {
      rejectLoad(new Error("Unable to load Google reCAPTCHA."));
    };

    currentScript.addEventListener("load", handleLoad, { once: true });
    currentScript.addEventListener("error", handleError, { once: true });

    if (window.grecaptcha && typeof window.grecaptcha.ready === "function") {
      resolveWhenReady();
    } else if (isNewScript) {
      document.head.appendChild(currentScript);
    } else if (currentScript.readyState === "complete") {
      handleLoad();
    }
  });

  return scriptPromise;
}

export default function Captcha({
  onVerify,
  onExpire,
  onError,
  siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY,
  theme = "light",
  size = "normal",
  resetKey = 0,
  className = "",
}: CaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | null>(null);
  const previousResetKeyRef = useRef(resetKey);
  const callbacksRef = useRef({ onVerify, onExpire, onError });
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    callbacksRef.current = { onVerify, onExpire, onError };
  }, [onVerify, onExpire, onError]);

  useEffect(() => {
    if (!siteKey) {
      setLoadError(
        "CAPTCHA is not configured. Set VITE_RECAPTCHA_SITE_KEY to enable it.",
      );
      callbacksRef.current.onVerify("");
      callbacksRef.current.onError?.();
      return;
    }

    let active = true;
    setLoadError("");
    callbacksRef.current.onVerify("");

    void loadRecaptcha()
      .then((recaptcha) => {
        if (!active || !containerRef.current) return;

        widgetIdRef.current = recaptcha.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          size,
          callback: (token) => callbacksRef.current.onVerify(token),
          "expired-callback": () => {
            callbacksRef.current.onVerify("");
            callbacksRef.current.onExpire?.();
            if (widgetIdRef.current !== null) {
              recaptcha.reset(widgetIdRef.current);
            }
          },
          "error-callback": () => {
            callbacksRef.current.onVerify("");
            callbacksRef.current.onError?.();
            if (widgetIdRef.current !== null) {
              recaptcha.reset(widgetIdRef.current);
            }
          },
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("Google reCAPTCHA error:", error);
        setLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load the CAPTCHA challenge.",
        );
        callbacksRef.current.onVerify("");
        callbacksRef.current.onError?.();
      });

    return () => {
      active = false;
      widgetIdRef.current = null;
    };
  }, [siteKey, theme, size]);

  useEffect(() => {
    if (previousResetKeyRef.current === resetKey) return;
    previousResetKeyRef.current = resetKey;
    callbacksRef.current.onVerify("");
    if (widgetIdRef.current !== null && window.grecaptcha) {
      window.grecaptcha.reset(widgetIdRef.current);
    }
  }, [resetKey]);

  return (
    <div className={className}>
      <div ref={containerRef} />
      {loadError && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {loadError}
        </p>
      )}
    </div>
  );
}
