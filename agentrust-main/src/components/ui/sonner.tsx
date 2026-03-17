import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="top-right"
      offset={{ top: 96, right: 16 }}
      className="toaster group"
      toastOptions={{
        duration: 1000,
        classNames: {
          toast:
            "group toast group-[.toaster]:w-full group-[.toaster]:min-h-0 group-[.toaster]:max-w-[420px] group-[.toaster]:rounded-[20px] group-[.toaster]:border group-[.toaster]:border-amber-400/15 group-[.toaster]:bg-[linear-gradient(180deg,rgba(20,26,42,0.96),rgba(14,19,34,0.96))] group-[.toaster]:p-5 group-[.toaster]:text-amber-50 group-[.toaster]:shadow-[0_0_0_1px_rgba(251,191,36,0.05),0_20px_54px_rgba(0,0,0,0.28)]",
          title: "text-[11px] font-black uppercase tracking-[0.22em] text-amber-300",
          description: "text-sm font-semibold leading-relaxed text-amber-50/95",
          success:
            "group-[.toaster]:border-emerald-300/20 group-[.toaster]:bg-[linear-gradient(180deg,rgba(10,40,28,0.96),rgba(11,26,21,0.96))] group-[.toaster]:text-emerald-50 group-[.toaster]:shadow-[0_0_0_1px_rgba(74,222,128,0.05),0_20px_54px_rgba(0,0,0,0.28)] [&_.sonner-toast-title]:text-emerald-300 [&_.sonner-toast-description]:text-emerald-50/95",
          error:
            "group-[.toaster]:border-red-300/20 group-[.toaster]:bg-[linear-gradient(180deg,rgba(47,18,24,0.96),rgba(28,13,18,0.96))] group-[.toaster]:text-red-50 group-[.toaster]:shadow-[0_0_0_1px_rgba(248,113,113,0.05),0_20px_54px_rgba(0,0,0,0.28)] [&_.sonner-toast-title]:text-red-300 [&_.sonner-toast-description]:text-red-100/95",
          warning:
            "group-[.toaster]:border-amber-300/20 group-[.toaster]:bg-[linear-gradient(180deg,rgba(20,26,42,0.96),rgba(14,19,34,0.96))] group-[.toaster]:text-amber-50",
          closeButton:
            "group-[.toaster]:border-none group-[.toaster]:bg-transparent group-[.toaster]:text-amber-100/80 group-[.toaster]:shadow-none hover:group-[.toaster]:text-amber-50",
          actionButton: "group-[.toast]:bg-amber-400/20 group-[.toast]:text-amber-100",
          cancelButton: "group-[.toast]:bg-slate-700/50 group-[.toast]:text-slate-100",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
