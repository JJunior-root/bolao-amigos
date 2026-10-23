/* Página do administrador: escolher os jogos exibidos no site, por data. */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const teamById = Object.fromEntries(TEAMS.map((t) => [t.id, t]));
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let games = [];
  let me = null;
  let statusTimer = null;

  async function api(method, path, body) {
    const options = { method, credentials: "same-origin", headers: {} };
    if (body !== undefined) { options.headers["Content-Type"] = "application/json"; options.body = JSON.stringify(body); }
    let response;
    try { response = await fetch(path, options); }
    catch { throw new Error("Não foi possível conectar ao servidor."); }
    let data = {};
    try { data = await response.json(); } catch { /* sem JSON */ }
    if (!response.ok) { const err = new Error(data.error || "Erro ao comunicar com o servidor."); err.status = response.status; throw err; }
    return data;
  }

  function localDateISO(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function status(message, isError = false) {
    const el = $("#status");
    el.textContent = message;
    el.style.color = isError ? "var(--danger)" : "var(--green)";
    clearTimeout(statusTimer);
    if (message) statusTimer = setTimeout(() => { el.textContent = ""; }, 3200);
  }

  function showLogin(message = "") {
    $("#login-view").hidden = false;
    $("#panel-view").hidden = true;
    $("#logout").hidden = true;
    $("#who").hidden = true;
    $("#login-error").textContent = message;
  }

  function showPanel() {
    $("#login-view").hidden = true;
    $("#panel-view").hidden = false;
    $("#logout").hidden = false;
    $("#who").hidden = false;
    $("#who").textContent = `${me.name} · administrador`;
    if (!$("#day").value) $("#day").value = localDateISO();
    render();
  }

  async function loadGames() {
    const data = await api("GET", "/api/games");
    games = data.games;
  }

  function render() {
    const day = $("#day").value;
    const list = games.filter((g) => g.date === day).sort((a, b) => a.time.localeCompare(b.time));
    const shown = list.filter((g) => g.onSite).length;
    const label = day ? new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }) : "";
    $("#summary").textContent = list.length
      ? `${shown} de ${list.length} jogos aparecem no site em ${label}.`
      : `Nenhum jogo cadastrado para ${label}.`;

    if (!list.length) {
      $("#games").innerHTML = `<div class="empty"><strong>Nenhum jogo nesta data</strong><p>Crie jogos no painel completo (site → Painel administrativo) e escolha a data.</p></div>`;
      return;
    }
    $("#games").innerHTML = list.map((g, i) => {
      const home = teamById[g.homeId] || g.home;
      const away = teamById[g.awayId] || g.away;
      const bets = g.winnerId ? " · encerrado" : "";
      return `
        <div class="game-row ${g.onSite ? "on" : ""}" data-id="${esc(g.id)}" style="animation-delay:${Math.min(i, 10) * 45}ms">
          <span class="game-time">${esc(g.time)}</span>
          <div class="game-teams">
            <span class="team"><img src="../assets/${esc(home.logo)}" alt="" />${esc(home.name)}</span>
            <span class="vs">x</span>
            <span class="team"><img src="../assets/${esc(away.logo)}" alt="" />${esc(away.name)}</span>
            <small class="game-meta">${esc(g.label)}${bets}</small>
          </div>
          <label class="admin-toggle switch">
            <input type="checkbox" data-toggle="${esc(g.id)}" ${g.onSite ? "checked" : ""} ${g.winnerId ? "disabled" : ""} />
            <span class="track" aria-hidden="true"></span>
            <span class="toggle-label">${g.onSite ? "No site" : "Oculto"}</span>
          </label>
        </div>`;
    }).join("");
  }

  async function setOnSite(id, onSite) {
    const data = await api("PATCH", `/api/admin/games/${encodeURIComponent(id)}/site`, { onSite });
    const index = games.findIndex((g) => g.id === id);
    if (index >= 0) games[index] = data.game;
  }

  async function toggleOne(input) {
    const id = input.dataset.toggle;
    const onSite = input.checked;
    input.disabled = true;
    try {
      await setOnSite(id, onSite);
      status(onSite ? "Jogo exibido no site." : "Jogo ocultado do site.");
      render();
    } catch (err) {
      input.checked = !onSite;
      input.disabled = false;
      status(err.message, true);
    }
  }

  async function setDay(onSite) {
    const day = $("#day").value;
    const targets = games.filter((g) => g.date === day && !g.winnerId && g.onSite !== onSite);
    if (!targets.length) { status(onSite ? "Todos os jogos deste dia já aparecem." : "Nenhum jogo deste dia aparece no site."); return; }
    status("Salvando…");
    try {
      for (const g of targets) await setOnSite(g.id, onSite);
      status(onSite ? `${targets.length} jogo(s) exibido(s) no site.` : `${targets.length} jogo(s) ocultado(s).`);
      render();
    } catch (err) {
      status(err.message, true);
      await loadGames().catch(() => {});
      render();
    }
  }

  async function init() {
    try {
      const data = await api("GET", "/api/me");
      me = data.user;
    } catch { me = null; }
    if (me && me.role === "admin") {
      await loadGames();
      showPanel();
    } else {
      showLogin(me ? "Esta conta não é de administrador." : "");
    }
  }

  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("#login-submit");
    button.disabled = true;
    button.classList.add("loading");
    $("#login-error").textContent = "";
    try {
      const data = await api("POST", "/api/login", { email: $("#login-email").value.trim(), password: $("#login-password").value });
      if (data.user.role !== "admin") {
        await api("POST", "/api/logout").catch(() => {});
        $("#login-error").textContent = "Esta conta não é de administrador.";
        return;
      }
      me = data.user;
      await loadGames();
      $("#login-password").value = "";
      showPanel();
    } catch (err) {
      $("#login-error").textContent = err.message;
    } finally {
      button.disabled = false;
      button.classList.remove("loading");
    }
  });

  $("#login-pwd-toggle").addEventListener("click", () => {
    const input = $("#login-password");
    const toggle = $("#login-pwd-toggle");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    toggle.classList.toggle("showing", show);
    toggle.setAttribute("aria-pressed", String(show));
    input.focus();
  });

  $("#logout").addEventListener("click", async () => {
    await api("POST", "/api/logout").catch(() => {});
    me = null;
    showLogin();
  });
  $("#day").addEventListener("change", () => { status(""); render(); });
  $("#games").addEventListener("change", (event) => {
    const input = event.target;
    if (input.matches("input[data-toggle]")) {
      const row = input.closest(".game-row");
      const label = row?.querySelector(".toggle-label");
      if (label) label.textContent = input.checked ? "No site" : "Oculto";
      toggleOne(input);
    }
  });
  $("#show-all-day").addEventListener("click", () => setDay(true));
  $("#hide-all-day").addEventListener("click", () => setDay(false));

  init();
})();
