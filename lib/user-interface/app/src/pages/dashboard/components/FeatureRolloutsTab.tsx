import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiClient } from "../../../common/api-client/api-client";
import type {
  FeatureRolloutConfig,
  FeatureRolloutMode,
  FeatureRolloutSearchUser,
} from "../../../common/types/feature-rollout";
import { Utils } from "../../../common/utils";
import FeatureRolloutModeSelector from "./FeatureRolloutModeSelector";

const FEATURE_KEY = "ai-grant-search";

interface FeatureRolloutsTabProps {
  apiClient: ApiClient;
  addNotification: (type: "success" | "error" | "info" | "warning", message: string) => void;
}

const emptyConfig: FeatureRolloutConfig = {
  featureKey: FEATURE_KEY,
  mode: "disabled",
  updatedAt: null,
  updatedBy: null,
  users: [],
};

const FeatureRolloutsTab: React.FC<FeatureRolloutsTabProps> = ({
  apiClient,
  addNotification,
}) => {
  const [config, setConfig] = useState<FeatureRolloutConfig>(emptyConfig);
  const [loading, setLoading] = useState(true);
  const [savingToggle, setSavingToggle] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [searchResults, setSearchResults] = useState<FeatureRolloutSearchUser[]>([]);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      const nextConfig = await apiClient.userManagement.getFeatureRollout(FEATURE_KEY);
      setConfig(nextConfig);
    } catch (error) {
      console.error("Error loading feature rollout config:", error);
      addNotification("error", "Failed to load AI search rollout settings");
    } finally {
      setLoading(false);
    }
  }, [apiClient, addNotification]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const handleModeChange = useCallback(async (mode: FeatureRolloutMode) => {
    try {
      setSavingToggle(true);
      const nextConfig = await apiClient.userManagement.updateFeatureRollout(FEATURE_KEY, mode);
      setConfig((current) => ({
        ...current,
        ...nextConfig,
        users: current.users,
      }));
      addNotification(
        "success",
        mode === "all"
          ? "AI search beta enabled for all users"
          : mode === "allowlisted"
            ? "AI search beta limited to allowlisted users"
            : "AI search beta disabled for all users"
      );
    } catch (error) {
      console.error("Error updating feature rollout:", error);
      addNotification("error", "Failed to update AI search beta mode");
    } finally {
      setSavingToggle(false);
    }
  }, [apiClient, addNotification]);

  const handleSearchUsers = useCallback(async () => {
    try {
      setSearchingUsers(true);
      const response = await apiClient.userManagement.searchFeatureRolloutUsers(
        FEATURE_KEY,
        searchQuery
      );
      setSearchResults(response.users);
    } catch (error) {
      console.error("Error searching users:", error);
      addNotification("error", "Failed to search users");
    } finally {
      setSearchingUsers(false);
    }
  }, [apiClient, addNotification, searchQuery]);

  const syncSearchResult = useCallback((email: string, hasAccess: boolean) => {
    setSearchResults((current) =>
      current.map((user) =>
        user.email === email
          ? {
              ...user,
              hasAccess,
            }
          : user
      )
    );
  }, []);

  const handleGrantAccess = useCallback(
    async (email: string) => {
      try {
        setPendingEmail(email);
        await apiClient.userManagement.grantFeatureRolloutUser(FEATURE_KEY, email);
        syncSearchResult(email, true);
        await loadConfig();
        addNotification("success", `Granted AI search beta access to ${email}`);
      } catch (error) {
        console.error("Error granting feature access:", error);
        addNotification("error", `Failed to grant access to ${email}`);
      } finally {
        setPendingEmail(null);
      }
    },
    [apiClient, addNotification, loadConfig, syncSearchResult]
  );

  const handleRevokeAccess = useCallback(
    async (email: string) => {
      try {
        setPendingEmail(email);
        await apiClient.userManagement.revokeFeatureRolloutUser(FEATURE_KEY, email);
        syncSearchResult(email, false);
        await loadConfig();
        addNotification("success", `Removed AI search beta access for ${email}`);
      } catch (error) {
        console.error("Error revoking feature access:", error);
        addNotification("error", `Failed to remove access for ${email}`);
      } finally {
        setPendingEmail(null);
      }
    },
    [apiClient, addNotification, loadConfig, syncSearchResult]
  );

  const allowlistedCount = config.users.length;
  const sortedResults = useMemo(
    () => [...searchResults].sort((a, b) => a.email.localeCompare(b.email)),
    [searchResults]
  );

  if (loading) {
    return <div className="feature-rollouts-panel">Loading feature rollouts...</div>;
  }

  return (
    <div className="feature-rollouts-panel">
      <div className="feature-rollouts-card">
        <div className="feature-rollouts-card__header">
          <div>
            <h2>AI Search Beta</h2>
            <p>
              Control who sees the AI-powered grant search. Users outside this rollout
              get the old normal search experience with no AI-specific UI or API calls.
            </p>
            <p className="feature-rollouts-process">
              Select one mode: all users, allowlisted users only, or disabled for all. Allowlist entries only matter in the allowlisted mode.
            </p>
          </div>
        </div>

        <FeatureRolloutModeSelector
          mode={config.mode}
          saving={savingToggle}
          onChange={(mode) => void handleModeChange(mode)}
        />

        <div className="feature-rollouts-meta">
          <span>{allowlistedCount} allowlisted user{allowlistedCount === 1 ? "" : "s"}</span>
          <span>
            Last updated{" "}
            {config.updatedAt ? Utils.formatTimestamp(config.updatedAt) : "never"}
            {config.updatedBy ? ` by ${config.updatedBy}` : ""}
          </span>
        </div>
      </div>

      <div className="feature-rollouts-grid">
        <section className="feature-rollouts-card">
          <div className="feature-rollouts-section-header">
            <h3>Allowlisted Users</h3>
            <p>Used only when rollout mode is set to allowlisted users only.</p>
          </div>
          {config.users.length === 0 ? (
            <p className="feature-rollouts-empty">No users have AI search beta access yet.</p>
          ) : (
            <div className="feature-rollouts-list">
              {config.users.map((user) => (
                <div key={user.email} className="feature-rollouts-list-item">
                  <div>
                    <div className="feature-rollouts-email">{user.email}</div>
                    <div className="feature-rollouts-detail">
                      Added {user.grantedAt ? Utils.formatTimestamp(user.grantedAt) : "recently"}
                      {user.grantedBy ? ` by ${user.grantedBy}` : ""}
                    </div>
                  </div>
                  <button
                    className="feature-rollouts-secondary-button"
                    onClick={() => handleRevokeAccess(user.email)}
                    disabled={pendingEmail === user.email}
                  >
                    {pendingEmail === user.email ? "Removing..." : "Remove"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="feature-rollouts-card">
          <div className="feature-rollouts-section-header">
            <h3>Search Users</h3>
            <p>Search Cognito users by email and grant access individually.</p>
          </div>

          <div className="feature-rollouts-search">
            <input
              type="text"
              className="feature-rollouts-search-input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by email"
            />
            <button
              className="action-button refresh-button"
              onClick={handleSearchUsers}
              disabled={searchingUsers}
            >
              {searchingUsers ? "Searching..." : "Search"}
            </button>
          </div>

          {sortedResults.length === 0 ? (
            <p className="feature-rollouts-empty">
              Search for users to grant or revoke AI search beta access.
            </p>
          ) : (
            <div className="feature-rollouts-list">
              {sortedResults.map((user) => (
                <div key={user.email} className="feature-rollouts-list-item">
                  <div>
                    <div className="feature-rollouts-email">{user.email}</div>
                    <div className="feature-rollouts-detail">
                      {user.status}
                      {user.roles.length > 0 ? ` • Roles: ${user.roles.join(", ")}` : ""}
                    </div>
                  </div>
                  {user.hasAccess ? (
                    <button
                      className="feature-rollouts-secondary-button"
                      onClick={() => handleRevokeAccess(user.email)}
                      disabled={pendingEmail === user.email}
                    >
                      {pendingEmail === user.email ? "Removing..." : "Remove"}
                    </button>
                  ) : (
                    <button
                      className="feature-rollouts-primary-button"
                      onClick={() => handleGrantAccess(user.email)}
                      disabled={pendingEmail === user.email}
                    >
                      {pendingEmail === user.email ? "Granting..." : "Grant Access"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default FeatureRolloutsTab;
