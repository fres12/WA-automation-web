const loginForm = document.getElementById('loginForm');
const loginButton = document.getElementById('loginButton');
const loginError = document.getElementById('loginError');

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';
  loginButton.disabled = true;
  loginButton.textContent = 'Memeriksa...';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Login gagal.');
    }

    window.location.assign(data.profile.role === 'admin' ? '/wa-status' : '/dashboard');
  } catch (error) {
    loginError.textContent = error.message;
    loginButton.disabled = false;
    loginButton.textContent = 'Masuk';
  }
});
