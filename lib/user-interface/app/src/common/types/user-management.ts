export type UserRolePreset = "user" | "admin" | "developer" | "admin-developer";

export interface ManagedUser {
  username: string;
  email: string;
  status: string;
  enabled: boolean;
  roles: string[];
}

export interface ManagedUsersResponse {
  users: ManagedUser[];
}
