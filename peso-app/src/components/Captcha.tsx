
import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  ready: (callback: () => void) => void;
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme?: "light" | "dark" | "auto";
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: (errorCode?: string) => void;
    }
  ) => string;
  reset: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
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

let turnstilePromise: Promise<TurnstileApi> | undefined;

function loadTurnstile(): Promise<TurnstileApi> {
  if (turnstilePromise) return turnstilePromise;

  turnstilePromise = new Promise<TurnstileApi>((resolve, reject) => {
    const finish = () => {
      const api = window.turnstile;

      if (!api) {
        reject(new Error("Cloudflare Turnstile API unavailable."));
        return;
      }

      api.ready(() => resolve(api));
    };

    if (window.turnstile) {
      finish();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-peso-turnstile="true"]'
    );

    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("CAPTCHA script failed.")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.pesoTurnstile = "true";

    script.onload = finish;
    script.onerror = () =>
      reject(new Error("Unable to load Cloudflare Turnstile."));

    document.head.appendChild(script);
  }).catch((error) => {
    turnstilePromise = undefined;
    throw error;
  });

  return turnstilePromise;
}

export default function Captcha({
  onVerify,
  onExpire,
  onError,
  siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? import.meta.env.VITE_RECAPTCHA_SITE_KEY,
  theme = "light",
  size = "normal",
  resetKey = 0,
  className = "",
}: CaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const callbacksRef = useRef({
    onVerify,
    onExpire,
    onError,
  });

  const [error, setError] = useState("");

  useEffect(() => {
    callbacksRef.current = {
      onVerify,
      onExpire,
      onError,
    };
  }, [onVerify, onExpire, onError]);

  useEffect(() => {
    if (!siteKey) {
      setError("Cloudflare Turnstile site key is missing. Set VITE_TURNSTILE_SITE_KEY in Vercel.");
      callbacksRef.current.onVerify("");
      return;
    }
    if (/^[a-f\d]{32,}$/i.test(siteKey)) {
      setError("The configured value looks like a secret key. Use the public Turnstile site key for VITE_TURNSTILE_SITE_KEY.");
      callbacksRef.current.onVerify("");
      return;
    }

    let active = true;
    const container = containerRef.current;

    if (!container) return;

    setError("");
    callbacksRef.current.onVerify("");

    loadTurnstile()
      .then((api) => {
        if (!active) return;

        container.replaceChildren();

        const widgetId = api.render(container, {
          sitekey: siteKey,
          theme,
          callback: (token) => {
            if (!active) return;
            callbacksRef.current.onVerify(token);
          },

          "expired-callback": () => {
            if (!active) return;

            callbacksRef.current.onVerify("");
            callbacksRef.current.onExpire?.();

            if (widgetIdRef.current !== null) {
              api.reset(widgetIdRef.current);
            }
          },

          "error-callback": (errorCode) => {
            if (!active) return;

            callbacksRef.current.onVerify("");
            callbacksRef.current.onError?.();
            setError(
              errorCode
                ? `Cloudflare Turnstile could not load (error ${errorCode}). Check that the public site key is correct and this domain is allowed in the Turnstile widget.`
                : "Cloudflare Turnstile could not load. Check the public site key and allowed domains in the Turnstile widget.",
            );
          },
        });

        widgetIdRef.current = widgetId;
      })
      .catch((err) => {
        if (!active) return;

        console.error("CAPTCHA error:", err);
        setError("Unable to load CAPTCHA. Please refresh.");
        callbacksRef.current.onVerify("");
        callbacksRef.current.onError?.();
      });

    return () => {
      active = false;
      widgetIdRef.current = null;
      container.replaceChildren();
    };
  }, [siteKey, theme, size]);

  useEffect(() => {
    if (widgetIdRef.current === null) return;

    callbacksRef.current.onVerify("");

    window.turnstile?.reset(widgetIdRef.current);
  }, [resetKey]);

  return (
    <div className={className}>
      <div ref={containerRef} />

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
