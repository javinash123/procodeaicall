import type { User, InsertUser, Lead, InsertLead, Campaign, InsertCampaign, Appointment, InsertAppointment } from "@shared/schema";

const getApiBase = () => {
  if (typeof window !== 'undefined') {
    const basePath = import.meta.env.BASE_URL || '/';
    return basePath.endsWith('/') ? `${basePath}api` : `${basePath}/api`;
  }
  return '/api';
};

const API_BASE = getApiBase();

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message || "Request failed");
  }
  return response.json();
}

// Auth API
export const authApi = {
  login: async (email: string, password: string): Promise<User> => {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      credentials: "include",
    });
    const data = await handleResponse<{ user: User }>(response);
    return data.user;
  },

  register: async (data: InsertUser): Promise<User> => {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      credentials: "include",
    });
    const result = await handleResponse<{ user: User }>(response);
    return result.user;
  },

  logout: async (): Promise<void> => {
    const response = await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    await handleResponse(response);
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await fetch(`${API_BASE}/auth/me`, {
      credentials: "include",
    });
    const data = await handleResponse<{ user: User }>(response);
    return data.user;
  },
};

// Users API (Admin)
export const usersApi = {
  getAll: async (): Promise<User[]> => {
    const response = await fetch(`${API_BASE}/users`, {
      credentials: "include",
    });
    const data = await handleResponse<{ users: User[] }>(response);
    return data.users;
  },

  getById: async (id: string): Promise<User> => {
    const response = await fetch(`${API_BASE}/users/${id}`, {
      credentials: "include",
    });
    const data = await handleResponse<{ user: User }>(response);
    return data.user;
  },

  update: async (id: string, data: Partial<User>): Promise<User> => {
    const response = await fetch(`${API_BASE}/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      credentials: "include",
    });
    const result = await handleResponse<{ user: User }>(response);
    return result.user;
  },

  delete: async (id: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/users/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    await handleResponse(response);
  },
};

// Leads API
export const leadsApi = {
  getAll: async (): Promise<Lead[]> => {
    const response = await fetch(`${API_BASE}/leads`, {
      credentials: "include",
    });
    const data = await handleResponse<{ leads: Lead[] }>(response);
    return data.leads;
  },

  getById: async (id: string): Promise<Lead> => {
    const response = await fetch(`${API_BASE}/leads/${id}`, {
      credentials: "include",
    });
    const data = await handleResponse<{ lead: Lead }>(response);
    return data.lead;
  },

  create: async (data: InsertLead): Promise<Lead> => {
    const response = await fetch(`${API_BASE}/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      credentials: "include",
    });
    const result = await handleResponse<{ lead: Lead }>(response);
    return result.lead;
  },

  update: async (id: string, data: Partial<InsertLead>): Promise<Lead> => {
    const response = await fetch(`${API_BASE}/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      credentials: "include",
    });
    const result = await handleResponse<{ lead: Lead }>(response);
    return result.lead;
  },

  delete: async (id: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/leads/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    await handleResponse(response);
  },

  addHistory: async (id: string, historyItem: any): Promise<Lead> => {
    const response = await fetch(`${API_BASE}/leads/${id}/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(historyItem),
      credentials: "include",
    });
    const result = await handleResponse<{ lead: Lead }>(response);
    return result.lead;
  },
};

// Campaigns API
export const campaignsApi = {
  getAll: async (): Promise<Campaign[]> => {
    const response = await fetch(`${API_BASE}/campaigns`, {
      credentials: "include",
    });
    const data = await handleResponse<{ campaigns: Campaign[] }>(response);
    return data.campaigns;
  },

  getById: async (id: string): Promise<Campaign> => {
    const response = await fetch(`${API_BASE}/campaigns/${id}`, {
      credentials: "include",
    });
    const data = await handleResponse<{ campaign: Campaign }>(response);
    return data.campaign;
  },

  create: async (data: InsertCampaign): Promise<Campaign> => {
    const response = await fetch(`${API_BASE}/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      credentials: "include",
    });
    const result = await handleResponse<{ campaign: Campaign }>(response);
    return result.campaign;
  },

  update: async (id: string, data: Partial<InsertCampaign>): Promise<Campaign> => {
    const response = await fetch(`${API_BASE}/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      credentials: "include",
    });
    const result = await handleResponse<{ campaign: Campaign }>(response);
    return result.campaign;
  },

  delete: async (id: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/campaigns/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    await handleResponse(response);
  },
};

// File Upload API
export type UploadedFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  uploadedAt: Date;
};

export const uploadApi = {
  uploadFiles: async (files: File[]): Promise<UploadedFile[]> => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });

    const response = await fetch(`${API_BASE}/upload`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    const result = await handleResponse<{ files: UploadedFile[] }>(response);
    return result.files;
  },

  deleteFile: async (filename: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/upload/${filename}`, {
      method: "DELETE",
      credentials: "include",
    });
    await handleResponse(response);
  },
};

// Appointments API
export const appointmentsApi = {
  getAll: async (): Promise<Appointment[]> => {
    const response = await fetch(`${API_BASE}/appointments`, {
      credentials: "include",
    });
    const data = await handleResponse<{ appointments: Appointment[] }>(response);
    return data.appointments;
  },

  getById: async (id: string): Promise<Appointment> => {
    const response = await fetch(`${API_BASE}/appointments/${id}`, {
      credentials: "include",
    });
    const data = await handleResponse<{ appointment: Appointment }>(response);
    return data.appointment;
  },

  create: async (data: InsertAppointment): Promise<Appointment> => {
    const response = await fetch(`${API_BASE}/appointments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      credentials: "include",
    });
    const result = await handleResponse<{ appointment: Appointment }>(response);
    return result.appointment;
  },

  update: async (id: string, data: Partial<InsertAppointment>): Promise<Appointment> => {
    const response = await fetch(`${API_BASE}/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      credentials: "include",
    });
    const result = await handleResponse<{ appointment: Appointment }>(response);
    return result.appointment;
  },

  delete: async (id: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/appointments/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    await handleResponse(response);
  },
};

// Settings API
export const settingsApi = {
  get: async (): Promise<{ settings: any; subscription: any }> => {
    const response = await fetch(`${API_BASE}/settings`, {
      credentials: "include",
    });
    return handleResponse<{ settings: any; subscription: any }>(response);
  },

  update: async (data: any): Promise<{ settings: any }> => {
    const response = await fetch(`${API_BASE}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      credentials: "include",
    });
    return handleResponse<{ settings: any }>(response);
  },

  changePassword: async (userId: string, currentPassword: string, newPassword: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/users/${userId}/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
      credentials: "include",
    });
    await handleResponse(response);
  },
};
