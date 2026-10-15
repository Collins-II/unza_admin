import Link from "next/link";

export default function NotFound() {
  return (
    <main className="ui-page flex items-center justify-center p-6">
      <div className="ui-card max-w-sm p-8 text-center">
        <p className="ui-eyebrow">404</p>
        <h1 className="ui-title mt-2">Page not found</h1>
        <p className="mt-2 text-sm text-gray-600">We could not find the page you were looking for.</p>
        <Link href="/" className="ui-btn ui-btn-primary mt-6">Back to map</Link>
      </div>
    </main>
  );
}

