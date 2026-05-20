import { useRef } from "react";
import { useSquircle } from "@/_lib/use-squircle";
import { cn } from "@/_lib/utils";

export interface ButtonGroupProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * Segmented toggle row: a raised pill with hairline-divided sibling buttons
 * inside. The container provides the shadow + rounding; the children handle
 * their own active/inactive surface.
 */
function ButtonGroup({ children, className, ...props }: ButtonGroupProps) {
  const ref = useRef<HTMLDivElement>(null);
  useSquircle(ref, 10);
  return (
    <div
      ref={ref}
      role="group"
      className={cn(
        "inline-flex h-[34px] w-full items-stretch overflow-hidden rounded-[10px] bg-card shadow-button",
        "divide-x divide-border/70",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface ButtonGroupItemProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  active: boolean;
  children: React.ReactNode;
}

function ButtonGroupItem({
  active,
  className,
  children,
  ...props
}: ButtonGroupItemProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "flex flex-1 items-center justify-center overflow-hidden px-2",
        "text-[14px] font-medium leading-[0.9] tracking-[-0.2px] outline-none",
        "transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card",
        active
          ? "bg-card text-primary"
          : "bg-button-hover text-secondary hover:text-primary",
        className,
      )}
      {...props}
    >
      <span className="px-1">{children}</span>
    </button>
  );
}

export { ButtonGroup, ButtonGroupItem };
