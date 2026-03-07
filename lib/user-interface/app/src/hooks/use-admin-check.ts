import { useState, useEffect } from "react";
import { Auth } from "aws-amplify";
import { hasRole, parseRoleClaim } from "../common/helpers/auth-roles";

/**
 * Checks whether the current authenticated user has the Admin role.
 *
 * Reads `custom:role` from the Cognito ID token.
 *
 * @returns `{ isAdmin, isDeveloper, roles, loading }` — `loading` is `true` while the
 * check is in progress.
 */
export function useAdminCheck(): {
  isAdmin: boolean;
  isDeveloper: boolean;
  roles: string[];
  loading: boolean;
} {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const checkAdmin = async () => {
      try {
        const result = await Auth.currentAuthenticatedUser();
        const parsedRoles = parseRoleClaim(
          result?.signInUserSession?.idToken?.payload["custom:role"]
        );
        if (!cancelled) {
          setRoles(parsedRoles);
          setIsAdmin(hasRole(parsedRoles, "Admin"));
          setIsDeveloper(hasRole(parsedRoles, "Developer"));
        }
      } catch {
        if (!cancelled) {
          setIsAdmin(false);
          setIsDeveloper(false);
          setRoles([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    checkAdmin();

    return () => {
      cancelled = true;
    };
  }, []);

  return { isAdmin, isDeveloper, roles, loading };
}

export default useAdminCheck;
