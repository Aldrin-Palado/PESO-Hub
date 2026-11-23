import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ConfirmationRequest =
  | {
      kind: "confirm";
      message: string;
      resolve: (confirmed: boolean) => void;
    }
  | {
      kind: "alert";
      message: string;
      resolve: () => void;
    };

type ConfirmationContextValue = (message: string) => Promise<boolean>;
type AlertContextValue = (message: string) => Promise<void>;

const ConfirmationContext = createContext<ConfirmationContextValue | null>(
  null,
);
const AlertContext = createContext<AlertContextValue | null>(null);

export function useConfirmation() {
  const confirm = useContext(ConfirmationContext);
  if (!confirm) {
    throw new Error("useConfirmation must be used within ConfirmationDialogProvider");
  }
  return confirm;
}

export function useAlertDialog() {
  const showAlert = useContext(AlertContext);
  if (!showAlert) {
    throw new Error("useAlertDialog must be used within ConfirmationDialogProvider");
  }
  return showAlert;
}

export function ConfirmationDialogProvider({
  children,
}: {
  children: ReactNode;
}) {
  const queueRef = useRef<ConfirmationRequest[]>([]);
  const activeRef = useRef<ConfirmationRequest | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const [activeRequest, setActiveRequest] =
    useState<ConfirmationRequest | null>(null);

  const confirm = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      const request: ConfirmationRequest = {
        kind: "confirm",
        message,
        resolve,
      };
      if (activeRef.current) {
        queueRef.current.push(request);
        return;
      }
      activeRef.current = request;
      setActiveRequest(request);
    });
  }, []);

  const showAlert = useCallback((message: string) => {
    return new Promise<void>((resolve) => {
      const request: ConfirmationRequest = {
        kind: "alert",
        message,
        resolve,
      };
      if (activeRef.current) {
        queueRef.current.push(request);
        return;
      }
      activeRef.current = request;
      setActiveRequest(request);
    });
  }, []);

  const finishConfirmation = useCallback((confirmed: boolean) => {
    const active = activeRef.current;
    if (active?.kind === "confirm") {
      active.resolve(confirmed);
    } else if (active?.kind === "alert") {
      active.resolve();
    }
    const nextRequest = queueRef.current.shift() ?? null;
    activeRef.current = nextRequest;
    setActiveRequest(nextRequest);
  }, []);

  useEffect(() => {
    if (!activeRequest) return;

    cancelButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finishConfirmation(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeRequest, finishConfirmation]);

  return (
    <ConfirmationContext.Provider value={confirm}>
      <AlertContext.Provider value={showAlert}>
        {children}
        {activeRequest && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                finishConfirmation(false);
              }
            }}
          >
            <section
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirmation-title"
              aria-describedby="confirmation-message"
              className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
              onKeyDown={(event) => {
                if (event.key !== "Tab") return;
                const buttons = event.currentTarget.querySelectorAll("button");
                const firstButton = buttons[0];
                const lastButton = buttons[buttons.length - 1];
                if (event.shiftKey && document.activeElement === firstButton) {
                  event.preventDefault();
                  lastButton.focus();
                } else if (
                  !event.shiftKey &&
                  document.activeElement === lastButton
                ) {
                  event.preventDefault();
                  firstButton.focus();
                }
              }}
            >
              <div className="mb-5">
                <div className="min-w-0">
                  <h2
                    id="confirmation-title"
                    className="text-lg font-bold text-slate-900"
                  >
                    {activeRequest.kind === "alert"
                      ? "Action required"
                      : "Confirm action"}
                  </h2>
                  <p
                    id="confirmation-message"
                    className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-600"
                  >
                    {activeRequest.message}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                {activeRequest.kind === "confirm" && (
                  <button
                    ref={cancelButtonRef}
                    type="button"
                    onClick={() => finishConfirmation(false)}
                    className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315FEA]"
                  >
                    Cancel
                  </button>
                )}
                <button
                  ref={activeRequest.kind === "alert" ? cancelButtonRef : null}
                  type="button"
                  onClick={() => finishConfirmation(true)}
                  className="rounded-xl bg-[#315FEA] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#244FD4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315FEA]"
                >
                  {activeRequest.kind === "alert" ? "OK" : "Confirm"}
                </button>
              </div>
            </section>
          </div>
        )}
      </AlertContext.Provider>
    </ConfirmationContext.Provider>
  );
}
