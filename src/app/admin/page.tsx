import { redirect } from "next/navigation";

/**
 * `/admin` is the canonical admin URL (used by the sidebar, the login redirect
 * and the customer guard), while the dashboard lives at `/admin/dashboard`.
 */
export default function AdminIndexPage() {
  redirect("/admin/dashboard");
}
