const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export function getApiUrl() {
  return API_URL;
}

export function resolveImageUrl(path) {
  if (!path) return '';

  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('data:')
  ) {
    return path;
  }

  if (path.startsWith('/')) {
    return path;
  }

  return `/${path}`;
}

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem('sushi_token');

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({
    ok: false,
    message: 'Respuesta inválida del servidor'
  }));

  if (!response.ok) {
    throw new Error(data.message || 'Error en la petición');
  }

  return data;
}
