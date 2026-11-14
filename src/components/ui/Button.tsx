import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-amber-500 text-neutral-950 hover:bg-amber-400 disabled:bg-neutral-700 disabled:text-neutral-500 shadow-lg shadow-amber-500/20",
  secondary:
    "bg-white/10 text-white hover:bg-white/15 border border-white/10",
  ghost: "text-neutral-300 hover:text-white hover:bg-white/5",
  outline:
    "border border-white/15 text-white hover:border-amber-500/50 hover:text-amber-400",
  danger: "bg-red-600 text-white hover:bg-red-500",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", className = "", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...rest}
    />
  );
});
