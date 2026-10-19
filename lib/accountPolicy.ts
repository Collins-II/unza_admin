export function isActiveStaff(account: { role?: string; status?: string } | null | undefined) {
  return account?.status === "active" && (account.role === "staff" || account.role === "admin");
}

export function removesLastAdministrator(
  current: { role: string; status?: string },
  update: { role?: string; status?: string },
  activeAdministrators: number
) {
  return current.role === "admin" && current.status === "active" &&
    ((update.role ?? current.role) !== "admin" || (update.status ?? current.status) !== "active") &&
    activeAdministrators <= 1;
}
