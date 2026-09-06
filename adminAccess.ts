const ADMIN_EMAILS = new Set(["gebrilfares972@gmail.com"]);

export function canAccessAdmin(user: { role?: string | null; email?: string | null } | null | undefined): boolean {
  if (!user) return false;
  const email = user.email?.trim().toLowerCase() ?? "";
  return user.role === "admin" || ADMIN_EMAILS.has(email);
}
