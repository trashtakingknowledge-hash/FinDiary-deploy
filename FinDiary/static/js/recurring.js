/* =========================================
   ZORVYN — RECURRING TRANSACTIONS
   File: static/js/recurring.js
   ========================================= */

(() => {
    "use strict";

    const API = window.ZorvynAPI;
    const $ = (selector) => document.querySelector(selector);

    if (!API) {
        console.error("ZorvynAPI is missing. Check static/js/api.js.");
        return;
    }

    const el = {
        formPanel: $("#recurring-form-panel"),
        form: $("#recurring-form"),
        formTitle: $("#recurring-form-title"),
        recurringId: $("#recurring_id"),
        showForm: $("#show-recurring-form"),
        cancelForm: $("#cancel-recurring-form"),
        cancelFormSecondary: $("#cancel-recurring-form-secondary"),
        saveButton: $("#save-recurring-btn"),
        historyModal: $("#payment-history-modal"),
        historyTitle: $("#payment-history-title"),
        historySubtitle: $("#payment-history-subtitle"),
        historyMessage: $("#payment-history-message"),
        historyBody: $("#payment-history-body"),
        closeHistory: $("#close-payment-history"),
        search: $("#recurring-search"),
        typeFilter: $("#recurring-type-filter"),
        frequencyFilter: $("#recurring-frequency-filter"),
        statusFilter: $("#recurring-status-filter"),

        tableBody: $("#recurring-table-body"),
        empty: $("#recurring-empty"),
        message: $("#recurring-status-message"),

        count: $("#recurring-count"),
        monthlyExpenses: $("#recurring-monthly-expenses"),
        monthlyIncome: $("#recurring-monthly-income"),
        nextDue: $("#recurring-next-due"),

        category: $("#recurring-category")
    };

    let recurringItems = [];
    let categories = [];
    let editingId = null;
    const PAGE_SIZE = 5;
    let currentPage = 1;
    const HISTORY_PAGE_SIZE = 5;
    let paymentHistoryItems = [];
    let historyPage = 1;
    let currentHistoryId = null;
    let historyTotal = 0;
    
    const paymentHistoryCache = new Map();

    const escapeHTML = (value) =>
        String(value ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]);

    const money = (amount) => new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(Number(amount || 0));

    const idOf = (item) =>
        item.id ?? item.recurring_id ?? item.recurring_transaction_id;

    const titleOf = (item) =>
        item.title ?? item.description ?? item.name ?? "Untitled recurring item";

    const typeOf = (item) => {
        const type = String(
            item.type ?? item.transaction_type ?? item.txn_type ?? "EXPENSE"
        ).toUpperCase();

        return type.includes("INCOME") || type === "CREDIT"
            ? "INCOME"
            : "EXPENSE";
    };

    const frequencyOf = (item) =>
        String(item.frequency ?? item.recurrence ?? "MONTHLY").toUpperCase();

    const statusOf = (item) =>
        String(item.status ?? "ACTIVE").toUpperCase();

    const nextDueOf = (item) =>
        String(
            item.next_due_date ??
            item.next_date ??
            item.next_occurrence ??
            ""
        ).slice(0, 10);

    function parseDate(value) {
        if (!value) return null;

        const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);

        return Number.isNaN(date.getTime()) ? null : date;
    }

    function formatDate(value) {
        const date = parseDate(value);

        if (!date) return "—";

        return date.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    }

    function showMessage(message, type = "") {
        if (!el.message) return;

        el.message.textContent = message;
        el.message.className = "recurring-status-message";

        if (type) {
            el.message.classList.add(type);
        }
    }

    function extractArray(response, key) {
        if (Array.isArray(response)) return response;
        if (Array.isArray(response?.[key])) return response[key];
        if (Array.isArray(response?.items)) return response.items;
        if (Array.isArray(response?.data)) return response.data;

        return [];
    }

    async function loadCategories() {
        try {
            const response = await API.get("/api/categories");
            categories = extractArray(response, "categories");

            populateCategories();
        } catch (error) {
            console.error("Unable to load categories:", error);
        }
    }

    function populateCategories(selectedId = "") {
        if (!el.category) return;

        el.category.innerHTML = `
            <option value="">Select category</option>
            ${categories.map((category) => {
                const id = category.id ?? category.category_id;
                const name = category.name ?? category.category_name;

                return `
                    <option
                        value="${escapeHTML(id)}"
                        ${String(id) === String(selectedId) ? "selected" : ""}
                    >${escapeHTML(name)}</option>
                `;
            }).join("")}
        `;
    }

    function monthlyEquivalent(item) {
        const amount = Number(item.amount ?? 0);

        switch (frequencyOf(item)) {
            case "WEEKLY":
                return amount * 52 / 12;
            case "MONTHLY":
                return amount;
            case "QUARTERLY":
                return amount / 3;
            case "YEARLY":
                return amount / 12;
            default:
                return 0;
        }
    }

    function updateSummary() {
        const active = recurringItems.filter(
            (item) => statusOf(item) === "ACTIVE"
        );

        const monthlyExpenses = active
            .filter((item) => typeOf(item) === "EXPENSE")
            .reduce((sum, item) => sum + monthlyEquivalent(item), 0);

        const monthlyIncome = active
            .filter((item) => typeOf(item) === "INCOME")
            .reduce((sum, item) => sum + monthlyEquivalent(item), 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const nextDates = active
            .map((item) => parseDate(nextDueOf(item)))
            .filter((date) => date && date >= today)
            .sort((a, b) => a - b);

        if (el.count) {
            el.count.textContent = recurringItems.length;
        }

        if (el.monthlyExpenses) {
            el.monthlyExpenses.textContent = money(monthlyExpenses);
        }

        if (el.monthlyIncome) {
            el.monthlyIncome.textContent = money(monthlyIncome);
        }

        if (el.nextDue) {
            el.nextDue.textContent = nextDates.length
                ? nextDates[0].toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short"
                })
                : "—";
        }
    }

    function getFilteredItems() {
        const query = String(el.search?.value ?? "")
            .trim()
            .toLowerCase();

        const type = el.typeFilter?.value ?? "ALL";
        const frequency = el.frequencyFilter?.value ?? "ALL";
        const status = el.statusFilter?.value ?? "ALL";

        return recurringItems.filter((item) => {
            const title = titleOf(item).toLowerCase();
            const category = String(
                item.category_name ?? item.category ?? ""
            ).toLowerCase();

            return (
                (!query || title.includes(query) || category.includes(query)) &&
                (type === "ALL" || typeOf(item) === type) &&
                (frequency === "ALL" || frequencyOf(item) === frequency) &&
                (status === "ALL" || statusOf(item) === status)
            );
        }).sort((a, b) => nextDueOf(a).localeCompare(nextDueOf(b)));
    }

    let paginationElement = null;

function ensurePaginationElement() {
    if (paginationElement) return paginationElement;

    const table = el.tableBody?.closest("table");
    if (!table) return null;

    paginationElement = document.createElement("div");
    paginationElement.id = "recurring-pagination";
    paginationElement.className = "recurring-pagination";
    table.insertAdjacentElement("afterend", paginationElement);

    paginationElement.addEventListener("click", (event) => {
        const button = event.target.closest("[data-page]");
        if (!button || button.disabled) return;

        currentPage = Number(button.dataset.page);
        renderItems();
    });

    return paginationElement;
}

function renderPagination(totalItems, totalPages) {
    const container = ensurePaginationElement();
    if (!container) return;

    if (totalItems <= PAGE_SIZE) {
        container.innerHTML = totalItems
            ? `<span>Showing ${totalItems} of ${totalItems}</span>`
            : "";
        return;
    }

    const first = (currentPage - 1) * PAGE_SIZE + 1;
    const last = Math.min(currentPage * PAGE_SIZE, totalItems);

    let buttons = "";

    for (let page = 1; page <= totalPages; page++) {
        buttons += `
            <button type="button"
                data-page="${page}"
                class="${page === currentPage ? "active" : ""}"
                ${page === currentPage ? 'aria-current="page"' : ""}>
                ${page}
            </button>
        `;
    }

    container.innerHTML = `
        <span>Showing ${first}–${last} of ${totalItems}</span>
        <div class="recurring-pagination-controls">
            <button type="button" data-page="${currentPage - 1}"
                ${currentPage === 1 ? "disabled" : ""}>
                Previous
            </button>
            ${buttons}
            <button type="button" data-page="${currentPage + 1}"
                ${currentPage === totalPages ? "disabled" : ""}>
                Next
            </button>
        </div>
    `;
}
function renderItems() {
    if (!el.tableBody) return;

    const items = getFilteredItems();

    const totalPages = Math.max(
        1,
        Math.ceil(items.length / PAGE_SIZE)
    );

    // Current page ko valid range mein rakho
    currentPage = Math.min(
        Math.max(1, currentPage),
        totalPages
    );

    // Sirf current page ke records display honge
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const visibleItems = items.slice(
        startIndex,
        startIndex + PAGE_SIZE
    );

    el.tableBody.innerHTML = visibleItems.map((item) => {
        const id = idOf(item);
        const type = typeOf(item);
        const status = statusOf(item);
        const frequency = frequencyOf(item);
        const category = item.category_name ?? item.category ?? "";

        const actions = `
            <div class="recurring-actions">
                <button type="button"
                    class="recurring-action-btn"
                    data-action="history"
                    data-id="${escapeHTML(id)}">
                    Payment History
                </button>

                <button type="button"
                    class="recurring-action-btn"
                    data-action="edit"
                    data-id="${escapeHTML(id)}">Edit</button>

                <button type="button"
                    class="recurring-action-btn"
                    data-action="toggle"
                    data-id="${escapeHTML(id)}">
                    ${status === "ACTIVE" ? "Pause" : "Resume"}
                </button>

                <button type="button"
                    class="recurring-action-btn delete"
                    data-action="delete"
                    data-id="${escapeHTML(id)}">Delete</button>
            </div>
        `;

        return `
            <tr>
                <td>
                    <div class="recurring-description">
                        ${escapeHTML(titleOf(item))}
                    </div>
                    ${category ? `
                        <div class="recurring-category">
                            ${escapeHTML(category)}
                        </div>
                    ` : ""}
                </td>
                <td>
                    <span class="recurring-type ${type.toLowerCase()}">
                        ${type}
                    </span>
                </td>
                <td>${escapeHTML(frequency)}</td>
                <td>${formatDate(nextDueOf(item))}</td>
                <td class="recurring-amount">${money(item.amount)}</td>
                <td>
                    <span class="recurring-status ${status.toLowerCase()}">
                        ${escapeHTML(status)}
                    </span>
                </td>
                <td>${actions}</td>
            </tr>
        `;
    }).join("");

    if (el.empty) {
        el.empty.hidden = items.length > 0;
    }

    // Pagination display
    renderPagination(items.length, totalPages);
}

    async function loadRecurring() {
        showMessage("Loading recurring transactions...");

        try {
            const response = await API.get("/api/recurring");
            recurringItems = extractArray(response, "recurring");

            updateSummary();
            renderItems();

            showMessage(
                `${recurringItems.length} recurring transaction(s) loaded.`
            );
        } catch (error) {
            console.error("Unable to load recurring transactions:", error);

            recurringItems = [];
            updateSummary();
            renderItems();

            showMessage(
                error.message ||
                "Unable to load recurring transactions. Check your backend endpoint.",
                "error"
            );
        }
    }

    function openForm(item = null) {
        if (!el.form || !el.formPanel) return;

        editingId = item ? idOf(item) : null;
        el.form.reset();

        if (el.recurringId) {
            el.recurringId.value = editingId ?? "";
        }

        populateCategories(item?.category_id ?? "");

        if (item) {
            el.form.elements.title.value = titleOf(item);
            el.form.elements.amount.value = item.amount ?? "";
            el.form.elements.type.value = typeOf(item);
            el.form.elements.frequency.value = frequencyOf(item);
            el.form.elements.start_date.value =
                String(item.start_date ?? "").slice(0, 10);
            el.form.elements.end_date.value =
                String(item.end_date ?? "").slice(0, 10);
            el.form.elements.next_due_date.value = nextDueOf(item);
            el.form.elements.status.value = statusOf(item);
            el.form.elements.notes.value = item.notes ?? "";
        } else {
            const today = new Date().toLocaleDateString("en-CA");
            el.form.elements.start_date.value = today;
            el.form.elements.next_due_date.value = today;
        }

        if (el.formTitle) {
            el.formTitle.textContent = item
                ? "Edit recurring transaction"
                : "Add recurring transaction";
        }

        if (el.saveButton) {
            el.saveButton.textContent = item
                ? "Save changes"
                : "Save recurring transaction";
        }

        el.formPanel.hidden = false;
        el.formPanel.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

        el.form.elements.title.focus();
    }

    function closeForm() {
        if (el.formPanel) el.formPanel.hidden = true;
        if (el.form) el.form.reset();
        if (el.recurringId) el.recurringId.value = "";

        editingId = null;
    }

    function getPayload() {
        return {
            title: el.form.elements.title.value.trim(),
            amount: Number(el.form.elements.amount.value),
            type: el.form.elements.type.value,
            category_id: el.form.elements.category_id.value || null,
            frequency: el.form.elements.frequency.value,
            start_date: el.form.elements.start_date.value,
            end_date: el.form.elements.end_date.value || null,
            next_due_date: el.form.elements.next_due_date.value,
            status: el.form.elements.status.value,
            notes: el.form.elements.notes.value.trim()
        };
    }

    async function saveRecurring(event) {
        event.preventDefault();

        if (!el.form.reportValidity()) return;

        const payload = getPayload();

        if (!payload.title || !payload.start_date || !payload.next_due_date) {
            showMessage("Complete all required fields.", "error");
            return;
        }

        if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
            showMessage("Enter an amount greater than zero.", "error");
            return;
        }

        if (payload.end_date && payload.end_date < payload.start_date) {
            showMessage("End date cannot be earlier than the start date.", "error");
            return;
        }

        const wasEditing = editingId != null;

        try {
            if (el.saveButton) {
                el.saveButton.disabled = true;
                el.saveButton.textContent = "Saving...";
            }

            if (wasEditing) {
                await API.put(
                    `/api/recurring/${encodeURIComponent(editingId)}`,
                    payload
                );
            } else {
                await API.post("/api/recurring", payload);
            }

            closeForm();

            showMessage(
                wasEditing
                    ? "Recurring transaction updated."
                    : "Recurring transaction added.",
                "success"
            );

            await loadRecurring();
        } catch (error) {
            console.error("Unable to save recurring transaction:", error);

            showMessage(
                error.message || "Unable to save recurring transaction.",
                "error"
            );
        } finally {
            if (el.saveButton) {
                el.saveButton.disabled = false;
                el.saveButton.textContent = "Save recurring transaction";
            }
        }
    }

    async function toggleStatus(id) {
        const item = recurringItems.find(
            (record) => String(idOf(record)) === String(id)
        );

        if (!item) return;

        const newStatus = statusOf(item) === "ACTIVE" ? "PAUSED" : "ACTIVE";

        const payload = {
            title: titleOf(item),
            amount: Number(item.amount),
            type: typeOf(item),
            category_id: item.category_id ?? null,
            frequency: frequencyOf(item),
            start_date: String(item.start_date ?? "").slice(0, 10),
            end_date: item.end_date
                ? String(item.end_date).slice(0, 10)
                : null,
            next_due_date: nextDueOf(item),
            status: newStatus,
            notes: item.notes ?? ""
        };

        try {
            await API.put(
                `/api/recurring/${encodeURIComponent(id)}`,
                payload
            );

            showMessage(
                `Recurring transaction ${newStatus.toLowerCase()}.`,
                "success"
            );

            await loadRecurring();
        } catch (error) {
            showMessage(error.message || "Unable to update status.", "error");
        }
    }

    
async function deleteRecurring(id) {
    const item = recurringItems.find(
        (record) => String(idOf(record)) === String(id)
    );

    if (!item) return;

    const confirmed = await showRecurringDeleteConfirmation(
        `Delete "${titleOf(item)}"?`,
        "This action cannot be undone."
    );

    if (!confirmed) return;

    try {
        await API.delete(`/api/recurring/${encodeURIComponent(id)}`);

        showMessage("Recurring transaction deleted.", "success");
        await loadRecurring();
    } catch (error) {
        console.error("Unable to delete recurring transaction:", error);
        showMessage(error.message || "Unable to delete item.", "error");
    }
}


function showRecurringDeleteConfirmation(message, description) {
    return new Promise((resolve) => {
        document.querySelector("#recurring-delete-modal")?.remove();

        const modal = document.createElement("div");
        modal.id = "recurring-delete-modal";
        modal.className = "recurring-delete-overlay";

        modal.innerHTML = `
            <div class="recurring-delete-dialog"
                 role="dialog"
                 aria-modal="true"
                 aria-labelledby="recurring-delete-title">

                <div class="recurring-delete-icon">!</div>

                <h2 id="recurring-delete-title">
                    Delete recurring transaction?
                </h2>

                <p class="recurring-delete-message"></p>
                <p class="recurring-delete-description"></p>

                <div class="recurring-delete-actions">
                    <button type="button" class="recurring-delete-cancel">
                        Cancel
                    </button>

                    <button type="button" class="recurring-delete-confirm">
                        Delete
                    </button>
                </div>
            </div>
        `;

        modal.querySelector(".recurring-delete-message").textContent =
            message;
        modal.querySelector(".recurring-delete-description").textContent =
            description;

        document.body.appendChild(modal);
        document.body.classList.add("recurring-modal-open");

        const cancelButton =
            modal.querySelector(".recurring-delete-cancel");
        const deleteButton =
            modal.querySelector(".recurring-delete-confirm");

        function closeModal(result) {
            modal.remove();
            document.body.classList.remove("recurring-modal-open");
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

   
async function openPaymentHistory(id, page = 1) {
    const item = recurringItems.find(
        (record) => String(idOf(record)) === String(id)
    );

    if (!item || !el.historyModal) return;

    currentHistoryId = id;
    historyPage = page;

    el.historyModal.hidden = false;
    el.historyTitle.textContent = `Payment History — ${titleOf(item)}`;
    el.historySubtitle.textContent =
        `${money(item.amount)} · ${frequencyOf(item)}`;

    const cacheKey = `${id}-${page}`;
    const cached = paymentHistoryCache.get(cacheKey);

    // Cached page: show immediately, without clearing or loading.
    if (cached) {
        paymentHistoryItems = cached.payments;
        historyTotal = cached.total;
        renderPaymentHistory(id);
        return;
    }

    el.historyBody.innerHTML = "";
    el.historyMessage.textContent = "Loading payment history...";

    try {
        const response = await API.get(
            `/api/recurring/${encodeURIComponent(id)}/payments?page=${page}&per_page=${HISTORY_PAGE_SIZE}`
        );

        paymentHistoryItems = extractArray(response, "payments");
        historyTotal = Number(
            response.total ?? paymentHistoryItems.length
        );

        paymentHistoryCache.set(cacheKey, {
            payments: paymentHistoryItems,
            total: historyTotal
        });

        renderPaymentHistory(id);
    } catch (error) {
        console.error("Unable to load payment history:", error);
        el.historyMessage.textContent =
            error.message || "Could not load payment history.";
    }
}


async function togglePaymentStatus(button) {
    const recurringId = button.dataset.recurringId;
    const dueDate = button.dataset.dueDate;
    const currentlyPaid = button.dataset.status === "PAID";

    document.querySelector("#payment-method-picker")?.remove();

    const picker = document.createElement("div");
    picker.id = "payment-method-picker";
    picker.className = "history-payment-method-group";

    if (currentlyPaid) {
        // Mark Unpaid: show Confirm and Cancel buttons
        picker.innerHTML = `
            <p>Are you sure you want to mark this payment as unpaid?</p>
            <div class="history-payment-method-actions">
                <button type="button" id="confirm-mark-unpaid">
                    Confirm Unpaid
                </button>
                <button type="button" id="cancel-payment-method">
                    Cancel
                </button>
            </div>
        `;
    } else {
        // Existing Mark Paid UI — unchanged
        picker.innerHTML = `
            <label for="history-payment-method">Payment Type</label>
            <select id="history-payment-method">
                <option value="">Select payment method</option>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="CARD">Debit / Credit Card</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
            </select>
            <div class="history-payment-method-actions">
                <button type="button" id="confirm-payment-method">
                    Confirm Paid
                </button>
                <button type="button" id="cancel-payment-method">
                    Cancel
                </button>
            </div>
        `;
    }

    const row = createPickerRow(picker);
    button.closest("tr")?.insertAdjacentElement("afterend", row);
    
const methodSelect = picker.querySelector("#history-payment-method");

if (methodSelect) {
    methodSelect.addEventListener("change", () => {
        if (methodSelect.value) {
            methodSelect.removeAttribute("aria-invalid");
            methodSelect.style.border = "";

            picker.querySelector(".payment-method-error")?.remove();
        }
    });
}
    

    picker.querySelector("#cancel-payment-method")
        .addEventListener("click", () => row.remove());

    if (currentlyPaid) {
        picker.querySelector("#confirm-mark-unpaid")
            .addEventListener("click", async (event) => {
                const confirmButton = event.currentTarget;
                confirmButton.disabled = true;

                try {
                    await updatePaymentStatus(
                        button, recurringId, dueDate, "UNPAID", null
                    );

                    row.remove();
                } finally {
                    confirmButton.disabled = false;
                }
            });
    } else {
        picker.querySelector("#confirm-payment-method")
            .addEventListener("click", async (event) => {
                const confirmButton = event.currentTarget;
                const method =
                    picker.querySelector("#history-payment-method").value;

                
if (!method) {
    const select = picker.querySelector("#history-payment-method");

    select.setAttribute("aria-invalid", "true");
    select.style.border = "1px solid #ef4444";

    let error = picker.querySelector(".payment-method-error");

    if (!error) {
        error = document.createElement("p");
        error.className = "payment-method-error";
        error.textContent =
            "Please select a payment method before confirming payment.";
        error.style.color = "#ef4444";
        error.style.fontSize = "13px";
        error.style.margin = "6px 0 0";

        select.insertAdjacentElement("afterend", error);
    }

    select.focus();
    return;
}


                confirmButton.disabled = true;

                try {
                    await updatePaymentStatus(
                        button, recurringId, dueDate, "PAID", method
                    );

                    row.remove();
                } finally {
                    confirmButton.disabled = false;
                }
            });
    }
}


function createPickerRow(picker) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 5;
    cell.appendChild(picker);
    row.appendChild(cell);

    return row;
}


async function updatePaymentStatus(
    button, recurringId, dueDate, status, paymentMethod
) {
    button.disabled = true;

    try {
        const response = await API.post(
            `/api/recurring/${encodeURIComponent(recurringId)}/payment`,
            {
                due_date: dueDate,
                payment_status: status,
                payment_method: paymentMethod
            }
        );
        console.log("Payment update response:", response);
        // Read the updated Next Due date returned by Flask.
        const nextDueDate = response?.next_due_date;

        const updatePayment = (payment) => {
            if (
                String(payment.recurring_id) !== String(recurringId) ||
                String(payment.due_date).slice(0, 10) !== dueDate
            ) {
                return;
            }

            payment.payment_status = status;
            payment.payment_method = paymentMethod;
        };

        paymentHistoryItems.forEach(updatePayment);

        // Update cached payment history pages.
        paymentHistoryCache.forEach((cached) => {
            cached.payments.forEach(updatePayment);
        });

        // Update the current payment history row.
        const row = button.closest("tr");

        if (row) {
            row.cells[2].textContent = status;
            row.cells[3].textContent = paymentMethod || "—";

            button.dataset.status = status;
            button.textContent =
                `Mark ${status === "PAID" ? "Unpaid" : "Paid"}`;
        }

        // Update Next Due in the recurring transaction card/table.
        if (nextDueDate) {
            const recurringElement = document.querySelector(
                `[data-recurring-id="${recurringId}"]`
            );

            if (recurringElement) {
                const nextDueElement = recurringElement.querySelector(
                    "[data-next-due]"
                );

                if (nextDueElement) {
                    nextDueElement.textContent = nextDueDate;
                }
            }
        }
            // Refresh the recurring list so its Next Due date is updated.
    await loadRecurring();

        showMessage("Payment status updated successfully.", "success");

    } catch (error) {
        console.error("Unable to update payment status:", error);

        el.historyMessage.textContent =
            error.message || "Could not update payment status.";

    } finally {
        button.disabled = false;
    }
}

function renderPaymentHistory(recurringId) {
    const payments = paymentHistoryItems;

    const totalPages = Math.max(
        1,
        Math.ceil(historyTotal / HISTORY_PAGE_SIZE)
    );

    const start = (historyPage - 1) * HISTORY_PAGE_SIZE;

    // Backend returns only the records for the current page.
    const visiblePayments = payments;

    if (!payments.length) {
        el.historyBody.innerHTML = `
            <tr>
                <td colspan="5">No payment history available.</td>
            </tr>
        `;

        el.historyMessage.textContent =
            historyTotal > 0
                ? "No records returned for this page."
                : "Payment occurrences will appear here.";

        renderHistoryPagination(historyTotal, totalPages);
        return;
    }

    el.historyBody.innerHTML = visiblePayments.map((payment) => {
        const dueDate = String(payment.due_date).slice(0, 10);
        const paid = payment.payment_status === "PAID";

        return `
            <tr>
                <td>${formatDate(dueDate)}</td>
                <td>${money(payment.amount)}</td>
                <td>${paid ? "PAID" : "UNPAID"}</td>
                <td>${escapeHTML(payment.payment_method || "—")}</td>
                <td>
                    <button type="button"
                        class="recurring-action-btn"
                        data-payment-action="toggle"
                        data-recurring-id="${escapeHTML(recurringId)}"
                        data-due-date="${escapeHTML(dueDate)}"
                        data-status="${paid ? "PAID" : "UNPAID"}">
                        Mark ${paid ? "Unpaid" : "Paid"}
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    el.historyMessage.textContent =
        `Showing ${start + 1}–${Math.min(
            start + payments.length,
            historyTotal
        )} of ${historyTotal} payment occurrences`;

    renderHistoryPagination(historyTotal, totalPages);
}





function renderHistoryPagination(totalItems, totalPages) {
    let container = document.querySelector(
        "#payment-history-pagination"
    );

    if (!container) {
        container = document.createElement("div");
        container.id = "payment-history-pagination";
        container.className = "recurring-pagination";

        el.historyBody.closest("table")
            ?.insertAdjacentElement("afterend", container);
    }

    if (totalItems <= HISTORY_PAGE_SIZE) {
        container.innerHTML = "";
        return;
    }

    let pageButtons = "";

    for (let page = 1; page <= totalPages; page++) {
        pageButtons += `
            <button type="button"
                data-history-page="${page}"
                class="${page === historyPage ? "active" : ""}">
                ${page}
            </button>
        `;
    }

    container.innerHTML = `
        <button type="button"
            data-history-page="${historyPage - 1}"
            ${historyPage === 1 ? "disabled" : ""}>
            Previous
        </button>

        ${pageButtons}

        <button type="button"
            data-history-page="${historyPage + 1}"
            ${historyPage === totalPages ? "disabled" : ""}>
            Next
        </button>
    `;
}

    function handleTableClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const { action, id } = button.dataset;
    if (id == null) return;

    const item = recurringItems.find(
        (record) => String(idOf(record)) === String(id)
    );

    if (action === "history") openPaymentHistory(id);
    if (action === "edit" && item) openForm(item);
    if (action === "toggle") toggleStatus(id);
    if (action === "delete") deleteRecurring(id);
}

    function initialize() {
        el.showForm?.addEventListener("click", () => openForm());
        el.cancelForm?.addEventListener("click", closeForm);
        el.cancelFormSecondary?.addEventListener("click", closeForm);
        el.form?.addEventListener("submit", saveRecurring);
        el.tableBody?.addEventListener("click", handleTableClick);
        el.closeHistory?.addEventListener("click", () => {
        el.historyModal.hidden = true;
        });

        el.historyBody?.addEventListener("click", (event) => {
            const button = event.target.closest(
                "button[data-payment-action='toggle']"
            );

            if (button) togglePaymentStatus(button);
        });
        // Payment History pagination
        document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-history-page]");

    if (!button || button.disabled || !currentHistoryId) return;

    const page = Number(button.dataset.historyPage);

    if (page < 1 || page === historyPage) return;

    await openPaymentHistory(currentHistoryId, page);
});

        [
            el.search,
            el.typeFilter,
            el.frequencyFilter,
            el.statusFilter
        ].forEach((control) => {
            control?.addEventListener(
                control === el.search ? "input" : "change",
                () => {
                    currentPage = 1;
                    renderItems();
                }
            );
        });

        Promise.allSettled([
            loadCategories(),
            loadRecurring()
        ]);
    }

    document.addEventListener("DOMContentLoaded", initialize);
})();