'use client';

import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { Toolbar } from '@/components/ui/toolbar';

export function FixedToolbar(props: ComponentProps<typeof Toolbar>) {
  const chrome = cn(
    'w-full min-w-0 shrink-0 rounded-none border-t border-sidebar-border bg-sidebar/95 px-4 py-2 backdrop-blur-xl',
    'min-h-12 text-sidebar-foreground shadow-none supports-backdrop-blur:bg-sidebar/80',
    '[&_button]:text-sidebar-foreground/85 [&_button:hover]:bg-sidebar-accent [&_button:hover]:text-sidebar-foreground',
  );

  return (
    <div
      className={cn(
        chrome,
        'relative z-40 grid w-full grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)] items-center gap-3',
      )}
    >
      <div aria-hidden className="min-w-0" />
      <Toolbar
        {...props}
        className={cn(
          'scrollbar-hide relative z-40 min-w-0 max-w-full justify-center overflow-x-auto',
          props.className,
        )}
      />
      <div aria-hidden className="min-w-0" />
    </div>
  );
}
