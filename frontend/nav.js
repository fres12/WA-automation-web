const navTarget = document.querySelector('[data-app-nav]');

if (navTarget) {
  const currentPath = window.location.pathname;
  const activePath = currentPath;

  navTarget.innerHTML = `
    <nav class="app-nav" aria-label="Navigasi utama">
      <a class="brand" href="/home">WA <span>Automation</span></a>
      <div class="nav-links">
        <a data-nav-path="/dashboard" href="/dashboard">Home</a>
        <a data-nav-path="/form" href="/form">Form</a>
        <a data-nav-path="/wa-status" href="/wa-status">WA Status</a>
        <a data-nav-path="/account" href="/account">Akun</a>
      </div>
    </nav>
  `;

  navTarget.querySelector(`[data-nav-path="${activePath}"]`)?.classList.add('active');
}
