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
  }
}

// --- INTERNAL REQUEST WRAPPER ---
async function request<T>(
  method: HttpMethod,
  url: string,
  body?: any
): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
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
};

export async function login(
  username: string,
  password: string
): Promise<LoginResponse> {
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
