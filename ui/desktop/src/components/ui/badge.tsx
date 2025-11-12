import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils';

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-full border px-2 py-[2px] text-[11px] font-medium uppercase tracking-wide',
  {
    variants: {
      variant: {
        default: 'bg-background-accent text-text-on-accent border-background-accent/60',
        secondary: 'bg-background-muted text-text-default border-border-subtle',
        outline: 'border-border-subtle text-text-muted',
        destructive: 'bg-background-danger text-white border-background-danger/80',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

interface BadgeProps extends React.ComponentProps<'div'>, VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <div
        data-slot="badge"
        ref={ref}
        className={cn(badgeVariants({ variant }), className)}
        {...props}
      />
    );
  }
);

Badge.displayName = 'Badge';

export { Badge, badgeVariants };
