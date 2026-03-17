import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const destructive = props.variant === "destructive";
        return (
          <Toast key={id} {...props}>
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-[0_0_20px_rgba(251,191,36,0.08)]"
              style={{
                borderColor: destructive ? "rgba(248, 113, 113, 0.2)" : "rgba(251, 191, 36, 0.2)",
                background: destructive ? "rgba(248, 113, 113, 0.1)" : "rgba(251, 191, 36, 0.1)",
                color: destructive ? "#fca5a5" : "#fcd34d",
              }}
            >
              <span className="material-symbols-outlined text-[22px]">{destructive ? "error" : "warning"}</span>
            </div>
            <div className="min-w-0 flex-1">
              {title && (
                <div className="inline-flex rounded-full px-3 py-1 shadow-[0_8px_20px_rgba(253,224,71,0.18)]"
                  style={{
                    border: destructive ? "1px solid rgba(252, 165, 165, 0.55)" : "1px solid rgba(253, 224, 71, 0.6)",
                    background: destructive ? "#fca5a5" : "#fde047",
                  }}
                >
                  <ToastTitle className="!text-slate-950">{title}</ToastTitle>
                </div>
              )}
              {description && <ToastDescription className="mt-2">{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
