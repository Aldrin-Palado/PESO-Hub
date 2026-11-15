
import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  ready: (callback: () => void) => void;

  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme?: "light" | "dark" | "auto";
      size?: "normal" | "compact";
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: (errorCode?: string) => void;
    }
  ) => string;

  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
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
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "compact";
  resetKey?: number;
  className?: string;
};

const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let turnstilePromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) {
    return new Promise((resolve, reject) => {
      try {
        window.turnstile!.ready(() => {
          if (window.turnstile) {
            resolve(window.turnstile);
          } else {
            reject(
              new Error("Cloudflare Turnstile API unavailable.")
            );
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  if (turnstilePromise) {
    return turnstilePromise;
  }

  turnstilePromise = new Promise<TurnstileApi>(
    (resolve, reject) => {
      let script = document.querySelector<HTMLScriptElement>(
        'script[data-peso-turnstile="true"]'
      );

      const isNewScript = !script;
      let settled = false;

      if (!script) {
        script = document.createElement("script");
        script.src = TURNSTILE_SCRIPT_URL;
        script.async = true;
        script.defer = true;
        script.dataset.pesoTurnstile = "true";
      }

      const currentScript = script;

      let timeout: number;

      const cleanup = () => {
        currentScript.removeEventListener("load", handleLoad);
        currentScript.removeEventListener("error", handleError);
        window.clearTimeout(timeout);
      };

      const rejectLoad = (error: Error) => {
        if (settled) return;

        settled = true;
        cleanup();
        turnstilePromise = null;

        reject(error);
      };

      const resolveWhenReady = () => {
        if (settled) return;

        const api = window.turnstile;

        if (!api || typeof api.ready !== "function") {
          rejectLoad(
            new Error("Cloudflare Turnstile API unavailable.")
          );
          return;
        }

        api.ready(() => {
          if (settled) return;

          const readyApi = window.turnstile;

          if (
            readyApi &&
            typeof readyApi.render === "function" &&
            typeof readyApi.reset === "function" &&
            typeof readyApi.remove === "function"
          ) {
            settled = true;
            cleanup();
            resolve(readyApi);
          } else {
            rejectLoad(
              new Error("Cloudflare Turnstile failed to initialize.")
            );
          }
        });
      };

      const handleLoad = () => {
        resolveWhenReady();
      };

      const handleError = () => {
        rejectLoad(
          new Error("Unable to load Cloudflare Turnstile.")
        );
      };

      currentScript.addEventListener(
        "load",
        handleLoad,
        { once: true }
      );

      currentScript.addEventListener(
        "error",
        handleError,
        { once: true }
      );

      timeout = window.setTimeout(() => {
        rejectLoad(
          new Error(
            "CAPTCHA loading timed out. Please refresh and try again."
          )
        );
      }, 15000);

      if (window.turnstile) {
        resolveWhenReady();
      } else if (isNewScript) {
        document.head.appendChild(currentScript);
      }
    }
  ).catch((error) => {
    turnstilePromise = null;
    throw error;
  });

  return turnstilePromise;
}

export default function Captcha({
  onVerify,
  onExpire,
  onError,
  siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY,
  theme = "light",
  size = "normal",
  resetKey = 0,
  className = "",
}: CaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const widgetIdRef = useRef<string | null>(null);

  const previousResetKeyRef = useRef(resetKey);

  const callbacksRef = useRef({
    onVerify,
    onExpire,
    onError,
  });

  const [error, setError] = useState("");

  // Keep callbacks updated.
  useEffect(() => {
    callbacksRef.current = {
      onVerify,
      onExpire,
      onError,
    };
  }, [onVerify, onExpire, onError]);

  // Load and render CAPTCHA.
  useEffect(() => {
<<<<<<< HEAD
=======
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
>>>>>>> f32c2bd6b441a177a9756b5df6ef02b6d686640c
    const container = containerRef.current;

    if (!container) return;

    if (!siteKey?.trim()) {
      setError(
        "Cloudflare Turnstile Site Key is missing."
      );

      callbacksRef.current.onVerify("");
      callbacksRef.current.onError?.();

      return;
    }

    let active = true;

    let renderedWidgetId: string | null = null;

    setError("");
    callbacksRef.current.onVerify("");

    container.replaceChildren();

    void loadTurnstile()
      .then((api) => {
        if (!active) return;

        const widgetId = api.render(container, {
          sitekey: siteKey.trim(),
          theme,
          size,

          callback: (token: string) => {
            if (!active) return;

            setError("");
            callbacksRef.current.onVerify(token);
          },

          "expired-callback": () => {
            if (!active) return;

            callbacksRef.current.onVerify("");
            callbacksRef.current.onExpire?.();
          },

          "error-callback": (errorCode) => {
            if (!active) return;

            callbacksRef.current.onVerify("");
<<<<<<< HEAD

            setError(
              "CAPTCHA verification failed. Please try again."
            );

            callbacksRef.current.onError?.();
=======
            callbacksRef.current.onError?.();
            setError(
              errorCode
                ? `Cloudflare Turnstile could not load (error ${errorCode}). Check that the public site key is correct and this domain is allowed in the Turnstile widget.`
                : "Cloudflare Turnstile could not load. Check the public site key and allowed domains in the Turnstile widget.",
            );
>>>>>>> f32c2bd6b441a177a9756b5df6ef02b6d686640c
          },
        });

        renderedWidgetId = widgetId;
        widgetIdRef.current = widgetId;
      })
      .catch((err: unknown) => {
        if (!active) return;

        console.error("Cloudflare Turnstile error:", err);

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load CAPTCHA. Please refresh."
        );

        callbacksRef.current.onVerify("");
        callbacksRef.current.onError?.();
      });

    return () => {
      active = false;

      if (renderedWidgetId !== null) {
        apiCleanup(renderedWidgetId);
      }

      if (widgetIdRef.current === renderedWidgetId) {
        widgetIdRef.current = null;
      }

      container.replaceChildren();
    };
  }, [siteKey, theme, size]);

  // Reset CAPTCHA when resetKey changes.
  useEffect(() => {
    if (previousResetKeyRef.current === resetKey) {
      return;
    }

    previousResetKeyRef.current = resetKey;

    callbacksRef.current.onVerify("");
    setError("");

    if (
      widgetIdRef.current !== null &&
      window.turnstile
    ) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [resetKey]);

  function apiCleanup(widgetId: string) {
    try {
      window.turnstile?.remove(widgetId);
    } catch (error) {
      console.warn("Unable to remove CAPTCHA widget:", error);
    }
  }

  return (
    <div className={className}>
      <div ref={containerRef} />

      {error && (
        <p
          role="alert"
          className="mt-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}
    </div>
  );
}
