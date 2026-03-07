import {
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || "us-east-1",
});

const USER_POOL_ID = process.env.USER_POOL_ID;
const ALLOWED_ROLE_PRESETS = new Map([
  ["user", ["User"]],
  ["admin", ["Admin"]],
  ["developer", ["Developer"]],
  ["admin-developer", ["Admin", "Developer"]],
]);

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "OPTIONS,GET,PATCH",
  "Content-Type": "application/json",
};

export const handler = async (event) => {
  try {
    if (event.requestContext?.http?.method === "OPTIONS") {
      return respond(200, {});
    }

    if (!USER_POOL_ID) {
      return respond(500, { message: "User management is not configured" });
    }

    const userContext = getUserContext(event);
    requireDeveloperManager(userContext.roles);

    const method = event.requestContext?.http?.method || "GET";

    if (method === "GET") {
      const users = await listUsers();
      return respond(200, { users });
    }

    if (method === "PATCH") {
      const username = decodeURIComponent(event.pathParameters?.username || "").trim();
      const rolePreset = String(parseBody(event.body).rolePreset || "").trim().toLowerCase();
      const nextRoles = ALLOWED_ROLE_PRESETS.get(rolePreset);

      if (!username) {
        return respond(400, { message: "Username is required" });
      }

      if (!nextRoles) {
        return respond(400, { message: "rolePreset must be one of: user, admin, developer, admin-developer" });
      }

      await cognitoClient.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: USER_POOL_ID,
          Username: username,
          UserAttributes: [
            {
              Name: "custom:role",
              Value: JSON.stringify(nextRoles),
            },
          ],
        })
      );

      return respond(200, {
        username,
        roles: nextRoles,
      });
    }

    return respond(405, { message: "Method not allowed" });
  } catch (error) {
    console.error("User management error:", error);
    return respond(error?.statusCode || 500, {
      message: error?.message || "User management request failed",
    });
  }
};

function parseBody(body) {
  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function parseRoles(rawRoles) {
  if (Array.isArray(rawRoles)) {
    return rawRoles.filter((role) => typeof role === "string");
  }

  if (typeof rawRoles !== "string" || rawRoles.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawRoles);
    return Array.isArray(parsed)
      ? parsed.filter((role) => typeof role === "string")
      : [];
  } catch {
    return [rawRoles];
  }
}

function getUserContext(event) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
  return {
    roles: parseRoles(claims["custom:role"]),
  };
}

function hasAllRoles(roles, requiredRoles) {
  const roleSet = new Set(roles);
  return requiredRoles.every((role) => roleSet.has(role));
}

function requireDeveloperManager(roles) {
  if (!hasAllRoles(roles, ["Admin", "Developer"])) {
    const error = new Error("User is not authorized to manage users");
    error.statusCode = 403;
    throw error;
  }
}

async function listUsers() {
  const response = await cognitoClient.send(
    new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      Limit: 100,
    })
  );

  return (response.Users || [])
    .map((user) => mapCognitoUser(user))
    .filter((user) => Boolean(user.email))
    .sort((a, b) => a.email.localeCompare(b.email));
}

function mapCognitoUser(user) {
  const attributes = Object.fromEntries(
    (user.Attributes || []).map((attribute) => [attribute.Name, attribute.Value || ""])
  );

  return {
    username: user.Username || "",
    email: String(attributes.email || "").trim().toLowerCase(),
    status: user.UserStatus || "UNKNOWN",
    enabled: user.Enabled !== false,
    roles: parseRoles(attributes["custom:role"]),
  };
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}
