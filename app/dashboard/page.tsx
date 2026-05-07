"use client";

import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="space-y-6 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">
          Dashboard - coming soon
        </h1>
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex h-11 items-center justify-center rounded-full border border-slate-300 px-6 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
