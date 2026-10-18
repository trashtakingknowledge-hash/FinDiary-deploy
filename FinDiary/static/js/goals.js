
document.addEventListener("DOMContentLoaded", () => {
    const API = window.ZorvynAPI;

    const container = document.getElementById("goals-container");
    const form = document.getElementById("goal-form");
    const modal = document.getElementById("goal-modal");
    const message = document.getElementById("goals-message");
    const filter = document.getElementById("goal-status-filter");

    const fields = {
        id: document.getElementById("goal-id"),
        name: document.getElementById("goal-name"),
        target: document.getElementById("goal-target"),
        saved: document.getElementById("goal-saved"),
        deadline: document.getElementById("goal-deadline"),
        status: document.getElementById("goal-status"),
        description: document.getElementById("goal-description")
    };

    let goals = [];
    let isAdmin = false;

    const money = value =>
        new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 2
        }).format(Number(value) || 0);

    const escapeHTML = value =>
        String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]);

    function showMessage(text, type = "") {
        message.textContent = text;
        message.className = `goals-message ${type}`;
    }

    function getItems(response) {
        if (Array.isArray(response)) return response;
        return response?.goals || response?.items || response?.data || [];
    }

    function normalizeGoal(goal) {
        return {
            id: goal.id ?? goal.goal_id,
            name: goal.name ?? goal.goal_name ?? goal.title ?? "Untitled Goal",
            target: Number(goal.target_amount ?? goal.target ?? 0),
            saved: Number(
                goal.saved_amount ?? goal.current_amount ?? goal.saved ?? 0
            ),
            deadline: goal.deadline ?? goal.target_date ?? "",
            status: String(goal.status || "ACTIVE").toUpperCase(),
            description: goal.description ?? goal.notes ?? ""
        };
    }

    function openModal(goal = null) {
        if (!isAdmin) {
            showMessage("Viewer mode is read-only.", "error");
            return;
        }

        form.reset();
        fields.id.value = "";
        fields.saved.value = "0";
        fields.status.value = "ACTIVE";

        document.getElementById("goal-modal-title").textContent =
            goal ? "Edit Financial Goal" : "Create Financial Goal";

        if (goal) {
            fields.id.value = goal.id;
            fields.name.value = goal.name;
            fields.target.value = goal.target;
            fields.saved.value = goal.saved;
            fields.deadline.value = goal.deadline
                ? String(goal.deadline).slice(0, 10)
                : "";
            fields.status.value = goal.status;
            fields.description.value = goal.description;
        }

        modal.hidden = false;
        fields.name.focus();
    }

    function closeModal() {
        modal.hidden = true;
    }

    function renderSummary() {
        document.getElementById("total-goals").textContent = goals.length;

        document.getElementById("total-target").textContent =
            money(goals.reduce((sum, goal) => sum + goal.target, 0));

        document.getElementById("total-saved").textContent =
            money(goals.reduce((sum, goal) => sum + goal.saved, 0));

        document.getElementById("completed-goals").textContent =
            goals.filter(goal => goal.status === "COMPLETED").length;
    }

    function renderGoals() {
        const selectedStatus = filter.value;

        const visibleGoals = goals.filter(goal =>
            selectedStatus === "ALL" || goal.status === selectedStatus
        );

        renderSummary();

        if (!visibleGoals.length) {
            container.innerHTML = `
                <div class="goals-empty">
                    No goals found.
                    ${isAdmin ? "Create your first financial goal to get started." : ""}
                </div>`;
            return;
        }

        container.innerHTML = visibleGoals.map(goal => {
            const percentage = goal.target > 0
                ? Math.min(100, Math.max(0, goal.saved / goal.target * 100))
                : 0;

            const statusClass = goal.status.toLowerCase();
            const remaining = Math.max(0, goal.target - goal.saved);

            return `
                <article class="goal-card">
                    <div class="goal-card-top">
                        <h3>${escapeHTML(goal.name)}</h3>
                        <span class="goal-status ${escapeHTML(statusClass)}">
                            ${escapeHTML(goal.status)}
                        </span>
                    </div>

                    <p class="goal-description">
                        ${escapeHTML(goal.description || "No description added.")}
                    </p>

                    <div class="goal-progress-labels">
                        <span>${money(goal.saved)} saved</span>
                        <span>${percentage.toFixed(1)}% of ${money(goal.target)}</span>
                    </div>

                    <div class="goal-progress-track"
                         role="progressbar"
                         aria-valuenow="${Math.round(percentage)}"
                         aria-valuemin="0"
                         aria-valuemax="100">
                        <div class="goal-progress-fill ${
                            percentage >= 100 ? "complete" : ""
                        }" style="width:${percentage}%"></div>
                    </div>

                    <div class="goal-deadline">
                        ${
                            goal.deadline
                                ? `Target date: ${escapeHTML(goal.deadline)}`
                                : "No target date set"
                        }
                        <br>Remaining: ${money(remaining)}
                    </div>

                    ${isAdmin ? `
                        <div class="goal-card-actions">
                            <button type="button" data-edit="${escapeHTML(goal.id)}">
                                Edit
                            </button>
                            <button type="button"
                                    class="goal-delete-btn"
                                    data-delete="${escapeHTML(goal.id)}">
                                Delete
                            </button>
                        </div>
                    ` : ""}
                </article>`;
        }).join("");
    }

    async function loadGoals() {
        try {
            const goalResponse = await API.get("/api/goals");

            isAdmin = true;
            goals = getItems(goalResponse).map(normalizeGoal);

            document.getElementById("add-goal-btn").hidden = !isAdmin;

            showMessage("");
            renderGoals();
        } catch (error) {
            container.innerHTML = `
                <div class="goals-empty">
                    Could not load goals. Check your Flask API.
                </div>`;
            showMessage(error.message || "Failed to load goals.", "error");
        }
    }

    document.getElementById("add-goal-btn")
        .addEventListener("click", () => openModal());

    document.getElementById("close-goal-modal")
        .addEventListener("click", closeModal);

    document.getElementById("cancel-goal-btn")
        .addEventListener("click", closeModal);

    modal.addEventListener("click", event => {
        if (event.target.hasAttribute("data-close-modal")) {
            closeModal();
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !modal.hidden) {
            closeModal();
        }
    });

    filter.addEventListener("change", renderGoals);


function showGoalDeleteConfirmation(message, description) {
    return new Promise((resolve) => {
        document.querySelector("#goal-delete-modal")?.remove();

        const modal = document.createElement("div");
        modal.id = "goal-delete-modal";
        modal.className = "goal-delete-overlay";

        modal.innerHTML = `
            <div class="goal-delete-dialog"
                 role="dialog"
                 aria-modal="true"
                 aria-labelledby="goal-delete-title">

                <div class="goal-delete-icon">!</div>

                <h2 id="goal-delete-title">Delete financial goal?</h2>

                <p class="goal-delete-message"></p>
                <p class="goal-delete-description"></p>

                <div class="goal-delete-actions">
                    <button type="button" class="goal-delete-cancel">
                        Cancel
                    </button>
                    <button type="button" class="goal-delete-confirm">
                        Delete
                    </button>
                </div>
            </div>
        `;

        modal.querySelector(".goal-delete-message").textContent = message;
        modal.querySelector(".goal-delete-description").textContent =
            description;

        document.body.appendChild(modal);
        document.body.classList.add("goal-modal-open");

        const cancelButton = modal.querySelector(".goal-delete-cancel");
        const deleteButton = modal.querySelector(".goal-delete-confirm");

        function closeModal(result) {
            modal.remove();
            document.body.classList.remove("goal-modal-open");
            document.removeEventListener("keydown", onKeyDown);
            resolve(result);
        }

        function onKeyDown(event) {
            if (event.key === "Escape") closeModal(false);
        }

        cancelButton.addEventListener("click", () => closeModal(false));
        deleteButton.addEventListener("click", () => closeModal(true));

        modal.addEventListener("click", (event) => {
            if (event.target === modal) closeModal(false);
        });

        document.addEventListener("keydown", onKeyDown);
        cancelButton.focus();
    });
}

    
    container.addEventListener("click", async event => {
        const editButton = event.target.closest("[data-edit]");
        const deleteButton = event.target.closest("[data-delete]");

        if (editButton) {
            const goal = goals.find(item =>
                String(item.id) === editButton.dataset.edit
            );

            if (goal) openModal(goal);
        }

        if (deleteButton) {
            if (!isAdmin) {
                showMessage("Viewer mode is read-only.", "error");
                return;
            }

            const id = deleteButton.dataset.delete;
            const goal = goals.find(item => String(item.id) === id);

            if (!goal) return;

            const confirmed = await showGoalDeleteConfirmation(
                `Delete "${goal.name}"?`,
                "This action cannot be undone."
            );

            if (!confirmed) return;

            try {
                await API.delete(
                    `/api/goals/${encodeURIComponent(id)}`
                );

                await loadGoals();
                showMessage("Goal deleted successfully.", "success");
            } catch (error) {
                showMessage(error.message || "Could not delete goal.", "error");
            }
        }
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();

        if (!isAdmin) {
            showMessage("Viewer mode is read-only.", "error");
            return;
        }

        const target = Number(fields.target.value);
        const saved = Number(fields.saved.value);

        if (!fields.name.value.trim()) {
            showMessage("Please enter a goal name.", "error");
            return;
        }

        if (!Number.isFinite(target) || target <= 0) {
            showMessage("Target amount must be greater than zero.", "error");
            return;
        }

        if (!Number.isFinite(saved) || saved < 0) {
            showMessage("Saved amount cannot be negative.", "error");
            return;
        }

        const payload = {
            name: fields.name.value.trim(),
            target_amount: target,
            saved_amount: saved,
            target_date: fields.deadline.value || null,
            status: fields.status.value,
            description: fields.description.value.trim()
        };

        const id = fields.id.value;
        const saveButton = document.getElementById("save-goal-btn");

        saveButton.disabled = true;

        try {
            if (id) {
                await API.put(
                    `/api/goals/${encodeURIComponent(id)}`,
                    payload
                );
            } else {
                await API.post("/api/goals", payload);
            }

            closeModal();
            await loadGoals();

            showMessage(
                id ? "Goal updated successfully." : "Goal created successfully.",
                "success"
            );
        } catch (error) {
            showMessage(error.message || "Could not save goal.", "error");
        } finally {
            saveButton.disabled = false;
        }
    });

    if (!API) {
        showMessage(
            "Shared API helper is missing. Check static/js/api.js.",
            "error"
        );
        return;
    }

    loadGoals();
});
