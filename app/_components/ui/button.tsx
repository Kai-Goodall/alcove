import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, useReducedMotion } from "motion/react";
import { Slot } from "radix-ui";
import { cn } from "@/_lib/utils";

const buttonVariants = cva(
	"relative inline-flex shrink-0 items-center justify-center gap-0 whitespace-nowrap rounded-full font-medium tracking-normal outline-none before:absolute before:-inset-0.75 before:pointer-events-none before:content-[''] disabled:pointer-events-none disabled:opacity-45",
	{
		variants: {
			variant: {
				raised:
					"bg-card text-foreground shadow-button hover:bg-button-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
				quiet:
					"before:rounded-full bg-transparent text-foreground [&_span]:relative [&_span]:z-[1] before:absolute before:transition-all before:inset-0.5 hover:before:inset-0 hover:before:bg-button-ghost-hover shadow-none-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
			},
			size: {
				default:
					"h-[34px] px-2 py-2 text-[13.77px] leading-[90%] [--button-icon-glyph:14px] [--button-icon-slot:18px] [--button-label-height:13px] [--button-label-px:4px]",
				icon: "h-[34px] w-[34px] p-2 [--button-icon-glyph:14px] [--button-icon-slot:18px]",
			},
		},
		defaultVariants: {
			variant: "raised",
			size: "default",
		},
	},
);

const MotionButton = motion.button;
const MotionSlot = motion.create(Slot.Root);

type MotionSafeButtonProps = Omit<
	React.ComponentPropsWithoutRef<"button">,
	"onAnimationStart" | "onDrag" | "onDragEnd" | "onDragStart"
>;

export interface ButtonProps
	extends MotionSafeButtonProps,
		VariantProps<typeof buttonVariants> {
	asChild?: boolean;
}

function isRenderableText(child: React.ReactNode) {
	return (
		typeof child === "string" ||
		typeof child === "number" ||
		(React.isValidElement(child) && child.type === React.Fragment)
	);
}

function Button({
	className,
	children,
	variant,
	size,
	asChild = false,
	...props
}: ButtonProps) {
	const shouldReduceMotion = useReducedMotion();
	const pressProps = shouldReduceMotion
		? {}
		: {
				animate: { transform: "scale(1)" },
				initial: false,
				transition: { type: "spring" as const, duration: 0.14, bounce: 0 },
				whileTap: { transform: "scale(0.96)" },
			};
	const childArray = React.Children.toArray(children).filter((child) => {
		return typeof child !== "string" || child.trim().length > 0;
	});
	const iconChildren = childArray.filter((child) => !isRenderableText(child));
	const labelChildren = childArray.filter(isRenderableText).map((child) => {
		return typeof child === "string" ? child.trim() : child;
	});
	const hasLabel = labelChildren.length > 0;

	const content = asChild ? (
		children
	) : (
		<>
			{iconChildren.map((child, index) => (
				<span
					aria-hidden
					className="inline-flex size-[var(--button-icon-slot)] shrink-0 basis-[var(--button-icon-slot)] items-center justify-center [&>svg]:size-[var(--button-icon-glyph)]"
					key={`icon-${index}`}
				>
					{child}
				</span>
			))}
			{hasLabel ? (
				<span className="inline-flex h-[var(--button-label-height)] items-center justify-center px-[var(--button-label-px)]">
					{labelChildren}
				</span>
			) : null}
		</>
	);

	const buttonClassName = cn(buttonVariants({ variant, size }), className);

	if (asChild) {
		return (
			<MotionSlot className={buttonClassName} {...pressProps} {...props}>
				{content}
			</MotionSlot>
		);
	}

	return (
		<MotionButton
			className={buttonClassName}
			type={props.type ?? "button"}
			{...pressProps}
			{...props}
		>
			{content}
		</MotionButton>
	);
}

export { Button, buttonVariants };
