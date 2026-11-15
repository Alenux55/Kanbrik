import {
  createListInput,
  editListInput,
  createItemInput,
  editItemInput,
} from "@/lib/work-list-contracts";
import type { WorkKind } from "@/lib/activity-contracts";
import {
  readLists,
  addList,
  changeList,
  addItem,
  changeItem,
} from "./work-lists";
import { planningRequest } from "./planning-http";
import { mutationBody, workspaceResponse } from "./workspace-http";
type Params = {
  id: string;
  recordId: string;
  listId?: string;
  itemId?: string;
};
type Context = { params: Promise<Params> };
export function workListHandlers(kind: WorkKind) {
  return {
    GET: (request: Request, { params }: Context) =>
      planningRequest(async () => {
        const p = await params;
        return workspaceResponse(
          await readLists(request.headers, p.id, { kind, id: p.recordId }),
        );
      }),
    POST: (request: Request, { params }: Context) =>
      planningRequest(async () => {
        const p = await params,
          input = await mutationBody(request, createListInput);
        return workspaceResponse(
          await addList(request.headers, p.id, { kind, id: p.recordId }, input),
          201,
        );
      }),
    PATCH: (request: Request, { params }: Context) =>
      planningRequest(async () => {
        const p = await params,
          input = await mutationBody(request, editListInput);
        return workspaceResponse(
          await changeList(
            request.headers,
            p.id,
            { kind, id: p.recordId },
            p.listId!,
            input,
          ),
        );
      }),
    itemPOST: (request: Request, { params }: Context) =>
      planningRequest(async () => {
        const p = await params,
          input = await mutationBody(request, createItemInput);
        return workspaceResponse(
          await addItem(
            request.headers,
            p.id,
            { kind, id: p.recordId },
            p.listId!,
            input,
          ),
          201,
        );
      }),
    itemPATCH: (request: Request, { params }: Context) =>
      planningRequest(async () => {
        const p = await params,
          input = await mutationBody(request, editItemInput);
        return workspaceResponse(
          await changeItem(
            request.headers,
            p.id,
            { kind, id: p.recordId },
            p.listId!,
            p.itemId!,
            input,
          ),
        );
      }),
  };
}
