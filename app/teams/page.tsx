"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type Team = {   // type is based on the "teams" table in the database, type is similar to struct in C
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
};

type TeamMemberRow = {
  teams: Team | null;
};

type TaskStatusRow = {
  team_id: string;
  status: string | null;
};

const inviteAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";  // Exclude easily confused characters like I, O, 1, and 0

function generateInviteCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => inviteAlphabet[byte % inviteAlphabet.length]).join("");
}

function isPendingTask(status: string | null | undefined) {
  const normalized = (status ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  return normalized !== "done";
}

export default function TeamsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [pendingTaskCounts, setPendingTaskCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdTeamName, setCreatedTeamName] = useState<string | null>(null);
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);
  const [copyInviteStatus, setCopyInviteStatus] = useState<"idle" | "copied" | "error">("idle");
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false);

  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoinSubmitting, setIsJoinSubmitting] = useState(false);

  const loadTeams = useCallback(async () => {
    setIsLoading(true);
    setPageError(null);

    const { data: userData, error: userError } = await supabase.auth.getUser();
        //supabase automatically finds the user based on seesion cookie (automatically saved when logged in)
  

    if (userError || !userData.user) {
      router.push("/login");
      return;
    }

    setUserId(userData.user.id);

    const { data, error } = await supabase
      .from("team_members")
      .select("teams(id, name, invite_code, created_at)")  //to get the teams that the user is a member of, so we select from the team_members table and join with the teams table to get the team details
      .eq("user_id", userData.user.id)  // eq is kinda like a where clause in SQL
      .returns<TeamMemberRow[]>();  



    if (error) {
      setTeams([]);
      setPendingTaskCounts({});
      setPageError("Unable to load your teams right now.");
    } else {
      const mappedTeams = (data ?? [])  // if data is null or undefined, use an empty array instead, null would give error while maping
        .map((row) => row.teams)
        .filter((team): team is Team => Boolean(team));
          //after this all mappedTeams is guaranteed to be of type Team, and not null
      setTeams(mappedTeams);

      const teamIds = mappedTeams.map((team) => team.id);
      if (teamIds.length === 0) {
        setPendingTaskCounts({});
      } else {
        const { data: taskRows, error: taskError } = await supabase
          .from("tasks")
          .select("team_id, status")
          .in("team_id", teamIds);

        if (taskError) {
          setPendingTaskCounts({});
        } else {
          const nextCounts = teamIds.reduce<Record<string, number>>((acc, teamId) => {
            acc[teamId] = 0;
            return acc;
          }, {});

          for (const task of (taskRows ?? []) as TaskStatusRow[]) {
            if (isPendingTask(task.status)) {
              nextCounts[task.team_id] = (nextCounts[task.team_id] ?? 0) + 1;
            }
          }

          setPendingTaskCounts(nextCounts);
        }
      }
    }

    setIsLoading(false);
  }, [router, supabase]);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  const handleCreateTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError(null);

    const trimmedName = createName.trim();
    if (!trimmedName) {
      setCreateError("Team name is required.");
      return;
    }

    if (!userId) {
      setCreateError("You must be logged in to create a team.");
      return;
    }

    setIsCreateSubmitting(true);

    const inviteCode = generateInviteCode();
    const { data: newTeam, error: teamError } = await supabase
      .from("teams")
      .insert({ name: trimmedName, invite_code: inviteCode })
      .select("id, name, invite_code, created_at")
      .single();

    if (teamError || !newTeam) {
      setCreateError(teamError?.message ?? "Unable to create the team.");
      setIsCreateSubmitting(false);
      return;
    }

    const { error: memberError } = await supabase.from("team_members").insert({
      team_id: newTeam.id,
      user_id: userId,
    });

    if (memberError) {
      setCreateError(memberError.message ?? "Unable to add you to the team.");
      setIsCreateSubmitting(false);
      return;
    }

    setCreatedTeamName(newTeam.name);
    setCreatedInviteCode(newTeam.invite_code);
    setCopyInviteStatus("idle");
    setCreateName("");
    setIsCreateSubmitting(false);
    await loadTeams();
  };

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setCreateName("");
    setCreateError(null);
    setCreatedTeamName(null);
    setCreatedInviteCode(null);
    setCopyInviteStatus("idle");
  };

  const handleCopyInviteCode = async () => {
    if (!createdInviteCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(createdInviteCode);
      setCopyInviteStatus("copied");
    } catch {
      setCopyInviteStatus("error");
    }
  };

  const handleJoinTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setJoinError(null);

    const trimmedCode = joinCode.trim().toUpperCase();
    if (!trimmedCode) {
      setJoinError("Invite code is required.");
      return;
    }

    if (!userId) {
      setJoinError("You must be logged in to join a team.");
      return;
    }

    setIsJoinSubmitting(true);

    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("id")
      .eq("invite_code", trimmedCode)
      .maybeSingle();

    if (teamError) {
      setJoinError("Unable to validate that invite code.");
      setIsJoinSubmitting(false);
      return;
    }

    if (!team) {
      setJoinError("Invalid invite code.");
      setIsJoinSubmitting(false);
      return;
    }

    const { error: memberError } = await supabase.from("team_members").insert({
      team_id: team.id,
      user_id: userId,
    });

    if (memberError) {
      if (memberError.code === "23505") {
        setJoinError("You are already a member of this team.");
      } else {
        setJoinError(memberError.message ?? "Unable to join the team.");
      }
      setIsJoinSubmitting(false);
      return;
    }

    setIsJoinOpen(false);
    setJoinCode("");
    setIsJoinSubmitting(false);
    await loadTeams();
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(120%_120%_at_0%_0%,#fff7ed_0%,#f8fafc_45%,#ecfeff_100%)] text-slate-900">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Your workspace
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Teams
          </h1>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              setCreatedTeamName(null);
              setCreatedInviteCode(null);
              setCopyInviteStatus("idle");
              setIsCreateOpen(true);
            }}
            className="inline-flex h-11 items-center justify-center rounded-full bg-slate-900 px-6 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Create Team
          </button>
          <button
            type="button"
            onClick={() => {
              setJoinError(null);
              setIsJoinOpen(true);
            }}
            className="inline-flex h-11 items-center justify-center rounded-full border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Join Team
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 pb-20">
        <section className="rounded-3xl border border-slate-200 bg-white/80 p-8 shadow-sm backdrop-blur sm:p-12">
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading your teams...</p>
          ) : pageError ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {pageError}
            </p>
          ) : teams.length === 0 ? (
            <p className="text-base text-slate-600">You have no teams yet.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {teams.map((team) => (
                <div
                  key={team.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm"
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Team
                    </p>
                    <p className="text-lg font-semibold text-slate-900">
                      {team.name}
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-500">
                      {pendingTaskCounts[team.id] ?? 0} pending{" "}
                      {(pendingTaskCounts[team.id] ?? 0) === 1 ? "task" : "tasks"}
                    </p>
                  </div>
                  <Link
                    href={`/teams/${team.id}`}
                    className="inline-flex h-10 items-center justify-center rounded-full bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Open
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {isCreateOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-6">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
            {createdInviteCode ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-600">
                    Team Created
                  </p>
                  <h2 className="text-xl font-semibold text-slate-900">
                    {createdTeamName} is ready
                  </h2>
                  <p className="text-sm text-slate-500">
                    Share this invite code with teammates so they can join your team.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Invite code
                  </p>
                  <p className="mt-2 break-all font-mono text-3xl font-semibold tracking-[0.2em] text-slate-950">
                    {createdInviteCode}
                  </p>
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={handleCopyInviteCode}
                    className="inline-flex h-11 w-full items-center justify-center rounded-full bg-slate-900 px-6 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    {copyInviteStatus === "copied" ? "Copied" : "Copy to clipboard"}
                  </button>
                  {copyInviteStatus === "error" ? (
                    <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-600">
                      Unable to copy the invite code. Please copy it manually.
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={closeCreateModal}
                    className="inline-flex h-11 w-full items-center justify-center rounded-full border border-slate-300 px-6 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                    Create Team
                  </p>
                  <h2 className="text-xl font-semibold text-slate-900">
                    Start a new workspace
                  </h2>
                </div>

                <form onSubmit={handleCreateTeam} className="mt-6 space-y-4">
                  <label className="block text-sm font-medium text-slate-700">
                    Team name
                    <input
                      type="text"
                      value={createName}
                      onChange={(event) => setCreateName(event.target.value)}
                      placeholder="Design Squad"
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                    />
                  </label>

                  {createError ? (
                    <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-600">
                      {createError}
                    </p>
                  ) : null}

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={closeCreateModal}
                      className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-slate-300 px-6 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isCreateSubmitting}
                      className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-slate-900 px-6 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      Create
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      ) : null}

      {isJoinOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-6">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Join Team
              </p>
              <h2 className="text-xl font-semibold text-slate-900">
                Enter an invite code
              </h2>
            </div>

            <form onSubmit={handleJoinTeam} className="mt-6 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Invite code
                <input
                  type="text"
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value)}
                  placeholder="6-character code"
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                />
              </label>

              {joinError ? (
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-600">
                  {joinError}
                </p>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setIsJoinOpen(false)}
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-slate-300 px-6 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isJoinSubmitting}
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-slate-900 px-6 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  Join
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
