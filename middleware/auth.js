function createAuthMiddleware({ supabaseUrl, anonKey, serviceRoleKey }) {
  function parseCookies(req) {
    return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((part) => {
      const separator = part.indexOf('=');
      const name = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      return [name, decodeURIComponent(value)];
    }));
  }

  async function getAuthContext(req) {
    const accessToken = parseCookies(req).wa_access_token;
    if (!accessToken) return null;

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` }
    });
    if (!userResponse.ok) return null;
    const user = await userResponse.json();
    if (!user?.id) return null;

    const profileKey = serviceRoleKey || anonKey;
    const profileResponse = await fetch(
      `${supabaseUrl}/rest/v1/profiles?select=id,email,username,role&id=eq.${encodeURIComponent(user.id)}`,
      { headers: { apikey: profileKey, Authorization: `Bearer ${profileKey}` } }
    );
    const profiles = await profileResponse.json();
    if (!profileResponse.ok || !profiles[0]) return null;
    return { user, profile: profiles[0] };
  }

  async function requirePageAuth(req, res, next) {
    try {
      const auth = await getAuthContext(req);
      if (!auth) return res.redirect('/login');
      req.auth = auth;
      next();
    } catch (error) {
      console.error('Auth middleware error:', error.message);
      res.redirect('/login');
    }
  }

  async function requireAdmin(req, res, next) {
    await requirePageAuth(req, res, () => {
      if (req.auth.profile.role !== 'admin') return res.redirect('/home');
      next();
    });
  }

  async function requireApiAuth(req, res, next) {
    try {
      const auth = await getAuthContext(req);
      if (!auth) return res.status(401).json({ success: false, error: 'Sesi login tidak valid.' });
      req.auth = auth;
      next();
    } catch (error) {
      console.error('API auth middleware error:', error.message);
      res.status(401).json({ success: false, error: 'Sesi login tidak valid.' });
    }
  }

  async function requireAdminApi(req, res, next) {
    await requireApiAuth(req, res, () => {
      if (req.auth.profile.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Akses admin diperlukan.' });
      }
      next();
    });
  }

  function requireProtectedStatic(req, res, next) {
    const pathname = decodeURIComponent(req.path);
    if (pathname === '/WA status.html') return requirePageAuth(req, res, next);
    if (['/index.html', '/dashboard.html', '/account.html'].includes(pathname)) {
      return requirePageAuth(req, res, next);
    }
    next();
  }

  return { getAuthContext, requirePageAuth, requireAdmin, requireApiAuth, requireAdminApi, requireProtectedStatic };
}

module.exports = { createAuthMiddleware };
