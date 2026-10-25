import { z } from "zod";
import { requestOrigin, trustedOrigin } from "../auth/validation";

type Dependencies = {
  user: () => Promise<{ id: string } | null>;
  remove: (userId: string, rowId: string) => Promise<boolean>;
};

export function createDeviceRemovalHandler(deps: Dependencies) {
  return async (request: Request, id: string): Promise<Response> => {
    const headers = { "Cache-Control": "private, no-store" };
    const error = (code: string, status: number) => Response.json({ error: { code } }, { status, headers });
    try {
      if (!trustedOrigin(requestOrigin(request.url, request.headers.get("host")), request.headers.get("origin"))) return error("invalid_origin", 403);
      if (!z.uuid().safeParse(id).success) return error("invalid_device", 400);
      const user = await deps.user();
      if (!user) return error("unauthorized", 401);
      const removed = await deps.remove(user.id, id);
      if (!removed) return error("device_not_found", 404);
      return Response.json({ removed: true }, { headers });
    } catch { return error("device_unavailable", 503); }
  };
}
