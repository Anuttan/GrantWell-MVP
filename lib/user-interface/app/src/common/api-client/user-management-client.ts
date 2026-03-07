import { Utils } from '../utils';
import { AppConfig } from '../types/app';
import type {
  CurrentFeatureRolloutAccess,
  FeatureRolloutConfig,
  FeatureRolloutMode,
  FeatureRolloutSearchResponse,
} from "../types/feature-rollout";

export class UserManagementClient {
  private readonly baseUrl: string;

  constructor(appConfig: AppConfig) {
    this.baseUrl = appConfig.httpEndpoint.replace(/\/+$/, "");
  }

  private async getAuthHeaders() {
    const token = await Utils.authenticate();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }

  // Invites a new user to the application
  async inviteUser(email: string) {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.baseUrl}/user-management/invite-user`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email })
      });
  
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || `Error: ${response.status}`);
      }
  
      return data;
    } catch (error) {
      console.error('Error inviting user:', error);
      throw error;
    }
  }

  async getCurrentFeatureAccess(): Promise<CurrentFeatureRolloutAccess> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/feature-rollouts/me`, {
      method: "GET",
      headers,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Error: ${response.status}`);
    }

    return data;
  }

  async getFeatureRollout(featureKey: string): Promise<FeatureRolloutConfig> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/feature-rollouts/${encodeURIComponent(featureKey)}`, {
      method: "GET",
      headers,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Error: ${response.status}`);
    }

    return data;
  }

  async updateFeatureRollout(featureKey: string, mode: FeatureRolloutMode): Promise<FeatureRolloutConfig> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.baseUrl}/feature-rollouts/${encodeURIComponent(featureKey)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ mode }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Error: ${response.status}`);
    }

    return data;
  }

  async searchFeatureRolloutUsers(featureKey: string, query: string): Promise<FeatureRolloutSearchResponse> {
    const headers = await this.getAuthHeaders();
    const url = new URL(`${this.baseUrl}/feature-rollouts/${encodeURIComponent(featureKey)}/users`);
    if (query.trim().length > 0) {
      url.searchParams.set("query", query.trim());
    }

    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Error: ${response.status}`);
    }

    return data;
  }

  async grantFeatureRolloutUser(featureKey: string, email: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(
      `${this.baseUrl}/feature-rollouts/${encodeURIComponent(featureKey)}/users/${encodeURIComponent(email)}`,
      {
        method: "PUT",
        headers,
      }
    );

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Error: ${response.status}`);
    }

    return data;
  }

  async revokeFeatureRolloutUser(featureKey: string, email: string) {
    const headers = await this.getAuthHeaders();
    const response = await fetch(
      `${this.baseUrl}/feature-rollouts/${encodeURIComponent(featureKey)}/users/${encodeURIComponent(email)}`,
      {
        method: "DELETE",
        headers,
      }
    );

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Error: ${response.status}`);
    }

    return data;
  }
} 
