import { Controller, Get, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';

@Controller('auth')
@ApiExcludeController()
export class AuthViewController {
  @Get('login')
  getLoginPage(@Res() res: Response): void {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>ULE — Sign In to Authorize MCP Access</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 2rem; max-width: 400px; width: 100%; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
    h1 { font-size: 1.25rem; margin-top: 0; margin-bottom: 0.5rem; color: #38bdf8; }
    p { font-size: 0.875rem; color: #94a3b8; margin-bottom: 1.5rem; }
    .field { margin-bottom: 1rem; }
    label { display: block; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #cbd5e1; margin-bottom: 0.25rem; }
    input { width: 100%; box-sizing: border-box; padding: 0.5rem 0.75rem; background: #0f172a; border: 1px solid #475569; border-radius: 4px; color: #f8fafc; font-size: 0.875rem; }
    button { width: 100%; padding: 0.625rem; background: #2563eb; color: white; border: none; border-radius: 4px; font-weight: 600; cursor: pointer; margin-top: 0.5rem; }
    button:hover { background: #1d4ed8; }
    .error { color: #f87171; font-size: 0.75rem; margin-top: 0.5rem; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Sign In to ULE</h1>
    <p>An external application is requesting authorization to connect via Model Context Protocol (MCP).</p>
    <form id="loginForm">
      <div class="field">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required placeholder="creator@ule.internal" />
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required />
      </div>
      <button type="submit" id="submitBtn">Sign In</button>
      <div id="errorMsg" class="error"></div>
    </form>
  </div>
  <script>
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('errorMsg');
      err.style.display = 'none';
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      try {
        const res = await fetch('/api/v1/auth/sign-in/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || 'Invalid credentials');
        }
        const params = new URLSearchParams(window.location.search);
        const redirect = params.get('redirect') || '/api/v1/auth/oauth2/authorize' + window.location.search;
        window.location.href = redirect;
      } catch (e) {
        err.textContent = e.message;
        err.style.display = 'block';
      }
    });
  </script>
</body>
</html>`);
  }

  @Get('consent')
  getConsentPage(@Res() res: Response): void {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>ULE — Authorize MCP Application</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 2rem; max-width: 440px; width: 100%; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
    h1 { font-size: 1.25rem; margin-top: 0; margin-bottom: 0.5rem; color: #38bdf8; }
    p { font-size: 0.875rem; color: #94a3b8; margin-bottom: 1.5rem; }
    .scopes-list { background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 1rem; margin-bottom: 1.5rem; }
    .scope-item { display: flex; align-items: flex-start; margin-bottom: 0.75rem; font-size: 0.875rem; }
    .scope-item:last-child { margin-bottom: 0; }
    .scope-badge { background: #0369a1; color: #e0f2fe; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.75rem; font-family: monospace; margin-right: 0.5rem; }
    .actions { display: flex; gap: 0.75rem; }
    button { flex: 1; padding: 0.625rem; border-radius: 4px; font-weight: 600; cursor: pointer; border: none; }
    .btn-allow { background: #2563eb; color: white; }
    .btn-allow:hover { background: #1d4ed8; }
    .btn-deny { background: #475569; color: #cbd5e1; }
    .btn-deny:hover { background: #334155; }
    .error { color: #f87171; font-size: 0.75rem; margin-top: 0.5rem; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Authorize Application</h1>
    <p>An external MCP client is requesting permission to access your private course authoring workspace on ULE.</p>
    <div class="scopes-list">
      <div class="scope-item">
        <span class="scope-badge">course:read</span>
        <div>View private courses, drafts, Activity Block schemas, and immutable versions.</div>
      </div>
      <div class="scope-item">
        <span class="scope-badge">course:write</span>
        <div>Create private courses, add, edit, reorder, or delete draft blocks, and create immutable versions.</div>
      </div>
    </div>
    <div class="actions">
      <button type="button" class="btn-deny" id="denyBtn">Deny</button>
      <button type="button" class="btn-allow" id="allowBtn">Authorize</button>
    </div>
    <div id="errorMsg" class="error"></div>
  </div>
  <script>
    async function submitConsent(accept) {
      const err = document.getElementById('errorMsg');
      err.style.display = 'none';
      try {
        const res = await fetch('/api/v1/auth/oauth2/consent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accept, scope: 'course:read course:write' }),
        });
        const data = await res.json().catch(() => ({}));
        if (data && data.url) {
          window.location.href = data.url;
        } else if (!res.ok) {
          throw new Error(data.message || 'Consent request failed');
        }
      } catch (e) {
        err.textContent = e.message;
        err.style.display = 'block';
      }
    }
    document.getElementById('allowBtn').addEventListener('click', () => submitConsent(true));
    document.getElementById('denyBtn').addEventListener('click', () => submitConsent(false));
  </script>
</body>
</html>`);
  }
}
