"use client";
import {
  SiblingOrderGroup,
  SiblingOrderRow,
  orderRows,
} from "./task-order-controls";
import type { TaskOrderRecord } from "@/lib/task-order-contracts";
import { useEffect, useRef, useState } from "react";
import type { WorkspaceSummary } from "@/lib/workspace-contracts";
import type { ProjectRecord, TaskRecord } from "@/lib/planning-contracts";
import {
  matchesProjectsTask,
  matchesProjectsProject,
  projectsFiltered,
  normalizeProjectsFilter,
} from "@/lib/projects-filters";
import type { LabelFilter } from "@/lib/task-labels";
import {
  PlannerFilters,
  TagMatchControl,
  FilterDates,
  advancedCount,
  validFilterDates,
} from "./planner-filters";
import { EditorDialog } from "./ui/editor-dialog";
import { TaskLabelBadges } from "./task-labels";
import { statusName } from "@/lib/task-statuses";
import { usePlanningDrafts } from "./planning-drafts";
import { usePlannerSession } from "./planner-session";
import { usePlannerContext } from "./planner-context";
import { button } from "./ui/planner-controls";
export function ProjectsPlanner({
  workspaces: initial,
}: {
  workspaces: WorkspaceSummary[];
}) {
  const context = usePlannerContext();
  const workspace =
    context.workspaces.find((w) => w.id === context.defaultWorkspaceId) ??
    initial.find((w) => w.kind === "personal");
  return (
    <section>
      <h1 className="text-4xl font-semibold">Projects</h1>
      <p className="mt-3">
        Projects and tasks in {workspace?.name}. Saves require a connection.
      </p>
      <p className="mt-2 text-sm">
        Use disclosures to expand; select a title to edit. Parent and subtask
        completion are independent.
      </p>
      {workspace && (
        <WorkspacePlanning key={workspace.id} workspace={workspace} />
      )}
    </section>
  );
}
function WorkspacePlanning({ workspace }: { workspace: WorkspaceSummary }) {
  const context = usePlannerContext();
  const session = usePlannerSession();
  const [lease] = useState(session.capture);
  const { saveEpoch, expansion, setExpansion, viewLabels, setViewLabels } =
    usePlanningDrafts();
  const labelFilter = normalizeProjectsFilter(viewLabels.projects),
    filtering = projectsFiltered(labelFilter);
  const matches = (task: TaskRecord) =>
    matchesProjectsTask(task, labelFilter, context.zone);
  const [advanced, setAdvanced] = useState(false);
  const [proposal, setProposal] = useState<LabelFilter>(labelFilter);
  const [data, setData] = useState<{
    projects: ProjectRecord[];
    tasks: TaskRecord[];
    orders: TaskOrderRecord[];
  } | null>(null);
  const [error, setError] = useState("");
  const [epoch, setEpoch] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    const seq = ++generation.current;
    Promise.all([
      session.fetch(`/api/workspaces/${workspace.id}/projects`),
      session.fetch(`/api/workspaces/${workspace.id}/tasks`),
      session.fetch(`/api/workspaces/${workspace.id}/task-order`),
    ])
      .then(async (responses) => {
        if (!active || seq !== generation.current || !session.isCurrent(lease))
          return;
        if (responses.some((r) => r.status === 404)) {
          setData(null);
          context.revoke(workspace.id);
          return;
        }
        if (responses.some((r) => !r.ok)) throw new Error();
        const [projects, tasks, orders] = await Promise.all(
          responses.map((r) => r.json()),
        );
        if (active && seq === generation.current && session.isCurrent(lease)) {
          setData({ projects, tasks, orders });
          setError("");
        }
      })
      .catch(() => {
        if (active && session.isCurrent(lease)) {
          setData(null);
          setError(
            "Could not load planning. Drafts kept; Refresh planning to retry.",
          );
        }
      });
    return () => {
      active = false;
    };
    // Workspace is immutable for this mounted context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, lease, workspace.id, epoch, saveEpoch]);
  const expanded = (id: string) =>
    filtering || (expansion[workspace.id + "/" + id] ?? false);
  function toggle(id: string) {
    setExpansion((current) => ({
      ...current,
      [workspace.id + "/" + id]: !expanded(id),
    }));
  }
  function tasks(projectId: string | null) {
    const scope = projectId
      ? data!.orders.find((s) => s.scopeKey === "project/" + projectId)
      : undefined;
    const roots = orderRows(
      data!.tasks.filter(
        (t) =>
          t.projectId === projectId &&
          !t.parentId &&
          (matches(t) ||
            data!.tasks.some(
              (child) => child.parentId === t.id && matches(child),
            )),
      ),
      scope,
    );
    return (
      <SiblingOrderGroup
        workspaceId={workspace.id}
        scope={scope}
        rows={roots}
        filtered={filtering}
        refresh={() => setEpoch((x) => x + 1)}
      >
        {roots.map((task) => {
          const childScope = data!.orders.find(
            (s) => s.scopeKey === "task/" + task.id,
          );
          const children = orderRows(
            data!.tasks.filter((t) => t.parentId === task.id && matches(t)),
            childScope,
          );
          return (
            <SiblingOrderRow
              key={task.id}
              task={task}
              open={() =>
                context.openEntity({
                  kind: "tasks",
                  workspaceId: workspace.id,
                  record: task,
                })
              }
              header={
                <>
                  <button
                    className={button}
                    aria-expanded={expanded(task.id)}
                    aria-label={`Expand task: ${task.title}`}
                    onClick={() => toggle(task.id)}
                  >
                    {expanded(task.id) ? "−" : "+"}
                  </button>
                  <button
                    data-drag-edit
                    aria-label={task.title}
                    title={
                      [
                        filtering &&
                          !matches(task) &&
                          "Context for matching subtasks",
                        ...(task.tags ?? []).map((t) => t.name),
                      ]
                        .filter(Boolean)
                        .join(", ") || undefined
                    }
                    className="min-h-11 min-w-0 flex-1 break-words py-2 text-left font-medium"
                  >
                    {task.title}
                    <TaskLabelBadges task={task} />
                    {filtering && !matches(task) && (
                      <span className="block text-xs">
                        Context for matching subtasks
                      </span>
                    )}
                  </button>
                  <span className="text-xs">
                    {statusName(task)} · {children.length} subtasks
                  </span>
                </>
              }
            >
              {expanded(task.id) && (
                <div>
                  <SiblingOrderGroup
                    workspaceId={workspace.id}
                    scope={childScope}
                    rows={children}
                    filtered={filtering}
                    refresh={() => setEpoch((x) => x + 1)}
                  >
                    {children.map((child) => (
                      <SiblingOrderRow
                        key={child.id}
                        task={child}
                        open={() =>
                          context.openEntity({
                            kind: "tasks",
                            workspaceId: workspace.id,
                            record: child,
                          })
                        }
                        header={
                          <>
                            <button
                              data-drag-edit
                              aria-label={child.title}
                              title={
                                (child.tags ?? [])
                                  .map((t) => t.name)
                                  .filter(Boolean)
                                  .join(", ") || undefined
                              }
                              className="min-h-11 w-full min-w-0 flex-1 break-words text-left"
                            >
                              {child.title}
                              <TaskLabelBadges task={child} />
                            </button>
                            <span className="text-xs">{statusName(child)}</span>
                          </>
                        }
                      />
                    ))}
                  </SiblingOrderGroup>
                  <button
                    className={button + " my-2"}
                    onClick={() =>
                      context.openEntity({
                        kind: "tasks",
                        workspaceId: workspace.id,
                        projectId,
                        parentId: task.id,
                      })
                    }
                  >
                    Add subtask to {task.title}
                  </button>
                </div>
              )}
            </SiblingOrderRow>
          );
        })}
        {roots.length === 0 && (
          <li className="py-3 text-sm">
            {filtering ? "No matching tasks." : "No tasks yet."}
          </li>
        )}
      </SiblingOrderGroup>
    );
  }
  return (
    <div className="mt-6 min-w-0">
      <div className="flex flex-wrap gap-2">
        <button
          className={button}
          onClick={() =>
            context.openEntity({ kind: "projects", workspaceId: workspace.id })
          }
        >
          New project
        </button>
        <button
          className={button}
          onClick={() =>
            context.openEntity({ kind: "tasks", workspaceId: workspace.id })
          }
        >
          New task
        </button>
        <button className={button} onClick={() => setEpoch((x) => x + 1)}>
          Refresh planning
        </button>
      </div>
      <PlannerFilters
        refreshKey={epoch}
        value={labelFilter}
        change={(value) =>
          setViewLabels((current) => ({ ...current, projects: value }))
        }
        workspaceIds={[workspace.id]}
        projects={(data?.projects ?? []).map((project) => ({
          id: project.id,
          title: project.title,
        }))}
        projectError={error || undefined}
        disabled={advanced}
        placeholder="Search project and task titles"
        advancedCount={advancedCount(labelFilter)}
        advanced={() => {
          setProposal(labelFilter);
          setAdvanced(true);
        }}
      />
      {advanced && (
        <EditorDialog
          title="Projects advanced filters"
          dirty={false}
          close={() => setAdvanced(false)}
          discard={() => {}}
        >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!validFilterDates(proposal, context.zone)) return;
              setViewLabels((current) => ({
                ...current,
                projects: {
                  ...current.projects,
                  matchAll: proposal.matchAll,
                  createdFrom: proposal.createdFrom,
                  createdTo: proposal.createdTo,
                  editedFrom: proposal.editedFrom,
                  editedTo: proposal.editedTo,
                },
              }));
              setAdvanced(false);
            }}
          >
            <TagMatchControl
              value={proposal.matchAll}
              change={(matchAll) =>
                setProposal((current) => ({ ...current, matchAll }))
              }
            />
            <FilterDates
              value={proposal}
              zone={context.zone}
              change={(key, value) =>
                setProposal((current) => ({ ...current, [key]: value }))
              }
            />
            <button
              className={button}
              disabled={!validFilterDates(proposal, context.zone)}
            >
              Apply filters
            </button>{" "}
          </form>
        </EditorDialog>
      )}
      {data && filtering && (
        <p>
          Matching tasks: {data.tasks.filter(matches).length} of{" "}
          {data.tasks.length} total. Ancestors shown as context are not
          additional matches. Matching projects:{" "}
          {
            data.projects.filter((project) =>
              matchesProjectsProject(
                project,
                data.tasks,
                labelFilter,
                context.zone,
              ),
            ).length
          }{" "}
          of {data.projects.length}.
        </p>
      )}
      {error && (
        <p role="alert" className="my-4">
          {error}
        </p>
      )}
      {!data ? (
        <p role="status">
          {error ? "Planning unavailable." : "Loading planning…"}
        </p>
      ) : (
        <ul aria-label="Projects hierarchy" className="mt-5 space-y-2">
          {data.projects
            .filter((project) =>
              matchesProjectsProject(
                project,
                data.tasks,
                labelFilter,
                context.zone,
              ),
            )
            .map((project) => (
              <li key={project.id} className="rounded-lg border bg-white p-2">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    className={button}
                    aria-expanded={expanded(project.id)}
                    aria-label={`Expand project: ${project.title}`}
                    onClick={() => toggle(project.id)}
                  >
                    {expanded(project.id) ? "−" : "+"}
                  </button>
                  <button
                    className="min-h-11 min-w-0 flex-1 break-words py-2 text-left font-semibold"
                    onClick={() =>
                      context.openEntity({
                        kind: "projects",
                        workspaceId: workspace.id,
                        record: project,
                      })
                    }
                  >
                    {project.title}
                  </button>
                  <span className="text-xs">
                    {
                      data.tasks.filter(
                        (t) => t.projectId === project.id && matches(t),
                      ).length
                    }{" "}
                    tasks
                  </span>
                </div>
                {expanded(project.id) && (
                  <>
                    {tasks(project.id)}
                    <button
                      className={button + " mt-2"}
                      onClick={() =>
                        context.openEntity({
                          kind: "tasks",
                          workspaceId: workspace.id,
                          projectId: project.id,
                        })
                      }
                    >
                      Add task to {project.title}
                    </button>
                  </>
                )}
              </li>
            ))}
          {(!labelFilter.projects?.length ||
            labelFilter.projects.includes("standalone")) && (
            <li className="rounded-lg border bg-white p-2">
              <div className="flex items-center gap-2">
                <button
                  className={button}
                  aria-label="Expand Standalone tasks"
                  aria-expanded={expanded("standalone")}
                  onClick={() => toggle("standalone")}
                >
                  {expanded("standalone") ? "−" : "+"}
                </button>
                <h2 className="font-semibold">Standalone tasks</h2>
              </div>
              {expanded("standalone") && (
                <>
                  {tasks(null)}
                  <button
                    className={button + " mt-2"}
                    onClick={() =>
                      context.openEntity({
                        kind: "tasks",
                        workspaceId: workspace.id,
                        projectId: null,
                      })
                    }
                  >
                    Add standalone task
                  </button>
                </>
              )}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
