
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

const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let turnstilePromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) {
    return new Promise((resolve, reject) => {
      window.turnstile!.ready(() => {
        if (window.turnstile) {
          resolve(window.turnstile);
        } else {
          reject(new Error("Turnstile API is unavailable."));
        }
      });
    });
  }

  if (turnstilePromise) {
    return turnstilePromise;
  }

  turnstilePromise = new Promise<TurnstileApi>((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(
      'script[data-peso-turnstile="true"]'
    );

    // Remove a stale script left by an earlier failed initialization.
    if (script && !window.turnstile) {
      script.remove();
      script = null;
    }

    if (!script) {
      script = document.createElement("script");
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.dataset.pesoTurnstile = "true";
    }

    const currentScript = script;
    let settled = false;

    const timeout = window.setTimeout(() => {
      finishError(
        new Error(
          "Cloudflare Turnstile could not load. Check your internet connection or browser settings."
        )
      );
    }, 30000);

    const cleanup = () => {
      currentScript.removeEventListener("load", handleLoad);
      currentScript.removeEventListener("error", handleError);
      window.clearTimeout(timeout);
    };

    const finishError = (error: Error) => {
      if (settled) return;

      settled = true;
      cleanup();
      turnstilePromise = null;
      reject(error);
    };

    const handleLoad = () => {
      if (settled) return;

      const api = window.turnstile;

      if (!api) {
        finishError(
          new Error(
            "Turnstile script loaded, but its API was not initialized."
          )
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
          finishError(
            new Error("Cloudflare Turnstile API is incomplete.")
          );
        }
      });
    };

    const handleError = () => {
      finishError(
        new Error(
          "Unable to download Cloudflare Turnstile. Check whether challenges.cloudflare.com is blocked."
        )
      );
    };

    currentScript.addEventListener("load", handleLoad, {
      once: true,
    });

    currentScript.addEventListener("error", handleError, {
      once: true,
    });

    if (!currentScript.isConnected) {
      document.head.appendChild(currentScript);
    }
  }).catch((error) => {
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

  // Load and render Turnstile.
  useEffect(() => {
    const container = containerRef.current;

    if (!container) return;

    if (!siteKey?.trim()) {
      setError("Cloudflare Turnstile Site Key is missing.");
      callbacksRef.current.onVerify("");
      callbacksRef.current.onError?.();
      return;
    }

    let active = true;
    let renderedWidgetId: string | null = null;

    container.replaceChildren();

    setError("");
    callbacksRef.current.onVerify("");

    void loadTurnstile()
      .then((api) => {
        if (!active) return;

        const widgetId = api.render(container, {
          sitekey: siteKey.trim(),
          theme,
          size,

          callback: (token) => {
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

            console.error(
              "Cloudflare Turnstile error code:",
              errorCode
            );

            callbacksRef.current.onVerify("");
            callbacksRef.current.onError?.();
          },
        });

        renderedWidgetId = widgetId;
        widgetIdRef.current = widgetId;
      })
      .catch((err: unknown) => {
        if (!active) return;

        console.error("Turnstile loading error:", err);

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load CAPTCHA. Please try again."
        );

        callbacksRef.current.onVerify("");
        callbacksRef.current.onError?.();
      });

    return () => {
      active = false;

      if (renderedWidgetId !== null) {
        try {
          window.turnstile?.remove(renderedWidgetId);
        } catch (err) {
          console.warn("Unable to remove Turnstile widget:", err);
        }
      }

      if (widgetIdRef.current === renderedWidgetId) {
        widgetIdRef.current = null;
      }

      container.replaceChildren();
    };
  }, [siteKey, theme, size]);

  // Reset widget when resetKey changes.
  useEffect(() => {
    if (previousResetKeyRef.current === resetKey) return;

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

  return (
    <div className={className}>
      <div ref={containerRef} />

      {error && (
        <p
          role="alert"
          className="mt-2 text-center text-sm text-red-700"
        >
          {error}
        </p>
      )}
    </div>
  );
}
