import { createClient } from "@supabase/supabase-js";
import { createDeviceRemovalHandler } from "@/lib/account/remove-device";
import { sessionClient } from "@/lib/server/session";
import { supabaseEnv } from "@/lib/server/env";

export const runtime = "nodejs";

const handler = createDeviceRemovalHandler({
  async user() {
    const client = await sessionClient();
    const { data, error } = await client.auth.getUser();
    return !error && data.user?.email_confirmed_at && !data.user.is_anonymous ? { id: data.user.id } : null;
  },
  async remove(userId, rowId) {
    const env = supabaseEnv();
    const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.rpc("remove_own_device", { p_user_id: userId, p_device_row_id: rowId });
    if (error || typeof data !== "boolean") throw new Error("Device removal unavailable");
    return data;
  },
});

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return handler(request, (await context.params).id);
}
