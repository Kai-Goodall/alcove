import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

type SwitchProps = Omit<
	React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>,
	"onAnimationStart" | "onDrag" | "onDragEnd" | "onDragStart"
>;

const MotionSwitchRoot = motion.create(SwitchPrimitive.Root);
const MotionSwitchThumb = motion.create(SwitchPrimitive.Thumb);

const Switch = React.forwardRef<
	React.ElementRef<typeof SwitchPrimitive.Root>,
	SwitchProps
>(
	(
		{
			checked: checkedProp,
			className,
			defaultChecked = false,
			onCheckedChange,
			style,
			...props
		},
		ref,
	) => {
		const [checked, setChecked] = React.useState(checkedProp ?? defaultChecked);
		const shouldReduceMotion = useReducedMotion();
		const layoutTransition = shouldReduceMotion
			? { duration: 0 }
			: { type: "spring" as const, duration: 0.22, bounce: 0 };

		React.useEffect(() => {
			if (checkedProp !== undefined) {
				setChecked(checkedProp);
			}
		}, [checkedProp]);

		return (
			<MotionSwitchRoot
				ref={ref}
				checked={checked}
				initial={false}
				layout
				onCheckedChange={(nextChecked) => {
					setChecked(nextChecked);
					onCheckedChange?.(nextChecked);
				}}
				style={{
					...style,
					justifyContent: checked ? "flex-end" : "flex-start",
				}}
				transition={layoutTransition}
				className={cn(
					"group/switch relative inline-flex h-5 w-8 shrink-0 cursor-default items-center rounded-full px-[2px] outline-none before:absolute before:-inset-1.5 before:pointer-events-none before:content-[''] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
					checked ? "bg-switch-on" : "bg-switch-off",
					"transition-colors",
					className,
				)}
				{...props}
			>
				<MotionSwitchThumb
					initial={false}
					layout
					transition={layoutTransition}
					className="pointer-events-none block h-4 w-4 rounded-full bg-card shadow-switch-thumb group-active/switch:w-[18px] transition-[width]"
				/>
			</MotionSwitchRoot>
		);
	},
);
Switch.displayName = SwitchPrimitive.Root.displayName;

export { Switch };
