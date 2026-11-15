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
  if (window.grecaptcha) return Promise.resolve(window.grecaptcha);
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
    const cleanupListeners = () => {
      currentScript.removeEventListener("load", handleLoad);
      currentScript.removeEventListener("error", handleError);
    };
    const handleLoad = () => {
      cleanupListeners();
      if (window.grecaptcha) {
        resolve(window.grecaptcha);
      } else {
        scriptPromise = undefined;
        reject(new Error("Google reCAPTCHA loaded without its API."));
      }
    };
    const handleError = () => {
      cleanupListeners();
      scriptPromise = undefined;
      reject(new Error("Unable to load Google reCAPTCHA."));
    };

    currentScript.addEventListener("load", handleLoad, { once: true });
    currentScript.addEventListener("error", handleError, { once: true });

    if (isNewScript) document.head.appendChild(currentScript);
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
