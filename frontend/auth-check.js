export async function checkAuth() {
  try {
    const response = await fetch('/api/auth/me');
    const data = await response.json();
    if (!response.ok || !data.success) {
      window.location.assign('/login');
      return null;
    }
    return data;
  } catch (error) {
    window.location.assign('/login');
    return null;
  }
}
