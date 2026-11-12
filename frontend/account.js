const accountError = document.getElementById('accountError');
const logoutButton = document.getElementById('logoutButton');
const profileUsername = document.getElementById('profileUsername');
const profileEmail = document.getElementById('profileEmail');

async function loadProfile() {
  try {
    const response = await fetch('/api/auth/me');
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Gagal memuat profil akun.');
    profileUsername.textContent = data.profile.username || '-';
    profileEmail.textContent = data.profile.email || data.user.email || '-';
  } catch (error) {
    accountError.textContent = error.message;
  }
}

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  logoutButton.textContent = 'Keluar...';
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } finally {
    window.location.assign('/login');
  }
});

loadProfile();
