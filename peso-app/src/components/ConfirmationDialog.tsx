import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ConfirmationRequest = {
  message: string;
  resolve: (confirmed: boolean) => void;
};

const ConfirmationContext = createContext<
  ((message: string) => Promise<boolean>) | null
>(null);

export function useConfirmation() {
  const confirm = useContext(ConfirmationContext);
  if (!confirm) {
    throw new Error("useConfirmation must be used within ConfirmationDialogProvider");
  }
  return confirm;
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
      const request = { message, resolve };
      if (activeRef.current) {
        queueRef.current.push(request);
        return;
      }
      activeRef.current = request;
      setActiveRequest(request);
    });
  }, []);

  const finishConfirmation = useCallback((confirmed: boolean) => {
    activeRef.current?.resolve(confirmed);
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
                  Confirm action
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
              <button
                ref={cancelButtonRef}
                type="button"
                onClick={() => finishConfirmation(false)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315FEA]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => finishConfirmation(true)}
                className="rounded-xl bg-[#315FEA] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#244FD4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315FEA]"
              >
                Confirm
              </button>
            </div>
          </section>
        </div>
      )}
    </ConfirmationContext.Provider>
  );
}
