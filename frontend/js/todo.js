// ============================================================
// todo.js — handles the Dashboard page: create/read/update/delete todos
// ============================================================

const API_BASE_URL = window.APP_CONFIG.API_BASE_URL;

// ---------------- Auth guard ----------------
const token = localStorage.getItem('token');
if (!token) {
  window.location.href = 'login.html';
}

const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

// ---------------- Element references ----------------
const userNameEl = document.getElementById('userName');
const logoutBtn = document.getElementById('logoutBtn');
const alertBox = document.getElementById('alertBox');

const createForm = document.getElementById('createForm');
const titleInput = document.getElementById('title');
const descriptionInput = document.getElementById('description');
const statusInput = document.getElementById('status');
const createBtn = document.getElementById('createBtn');

const todoGrid = document.getElementById('todoGrid');
const filterChips = document.querySelectorAll('.filter-chip');

const editModal = document.getElementById('editModal');
const editForm = document.getElementById('editForm');
const editIdInput = document.getElementById('editId');
const editTitleInput = document.getElementById('editTitle');
const editDescriptionInput = document.getElementById('editDescription');
const editStatusInput = document.getElementById('editStatus');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const saveEditBtn = document.getElementById('saveEditBtn');

let allTodos = [];
let activeFilter = 'All';

// ---------------- Helpers ----------------
function showAlert(message, type = 'success') {
  alertBox.textContent = message;
  alertBox.className = `alert alert-${type} show`;
  setTimeout(() => alertBox.classList.remove('show'), 3000);
}

function setFieldError(groupEl, hasError) {
  groupEl.classList.toggle('has-error', hasError);
}

function setButtonLoading(btn, isLoading) {
  btn.disabled = isLoading;
  btn.classList.toggle('loading', isLoading);
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`
  };
}

function handleAuthError(response) {
  if (response.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
    return true;
  }
  return false;
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------------- Render ----------------
function renderTodos() {
  const filtered =
    activeFilter === 'All' ? allTodos : allTodos.filter((t) => t.status === activeFilter);

  if (filtered.length === 0) {
    todoGrid.innerHTML = `
      <div class="empty-state">
        <div class="icon">🗂️</div>
        <p>No cards filed under this tab yet. Add one above.</p>
      </div>
    `;
    return;
  }

  todoGrid.innerHTML = filtered
    .map((todo) => {
      const statusClass = todo.status.toLowerCase();
      return `
        <div class="todo-card glass-panel" data-id="${todo._id}">
          <div class="card-top">
            <h3>${escapeHtml(todo.title)}</h3>
            <span class="status-badge ${statusClass}">${todo.status}</span>
          </div>
          ${todo.description ? `<p class="desc">${escapeHtml(todo.description)}</p>` : ''}
          <span class="card-meta">Created ${formatDate(todo.createdAt)}</span>
          <div class="card-actions">
            <select class="status-select" data-id="${todo._id}">
              <option value="Pending" ${todo.status === 'Pending' ? 'selected' : ''}>Pending</option>
              <option value="Completed" ${todo.status === 'Completed' ? 'selected' : ''}>Completed</option>
              <option value="Expired" ${todo.status === 'Expired' ? 'selected' : ''}>Expired</option>
            </select>
            <button class="icon-btn edit" data-id="${todo._id}">Edit</button>
            <button class="icon-btn delete" data-id="${todo._id}">Delete</button>
          </div>
        </div>
      `;
    })
    .join('');

  attachCardListeners();
}

function attachCardListeners() {
  todoGrid.querySelectorAll('.status-select').forEach((select) => {
    select.addEventListener('change', (e) => {
      updateTodo(e.target.dataset.id, { status: e.target.value });
    });
  });

  todoGrid.querySelectorAll('.icon-btn.edit').forEach((btn) => {
    btn.addEventListener('click', (e) => openEditModal(e.target.dataset.id));
  });

  todoGrid.querySelectorAll('.icon-btn.delete').forEach((btn) => {
    btn.addEventListener('click', (e) => deleteTodo(e.target.dataset.id));
  });
}

// ---------------- API calls ----------------
async function fetchTodos() {
  try {
    const response = await fetch(`${API_BASE_URL}/todo/get`, {
      method: 'GET',
      headers: authHeaders()
    });

    if (handleAuthError(response)) return;

    const data = await response.json();

    if (!response.ok) {
      showAlert(data.message || 'Failed to load tasks.', 'error');
      return;
    }

    allTodos = data.todos;
    renderTodos();
  } catch (error) {
    showAlert('Could not reach the server. Is the backend running?', 'error');
  }
}

async function createTodo(payload) {
  const response = await fetch(`${API_BASE_URL}/todo/create`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });

  if (handleAuthError(response)) return null;

  const data = await response.json();

  if (!response.ok) {
    showAlert(data.message || 'Failed to create task.', 'error');
    return null;
  }

  return data.todo;
}

async function updateTodo(id, payload) {
  try {
    const response = await fetch(`${API_BASE_URL}/todo/update/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });

    if (handleAuthError(response)) return;

    const data = await response.json();

    if (!response.ok) {
      showAlert(data.message || 'Failed to update task.', 'error');
      return;
    }

    const idx = allTodos.findIndex((t) => t._id === id);
    if (idx !== -1) allTodos[idx] = data.todo;
    renderTodos();
    showAlert('Task updated successfully.', 'success');
  } catch (error) {
    showAlert('Could not reach the server. Is the backend running?', 'error');
  }
}

async function deleteTodo(id) {
  const confirmed = window.confirm('Delete this task? This cannot be undone.');
  if (!confirmed) return;

  try {
    const response = await fetch(`${API_BASE_URL}/todo/delete/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });

    if (handleAuthError(response)) return;

    const data = await response.json();

    if (!response.ok) {
      showAlert(data.message || 'Failed to delete task.', 'error');
      return;
    }

    allTodos = allTodos.filter((t) => t._id !== id);
    renderTodos();
    showAlert('Task deleted.', 'success');
  } catch (error) {
    showAlert('Could not reach the server. Is the backend running?', 'error');
  }
}

// ---------------- Create form ----------------
createForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = titleInput.value.trim();
  const description = descriptionInput.value.trim();
  const status = statusInput.value;

  const titleValid = title.length > 0;
  setFieldError(document.getElementById('titleGroup'), !titleValid);
  if (!titleValid) return;

  setButtonLoading(createBtn, true);

  const newTodo = await createTodo({ title, description, status });

  setButtonLoading(createBtn, false);

  if (newTodo) {
    allTodos.unshift(newTodo);
    renderTodos();
    createForm.reset();
    showAlert('Task added successfully.', 'success');
  }
});

titleInput.addEventListener('input', () => {
  setFieldError(document.getElementById('titleGroup'), false);
});

// ---------------- Filter chips ----------------
filterChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    filterChips.forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    activeFilter = chip.dataset.filter;
    renderTodos();
  });
});

// ---------------- Edit modal ----------------
function openEditModal(id) {
  const todo = allTodos.find((t) => t._id === id);
  if (!todo) return;

  editIdInput.value = todo._id;
  editTitleInput.value = todo.title;
  editDescriptionInput.value = todo.description || '';
  editStatusInput.value = todo.status;
  setFieldError(document.getElementById('editTitleGroup'), false);

  editModal.classList.add('show');
}

function closeEditModal() {
  editModal.classList.remove('show');
}

cancelEditBtn.addEventListener('click', closeEditModal);

editModal.addEventListener('click', (e) => {
  if (e.target === editModal) closeEditModal();
});

editForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = editIdInput.value;
  const title = editTitleInput.value.trim();
  const description = editDescriptionInput.value.trim();
  const status = editStatusInput.value;

  const titleValid = title.length > 0;
  setFieldError(document.getElementById('editTitleGroup'), !titleValid);
  if (!titleValid) return;

  setButtonLoading(saveEditBtn, true);
  await updateTodo(id, { title, description, status });
  setButtonLoading(saveEditBtn, false);
  closeEditModal();
});

// ---------------- Logout ----------------
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'login.html';
});

// ---------------- Init ----------------
userNameEl.textContent = currentUser.name || 'there';
fetchTodos();
