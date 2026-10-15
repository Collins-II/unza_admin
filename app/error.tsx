"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="ui-page flex items-center justify-center p-6">
      <div className="ui-card max-w-sm p-8 text-center">
        <p className="ui-eyebrow">Something went wrong</p>
        <h1 className="ui-title mt-2">Unexpected error</h1>
        <p className="mt-2 text-sm text-gray-600">Please try again.</p>
        <button type="button" onClick={reset} className="ui-btn ui-btn-primary mt-6">Try again</button>
      </div>
    </main>
  );
}

