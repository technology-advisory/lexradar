const CONFIG = {
  API_BASE_URL: "https://lexradar-api.jolly-lab-c60a.workers.dev",
  DEFAULT_MAX_RESULTS: 10,
  HARD_MAX_RESULTS: 20,
  ENABLE_DEMO_MODE: false,
  STORAGE_KEYS: {
    history: "lexradar.history.v1",
    favorites: "lexradar.favorites.v1",
    theme: "lexradar.theme.v1",
    session: "lexradar.session.v1",
    quota: "lexradar.quota.v1",
    customUsers: "lexradar.customPasswords.v1",
    extraUsers: "lexradar.extraUsers.v1",
    userOverrides: "lexradar.userOverrides.v1"
  },
  USERS_URL: "data/users.json",
  USER_HASH_PEPPER: "lexradar-local-beta-v2",
  DEFAULT_WEEKLY_LIMIT: 5,
  SESSION_TTL_MS: 8 * 60 * 60 * 1000
};

const demoResults = [
  {
    id: "demo-1",
    source: "CENDOJ",
    date: "2026-06-18",
    court: "Tribunal Supremo · Sala Civil",
    jurisdiction: "Civil",
    identifier: "ECLI:ES:TS:2026:0000 / STS 0000/2026",
    ecli: "ECLI:ES:TS:2026:0000",
    roj: "STS 0000/2026",
    title: "Resultado demo · requisitos de transparencia",
    summary: "Este resultado pertenece al modo demo. Desactiva ENABLE_DEMO_MODE para consultar el Worker real.",
    url: "https://www.poderjudicial.es"
  }
];

let currentResults = [];
let activeQuery = "";
let accountState = null;
let betaUsers = [];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const els = {
  form: $("#searchForm"),
  query: $("#queryInput"),
  source: $("#sourceSelect"),
  sourceChips: () => $$(".source-chip"),
  maxResults: $("#maxResultsSelect"),
  mode: () => document.querySelector('input[name="mode"]:checked')?.value || "search",
  account: $("#accountBox"),
  quota: $("#quotaBox"),
  status: $("#statusBox"),
  results: $("#resultsList"),
  resultsTitle: $("#resultsTitle"),
  resultsSubtitle: $("#resultsSubtitle"),
  count: $("#resultCount"),
  history: $("#historyList"),
  favorites: $("#favoritesList"),
  favoritesCounter: $("#favoritesCounter"),
  clearHistory: $("#clearHistoryBtn"),
  exportJson: $("#exportJsonBtn"),
  exportCsv: $("#exportCsvBtn"),
  dialog: $("#detailDialog"),
  detail: $("#detailContent"),
  closeDialog: $("#closeDialogBtn"),
  toast: $("#toast"),
  theme: $("#themeToggle"),
  loginOverlay: $("#loginOverlay"),
  loginForm: $("#loginForm"),
  loginEmail: $("#loginEmail"),
  loginPassword: $("#loginPassword"),
  loginError: $("#loginError"),
  accountToggle: $("#accountToggle"),
  accountMenu: $("#accountMenu"),
  accountName: $("#accountName"),
  accountMeta: $("#accountMeta"),
  accountAvatar: $("#accountAvatar"),
  passwordDialog: $("#passwordDialog"),
  passwordForm: $("#passwordForm"),
  createUserDialog: $("#createUserDialog"),
  createUserForm: $("#createUserForm")
};

init();

async function init() {
  document.body.classList.add("auth-loading");
  applySavedTheme();
  bindEvents();
  renderHistory();
  renderFavorites();
  renderEmptyState();
  syncSourceChips();
  updateModePlaceholder();
  await loadUsers();
  await loadAccount();
}

function bindEvents() {
  els.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await runSearch(els.query.value.trim());
  });

  $$("[data-query]").forEach((button) => {
    button.addEventListener("click", async () => {
      els.query.value = button.dataset.query;
      await runSearch(button.dataset.query);
    });
  });

  els.clearHistory.addEventListener("click", () => {
    localStorage.removeItem(CONFIG.STORAGE_KEYS.history);
    renderHistory();
    toast("Historial limpiado");
  });

  els.exportJson.addEventListener("click", () => exportJson());
  els.exportCsv.addEventListener("click", () => exportCsv());

  els.closeDialog.addEventListener("click", () => els.dialog.close());
  els.dialog.addEventListener("click", (event) => {
    if (event.target === els.dialog) els.dialog.close();
  });

  els.theme.addEventListener("click", toggleTheme);

  // Selector visual de fuente: CENDOJ / TJUE / Ambas
  els.sourceChips().forEach((button) => {
    button.addEventListener("click", () => {
      const source = button.dataset.source || "cendoj";
      els.source.value = source;
      syncSourceChips();
      toast(`Fuente seleccionada: ${sourceHumanLabel(source)}`);
    });
  });

  els.source?.addEventListener("change", syncSourceChips);

  $$('input[name="mode"]').forEach((radio) => {
    radio.addEventListener("change", updateModePlaceholder);
  });

  els.loginForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void loginWithLocalUser();
  });

  // Account dropdown toggle
  els.accountToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = !els.accountMenu.hidden;
    if (isOpen) {
      closeAccountMenu();
    } else {
      openAccountMenu();
    }
  });

  document.addEventListener("click", (event) => {
    if (!els.accountMenu || els.accountMenu.hidden) return;
    if (els.accountMenu.contains(event.target) || els.accountToggle.contains(event.target)) return;
    closeAccountMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAccountMenu();
  });

  // Close dialogs via [data-close-dialog]
  $$("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => {
      const dialog = document.getElementById(button.dataset.closeDialog);
      dialog?.close();
    });
  });

  // Password change form
  els.passwordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const newPassword = $("#pwdNew").value.trim();
    const confirmPassword = $("#pwdConfirm").value.trim();
    const errorBox = $("#pwdDialogError");

    if (newPassword.length < 4) {
      errorBox.hidden = false;
      errorBox.textContent = "La contraseña debe tener al menos 4 caracteres.";
      return;
    }
    if (newPassword !== confirmPassword) {
      errorBox.hidden = false;
      errorBox.textContent = "Las contraseñas no coinciden.";
      return;
    }

    const ok = await changePassword(newPassword);
    if (ok) {
      errorBox.hidden = true;
      els.passwordForm.reset();
      els.passwordDialog.close();
    } else {
      errorBox.hidden = false;
      errorBox.textContent = "No se pudo actualizar la contraseña.";
    }
  });

  // Create user form
  els.createUserForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = $("#newUserEmail").value.trim();
    const password = $("#newUserPassword").value.trim();
    const displayName = $("#newUserName").value.trim();
    const weeklyLimitRaw = $("#newUserLimit").value.trim();
    const errorBox = $("#createUserError");

    const ok = await createNewUser({ email, password, displayName, weeklyLimit: weeklyLimitRaw });
    if (ok) {
      errorBox.hidden = true;
      els.createUserForm.reset();
      els.createUserDialog.close();
    } else {
      errorBox.hidden = false;
      errorBox.textContent = "No se pudo crear el usuario. Revisa los datos.";
    }
  });

  // Edit user form (admin)
  $("#editUserForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const targetKey = $("#editUserKey").value;
    const email = $("#editUserEmail").value.trim();
    const password = $("#editUserPassword").value.trim();
    const displayName = $("#editUserName").value.trim();
    const weeklyLimitRaw = $("#editUserLimit").value.trim();
    const errorBox = $("#editUserError");

    const ok = await adminUpdateUser(targetKey, { email, password, displayName, weeklyLimit: weeklyLimitRaw });
    if (ok) {
      errorBox.hidden = true;
      $("#editUserDialog").close();
    } else {
      errorBox.hidden = false;
      errorBox.textContent = "No se pudo guardar. Revisa los datos.";
    }
  });
}

function openAccountMenu() {
  if (!els.accountMenu) return;
  els.accountMenu.hidden = false;
  els.accountToggle.setAttribute("aria-expanded", "true");
}

function closeAccountMenu() {
  if (!els.accountMenu) return;
  els.accountMenu.hidden = true;
  els.accountToggle.setAttribute("aria-expanded", "false");
}

async function loadUsers() {
  try {
    const response = await fetch(CONFIG.USERS_URL, { cache: "no-store" });
    const data = await response.json();
    betaUsers = Array.isArray(data.users) ? data.users : [];
  } catch (error) {
    console.warn("No se pudo cargar data/users.json; no hay usuarios locales disponibles.", error);
  }

  const extraUsers = readStorage(CONFIG.STORAGE_KEYS.extraUsers, []);
  if (Array.isArray(extraUsers) && extraUsers.length) {
    betaUsers = [...betaUsers, ...extraUsers];
  }

  const overrides = readStorage(CONFIG.STORAGE_KEYS.userOverrides, {});
  betaUsers = betaUsers.map((user) => {
    const key = user._key || user.emailHash;
    const patch = overrides[key];
    return patch ? { ...user, ...patch, _key: key } : { ...user, _key: key };
  });
}

function saveUserOverride(key, patch) {
  const overrides = readStorage(CONFIG.STORAGE_KEYS.userOverrides, {});
  overrides[key] = { ...(overrides[key] || {}), ...patch };
  localStorage.setItem(CONFIG.STORAGE_KEYS.userOverrides, JSON.stringify(overrides));
  betaUsers = betaUsers.map((u) => (u._key === key ? { ...u, ...patch } : u));
}

async function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function loginWithLocalUser() {
  const email = await normalizeEmail(els.loginEmail.value);
  const password = els.loginPassword.value;

  if (!email || !password) {
    els.loginError.hidden = false;
    els.loginError.textContent = "Introduce email y contraseña.";
    return;
  }

  const emailHash = await sha256(`${CONFIG.USER_HASH_PEPPER}:email:${email}`);
  const baseUser = betaUsers.find((item) => item.emailHash === emailHash);

  if (!baseUser) {
    els.loginError.hidden = false;
    els.loginError.textContent = "Email o contraseña incorrectos.";
    return;
  }

  const passwordHash = await sha256(`${CONFIG.USER_HASH_PEPPER}:password:${email}:${password}`);

  if (passwordHash !== baseUser.passwordHash) {
    els.loginError.hidden = false;
    els.loginError.textContent = "Email o contraseña incorrectos.";
    return;
  }

  const session = createSession({ ...baseUser, email, emailHash, userKey: baseUser._key });
  saveSession(session);
  els.loginError.hidden = true;
  els.loginOverlay.hidden = true;
  document.body.classList.remove("login-visible", "auth-loading");
  accountState = buildAccountState(session);
  renderAccount(accountState);
  toast("Sesión iniciada");
}

async function changePassword(newPassword) {
  const session = getSession();
  if (!session) return false;
  if (!newPassword || newPassword.length < 4) {
    toast("La contraseña debe tener al menos 4 caracteres");
    return false;
  }

  const passwordHash = await sha256(`${CONFIG.USER_HASH_PEPPER}:password:${session.username}:${newPassword}`);
  saveUserOverride(session.userKey, { passwordHash });
  toast("Contraseña actualizada");
  return true;
}

async function adminUpdateUser(targetKey, { email, password, displayName, weeklyLimit }) {
  const session = getSession();
  if (!session || session.role !== "admin") {
    toast("Solo un admin puede editar usuarios");
    return false;
  }

  const target = betaUsers.find((u) => u._key === targetKey);
  if (!target) {
    toast("Usuario no encontrado");
    return false;
  }

  const patch = {};

  if (email) {
    const normalizedEmail = await normalizeEmail(email);
    if (normalizedEmail && normalizedEmail !== target.email) {
      patch.email = normalizedEmail;
      patch.emailHash = await sha256(`${CONFIG.USER_HASH_PEPPER}:email:${normalizedEmail}`);
    }
  }

  if (password) {
    const emailForHash = patch.email || target.email;
    patch.passwordHash = await sha256(`${CONFIG.USER_HASH_PEPPER}:password:${emailForHash}:${password}`);
  }

  if (displayName) patch.displayName = displayName;
  if (weeklyLimit !== undefined) {
    patch.weeklyLimit = weeklyLimit === "" || weeklyLimit === null ? null : Number(weeklyLimit);
  }

  if (!Object.keys(patch).length) {
    toast("No hay cambios que guardar");
    return false;
  }

  saveUserOverride(targetKey, patch);

  // If admin edited their own account, refresh the active session
  if (session.userKey === targetKey) {
    const updated = betaUsers.find((u) => u._key === targetKey);
    const newSession = createSession({
      ...updated,
      email: updated.email || session.username,
      emailHash: updated.emailHash,
      userKey: targetKey
    });
    saveSession(newSession);
    accountState = buildAccountState(newSession);
    renderAccount(accountState);
  }

  toast("Usuario actualizado");
  return true;
}

async function createNewUser({ email, password, displayName, weeklyLimit }) {
  const session = getSession();
  if (!session || session.role !== "admin") {
    toast("Solo un admin puede crear usuarios");
    return false;
  }

  const normalizedEmail = await normalizeEmail(email);
  if (!normalizedEmail || !password) {
    toast("Email y contraseña son obligatorios");
    return false;
  }

  const emailHash = await sha256(`${CONFIG.USER_HASH_PEPPER}:email:${normalizedEmail}`);
  const passwordHash = await sha256(`${CONFIG.USER_HASH_PEPPER}:password:${normalizedEmail}:${password}`);

  const extraUsers = readStorage(CONFIG.STORAGE_KEYS.extraUsers, []);

  if (betaUsers.some((u) => u.emailHash === emailHash) || extraUsers.some((u) => u.emailHash === emailHash)) {
    toast("Ese usuario ya existe");
    return false;
  }

  const newUser = {
    email: normalizedEmail,
    emailHash,
    passwordHash,
    displayName: displayName || normalizedEmail.split("@")[0],
    weeklyLimit: weeklyLimit === "" || weeklyLimit === null ? null : Number(weeklyLimit),
    role: "beta",
    _key: emailHash
  };

  extraUsers.push(newUser);
  localStorage.setItem(CONFIG.STORAGE_KEYS.extraUsers, JSON.stringify(extraUsers));
  betaUsers.push(newUser);
  toast(`Usuario ${normalizedEmail} creado`);
  return true;
}

function createSession(user) {
  const now = Date.now();
  return {
    username: user.email,
    emailHash: user.emailHash,
    userKey: user.userKey || user._key || user.emailHash,
    displayName: user.displayName || user.email,
    weeklyLimit: user.weeklyLimit,
    role: user.role || "beta",
    createdAt: now,
    expiresAt: now + CONFIG.SESSION_TTL_MS
  };
}

function saveSession(session) {
  localStorage.setItem(CONFIG.STORAGE_KEYS.session, JSON.stringify(session));
}

async function loadAccount() {
  const session = getSession();
  if (!session) {
    showLogin();
    accountState = null;
    if (els.accountName) els.accountName.textContent = "Beta privada";
    if (els.accountMeta) els.accountMeta.textContent = "Inicia sesión";
    if (els.accountAvatar) els.accountAvatar.textContent = "··";
    if (els.accountMenu) els.accountMenu.innerHTML = "";
    els.quota.classList.remove("hidden");
    els.quota.innerHTML = `<strong>Acceso requerido</strong><span>Inicia sesión para consultar CENDOJ.</span>`;
    setSearchEnabled(false);
    finishAuthBoot();
    return;
  }

  els.loginOverlay.hidden = true;
  document.body.classList.remove("login-visible");
  accountState = buildAccountState(session);
  renderAccount(accountState);
  finishAuthBoot();
}

function finishAuthBoot() {
  document.body.classList.remove("auth-loading");
}

function showLogin() {
  if (els.loginOverlay) els.loginOverlay.hidden = false;
  document.body.classList.add("login-visible");
}

function getSession() {
  const session = readStorage(CONFIG.STORAGE_KEYS.session, null);
  if (!session || !session.username) return null;

  const now = Date.now();
  if (!session.expiresAt) {
    session.createdAt = session.createdAt || now;
    session.expiresAt = now + CONFIG.SESSION_TTL_MS;
    saveSession(session);
  }

  if (Number(session.expiresAt) <= now) {
    clearSession();
    return null;
  }

  return session;
}

function clearSession() {
  localStorage.removeItem(CONFIG.STORAGE_KEYS.session);
}

function logout() {
  clearSession();
  accountState = null;
  showLogin();
  renderAccount({ user: { username: "" }, quota: { limit: 0, used: 0, remaining: 0 } });
  setSearchEnabled(false);
}

function buildAccountState(session) {
  const quota = getQuotaForUser(session);
  return { ok: true, user: session, quota };
}

function getQuotaForUser(session) {
  const limit = session.weeklyLimit === null ? null : Number(session.weeklyLimit ?? CONFIG.DEFAULT_WEEKLY_LIMIT);
  const week = getWeekKey();
  const store = readStorage(CONFIG.STORAGE_KEYS.quota, {});
  const quotaKey = session.emailHash || session.username;
  const userQuota = store[quotaKey] || { week, used: 0 };
  const used = userQuota.week === week ? Number(userQuota.used || 0) : 0;
  return {
    limit,
    used,
    remaining: limit === null ? Infinity : Math.max(0, limit - used),
    week
  };
}

function incrementQuota() {
  const session = getSession();
  if (!session || session.weeklyLimit === null) return;
  const week = getWeekKey();
  const store = readStorage(CONFIG.STORAGE_KEYS.quota, {});
  const current = store[session.username]?.week === week ? Number(store[session.username].used || 0) : 0;
  store[session.username] = { week, used: current + 1 };
  localStorage.setItem(CONFIG.STORAGE_KEYS.quota, JSON.stringify(store));
}

function resetCurrentUserQuota() {
  const session = getSession();
  if (!session) return;
  const store = readStorage(CONFIG.STORAGE_KEYS.quota, {});
  delete store[session.username];
  localStorage.setItem(CONFIG.STORAGE_KEYS.quota, JSON.stringify(store));
  accountState = buildAccountState(session);
  renderAccount(accountState);
  toast("Contador semanal reseteado");
}

function initials(label) {
  const parts = String(label || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "··";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function renderAccount(data) {
  const user = data?.user || {};
  const label = user.displayName || user.username || "Usuario beta";
  const quota = data?.quota || { limit: CONFIG.DEFAULT_WEEKLY_LIMIT, used: 0, remaining: CONFIG.DEFAULT_WEEKLY_LIMIT };
  const quotaLabel = quota.limit === null ? "Sin límite" : `${quota.remaining}/${quota.limit} búsquedas`;
  const isAdmin = user.role === "admin";

  if (els.accountName) els.accountName.textContent = shorten(label, 20);
  if (els.accountMeta) els.accountMeta.textContent = shorten(user.username || "", 26);
  if (els.accountAvatar) els.accountAvatar.textContent = initials(label);

  const adminItems = isAdmin
    ? `
      <button class="account-menu-item" type="button" id="resetQuotaBtn">
        <svg class="account-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
        Reset contador
      </button>
      <button class="account-menu-item" type="button" id="createUserBtn">
        <svg class="account-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="16" y1="11" x2="22" y2="11"></line></svg>
        Nuevo usuario
      </button>
      <button class="account-menu-item" type="button" id="manageUsersBtn">
        <svg class="account-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
        Gestionar usuarios
      </button>
      <div class="account-menu-divider"></div>
    `
    : "";

  els.accountMenu.innerHTML = `
    <div class="account-menu-header">
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(user.username || "")} · ${escapeHtml(quotaLabel)}</span>
    </div>
    <button class="account-menu-item" type="button" id="changePasswordBtn">
      <svg class="account-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
      Cambiar contraseña
    </button>
    ${adminItems}
    <button class="account-menu-item danger" type="button" id="logoutBtn">
      <svg class="account-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
      Cerrar sesión
    </button>
  `;

  $("#logoutBtn")?.addEventListener("click", () => { closeAccountMenu(); logout(); });
  $("#resetQuotaBtn")?.addEventListener("click", () => { closeAccountMenu(); resetCurrentUserQuota(); });
  $("#changePasswordBtn")?.addEventListener("click", () => { closeAccountMenu(); openChangePasswordDialog(); });
  $("#createUserBtn")?.addEventListener("click", () => { closeAccountMenu(); openCreateUserDialog(); });
  $("#manageUsersBtn")?.addEventListener("click", () => { closeAccountMenu(); openManageUsersDialog(); });

  els.quota.classList.remove("hidden");
  els.quota.classList.add("session-strip");
  const roleBadge = isAdmin ? `<span class="session-role-badge admin">Admin</span>` : `<span class="session-role-badge">Beta</span>`;
  els.quota.innerHTML = `
    <span class="session-strip-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
    </span>
    <span class="session-strip-text">
      <strong>${escapeHtml(user.username || label)}</strong>
      <span>${escapeHtml(quotaLabel)}</span>
    </span>
    ${roleBadge}
  `;

  setSearchEnabled(quota.limit === null || quota.remaining > 0);
}

function openChangePasswordDialog() {
  const session = getSession();
  const emailField = $("#pwdCurrentEmail");
  if (emailField && session) emailField.value = session.username;
  const errorBox = $("#pwdDialogError");
  if (errorBox) errorBox.hidden = true;
  els.passwordForm?.reset();
  if (emailField && session) emailField.value = session.username;
  els.passwordDialog?.showModal();
  $("#pwdNew")?.focus();
}

function openCreateUserDialog() {
  const errorBox = $("#createUserError");
  if (errorBox) errorBox.hidden = true;
  els.createUserForm?.reset();
  els.createUserDialog?.showModal();
  $("#newUserEmail")?.focus();
}

function openManageUsersDialog() {
  renderManageUsersList();
  $("#manageUsersDialog")?.showModal();
}

function renderManageUsersList() {
  const list = $("#manageUsersList");
  if (!list) return;

  if (!betaUsers.length) {
    list.innerHTML = `<p class="compact-dialog-sub">No hay usuarios cargados.</p>`;
    return;
  }

  list.innerHTML = betaUsers.map((user) => {
    const quotaText = user.weeklyLimit === null || user.weeklyLimit === undefined ? "Sin límite" : `${user.weeklyLimit}/semana`;
    const roleText = user.role === "admin" ? "Admin" : "Beta";
    return `
      <div class="manage-user-row">
        <div class="manage-user-avatar">${escapeHtml(initials(user.displayName || user.email || ""))}</div>
        <div class="manage-user-info">
          <strong>${escapeHtml(user.displayName || "Sin nombre")}</strong>
          <span>${escapeHtml(user.email || "—")}</span>
          <span class="manage-user-meta">${escapeHtml(roleText)} · ${escapeHtml(quotaText)}</span>
        </div>
        <button class="panel-action" type="button" data-edit-user="${escapeAttribute(user._key)}">Editar</button>
      </div>
    `;
  }).join("");

  $$("[data-edit-user]").forEach((button) => {
    button.addEventListener("click", () => openEditUserDialog(button.dataset.editUser));
  });
}

function openEditUserDialog(userKey) {
  const user = betaUsers.find((u) => u._key === userKey);
  if (!user) return;

  $("#manageUsersDialog")?.close();

  $("#editUserKey").value = userKey;
  $("#editUserEmail").value = user.email || "";
  $("#editUserName").value = user.displayName || "";
  $("#editUserLimit").value = user.weeklyLimit === null || user.weeklyLimit === undefined ? "" : user.weeklyLimit;
  $("#editUserPassword").value = "";
  const errorBox = $("#editUserError");
  if (errorBox) errorBox.hidden = true;

  $("#editUserTitle").textContent = `Editar: ${user.displayName || user.email || "usuario"}`;
  $("#editUserDialog")?.showModal();
  $("#editUserEmail")?.focus();
}

function setSearchEnabled(enabled) {
  const submit = els.form.querySelector('button[type="submit"]');
  submit.disabled = !enabled;
  els.query.disabled = !enabled;
  if (!enabled) {
    submit.textContent = "Límite alcanzado";
    els.query.placeholder = "Has consumido tus búsquedas semanales";
  } else {
    submit.textContent = "Buscar";
    updateModePlaceholder();
  }
}

function updateModePlaceholder() {
  const example = $("#researchExample");
  if (!els.query || els.query.disabled) return;
  const mode = els.mode();
  if (mode === "research") {
    els.query.placeholder = "Ej. Compara la doctrina del TJUE y del Tribunal Supremo sobre la comisión de apertura";
    if (example) example.hidden = false;
  } else if (mode === "ai") {
    els.query.placeholder = "Investigación con IA disponible próximamente";
    if (example) example.hidden = true;
  } else {
    els.query.placeholder = "Ej. comisión de apertura";
    if (example) example.hidden = true;
  }
}

function syncSourceChips() {
  const value = els.source?.value || "cendoj";
  els.sourceChips().forEach((button) => {
    button.classList.toggle("active", button.dataset.source === value);
  });
}

async function runSearch(query) {
  if (!query) return;

  const session = getSession();
  if (!session) {
    showLogin();
    return;
  }

  const quotaBefore = getQuotaForUser(session);
  if (quotaBefore.limit !== null && quotaBefore.remaining <= 0) {
    renderEmptyState("Límite semanal alcanzado", `Has consumido tus ${quotaBefore.limit} búsquedas de esta semana. Vuelve la semana que viene o solicita un reset al administrador.`);
    return;
  }

  activeQuery = query;
  const mode = els.mode();
  const sourceLabel = sourceHumanLabel(els.source.value);
  const loadingTitle = mode === "ai"
    ? "Ejecutando búsqueda con IA sin IA"
    : mode === "research"
      ? "Ejecutando investigación sin IA"
      : `Consultando ${sourceLabel}`;
  const loadingText = mode === "ai"
    ? "LexRadar simula una investigación asistida: interpreta por reglas, lanza búsquedas, deduplica y crea una tabla técnica sin llamar a ningún modelo de IA."
    : mode === "research"
      ? "LexRadar lanzará búsquedas controladas, deduplicará resultados y generará una tabla técnica."
      : "Estamos buscando jurisprudencia. Puede tardar unos segundos.";

  setLoading(true, loadingTitle, loadingText);
  updateResultsHeader("Buscando...", `Consulta: “${query}”`, 0);
  els.results.innerHTML = "";
  setExportState(false);

  const slowTimer = setTimeout(() => {
    setLoading(true, "Extrayendo jurisprudencia", `${sourceHumanLabel(els.source.value)} puede tardar más en búsquedas amplias. Seguimos esperando respuesta.`);
  }, 12000);

  try {
    const maxResults = clamp(Number(els.maxResults.value || CONFIG.DEFAULT_MAX_RESULTS), 1, CONFIG.HARD_MAX_RESULTS);
    const payload = { source: els.source.value, query, maxResults };
    const data = CONFIG.ENABLE_DEMO_MODE
      ? await fakeSearch(payload)
      : (mode === "research" || mode === "ai")
        ? await apiResearch({ ...payload, mode })
        : await apiSearch(payload);

    clearTimeout(slowTimer);
    setLoading(false);

    if (mode === "research" || mode === "ai") {
      currentResults = normalizeResults(data.results || []);
      saveHistory(query, currentResults.length, mode);
      renderResearchReport(data, mode);
      updateResultsHeader("Investigación", `${currentResults.length} resultado(s) normalizados para “${query}”`, currentResults.length);
    } else {
      currentResults = normalizeResults(data.results || []);
      saveHistory(query, currentResults.length, "search");
      renderResults(currentResults);
      updateResultsHeader("Resultados", `${currentResults.length} resultado(s) para “${query}”`, currentResults.length);
    }

    renderHistory();
    setExportState(currentResults.length > 0);

    incrementQuota();
    accountState = buildAccountState(session);
    renderAccount(accountState);

    if (!currentResults.length) {
      renderEmptyState("Sin resultados", "Prueba con menos términos o una búsqueda más general.");
    }
  } catch (error) {
    clearTimeout(slowTimer);
    console.error(error);
    currentResults = [];
    setExportState(false);
    setLoading(false);
    if (error.code === "QUOTA_EXCEEDED") {
      renderEmptyState("Límite semanal alcanzado", "Has consumido tus búsquedas disponibles de esta semana. Vuelve la semana que viene.");
      await loadAccount();
    } else {
      const friendly = error.message === "Failed to fetch"
        ? "No ha sido posible contactar con el servicio de búsqueda. Comprueba la conexión, el Worker o inténtalo de nuevo."
        : (error.message || "Revisa el Worker o Apify.");
      renderEmptyState("No se pudo completar la búsqueda", friendly);
    }
    updateResultsHeader("Error", "La consulta no devolvió resultados válidos", 0);
  }
}

function sourceHumanLabel(source) {
  if (source === "tjue") return "TJUE";
  if (source === "both") return "CENDOJ + TJUE";
  return "CENDOJ";
}

async function apiSearch(payload) {
  return apiPost("/search", payload);
}

async function apiResearch(payload) {
  return apiPost("/research", payload);
}

async function apiPost(path, payload) {
  const session = getSession();
  const headers = { "Content-Type": "application/json" };
  if (session?.username) headers["X-LexRadar-User"] = session.username;
  const response = await fetch(`${CONFIG.API_BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.ok === false) {
    const error = new Error(data?.error || `Error HTTP ${response.status}`);
    error.code = data?.code;
    throw error;
  }
  return data;
}

async function fakeSearch() {
  await new Promise((resolve) => setTimeout(resolve, 600));
  return { ok: true, results: demoResults, quota: { limit: 5, used: 1, remaining: 4, week: "demo" } };
}

function normalizeResults(results) {
  return results.map((item, index) => {
    const ecli = item.ecli || extractEcli(item.identifier || "");
    const roj = item.roj || extractRoj(item.identifier || "");
    const id = item.id || ecli || roj || item.url || `${item.source || "result"}-${index}-${Date.now()}`;
    return {
      id,
      source: item.source || "CENDOJ",
      date: item.date || item.resolutionDateISO || item.documentDate || "",
      court: item.court || item.organo || item.courtName || "Órgano no informado",
      jurisdiction: item.jurisdiction || item.documentType || "",
      identifier: item.identifier || [ecli, roj, item.caseNumber].filter(Boolean).join(" / "),
      ecli,
      roj,
      caseNumber: item.caseNumber || "",
      title: item.title || item.titulo || buildTitle(item),
      summary: cleanText(item.summary || item.resumen || item.extract || item.text || "Resultado devuelto por la fuente."),
      url: item.url || item.pdfUrl || item.documentUrl || ""
    };
  });
}

function buildTitle(item) {
  const parts = [item.court, item.date, item.ecli || item.roj].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Sentencia sin título";
}

function renderResearchReport(data, selectedMode = "research") {
  const plan = data.plan || {};
  const queries = plan.queries || [];
  const metrics = data.metrics || {};
  const tjueStatus = data.tjueStatus || "no solicitado";
  const sourceMix = data.source || data.sources?.join(" + ") || sourceHumanLabel(els.source.value);
  const isAiWithoutAi = selectedMode === "ai" || data.mode === "ai-without-ai";
  const rows = (data.comparisonRows || []).slice(0, 12);

  els.results.innerHTML = `
    <article class="research-report">
      <div class="result-meta">
        <span class="badge source">${isAiWithoutAi ? "IA sin IA" : "Motor sin IA"}</span>
        <span class="badge">${escapeHtml(sourceMix)} </span>
        <span class="badge">${escapeHtml(metrics.executedQueries || queries.length)} búsquedas</span>
        <span class="badge">${escapeHtml(String(metrics.deduplicated || currentResults.length))} resultados únicos</span>
      </div>
      <h3 class="result-title">Informe técnico de investigación</h3>
      <p class="research-note">${isAiWithoutAi ? "Modo IA sin IA: simula una investigación asistida mediante reglas, no llama a ningún modelo ni consume tokens de IA." : "Este informe no usa IA: se basa en reglas, búsquedas planificadas, deduplicación, orden cronológico y metadatos/extractos recuperados."}</p>

      <div class="research-grid">
        <div class="research-metric"><strong>${escapeHtml(String(metrics.rawResults || 0))}</strong><span>resultados brutos</span></div>
        <div class="research-metric"><strong>${escapeHtml(String(metrics.deduplicated || 0))}</strong><span>resultados únicos</span></div>
        <div class="research-metric"><strong>${escapeHtml(tjueStatus)}</strong><span>estado TJUE</span></div>
      </div>

      <h4>Consultas lanzadas</h4>
      <p>${queries.map((q) => `<span class="query-chip">${escapeHtml(q)}</span>`).join("")}</p>

      <h4>Tabla comparativa / cronología</h4>
      <table class="research-table">
        <thead><tr><th>Fecha</th><th>Órgano</th><th>Identificador</th><th>Aplicación / extracto</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(formatDate(row.date || ""))}</td>
              <td>${escapeHtml(shorten(row.court || "", 42))}</td>
              <td>${escapeHtml(row.identifier || row.ecli || row.roj || "")}</td>
              <td>${escapeHtml(shorten(row.summary || "", 260))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      <div class="result-actions">
        <button class="mini-btn primary" type="button" id="showResearchResultsBtn">Ver resultados normalizados</button>
      </div>
    </article>
  `;

  $("#showResearchResultsBtn")?.addEventListener("click", () => renderResults(currentResults));
}

function renderResults(results) {
  els.results.innerHTML = results.map((item) => resultCardTemplate(item)).join("");

  results.forEach((item) => {
    $(`[data-open="${cssEscape(item.id)}"]`)?.addEventListener("click", () => openDetail(item.id));
    $(`[data-fav="${cssEscape(item.id)}"]`)?.addEventListener("click", () => toggleFavorite(item.id));
    $(`[data-copy="${cssEscape(item.id)}"]`)?.addEventListener("click", () => copyCitation(item));
  });
}

function resultCardTemplate(item) {
  const isFav = isFavorite(item.id);
  const safeId = escapeHtml(item.id);
  return `
    <article class="result-card">
      <div class="result-meta">
        <span class="badge source">${escapeHtml(item.source)}</span>
        ${item.date ? `<span class="badge">📅 ${escapeHtml(formatDate(item.date))}</span>` : ""}
        <span class="badge">🏛 ${escapeHtml(shorten(item.court, 58))}</span>
        ${item.roj ? `<span class="badge">${escapeHtml(item.roj)}</span>` : ""}
      </div>
      <h3 class="result-title">${escapeHtml(item.title || item.identifier || "Sentencia")}</h3>
      <p class="result-summary">${escapeHtml(shorten(item.summary, 430))}</p>
      <div class="result-actions">
        <button class="mini-btn primary" type="button" data-open="${safeId}">Ver ficha</button>
        <button class="mini-btn ${isFav ? "active" : ""}" type="button" data-fav="${safeId}">${isFav ? "⭐ Favorita" : "☆ Favorito"}</button>
        <button class="mini-btn" type="button" data-copy="${safeId}">Copiar cita</button>
        ${item.url ? `<a class="mini-btn" href="${escapeAttribute(item.url)}" target="_blank" rel="noopener noreferrer">Fuente original</a>` : ""}
      </div>
    </article>
  `;
}

function openDetail(id) {
  const item = currentResults.find((result) => result.id === id) || getFavorites().find((result) => result.id === id);
  if (!item) return;

  els.detail.innerHTML = `
    <div class="detail-kicker">
      <span class="badge source">${escapeHtml(item.source)}</span>
      ${item.date ? `<span class="badge">📅 ${escapeHtml(formatDate(item.date))}</span>` : ""}
      ${item.jurisdiction ? `<span class="badge">${escapeHtml(item.jurisdiction)}</span>` : ""}
    </div>
    <h2 class="detail-title">${escapeHtml(item.title || item.identifier || "Ficha de sentencia")}</h2>

    <div class="detail-grid">
      <div class="detail-field"><small>Órgano</small>${escapeHtml(item.court || "No informado")}</div>
      <div class="detail-field"><small>Identificador</small>${escapeHtml(item.identifier || "No informado")}</div>
      <div class="detail-field"><small>ECLI</small>${escapeHtml(item.ecli || "No informado")}</div>
      <div class="detail-field"><small>ROJ / STS</small>${escapeHtml(item.roj || "No informado")}</div>
    </div>

    <div class="result-actions">
      <button class="mini-btn primary" type="button" id="detailCopyBtn">Copiar cita</button>
      <button class="mini-btn ${isFavorite(item.id) ? "active" : ""}" type="button" id="detailFavBtn">${isFavorite(item.id) ? "⭐ Favorita" : "☆ Añadir a favoritos"}</button>
      ${item.url ? `<a class="mini-btn" href="${escapeAttribute(item.url)}" target="_blank" rel="noopener noreferrer">Abrir fuente original</a>` : ""}
    </div>

    <section class="detail-section">
      <h3>Resumen / extracto</h3>
      <p>${escapeHtml(item.summary || "Sin resumen disponible.")}</p>
    </section>

    <section class="detail-section">
      <h3>Cita sugerida</h3>
      <p>${escapeHtml(buildCitation(item))}</p>
    </section>
  `;

  $("#detailCopyBtn")?.addEventListener("click", () => copyCitation(item));
  $("#detailFavBtn")?.addEventListener("click", () => {
    toggleFavorite(item.id);
    openDetail(item.id);
  });

  els.dialog.showModal();
}

function renderEmptyState(title = "Aún no hay resultados", text = "Lanza una búsqueda para consultar jurisprudencia real en CENDOJ.") {
  els.results.innerHTML = `<div class="empty-state"><strong>${escapeHtml(title)}</strong><br>${escapeHtml(text)}</div>`;
}

function setLoading(isLoading, title = "Consultando", text = "Procesando...") {
  els.status.classList.toggle("hidden", !isLoading);
  if (isLoading) {
    els.status.innerHTML = `<strong>${escapeHtml(title)}</strong><br><span>${escapeHtml(text)}</span><div class="progress"><span></span></div>`;
  } else {
    els.status.innerHTML = "";
  }
}

function updateResultsHeader(title, subtitle, count) {
  els.resultsTitle.textContent = title;
  els.resultsSubtitle.textContent = subtitle;
  els.count.textContent = String(count);
}

function setExportState(enabled) {
  els.exportJson.disabled = !enabled;
  els.exportCsv.disabled = !enabled;
}

function saveHistory(query, count, mode = "search") {
  const history = getHistory().filter((item) => item.query.toLowerCase() !== query.toLowerCase());
  history.unshift({ query, count, at: new Date().toISOString() });
  localStorage.setItem(CONFIG.STORAGE_KEYS.history, JSON.stringify(history.slice(0, 10)));
}

function getHistory() {
  return readStorage(CONFIG.STORAGE_KEYS.history, []);
}

function renderHistory() {
  const history = getHistory();
  if (!history.length) {
    els.history.className = "compact-list empty";
    els.history.innerHTML = `
      <div class="panel-empty">
        <svg class="panel-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15.5 14"></polyline></svg>
        <p>Aún no hay búsquedas</p>
      </div>
    `;
    return;
  }

  els.history.className = "compact-list";
  els.history.innerHTML = history.map((item) => `
    <div class="compact-item">
      <button type="button" data-history="${escapeAttribute(item.query)}">${escapeHtml(item.query)}</button>
      <div class="compact-meta"><span class="compact-meta-badge">${item.count}</span> resultado(s) · ${escapeHtml(relativeTime(item.at))}</div>
    </div>
  `).join("");

  $$('[data-history]').forEach((button) => {
    button.addEventListener("click", async () => {
      els.query.value = button.dataset.history;
      await runSearch(button.dataset.history);
    });
  });
}

function getFavorites() {
  return readStorage(CONFIG.STORAGE_KEYS.favorites, []);
}

function isFavorite(id) {
  return getFavorites().some((item) => item.id === id);
}

function toggleFavorite(id) {
  const item = currentResults.find((result) => result.id === id) || getFavorites().find((result) => result.id === id);
  if (!item) return;

  let favorites = getFavorites();
  const exists = favorites.some((favorite) => favorite.id === id);
  favorites = exists ? favorites.filter((favorite) => favorite.id !== id) : [item, ...favorites].slice(0, 25);
  localStorage.setItem(CONFIG.STORAGE_KEYS.favorites, JSON.stringify(favorites));
  renderFavorites();
  if (currentResults.length) renderResults(currentResults);
  toast(exists ? "Eliminada de favoritos" : "Añadida a favoritos");
}

function renderFavorites() {
  const favorites = getFavorites();
  els.favoritesCounter.textContent = String(favorites.length);
  if (!favorites.length) {
    els.favorites.className = "compact-list empty";
    els.favorites.innerHTML = `
      <div class="panel-empty">
        <svg class="panel-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
        <p>Marca sentencias como favoritas</p>
      </div>
    `;
    return;
  }

  els.favorites.className = "compact-list";
  els.favorites.innerHTML = favorites.slice(0, 6).map((item) => `
    <div class="compact-item">
      <button type="button" data-favorite-open="${escapeAttribute(item.id)}">${escapeHtml(shorten(item.title || item.identifier, 75))}</button>
      <div class="compact-meta">${escapeHtml(item.source)} · ${escapeHtml(formatDate(item.date))}</div>
    </div>
  `).join("");

  $$('[data-favorite-open]').forEach((button) => {
    button.addEventListener("click", () => openDetail(button.dataset.favoriteOpen));
  });
}

async function copyCitation(item) {
  const text = buildCitation(item);
  await navigator.clipboard.writeText(text).catch(() => null);
  toast("Cita copiada");
}

function buildCitation(item) {
  return [item.roj, item.ecli, item.court, item.date ? formatDate(item.date) : ""].filter(Boolean).join(" · ");
}

function exportJson() {
  downloadFile(`lexradar-${slug(activeQuery || "resultados")}.json`, JSON.stringify(currentResults, null, 2), "application/json");
}

function exportCsv() {
  const header = ["source", "date", "court", "ecli", "roj", "title", "summary", "url"];
  const rows = currentResults.map((item) => header.map((key) => csvCell(item[key] || "")).join(","));
  downloadFile(`lexradar-${slug(activeQuery || "resultados")}.csv`, [header.join(","), ...rows].join("\n"), "text/csv;charset=utf-8");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(CONFIG.STORAGE_KEYS.theme, next);
  els.theme.textContent = next === "light" ? "🌙" : "☀️";
}

function applySavedTheme() {
  const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.theme) || "light";
  document.documentElement.dataset.theme = saved;
  els.theme.textContent = saved === "light" ? "🌙" : "☀️";
}

function getWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function readStorage(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}

function cleanText(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

function shorten(text = "", max = 180) {
  const clean = cleanText(text);
  return clean.length > max ? `${clean.slice(0, max).trim()}...` : clean;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function relativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 60_000) return "ahora";
  if (diffMs < 3_600_000) return `${Math.round(diffMs / 60_000)} min`;
  if (diffMs < 86_400_000) return `${Math.round(diffMs / 3_600_000)} h`;
  return `${Math.round(diffMs / 86_400_000)} d`;
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove("show"), 1800);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function escapeAttribute(value = "") {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function cssEscape(value) {
  return window.CSS?.escape ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function csvCell(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function slug(value) {
  return String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "resultados";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function extractEcli(value) {
  return String(value).match(/ECLI:[A-Z]{2}:[A-Z]+:[0-9]{4}:[A-Z0-9.]+/i)?.[0] || "";
}

function extractRoj(value) {
  return String(value).match(/\b(?:STS|ATS|SAP|SJPI|SAN|STSJ)\s?\d+\/\d{4}\b/i)?.[0] || "";
}
