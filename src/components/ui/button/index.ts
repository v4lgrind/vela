import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as Button } from "./Button.vue"

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer active:scale-95 hover:brightness-125 hover:-translate-y-0.5 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground border border-primary/80 hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30 hover:border-primary",
        destructive:
          "bg-destructive text-destructive-foreground border border-destructive/80 hover:bg-destructive/90 hover:shadow-xl hover:shadow-destructive/40 hover:border-destructive",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground hover:border-accent-foreground/30 hover:shadow-lg",
        secondary:
          "bg-secondary text-secondary-foreground border border-white/15 hover:bg-secondary/80 hover:shadow-lg hover:shadow-white/10 hover:border-white/25",
        ghost: "bg-black/5 hover:bg-accent hover:text-accent-foreground hover:shadow-md border border-border-input hover:border-border-hover",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        "default": "h-10 px-4 py-2",
        "sm": "h-9 rounded-md px-3",
        "lg": "h-11 rounded-md px-8",
        "icon": "h-10 w-10",
        "icon-sm": "size-9",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export type ButtonVariants = VariantProps<typeof buttonVariants>
