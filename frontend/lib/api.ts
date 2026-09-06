// lib/api.ts
// FINAL — Stable JWT API Client with Auto Token & Error Handling

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

const API_BASE = "/api";
//const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

// --- TOKEN HANDLER ---

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function setToken(token: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("token", token);
  }
}

export function clearToken() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("token");
    localStorage.removeItem("read_only");
  }
}

// --- INTERNAL REQUEST WRAPPER ---
async function request<T>(
  method: HttpMethod,
  url: string,
  body?: any
): Promise<T> {
  if (method !== "GET" && url !== "/login" && isReadOnly()) {
    throw new Error("Akun ini read-only, tidak bisa mengubah data.");
  }

  const token = getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token && url !== "/login") {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // AUTO-HANDLE UNAUTHORIZED
  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }

  // Handle no-content responses
  if (res.status === 204) {
    return "" as T;
  }

  // Try to parse JSON safely
  let responseData: any = null;
  const rawText = await res.text();

  try {
    responseData = rawText ? JSON.parse(rawText) : null;
  } catch {
    responseData = rawText;
  }

  if (!res.ok) {
    const msg =
      typeof responseData === "string"
        ? responseData
        : responseData?.error ||
          responseData?.message ||
          "API request failed";
    throw new Error(msg);
  }

  return responseData as T;
}

// --- PUBLIC API FUNCTIONS ---
export async function apiGet<T>(url: string): Promise<T> {
  return request<T>("GET", url);
}

export async function apiPost<T>(url: string, body?: any): Promise<T> {
  return request<T>("POST", url, body);
}

export async function apiPut<T>(url: string, body?: any): Promise<T> {
  return request<T>("PUT", url, body);
}

export async function apiDelete<T>(url: string): Promise<T> {
  return request<T>("DELETE", url);
}

// --- LOGIN & LOGOUT HELPERS ---

export type LoginResponse = {
  token: string;
  role: string;
  division: string;
  username: string;
  read_only: boolean;
};

// --- READ-ONLY GUARD ---
// Read-only accounts exist purely to share dashboards with people outside
// the team (e.g. for analysis). Block writes on the client as a first line
// of defense - the backend enforces this regardless.
export function isReadOnly(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("read_only") === "true";
}

export async function login(
  username: string,
  password: string
): Promise<LoginResponse> {
  clearToken();
  const res = await apiPost<LoginResponse>("/login", { username, password });

  setToken(res.token);
  return res;
}

export function logout() {
  clearToken();
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
}

// --- USERS API ---
export async function apiGetUsers() {
  return apiGet<any[]>("/users"); // explicit array return
}

export async function apiCreateUser(payload: any) {
  return apiPost("/users", payload);
}

export async function apiUpdateUser(id: number, payload: any) {
  return apiPut(`/users/${id}`, payload);
}

export async function apiDeleteUser(id: number) {
  return apiDelete(`/users/${id}`);
}


export async function apiGetBlob(url: string): Promise<Blob> {
  const token = getToken();

  const headers: Record<string, string> = {};
  if (token && url !== "/login") {
    headers["Authorization"] = `Bearer ${token}`;
  }

  console.log("[API REQUEST]", `${API_BASE}${url}`);

  const res = await fetch(`${API_BASE}${url}`, {
    method: "GET",
    headers,
  });

  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    // coba baca text error
    const msg = await res.text();
    throw new Error(msg || "Export failed");
  }

  return await res.blob();
}


export async function apiGetProjectPipelineSummary(query = "") {
  return apiGet(`/projects/pipeline/summary${query}`);
}

export async function apiGetProjectPipelineDetails(query = "") {
  return apiGet(`/projects/pipeline/details${query}`);
}

export async function apiGetProjectSPHSummary(query = "") {
  return apiGet(`/projects/sph/summary${query}`);
}

export async function apiGetProjectSPHDetails(query = "") {
  return apiGet(`/projects/sph/details${query}`);
}

