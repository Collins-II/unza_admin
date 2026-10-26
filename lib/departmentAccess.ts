export type DepartmentPrincipal = { role: string; departmentIds?: string[] };

export function canAccessDepartment(principal: DepartmentPrincipal, departmentId: string) {
  return principal.role === "admin" || principal.role === "staff" &&
    Boolean(principal.departmentIds?.some((id) => id.toLowerCase() === departmentId.toLowerCase()));
}

export function validateDepartmentAssignments(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 100 &&
    value.every((id) => typeof id === "string" && /^[a-f\d]{24}$/i.test(id)) &&
    new Set(value.map((id: string) => id.toLowerCase())).size === value.length;
}
