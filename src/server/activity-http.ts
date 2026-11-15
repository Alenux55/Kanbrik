import {
  activityPageInput,
  createCommentInput,
  editCommentInput,
  type WorkKind,
} from "@/lib/activity-contracts";
import { planningRequest } from "./planning-http";
import { mutationBody, workspaceResponse } from "./workspace-http";
import { readActivity, postComment, changeComment } from "./work-activity";
type Context = { params: Promise<{ id: string; recordId: string }> };
export function activityHandlers(kind: WorkKind) {
  const read =
    (type: "comments" | "history") =>
    (request: Request, { params }: Context) =>
      planningRequest(async () => {
        const { id, recordId } = await params;
        const input = activityPageInput.parse(
          Object.fromEntries(new URL(request.url).searchParams),
        );
        return workspaceResponse(
          await readActivity(
            request.headers,
            id,
            { kind, id: recordId },
            input,
            type,
          ),
        );
      });
  return {
    commentsGET: read("comments"),
    historyGET: read("history"),
    commentsPOST: (request: Request, { params }: Context) =>
      planningRequest(async () => {
        const input = await mutationBody(request, createCommentInput),
          { id, recordId } = await params;
        return workspaceResponse(
          await postComment(request.headers, id, { kind, id: recordId }, input),
          201,
        );
      }),
    commentPATCH: (
      request: Request,
      {
        params,
      }: {
        params: Promise<{ id: string; recordId: string; commentId: string }>;
      },
    ) =>
      planningRequest(async () => {
        const input = await mutationBody(request, editCommentInput),
          { id, recordId, commentId } = await params;
        return workspaceResponse(
          await changeComment(
            request.headers,
            id,
            { kind, id: recordId },
            commentId,
            input,
          ),
        );
      }),
  };
}
