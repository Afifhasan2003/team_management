"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();   // router is a hook that allows us to navigate programmatically
  const supabase = createClient();  // supabase is our client instance that we will use to interact with our Supabase backend
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingAction, setPendingAction] = useState<"login" | "signup" | null>(
    null,
  );

  const handleLogin = async () => {
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    setPendingAction("login");

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsSubmitting(false);
    setPendingAction(null);

    if (authError) {
      setError(authError.message);
      return;
    }

    router.push("/teams");  //router.push is used to navigate to the teams page after a successful login
  };

  const handleSignUp = async () => {
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    setPendingAction("signup");

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    setIsSubmitting(false);
    setPendingAction(null);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (!data.session) {
      setMessage("Check your email to confirm your account before signing in.");
      return;
    }

    router.push("/dashboard");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            Welcome back
          </p>
          <h1 className="text-2xl font-semibold text-slate-900">
            Sign in to TaskFlow
          </h1>
          <p className="text-sm text-slate-500">
            Use your email and password to continue.
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your password"
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
            />
          </label>

          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
              {error}
            </p>
          ) : null}

          {message ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {message}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleLogin}
              disabled={isSubmitting}
              className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-400 disabled:opacity-50"
            >
              {pendingAction === "login" ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : null}
              {pendingAction === "login" ? "Signing in..." : "Login"}
            </button>
            <button
              type="button"
              onClick={handleSignUp}
              disabled={isSubmitting}
              className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border border-slate-300 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendingAction === "signup" ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400/40 border-t-slate-700" />
              ) : null}
              {pendingAction === "signup" ? "Signing up..." : "Sign Up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
