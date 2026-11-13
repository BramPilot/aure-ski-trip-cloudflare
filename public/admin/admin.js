(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const state = { settings: null, participants: [], announcements: [] };
  let toastTimer;

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(options.headers || {}) },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && path !== "/api/admin/login") showLogin();
    if (!response.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  function toast(message) {
    const element = $("#toast");
    element.textContent = message;
    element.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove("is-visible"), 2800);
  }

  function showLogin() {
    $("#setupView").hidden = true;
    $("#loginView").hidden = false;
    $("#dashboard").hidden = true;
    $("#logoutButton").hidden = true;
  }

  function showSetup() {
    $("#setupView").hidden = false;
    $("#loginView").hidden = true;
    $("#dashboard").hidden = true;
    $("#logoutButton").hidden = true;
  }

  function showDashboard() {
    $("#setupView").hidden = true;
    $("#loginView").hidden = true;
    $("#dashboard").hidden = false;
    $("#logoutButton").hidden = false;
  }

  async function start() {
    try {
      await loadDashboard();
    } catch (_) {
      try {
        const status = await api("/api/admin/status");
        status.passwordConfigured ? showLogin() : showSetup();
      } catch (error) {
        showLogin();
        $("#loginError").textContent = error.message;
      }
    }
  }

  async function loadDashboard() {
    const data = await api("/api/admin/bootstrap");
    state.settings = data.settings;
    state.participants = data.participants || [];
    state.announcements = data.announcements || [];
    render();
    showDashboard();
  }

  function render() {
    renderSummary();
    renderSettings();
    renderParticipants();
    renderAnnouncements();
  }

  function renderSummary() {
    const confirmed = state.participants.filter((participant) => participant.status === "confirmed").length;
    const pending = state.participants.filter((participant) => participant.status === "pending").length;
    const active = state.announcements.find((announcement) => Number(announcement.active) === 1);
    $("#confirmedCount").textContent = String(confirmed);
    $("#confirmedTarget").textContent = `of ${state.settings.targetCount} travellers`;
    $("#pendingCount").textContent = String(pending);
    $("#registrationState").textContent = state.settings.registrationOpen ? "OPEN" : "CLOSED";
    $("#announcementState").textContent = active ? "LIVE" : "NONE";
  }

  function renderSettings() {
    $("#registrationOpen").checked = state.settings.registrationOpen;
    $("#targetCount").value = state.settings.targetCount;
    $("#registrationDeadline").value = state.settings.registrationDeadline;
    $("#bookingUrl").value = state.settings.bookingUrl;
  }

  function renderParticipants() {
    const query = $("#participantSearch").value.trim().toLowerCase();
    const filter = $("#participantFilter").value;
    const participants = state.participants.filter((participant) => {
      const matchesStatus = filter === "all" || participant.status === filter;
      const haystack = `${participant.name} ${participant.email} ${participant.phone} ${participant.room_name}`.toLowerCase();
      return matchesStatus && haystack.includes(query);
    });
    const tbody = $("#participantTable");
    tbody.replaceChildren(...participants.map(participantRow));
    $("#participantEmpty").hidden = participants.length !== 0;
  }

  function participantRow(participant) {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    nameCell.textContent = participant.name;
    if (Number(participant.is_placeholder) === 1) {
      const badge = document.createElement("span");
      badge.className = "placeholder-badge";
      badge.textContent = "replace";
      nameCell.append(badge);
    }
    const contact = document.createElement("td");
    contact.className = "contact-cell";
    [participant.email, participant.phone].filter(Boolean).forEach((value) => {
      const line = document.createElement("span");
      line.textContent = value;
      contact.append(line);
    });
    if (!contact.children.length) contact.textContent = "—";
    const room = document.createElement("td");
    room.textContent = participant.room_name || "—";
    const statusCell = document.createElement("td");
    const status = document.createElement("span");
    status.className = `status status-${participant.status}`;
    status.textContent = participant.status;
    statusCell.append(status);
    const actions = document.createElement("td");
    const actionWrap = document.createElement("div");
    actionWrap.className = "row-actions";
    actionWrap.append(actionButton("EDIT", () => openParticipant(participant)), actionButton("DELETE", () => deleteParticipant(participant), "delete"));
    actions.append(actionWrap);
    row.append(nameCell, contact, room, statusCell, actions);
    return row;
  }

  function renderAnnouncements() {
    const list = $("#announcementList");
    if (!state.announcements.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No announcements yet. Create one when you have an update for travellers.";
      list.replaceChildren(empty);
      return;
    }
    list.replaceChildren(...state.announcements.map((announcement) => {
      const item = document.createElement("article");
      item.className = `announcement-item${Number(announcement.active) === 1 ? " is-active" : ""}`;
      const copy = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = announcement.title;
      const body = document.createElement("p");
      body.textContent = announcement.body;
      const meta = document.createElement("p");
      meta.className = "announcement-meta";
      meta.textContent = Number(announcement.active) === 1 ? "LIVE ON WEBSITE" : "DRAFT / HIDDEN";
      copy.append(title, body, meta);
      const actions = document.createElement("div");
      actions.className = "row-actions";
      actions.append(actionButton("EDIT", () => openAnnouncement(announcement)), actionButton("DELETE", () => deleteAnnouncement(announcement), "delete"));
      item.append(copy, actions);
      return item;
    }));
  }

  function actionButton(label, handler, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.className = className;
    button.addEventListener("click", handler);
    return button;
  }

  function openParticipant(participant = null) {
    $("#participantDialogTitle").textContent = participant ? "Edit participant" : "Add participant";
    $("#participantId").value = participant?.id || "";
    $("#participantName").value = participant?.name || "";
    $("#participantEmail").value = participant?.email || "";
    $("#participantPhone").value = participant?.phone || "";
    $("#participantRoom").value = participant?.room_name || "";
    $("#participantStatus").value = participant?.status || "confirmed";
    $("#participantNotes").value = participant?.notes || "";
    $("#participantDialog").showModal();
  }

  function openAnnouncement(announcement = null) {
    $("#announcementDialogTitle").textContent = announcement ? "Edit announcement" : "New announcement";
    $("#announcementId").value = announcement?.id || "";
    $("#announcementTitleInput").value = announcement?.title || "";
    $("#announcementBodyInput").value = announcement?.body || "";
    $("#announcementActive").checked = Number(announcement?.active || 0) === 1;
    $("#announcementDialog").showModal();
  }

  async function deleteParticipant(participant) {
    if (!window.confirm(`Delete ${participant.name}? This cannot be undone.`)) return;
    await api(`/api/admin/participants/${participant.id}`, { method: "DELETE" });
    toast("Participant deleted");
    await loadDashboard();
  }

  async function deleteAnnouncement(announcement) {
    if (!window.confirm(`Delete “${announcement.title}”?`)) return;
    await api(`/api/admin/announcements/${announcement.id}`, { method: "DELETE" });
    toast("Announcement deleted");
    await loadDashboard();
  }

  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("#loginError").textContent = "";
    try {
      await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: $("#password").value }) });
      $("#password").value = "";
      await loadDashboard();
    } catch (error) {
      $("#loginError").textContent = error.message;
    }
  });

  $("#setupForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("#setupError").textContent = "";
    const password = $("#setupPassword").value;
    if (password !== $("#setupPasswordConfirm").value) {
      $("#setupError").textContent = "The passwords do not match.";
      return;
    }
    try {
      await api("/api/admin/setup", { method: "POST", body: JSON.stringify({ password }) });
      $("#setupPassword").value = "";
      $("#setupPasswordConfirm").value = "";
      await loadDashboard();
      toast("Admin access created");
    } catch (error) {
      $("#setupError").textContent = error.message;
    }
  });

  $("#logoutButton").addEventListener("click", async () => {
    await api("/api/admin/logout", { method: "POST", body: "{}" });
    showLogin();
  });

  $("#settingsForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter || event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const data = await api("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          targetCount: Number($("#targetCount").value),
          registrationOpen: $("#registrationOpen").checked,
          registrationDeadline: $("#registrationDeadline").value,
          bookingUrl: $("#bookingUrl").value
        })
      });
      state.settings = data.settings;
      renderSummary();
      $("#settingsState").textContent = "Saved just now";
      toast("Website settings updated");
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  });

  $("#participantForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = $("#participantId").value;
    const payload = {
      name: $("#participantName").value,
      email: $("#participantEmail").value,
      phone: $("#participantPhone").value,
      roomName: $("#participantRoom").value,
      status: $("#participantStatus").value,
      notes: $("#participantNotes").value
    };
    try {
      await api(id ? `/api/admin/participants/${id}` : "/api/admin/participants", { method: id ? "PUT" : "POST", body: JSON.stringify(payload) });
      $("#participantDialog").close();
      toast(id ? "Participant updated" : "Participant added");
      await loadDashboard();
    } catch (error) {
      toast(error.message);
    }
  });

  $("#announcementForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = $("#announcementId").value;
    const payload = { title: $("#announcementTitleInput").value, body: $("#announcementBodyInput").value, active: $("#announcementActive").checked };
    try {
      await api(id ? `/api/admin/announcements/${id}` : "/api/admin/announcements", { method: id ? "PUT" : "POST", body: JSON.stringify(payload) });
      $("#announcementDialog").close();
      toast(id ? "Announcement updated" : "Announcement created");
      await loadDashboard();
    } catch (error) {
      toast(error.message);
    }
  });

  $("#addParticipant").addEventListener("click", () => openParticipant());
  $("#addAnnouncement").addEventListener("click", () => openAnnouncement());
  $("#participantSearch").addEventListener("input", renderParticipants);
  $("#participantFilter").addEventListener("change", renderParticipants);
  document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => $(`#${button.dataset.closeDialog}`).close()));

  start();
})();
