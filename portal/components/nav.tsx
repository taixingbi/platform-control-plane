"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";

const LINKS = [
  { href: "/tenants", label: "Tenants" },
  { href: "/applications", label: "Applications" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/models", label: "Models / Route Sets" },
  { href: "/guardrails", label: "Guardrails" },
  { href: "/usage", label: "Usage / Cost" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <span className="text-sm font-semibold">Bedrock Gateway</span>
          <nav className="flex gap-1">
            {LINKS.map((link) => {
              const active = pathname?.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    active
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
