import React, { useCallback, useEffect, useState } from "react";
import type { ApiClient } from "../../../common/api-client/api-client";
import type { ManagedUser, UserRolePreset } from "../../../common/types/user-management";

interface UserManagementTabProps {
  apiClient: ApiClient;
  addNotification: (type: "success" | "error" | "info" | "warning", message: string) => void;
}

const roleOptions: Array<{ value: UserRolePreset; label: string }> = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
  { value: "developer", label: "Developer" },
  { value: "admin-developer", label: "Admin + Developer" },
];

function getRolePreset(roles: string[]): UserRolePreset {
  const normalizedRoles = roles.map((role) => role.toLowerCase());
  const isAdmin = normalizedRoles.includes("admin");
  const isDeveloper = normalizedRoles.includes("developer");

  if (isAdmin && isDeveloper) {
    return "admin-developer";
  }
  if (isAdmin) {
    return "admin";
  }
  if (isDeveloper) {
    return "developer";
  }
  return "user";
}

const UserManagementTab: React.FC<UserManagementTabProps> = ({
  apiClient,
  addNotification,
}) => {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [draftRoles, setDraftRoles] = useState<Record<string, UserRolePreset>>({});
  const [loading, setLoading] = useState(true);
  const [savingUsername, setSavingUsername] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.userManagement.listUsers();
      setUsers(response.users);
      setDraftRoles(
        Object.fromEntries(
          response.users.map((user) => [user.username, getRolePreset(user.roles)])
        )
      );
    } catch (error) {
      console.error("Error loading users:", error);
      addNotification("error", "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [apiClient, addNotification]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleSave = useCallback(
    async (user: ManagedUser) => {
      const nextRole = draftRoles[user.username];
      if (!nextRole || nextRole === getRolePreset(user.roles)) {
        return;
      }

      try {
        setSavingUsername(user.username);
        const updated = await apiClient.userManagement.updateUserRole(user.username, nextRole);
        setUsers((current) =>
          current.map((item) =>
            item.username === user.username
              ? { ...item, roles: updated.roles }
              : item
          )
        );
        addNotification("success", `Updated role for ${user.email}`);
      } catch (error) {
        console.error("Error updating user role:", error);
        addNotification("error", `Failed to update role for ${user.email}`);
      } finally {
        setSavingUsername(null);
      }
    },
    [apiClient, addNotification, draftRoles]
  );

  if (loading) {
    return (
      <div className="feature-rollouts-panel" role="status" aria-busy="true">
        Loading users...
      </div>
    );
  }

  return (
    <div className="user-management-panel">
      <div className="feature-rollouts-card">
        <div className="feature-rollouts-card__header">
          <div>
            <span className="feature-rollouts-eyebrow">Developer Controls</span>
            <h2>User Management</h2>
            <p>Edit user roles directly from the table below.</p>
          </div>
        </div>

        <div className="user-management-table-wrapper">
          <table className="user-management-table">
            <thead>
              <tr>
                <th scope="col">User</th>
                <th scope="col">Status</th>
                <th scope="col">Role</th>
                <th scope="col" className="user-management-table__actions">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const currentRole = getRolePreset(user.roles);
                const draftRole = draftRoles[user.username] || currentRole;
                const isSaving = savingUsername === user.username;
                const hasChanges = draftRole !== currentRole;

                return (
                  <tr key={user.username}>
                    <td>
                      <div className="user-management-user-cell">
                        <span className="user-management-user-email">{user.email}</span>
                        <span className="user-management-user-username">{user.username}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`user-management-status-pill ${user.enabled ? "is-enabled" : "is-disabled"}`}>
                        {user.enabled ? user.status : "DISABLED"}
                      </span>
                    </td>
                    <td>
                      <label className="visually-hidden" htmlFor={`role-select-${user.username}`}>
                        Role for {user.email}
                      </label>
                      <select
                        id={`role-select-${user.username}`}
                        className="user-management-role-select"
                        value={draftRole}
                        onChange={(event) =>
                          setDraftRoles((current) => ({
                            ...current,
                            [user.username]: event.target.value as UserRolePreset,
                          }))
                        }
                        disabled={isSaving}
                      >
                        {roleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="user-management-table__actions">
                      <button
                        type="button"
                        className="feature-rollouts-primary-button"
                        onClick={() => void handleSave(user)}
                        disabled={!hasChanges || isSaving}
                      >
                        {isSaving ? "Saving..." : "Save"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default UserManagementTab;
