
import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
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

const SCRIPT_SELECTOR =
  'script[data-peso-turnstile="true"]';

let turnstilePromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  // Use an already initialized API.
  if (
    window.turnstile &&
    typeof window.turnstile.render === "function" &&
    typeof window.turnstile.reset === "function"
  ) {
    return Promise.resolve(window.turnstile);
  }

  // Prevent duplicate script loading.
  if (turnstilePromise) {
    return turnstilePromise;
  }

  turnstilePromise = new Promise<TurnstileApi>(
    (resolve, reject) => {
      let script = document.querySelector<HTMLScriptElement>(
        SCRIPT_SELECTOR
      );

      let settled = false;

      let timeout: number;

      const cleanup = () => {
        script?.removeEventListener("load", handleLoad);
        script?.removeEventListener("error", handleError);
        window.clearTimeout(timeout);
      };

      const fail = (error: Error) => {
        if (settled) return;

        settled = true;
        cleanup();
        turnstilePromise = null;

        reject(error);
      };

      const handleLoad = () => {
        if (settled) return;

        const api = window.turnstile;

        if (
          api &&
          typeof api.render === "function" &&
          typeof api.reset === "function" &&
          typeof api.remove === "function"
        ) {
          settled = true;
          cleanup();
          resolve(api);
          return;
        }

        fail(
          new Error(
            "Cloudflare script loaded, but the Turnstile API is unavailable."
          )
        );
      };

      const handleError = () => {
        fail(
          new Error(
            "Unable to load Cloudflare Turnstile. Check your browser, network, or firewall settings."
          )
        );
      };

      timeout = window.setTimeout(() => {
        fail(
          new Error(
            "Cloudflare Turnstile loading timed out. Please refresh and try again."
          )
        );
      }, 30000);

      // Create script if it does not exist.
      if (!script) {
        script = document.createElement("script");

        script.src = SCRIPT_URL;
        script.dataset.pesoTurnstile = "true";

        // Do not add async or defer.
        script.async = false;
      } else {
        // Remove conflicting script attributes.
        script.removeAttribute("async");
        script.removeAttribute("defer");
      }

      const currentScript = script;

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

      // Add script to document.
      if (!currentScript.isConnected) {
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

  // Keep callbacks updated without reloading the widget.
  useEffect(() => {
    callbacksRef.current = {
      onVerify,
      onExpire,
      onError,
    };
  }, [onVerify, onExpire, onError]);

  // Load and render Cloudflare Turnstile.
  useEffect(() => {
    const container = containerRef.current;

    if (!container) return;

    if (!siteKey?.trim()) {
      setError(
        "Cloudflare Turnstile Site Key is missing. Check your environment variables."
      );

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

        // Make sure the container is empty before rendering.
        container.replaceChildren();

        const widgetId = api.render(container, {
          sitekey: siteKey.trim(),
          theme,
          size,

          // Successful verification.
          callback: (token: string) => {
            if (!active) return;

            setError("");
            callbacksRef.current.onVerify(token);
          },

          // Token expired.
          "expired-callback": () => {
            if (!active) return;

            callbacksRef.current.onVerify("");
            callbacksRef.current.onExpire?.();
          },

          // Verification error.
          "error-callback": (errorCode) => {
            if (!active) return;

            console.error(
              "[Cloudflare Turnstile] Error code:",
              errorCode
            );

            callbacksRef.current.onVerify("");

            setError(
              "CAPTCHA verification failed. Please try again."
            );

            callbacksRef.current.onError?.();
          },
        });

        renderedWidgetId = widgetId;
        widgetIdRef.current = widgetId;
      })
      .catch((err: unknown) => {
        if (!active) return;

        console.error(
          "[Cloudflare Turnstile] Loading error:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load CAPTCHA. Please try again."
        );

        callbacksRef.current.onVerify("");
        callbacksRef.current.onError?.();
      });

    // Cleanup when component unmounts.
    return () => {
      active = false;

      if (renderedWidgetId !== null) {
        try {
          window.turnstile?.remove(renderedWidgetId);
        } catch (err) {
          console.warn(
            "[Cloudflare Turnstile] Widget cleanup error:",
            err
          );
        }
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

  return (
    <div
      className={`flex min-h-[80px] flex-col items-center justify-center ${className}`}
    >
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
