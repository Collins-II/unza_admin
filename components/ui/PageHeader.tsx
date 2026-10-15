import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  backHref?: string;
  actions?: ReactNode;
};

/** Consistent top section for every inner page. */
export function PageHeader({ eyebrow = 'Campus Navigator', title, subtitle, backHref = '/', actions }: PageHeaderProps) {
  return (
    <header className="-mx-4 -mt-4 mb-6 flex flex-col gap-4 border-b-[3px] border-[#008236] bg-black px-4 pb-5 pt-[calc(1rem+env(safe-area-inset-top))] text-white md:mx-0 md:mt-0 md:flex-row md:items-end md:justify-between md:rounded-md md:px-6">
      <div className="flex items-start gap-3">
        <Link
          href={backHref}
          aria-label="Back"
          className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-white text-white transition hover:bg-white hover:text-black active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-[#4ade80]">
            <Image src="/images/unza_logo.jpg" alt="" width={16} height={16} className="rounded-full" />
            {eyebrow}
          </p>
          <h1 className="mt-1 text-3xl font-black uppercase leading-none tracking-tight text-white">{title}</h1>
          {subtitle ? <p className="mt-2 max-w-xl text-sm text-gray-300">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function statusBadgeClass(status: string) {
  const s = status.toLowerCase();
  if (['confirmed', 'paid', 'available', 'open', 'completed'].includes(s)) return 'ui-badge ui-badge-success';
  if (['pending', 'busy', 'processing'].includes(s)) return 'ui-badge ui-badge-warning';
  if (['failed', 'cancelled', 'rejected'].includes(s)) return 'ui-badge ui-badge-danger';
  return 'ui-badge ui-badge-neutral';
}
