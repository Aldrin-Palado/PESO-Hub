import { useEffect, useRef, useState } from "react";

type TurnstileTheme = "light" | "dark" | "auto";
type TurnstileSize = "normal" | "compact";

type TurnstileRenderOptions = {
  sitekey: string;
  theme: TurnstileTheme;
  size: TurnstileSize;
  appearance: "always";
  execution: "execute";
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
  "timeout-callback": () => void;
};

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: TurnstileRenderOptions,
  ) => string;
  execute: (widgetId: string) => void;
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
  theme?: TurnstileTheme;
  size?: TurnstileSize;
  resetKey?: number;
  className?: string;
};

const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<TurnstileApi> | undefined;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(
      `script[src^="${TURNSTILE_SCRIPT_URL}"]`,
    );
    const isNewScript = !script;

    if (!script) {
      script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT_URL;
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
      if (window.turnstile) {
        resolve(window.turnstile);
      } else {
        scriptPromise = undefined;
        reject(new Error("Cloudflare Turnstile loaded without its API."));
      }
    };
    const handleError = () => {
      cleanupListeners();
      scriptPromise = undefined;
      reject(new Error("Unable to load Cloudflare Turnstile."));
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
  siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY,
  theme = "light",
  size = "normal",
  resetKey = 0,
  className = "",
}: CaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbacksRef = useRef({ onVerify, onExpire, onError });
  const [loadError, setLoadError] = useState("");
  const [widgetId, setWidgetId] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    callbacksRef.current = { onVerify, onExpire, onError };
  }, [onVerify, onExpire, onError]);

  useEffect(() => {
    if (!siteKey) {
      setLoadError(
        "CAPTCHA is not configured. Set VITE_TURNSTILE_SITE_KEY to enable it.",
      );
      callbacksRef.current.onVerify("");
      callbacksRef.current.onError?.();
      return;
    }

    let active = true;
    let renderedWidgetId: string | undefined;
    setLoadError("");
    setWidgetId(null);
    setIsVerifying(false);
    setIsVerified(false);
    callbacksRef.current.onVerify("");

    void loadTurnstile()
      .then((turnstile) => {
        if (!active || !containerRef.current) return;

        renderedWidgetId = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          size,
          appearance: "always",
          execution: "execute",
          callback: (token) => {
            setIsVerified(true);
            setIsVerifying(false);
            callbacksRef.current.onVerify(token);
          },
          "expired-callback": () => {
            setIsVerified(false);
            setIsVerifying(false);
            callbacksRef.current.onVerify("");
            callbacksRef.current.onExpire?.();
          },
          "error-callback": () => {
            setIsVerified(false);
            setIsVerifying(false);
            callbacksRef.current.onVerify("");
            callbacksRef.current.onError?.();
          },
          "timeout-callback": () => {
            setIsVerifying(false);
            callbacksRef.current.onVerify("");
          },
        });
        setWidgetId(renderedWidgetId);
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("Cloudflare Turnstile error:", error);
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
      if (renderedWidgetId && window.turnstile) {
        window.turnstile.remove(renderedWidgetId);
      }
    };
  }, [siteKey, theme, size, resetKey]);

  const startVerification = () => {
    if (!widgetId || !window.turnstile || isVerifying || isVerified) return;
    setIsVerifying(true);
    try {
      window.turnstile.execute(widgetId);
    } catch (error) {
      setIsVerifying(false);
      setLoadError(
        error instanceof Error
          ? error.message
          : "Unable to start CAPTCHA verification.",
      );
      callbacksRef.current.onVerify("");
      callbacksRef.current.onError?.();
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={startVerification}
        disabled={!widgetId || isVerifying || isVerified || Boolean(loadError)}
        className="mb-3 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isVerified
          ? "CAPTCHA verified"
          : isVerifying
            ? "Verifying..."
            : "I'm not a robot — verify"}
      </button>
      <div ref={containerRef} />
      {loadError && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {loadError}
        </p>
      )}
    </div>
  );
}
