"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { createClient } from "@/lib/supabase/client";

type TaskStatus = "To-do" | "In Progress" | "Done";   //now TaskStatus can only store one of these three strings 
type RecurrenceType = "none" | "daily" | "weekly";

type Team = {
  id: string;
  name: string;
  invite_code: string;
};

type Task = {
  id: string;
  team_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  is_important: boolean;
  is_urgent: boolean;
  due_date: string | null;
  recurrence_type: RecurrenceType;
  created_at: string;
};

type TaskRow = {
  id: string;
  team_id: string;
  title: string;
  description: string | null;
  status: string | null;
  is_important: boolean | null;
  is_urgent: boolean | null;
  due_date: string | null;
  recurrence_type?: string | null;
  created_at: string | null;
};

type TeamMember = {
  userId: string;
  label: string;
};

type TaskAssigneeRow = {
  task_id: string;
  user_id: string;
};

type ProfileRow = {
  id: string;
  email?: string | null;    // ? is for optional, meaning it may or may not be present, and | null means it can also be null
  name?: string | null;
  full_name?: string | null;
};

type StatusFilter = "All" | TaskStatus;
type RecurringFilter = "all" | "daily" | "weekly";
type AddMemberMode = "email" | "code";

const statusOptions: TaskStatus[] = ["To-do", "In Progress", "Done"];
const recurrenceOptions: { label: string; value: RecurrenceType }[] = [
  { label: "Does not repeat", value: "none" },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
];

const dbStatusByUi: Record<TaskStatus, string> = {
  "To-do": "todo",
  "In Progress": "in_progress",
  Done: "done",
};

function uiStatusFromDb(value: string | null | undefined): TaskStatus {
  const normalized = (value ?? "").toLowerCase().replace(/[\s-]+/g, "_");

  if (normalized === "done") {
    return "Done";
  }

  if (normalized === "in_progress") {
    return "In Progress";
  }

  return "To-do";
}

function recurrenceFromDb(value: string | null | undefined): RecurrenceType {
  if (value === "daily" || value === "weekly") {
    return value;
  }

  return "none";
}

function recurrenceLabel(value: RecurrenceType) {
  if (value === "daily") {
    return "Daily";
  }

  if (value === "weekly") {
    return "Weekly";
  }

  return "Does not repeat";
}

function isMissingRecurrenceColumnError(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "PGRST204" ||
    message.includes("recurrence_type") ||
    message.includes("'recurrence_type'") ||
    message.includes("column tasks.recurrence_type")
  );
}

type TaskFormState = {
  title: string;
  description: string;
  status: TaskStatus;
  isImportant: boolean;
  isUrgent: boolean;
  dueDate: string;
  recurrenceType: RecurrenceType;
  assigneeIds: string[];
};

const getTomorrowDateString = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const y = tomorrow.getFullYear();
  const m = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const d = String(tomorrow.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const getInitialFormState = (): TaskFormState => ({
  title: "",
  description: "",
  status: "To-do",
  isImportant: false,
  isUrgent: false,
  dueDate: getTomorrowDateString(),
  recurrenceType: "none",
  assigneeIds: [],
});

//returns some classes to design task approriately
function statusBadgeClass(status: TaskStatus) {   // status is of type TaskStatus
  if (status === "Done") {
    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  }

  if (status === "In Progress") {
    return "bg-amber-100 text-amber-700 border-amber-200";
  }

  return "bg-slate-100 text-slate-700 border-slate-200";
}

function formatDueDate(dateValue: string | null) {
  if (!dateValue) {
    return "No due date";
  }

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) { //if true, then the date is invalid
    
    return dateValue;
  }

  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function toDateInputValue(dateValue: string | null) {
  if (!dateValue) {
    return "";
  }

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

function calculateNextDueDate(currentDueDateStr: string | null, recurrenceType: RecurrenceType): string {
  let year: number;
  let month: number;
  let day: number;

  if (currentDueDateStr && /^\d{4}-\d{2}-\d{2}$/.test(currentDueDateStr)) {
    const parts = currentDueDateStr.split("-");
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10) - 1; // 0-based
    day = parseInt(parts[2], 10);
  } else {
    const today = new Date();
    year = today.getFullYear();
    month = today.getMonth();
    day = today.getDate();
  }

  const date = new Date(year, month, day);
  if (recurrenceType === "daily") {
    date.setDate(date.getDate() + 1);
  } else if (recurrenceType === "weekly") {
    date.setDate(date.getDate() + 7);
  }

  // Format as YYYY-MM-DD using local timezone coordinates
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id,
    team_id: row.team_id,
    title: row.title,
    description: row.description ?? null,
    status: uiStatusFromDb(row.status),
    is_important: Boolean(row.is_important),
    is_urgent: Boolean(row.is_urgent),
    due_date: row.due_date ?? null,
    recurrence_type: recurrenceFromDb(row.recurrence_type),
    created_at: row.created_at ?? "",
  };
}

export default function TeamPage() {
  const params = useParams<{ id?: string | string[] }>();
  const teamId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [team, setTeam] = useState<Team | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskAssignees, setTaskAssignees] = useState<Record<string, string[]>>({});
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isRecurrenceAvailable, setIsRecurrenceAvailable] = useState(true);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [recurringFilter, setRecurringFilter] = useState<RecurringFilter>("all");
  const [importantOnly, setImportantOnly] = useState(false);
  const [urgentOnly, setUrgentOnly] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState<TaskFormState>(getInitialFormState);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [updatingStatusTaskId, setUpdatingStatusTaskId] = useState<string | null>(null);

  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [addMemberMode, setAddMemberMode] = useState<AddMemberMode>("email");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [copyInviteStatus, setCopyInviteStatus] = useState<"idle" | "copied" | "error">("idle");
  const [isDeleteTeamOpen, setIsDeleteTeamOpen] = useState(false);
  const [isDeletingTeam, setIsDeletingTeam] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  const assigneeLabelById = useMemo(() => {
    return teamMembers.reduce<Record<string, string>>((acc, member) => {
      acc[member.userId] = member.label;
      return acc;
    }, {});
  }, [teamMembers]);

  const loadTeamPage = useCallback(async () => {
    if (!teamId) {
      setIsLoading(false);
      setPageError("Invalid team id.");
      return;
    }

    setIsLoading(true);
    setPageError(null);

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      router.push("/login");
      return;
    }

    setCurrentUserId(userData.user.id);

    const currentUserEmail = userData.user.email ?? null;

    const { data: memberCheck, error: memberCheckError } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("team_id", teamId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (memberCheckError || !memberCheck) {
      setIsLoading(false);
      setPageError("You do not have access to this team.");
      return;
    }

    const { data: teamData, error: teamError } = await supabase
      .from("teams")
      .select("id, name, invite_code")
      .eq("id", teamId)
      .single();

    if (teamError || !teamData) {
      setIsLoading(false);
      setPageError("Unable to load team details.");
      return;
    }

    setTeam(teamData as Team);

    const { data: membersData, error: membersError } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId);

    if (membersError) {
      setIsLoading(false);
      setPageError("Unable to load team members.");
      return;
    }

    const memberUserIds = (membersData ?? [])
      .map((row) => row.user_id as string)
      .filter(Boolean);

    const profileById: Record<string, ProfileRow> = {};

    if (memberUserIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, name, full_name")
        .in("id", memberUserIds);

      if (!profilesError && profilesData) {
        for (const row of profilesData as ProfileRow[]) {
          profileById[row.id] = row;
        }
      }
    }

    const mappedMembers: TeamMember[] = memberUserIds.map((memberId) => {
      const profile = profileById[memberId];
      const label =
        profile?.full_name?.trim() ||
        profile?.name?.trim() ||
        profile?.email?.trim() ||
        (memberId === userData.user.id ? currentUserEmail : null) ||
        memberId;

      return {
        userId: memberId,
        label,
      };
    });

    setTeamMembers(mappedMembers);

    const taskResult = await supabase
      .from("tasks")
      .select(
        "id, team_id, title, description, status, is_important, is_urgent, due_date, recurrence_type, created_at",
      )
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    let taskRows = (taskResult.data ?? null) as TaskRow[] | null;
    let taskError = taskResult.error;

    if (taskError && isMissingRecurrenceColumnError(taskError)) {
      setIsRecurrenceAvailable(false);
      setRecurringFilter("all");

      const fallback = await supabase
        .from("tasks")
        .select(
          "id, team_id, title, description, status, is_important, is_urgent, due_date, created_at",
        )
        .eq("team_id", teamId)
        .order("created_at", { ascending: false });

      taskRows = (fallback.data ?? null) as TaskRow[] | null;
      taskError = fallback.error;
    } else {
      setIsRecurrenceAvailable(true);
    }

    if (taskError) {
      setIsLoading(false);
      setPageError("Unable to load tasks.");
      return;
    }

    const safeTasks = ((taskRows ?? []) as TaskRow[]).map(taskFromRow);

    setTasks(safeTasks);

    if (safeTasks.length === 0) {
      setTaskAssignees({});
      setIsLoading(false);
      return;
    }

    const taskIds = safeTasks.map((task) => task.id);
    const { data: taskAssigneeRows, error: taskAssigneeError } = await supabase
      .from("task_assignees")
      .select("task_id, user_id")
      .in("task_id", taskIds);

    if (taskAssigneeError) {
      setIsLoading(false);
      setPageError("Unable to load task assignees.");
      return;
    }

    const nextAssignees: Record<string, string[]> = {};
    for (const row of (taskAssigneeRows ?? []) as TaskAssigneeRow[]) {
      if (!nextAssignees[row.task_id]) {
        nextAssignees[row.task_id] = [];
      }
      nextAssignees[row.task_id].push(row.user_id);
    }

    setTaskAssignees(nextAssignees);
    setIsLoading(false);
  }, [router, supabase, teamId]);


  useEffect(() => {
    void loadTeamPage();
  }, [loadTeamPage]);

  useEffect(() => {
    if (!teamId) {
      return;
    }

    const channel = supabase
      .channel(`team-tasks-${teamId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `team_id=eq.${teamId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newTask = taskFromRow(payload.new as TaskRow);

            setTasks((prevTasks) => [
              newTask,
              ...prevTasks.filter((task) => task.id !== newTask.id),
            ]);
            return;
          }

          if (payload.eventType === "UPDATE") {
            const updatedTask = taskFromRow(payload.new as TaskRow);

            setTasks((prevTasks) =>
              prevTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task)),
            );
            return;
          }

          if (payload.eventType === "DELETE") {
            const deletedTaskId = (payload.old as Partial<TaskRow>).id;

            if (!deletedTaskId) {
              return;
            }

            setTasks((prevTasks) => prevTasks.filter((task) => task.id !== deletedTaskId));
            setTaskAssignees((prevAssignees) => {
              const nextAssignees = { ...prevAssignees };
              delete nextAssignees[deletedTaskId];
              return nextAssignees;
            });
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, teamId]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (statusFilter !== "All" && task.status !== statusFilter) {
        return false;
      }

      if (importantOnly && !task.is_important) {
        return false;
      }

      if (urgentOnly && !task.is_urgent) {
        return false;
      }

      if (recurringFilter !== "all" && task.recurrence_type !== recurringFilter) {
        return false;
      }

      return true;
    });
  }, [importantOnly, recurringFilter, statusFilter, tasks, urgentOnly]);

  const closeModal = () => {    // modal is a popup window to create or edit a task
    setIsModalOpen(false);
    setEditingTaskId(null);
    setTaskForm(getInitialFormState());
    setFormError(null);
  };

  const openCreateModal = () => { // open the modal (popup window) to create a new task
    setEditingTaskId(null);
    setTaskForm(getInitialFormState());
    setFormError(null);
    setIsModalOpen(true);   // this is the actual line that opens the modal 
  };

  const openAddMemberModal = () => {
    setAddMemberMode("email");
    setInviteEmail("");
    setInviteError(null);
    setInviteSuccess(null);
    setCopyInviteStatus("idle");
    setIsAddMemberOpen(true);
  };

  const closeAddMemberModal = () => {
    setIsAddMemberOpen(false);
    setInviteEmail("");
    setInviteError(null);
    setInviteSuccess(null);
    setCopyInviteStatus("idle");
    setIsAddingMember(false);
  };

  const openEditModal = (task: Task) => {
    setEditingTaskId(task.id);
    setTaskForm({
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      isImportant: task.is_important,
      isUrgent: task.is_urgent,
      dueDate: toDateInputValue(task.due_date),
      recurrenceType: task.recurrence_type,
      assigneeIds: taskAssignees[task.id] ?? [],
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const toggleAssignee = (userId: string) => {
    setTaskForm((prev) => {
      const exists = prev.assigneeIds.includes(userId);

      return {
        ...prev,
        assigneeIds: exists
          ? prev.assigneeIds.filter((id) => id !== userId)
          : [...prev.assigneeIds, userId],
      };
    });
  };

  const handleSubmitTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!teamId) {
      setFormError("Invalid team id.");
      return;
    }

    const title = taskForm.title.trim();
    if (!title) {
      setFormError("Title is required.");
      return;
    }

    if (!editingTaskId && !currentUserId) {
      setFormError("Unable to determine task creator. Please refresh and try again.");
      return;
    }

    setIsSubmitting(true);

    const payload = {
      team_id: teamId,
      title,
      description: taskForm.description.trim() || null,
      status: dbStatusByUi[taskForm.status],
      is_important: taskForm.isImportant,
      is_urgent: taskForm.isUrgent,
      due_date: taskForm.dueDate || null,
    };

    const taskPayload = isRecurrenceAvailable
      ? { ...payload, recurrence_type: taskForm.recurrenceType }
      : payload;

    let nextTaskId = editingTaskId;

    if (editingTaskId) {
      let { error: updateError } = await supabase
        .from("tasks")
        .update(taskPayload)
        .eq("id", editingTaskId)
        .eq("team_id", teamId);

      if (updateError && isMissingRecurrenceColumnError(updateError)) {
        setIsRecurrenceAvailable(false);
        setRecurringFilter("all");

        const fallbackUpdate = await supabase
          .from("tasks")
          .update(payload)
          .eq("id", editingTaskId)
          .eq("team_id", teamId);

        updateError = fallbackUpdate.error;
      }

      if (updateError) {
        setFormError(updateError.message ?? "Unable to update task.");
        setIsSubmitting(false);
        return;
      }

      const { error: clearAssigneesError } = await supabase
        .from("task_assignees")
        .delete()
        .eq("task_id", editingTaskId);

      if (clearAssigneesError) {
        setFormError(clearAssigneesError.message ?? "Unable to update assignees.");
        setIsSubmitting(false);
        return;
      }
    } 
    else {
      const createPayload = {
        ...taskPayload,
        created_by: currentUserId,
      };

      let { data: createdTask, error: createError } = await supabase
        .from("tasks")
        .insert(createPayload)
        .select("id")
        .single();

      if (createError && isMissingRecurrenceColumnError(createError)) {
        setIsRecurrenceAvailable(false);
        setRecurringFilter("all");

        const fallbackCreate = await supabase
          .from("tasks")
          .insert({
            ...payload,
            created_by: currentUserId,
          })
          .select("id")
          .single();

        createdTask = fallbackCreate.data;
        createError = fallbackCreate.error;
      }

      if (createError || !createdTask) {
        setFormError(createError?.message ?? "Unable to create task.");
        setIsSubmitting(false);
        return;
      }

      nextTaskId = createdTask.id as string;
    }

    if (nextTaskId && taskForm.assigneeIds.length > 0) {
      const assigneeRows = taskForm.assigneeIds.map((userId) => ({
        task_id: nextTaskId,
        user_id: userId,
      }));

      const { error: assigneeInsertError } = await supabase
        .from("task_assignees")
        .insert(assigneeRows);

      if (assigneeInsertError) {
        setFormError(assigneeInsertError.message ?? "Unable to save assignees.");
        setIsSubmitting(false);
        return;
      }
    }

    setIsSubmitting(false);
    closeModal();
    await loadTeamPage();
  };

  const handleDeleteTask = async (taskId: string) => {

    const ok = window.confirm("Are you sure you want to delete this task?");
      //window.confirm is a built-in JavaScript function that displays a dialog box with a specified message, along with an OK and a Cancel button. It returns true if the user clicks OK, and false if the user clicks Cancel.
    if (!ok) {
      return;
    }

    setDeletingTaskId(taskId);
    setPageError(null);

    const { error: assigneeDeleteError } = await supabase
      .from("task_assignees")
      .delete()
      .eq("task_id", taskId);

    if (assigneeDeleteError) {
      setPageError(assigneeDeleteError.message ?? "Unable to delete the task.");
      setDeletingTaskId(null);
      return;
    }

    const { error: taskDeleteError } = await supabase
      .from("tasks")
      .delete()
      .eq("id", taskId)
      .eq("team_id", teamId ?? "");

    if (taskDeleteError) {
      setPageError(taskDeleteError.message ?? "Unable to delete the task.");
      setDeletingTaskId(null);
      return;
    }

    setDeletingTaskId(null);
    await loadTeamPage();
  };

  const handleDeleteTeam = async () => {
    if (!teamId || !team) {
      return;
    }

    if (deleteConfirmName !== team.name) {
      setPageError("Confirmation name does not match the team name.");
      return;
    }

    setIsDeletingTeam(true);
    setPageError(null);

    // 1. Get task IDs for this team to delete their assignees
    const { data: taskIdsData, error: fetchTasksError } = await supabase
      .from("tasks")
      .select("id")
      .eq("team_id", teamId);

    if (fetchTasksError) {
      setPageError(fetchTasksError.message ?? "Unable to fetch team tasks for deletion.");
      setIsDeletingTeam(false);
      return;
    }

    const taskIds = taskIdsData?.map((t) => t.id) ?? [];

    // 2. Delete task assignees
    if (taskIds.length > 0) {
      const { error: assigneeDeleteError } = await supabase
        .from("task_assignees")
        .delete()
        .in("task_id", taskIds);

      if (assigneeDeleteError) {
        setPageError(assigneeDeleteError.message ?? "Unable to delete task assignees.");
        setIsDeletingTeam(false);
        return;
      }
    }

    // 3. Delete tasks
    const { error: tasksDeleteError } = await supabase
      .from("tasks")
      .delete()
      .eq("team_id", teamId);

    if (tasksDeleteError) {
      setPageError(tasksDeleteError.message ?? "Unable to delete team tasks.");
      setIsDeletingTeam(false);
      return;
    }

    // 4. Delete team members
    const { error: membersDeleteError } = await supabase
      .from("team_members")
      .delete()
      .eq("team_id", teamId);

    if (membersDeleteError) {
      setPageError(membersDeleteError.message ?? "Unable to delete team members.");
      setIsDeletingTeam(false);
      return;
    }

    // 5. Delete the team itself
    const { error: teamDeleteError } = await supabase
      .from("teams")
      .delete()
      .eq("id", teamId);

    if (teamDeleteError) {
      setPageError(teamDeleteError.message ?? "Unable to delete the team.");
      setIsDeletingTeam(false);
      return;
    }

    setIsDeletingTeam(false);
    setIsDeleteTeamOpen(false);
    setDeleteConfirmName("");

    // Redirect to teams list page
    router.push("/teams");
  };

  const handleUpdateTaskStatus = async (task: Task, nextStatus: TaskStatus) => {
    if (!teamId || task.status === nextStatus) {
      return;
    }

    setUpdatingStatusTaskId(task.id);
    setPageError(null);

    const isCompletedRecurring =
      nextStatus === "Done" &&
      task.recurrence_type !== "none" &&
      isRecurrenceAvailable;

    const updatePayload: { status: string; recurrence_type?: string } = {
      status: dbStatusByUi[nextStatus],
    };

    if (isCompletedRecurring) {
      updatePayload.recurrence_type = "none";
    }

    const { error } = await supabase
      .from("tasks")
      .update(updatePayload)
      .eq("id", task.id)
      .eq("team_id", teamId);

    if (error) {
      setPageError(error.message ?? "Unable to update task status.");
      setUpdatingStatusTaskId(null);
      return;
    }

    if (isCompletedRecurring) {
      const nextDueDate = calculateNextDueDate(task.due_date, task.recurrence_type);
      const nextPayload = {
        team_id: teamId,
        title: task.title,
        description: task.description,
        status: "todo",
        is_important: task.is_important,
        is_urgent: task.is_urgent,
        due_date: nextDueDate,
        recurrence_type: task.recurrence_type,
        created_by: currentUserId,
      };

      const { data: createdTask, error: createError } = await supabase
        .from("tasks")
        .insert(nextPayload)
        .select("id")
        .single();

      if (createError) {
        setPageError(createError.message ?? "Unable to create next recurring task.");
      } else if (createdTask) {
        const originalAssignees = taskAssignees[task.id] ?? [];
        if (originalAssignees.length > 0) {
          const assigneePayloads = originalAssignees.map((userId) => ({
            task_id: createdTask.id,
            user_id: userId,
          }));

          const { error: assigneesError } = await supabase
            .from("task_assignees")
            .insert(assigneePayloads);

          if (assigneesError) {
            setPageError(assigneesError.message ?? "Unable to copy assignees to the next recurring task.");
          }
        }
      }

      await loadTeamPage();
    } else {
      setTasks((prevTasks) =>
        prevTasks.map((currentTask) =>
          currentTask.id === task.id ? { ...currentTask, status: nextStatus } : currentTask,
        ),
      );
    }
    setUpdatingStatusTaskId(null);
  };

  const handleAddMemberByEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);

    if (!teamId) {
      setInviteError("Invalid team id.");
      return;
    }

    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      setInviteError("Email is required.");
      return;
    }

    setIsAddingMember(true);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, name, full_name")
      .ilike("email", email)
      .maybeSingle();

    if (profileError) {
      setInviteError("Unable to find that person right now.");
      setIsAddingMember(false);
      return;
    }

    if (!profile) {
      setInviteError("No account was found for that email. Share the invite code instead.");
      setIsAddingMember(false);
      return;
    }

    const { error: memberError } = await supabase.from("team_members").insert({
      team_id: teamId,
      user_id: (profile as ProfileRow).id,
    });

    if (memberError) {
      if (memberError.code === "23505") {
        setInviteError("That person is already a member of this team.");
      } else {
        setInviteError(memberError.message ?? "Unable to add that member.");
      }
      setIsAddingMember(false);
      return;
    }

    const addedProfile = profile as ProfileRow;
    const addedLabel =
      addedProfile.full_name?.trim() ||
      addedProfile.name?.trim() ||
      addedProfile.email?.trim() ||
      email;

    setInviteEmail("");
    setInviteSuccess(`${addedLabel} was added to the team.`);
    setIsAddingMember(false);
    await loadTeamPage();
  };

  const handleCopyTeamInviteCode = async () => {
    if (!team?.invite_code) {
      setCopyInviteStatus("error");
      return;
    }

    try {
      await navigator.clipboard.writeText(team.invite_code);
      setCopyInviteStatus("copied");
    } catch {
      setCopyInviteStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(120%_120%_at_0%_0%,#fff7ed_0%,#f8fafc_45%,#ecfeff_100%)] text-slate-900">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Team workspace
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {team?.name ?? "Team"}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/teams"
            className="inline-flex h-11 items-center justify-center rounded-full border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Back to Teams
          </Link>
          <button
            type="button"
            onClick={() => setIsDeleteTeamOpen(true)}
            className="inline-flex h-11 items-center justify-center rounded-full border border-rose-200 bg-white px-5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
          >
            Delete Team
          </button>
          <button
            type="button"
            onClick={openAddMemberModal}
            className="inline-flex h-11 items-center justify-center rounded-full border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Add Member
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex h-11 items-center justify-center rounded-full bg-slate-900 px-6 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            New Task
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 pb-20">
        <section className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur sm:p-8">
          <div className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
            {/* status */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="text-sm font-medium text-slate-700">
                Status
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                  className="ml-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="All">All</option>
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-medium text-slate-700">
                Recurring
                <select
                  value={recurringFilter}
                  disabled={!isRecurrenceAvailable}
                  onChange={(event) =>
                    setRecurringFilter(event.target.value as RecurringFilter)
                  }
                  className="ml-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="all">All tasks</option>
                  <option value="daily">Daily recurring</option>
                  <option value="weekly">Weekly recurring</option>
                </select>
              </label>
            </div>
            {/* important and urgent */}
            <div className="flex items-center gap-4">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={importantOnly}
                  onChange={(event) => setImportantOnly(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Important only
              </label>

              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={urgentOnly}
                  onChange={(event) => setUrgentOnly(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Urgent only
              </label>
            </div>
          </div>

          {!isRecurrenceAvailable ? (
            <p className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Recurring task fields are waiting on the database migration. Existing
              tasks are shown, but daily and weekly recurrence cannot be saved yet.
            </p>
          ) : null}

          {isLoading ? (
            <p className="text-sm text-slate-500">Loading team tasks...</p>
          ) : pageError ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {pageError}
            </p>
          ) : filteredTasks.length === 0 ? (
            <p className="text-base text-slate-600">No tasks match your filters.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {filteredTasks.map((task) => {
                const assignees = (taskAssignees[task.id] ?? []).map(
                  (userId) => assigneeLabelById[userId] ?? userId,
                );

                return (
                  
                  <article   // each task is displayed in an article element
                    key={task.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <h2 className="text-lg font-semibold text-slate-900">{task.title}</h2>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClass(task.status)}`}
                      >
                        {task.status}
                      </span>
                    </div>

                    {task.description ? (
                      <p className="mt-2 text-sm text-slate-600">{task.description}</p>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {task.is_important ? (
                        <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
                          Important
                        </span>
                      ) : null}
                      {task.is_urgent ? (
                        <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">
                          Urgent
                        </span>
                      ) : null}
                      {task.recurrence_type !== "none" ? (
                        <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold text-cyan-700">
                          {recurrenceLabel(task.recurrence_type)}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 space-y-2 text-sm text-slate-600">
                      <p>
                        <span className="font-semibold text-slate-700">Due:</span>{" "}
                        {formatDueDate(task.due_date)}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-700">Assignees:</span>{" "}
                        {assignees.length > 0 ? assignees.join(", ") : "Unassigned"}
                      </p>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      {task.status === "To-do" ? (
                        <button
                          type="button"
                          onClick={() => void handleUpdateTaskStatus(task, "In Progress")}
                          disabled={updatingStatusTaskId === task.id}
                          className="inline-flex h-10 items-center justify-center rounded-full bg-amber-600 px-5 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-amber-300"
                        >
                          {updatingStatusTaskId === task.id ? "Updating..." : "Mark In Progress"}
                        </button>
                      ) : null}
                      {task.status !== "Done" ? (
                        <button
                          type="button"
                          onClick={() => void handleUpdateTaskStatus(task, "Done")}
                          disabled={updatingStatusTaskId === task.id}
                          className="inline-flex h-10 items-center justify-center rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
                        >
                          {updatingStatusTaskId === task.id ? "Updating..." : "Mark Completed"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => openEditModal(task)}
                        className="inline-flex h-10 items-center justify-center rounded-full border border-slate-300 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteTask(task.id)}
                        disabled={deletingTaskId === task.id}
                        className="inline-flex h-10 items-center justify-center rounded-full bg-rose-600 px-5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-rose-300"
                      >
                        {deletingTaskId === task.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {isAddMemberOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-6">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Add Member
              </p>
              <h2 className="text-xl font-semibold text-slate-900">
                Invite people to {team?.name ?? "this team"}
              </h2>
            </div>

            <div className="mt-6 grid grid-cols-2 rounded-2xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => {
                  setAddMemberMode("email");
                  setInviteError(null);
                  setInviteSuccess(null);
                  setCopyInviteStatus("idle");
                }}
                className={`h-10 rounded-xl text-sm font-semibold transition ${
                  addMemberMode === "email"
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Add by Email
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddMemberMode("code");
                  setInviteError(null);
                  setInviteSuccess(null);
                  setCopyInviteStatus("idle");
                }}
                className={`h-10 rounded-xl text-sm font-semibold transition ${
                  addMemberMode === "code"
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Invite Code
              </button>
            </div>

            {addMemberMode === "email" ? (
              <form onSubmit={handleAddMemberByEmail} className="mt-6 space-y-4">
                <label className="block text-sm font-medium text-slate-700">
                  Email address
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="teammate@example.com"
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                  />
                </label>

                {inviteError ? (
                  <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-600">
                    {inviteError}
                  </p>
                ) : null}

                {inviteSuccess ? (
                  <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                    {inviteSuccess}
                  </p>
                ) : null}

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeAddMemberModal}
                    className="inline-flex h-11 items-center justify-center rounded-full border border-slate-300 px-6 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isAddingMember}
                    className="inline-flex h-11 items-center justify-center rounded-full bg-slate-900 px-6 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {isAddingMember ? "Adding..." : "Add Member"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Invite code
                  </p>
                  <p className="mt-2 break-all font-mono text-3xl font-semibold tracking-[0.2em] text-slate-950">
                    {team?.invite_code ?? "Unavailable"}
                  </p>
                </div>

                {copyInviteStatus === "error" ? (
                  <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-600">
                    Unable to copy the invite code. Please copy it manually.
                  </p>
                ) : null}

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeAddMemberModal}
                    className="inline-flex h-11 items-center justify-center rounded-full border border-slate-300 px-6 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyTeamInviteCode}
                    className="inline-flex h-11 items-center justify-center rounded-full bg-slate-900 px-6 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    {copyInviteStatus === "copied" ? "Copied" : "Copy Invite Code"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {isModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-6">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                {editingTaskId ? "Edit Task" : "New Task"}
              </p>
              <h2 className="text-xl font-semibold text-slate-900">
                {editingTaskId ? "Update task details" : "Create a new task"}
              </h2>
            </div>

            <form onSubmit={handleSubmitTask} className="mt-6 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Title
                <input
                  type="text"
                  value={taskForm.title}
                  onChange={(event) =>
                    setTaskForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  required
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Description
                <textarea
                  value={taskForm.description}
                  onChange={(event) =>
                    setTaskForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                  rows={4}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Status
                  <select
                    value={taskForm.status}
                    onChange={(event) =>
                      setTaskForm((prev) => ({
                        ...prev,
                        status: event.target.value as TaskStatus,
                      }))
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900"
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Due date
                  <input
                    type="date"
                    value={taskForm.dueDate}
                    onChange={(event) =>
                      setTaskForm((prev) => ({ ...prev, dueDate: event.target.value }))
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Recurring
                  <select
                    value={taskForm.recurrenceType}
                    disabled={!isRecurrenceAvailable}
                    onChange={(event) =>
                      setTaskForm((prev) => ({
                        ...prev,
                        recurrenceType: event.target.value as RecurrenceType,
                      }))
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {recurrenceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap gap-6">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={taskForm.isImportant}
                    onChange={(event) =>
                      setTaskForm((prev) => ({
                        ...prev,
                        isImportant: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Important
                </label>

                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={taskForm.isUrgent}
                    onChange={(event) =>
                      setTaskForm((prev) => ({ ...prev, isUrgent: event.target.checked }))
                    }
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Urgent
                </label>
              </div>

              <fieldset className="rounded-2xl border border-slate-200 p-4">
                <legend className="px-1 text-sm font-semibold text-slate-700">Assignees</legend>
                {teamMembers.length === 0 ? (
                  <p className="text-sm text-slate-500">No team members found.</p>
                ) : (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {teamMembers.map((member) => (
                      <label
                        key={member.userId}
                        className="inline-flex items-center gap-2 text-sm text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={taskForm.assigneeIds.includes(member.userId)}
                          onChange={() => toggleAssignee(member.userId)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        {member.label}
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>

              {formError ? (
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-600">
                  {formError}
                </p>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-slate-300 px-6 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-slate-900 px-6 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isSubmitting ? "Saving..." : editingTaskId ? "Save Changes" : "Create Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isDeleteTeamOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-6">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-500">
                Delete Team
              </p>
              <h2 className="text-xl font-semibold text-slate-900">
                Are you absolutely sure?
              </h2>
              <p className="text-sm text-slate-500">
                This action is permanent and cannot be undone. It will delete the team **{team?.name}**, all of its tasks, and remove all team members.
              </p>
            </div>

            <div className="mt-6 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Please type <span className="font-semibold text-slate-900">"{team?.name}"</span> to confirm:
                <input
                  type="text"
                  value={deleteConfirmName}
                  onChange={(event) => setDeleteConfirmName(event.target.value)}
                  placeholder={team?.name}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                />
              </label>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    setIsDeleteTeamOpen(false);
                    setDeleteConfirmName("");
                  }}
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-slate-300 px-6 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteTeam}
                  disabled={isDeletingTeam || deleteConfirmName !== team?.name}
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-rose-600 px-6 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-rose-300"
                >
                  {isDeletingTeam ? "Deleting..." : "Delete Team"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
