// ============================================================
// auth.js — handles Signup and Login page logic
// ============================================================

// Base URL of the backend API. Set in js/config.js.
const API_BASE_URL = window.APP_CONFIG.API_BASE_URL;

function setFieldError(groupEl, hasError) {
  groupEl.classList.toggle('has-error', hasError);
}

function showAlert(alertEl, message, type = 'error') {
  alertEl.textContent = message;
  alertEl.className = `alert alert-${type} show`;
}

function hideAlert(alertEl) {
  alertEl.classList.remove('show');
}

function setButtonLoading(btn, isLoading) {
  btn.disabled = isLoading;
  btn.classList.toggle('loading', isLoading);
}

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;

// ---------------- SIGNUP ----------------
const signupForm = document.getElementById('signupForm');
if (signupForm) {
  const alertBox = document.getElementById('alertBox');
  const nameInput = document.getElementById('name');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const signupBtn = document.getElementById('signupBtn');

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(alertBox);

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    let isValid = true;

    const nameValid = name.length > 0;
    setFieldError(document.getElementById('nameGroup'), !nameValid);
    if (!nameValid) isValid = false;

    const emailValid = EMAIL_REGEX.test(email);
    setFieldError(document.getElementById('emailGroup'), !emailValid);
    if (!emailValid) isValid = false;

    const passwordValid = password.length >= 6;
    setFieldError(document.getElementById('passwordGroup'), !passwordValid);
    if (!passwordValid) isValid = false;

    if (!isValid) return;

    setButtonLoading(signupBtn, true);

    try {
      const response = await fetch(`${API_BASE_URL}/user/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        showAlert(alertBox, data.message || 'Signup failed. Please try again.', 'error');
        return;
      }

      showAlert(alertBox, 'Account created! Redirecting to login...', 'success');
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 1200);
    } catch (error) {
      showAlert(alertBox, 'Could not reach the server. Is the backend running?', 'error');
    } finally {
      setButtonLoading(signupBtn, false);
    }
  });
}

// ---------------- LOGIN ----------------
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  const alertBox = document.getElementById('alertBox');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const loginBtn = document.getElementById('loginBtn');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(alertBox);

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    let isValid = true;

    const emailValid = EMAIL_REGEX.test(email);
    setFieldError(document.getElementById('emailGroup'), !emailValid);
    if (!emailValid) isValid = false;

    const passwordValid = password.length > 0;
    setFieldError(document.getElementById('passwordGroup'), !passwordValid);
    if (!passwordValid) isValid = false;

    if (!isValid) return;

    setButtonLoading(loginBtn, true);

    try {
      const response = await fetch(`${API_BASE_URL}/user/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        showAlert(alertBox, data.message || 'Login failed. Please check your credentials.', 'error');
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      window.location.href = 'dashboard.html';
    } catch (error) {
      showAlert(alertBox, 'Could not reach the server. Is the backend running?', 'error');
    } finally {
      setButtonLoading(loginBtn, false);
    }
  });
}
