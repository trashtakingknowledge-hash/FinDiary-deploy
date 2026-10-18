/* =========================================
   ZORVYN — TRANSACTIONS PAGE
   File: static/js/transactions.js
   ========================================= */

(() => {
    "use strict";

    const API = window.ZorvynAPI;

    if (!API) {
        console.error("ZorvynAPI is missing. Check static/js/api.js.");
        return;
    }

    const $ = (selector) => document.querySelector(selector);

    const PAGE_SIZE = 10;

    const el = {
        formPanel: $("#transaction-form-panel"),
        form: $("#transaction-form"),
        formTitle: $("#transaction-form-title"),
        transactionId: $("#transaction_id"),
        showForm: $("#show-transaction-form"),
        cancelForm: $("#cancel-transaction-form"),
        cancelFormSecondary: $("#cancel-transaction-form-secondary"),
        saveButton: $("#save-transaction-btn"),

        search: $("#transaction-search"),
        typeFilter: $("#transaction-type-filter"),
        categoryFilter: $("#transaction-category-filter"),
        periodFilter: $("#transaction-period-filter"),

        tableBody: $("#transactions-table-body"),
        empty: $("#transactions-empty"),
        status: $("#transactions-status"),

        count: $("#transaction-count"),
        income: $("#transaction-income"),
        expenses: $("#transaction-expenses"),
        net: $("#transaction-net"),

        categorySelect: $("#transaction-category"),

        pagination: $("#transactions-pagination"),
        paginationInfo: $("#transactions-pagination-info"),
        previous: $("#transactions-prev-page"),
        next: $("#transactions-next-page")
    };

    let transactions = [];
    let categories = [];
    let editingId = null;
    let currentPage = 1;

    const escapeHTML = (value) =>
        String(value ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]);

    const money = (amount, currency = "INR") => {
        const value = Number(amount ?? 0);

        try {
            return new Intl.NumberFormat("en-IN", {
                style: "currency",
                currency,
                maximumFractionDigits: 2
            }).format(Number.isFinite(value) ? value : 0);
        } catch {
            return `₹${value.toFixed(2)}`;
        }
    };

    function normalizeType(transaction) {
        const raw = String(
            transaction.txn_type ??
            transaction.type ??
            transaction.transaction_type ??
            "EXPENSE"
        ).toUpperCase();

        return raw.includes("INCOME") || raw === "CREDIT"
            ? "INCOME"
            : "EXPENSE";
    }

    function transactionId(transaction) {
        return transaction.id ??
            transaction.transaction_id ??
            transaction.txn_id;
    }

    function transactionDate(transaction) {
        return String(
            transaction.txn_date ??
            transaction.transaction_date ??
            transaction.date ??
            ""
        ).slice(0, 10);
    }

    function transactionDescription(transaction) {
        return transaction.title ??
            transaction.description ??
            transaction.name ??
            "Untitled transaction";
    }

    function transactionCategory(transaction) {
        return transaction.category_name ??
            transaction.category ??
            transaction.category_label ??
            "Uncategorized";
    }

    function dateObject(value) {
        if (!value) return null;

        const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);

        return Number.isNaN(date.getTime()) ? null : date;
    }

    function formatDate(value) {
        const date = dateObject(value);

        if (!date) return "—";

        return date.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    }

    function showStatus(message, type = "") {
        if (!el.status) return;

        el.status.textContent = message;
        el.status.className = "transactions-status";

        if (type) {
            el.status.classList.add(type);
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

            populateCategorySelects();
        } catch (error) {
            console.error("Could not load categories:", error);

            showStatus(
                "Categories could not be loaded. Check your categories API.",
                "error"
            );
        }
    }

    function populateCategorySelects(selectedId = "") {
        if (el.categorySelect) {
            el.categorySelect.innerHTML = `
                <option value="">Select a category</option>
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

        if (el.categoryFilter) {
            const previousValue = el.categoryFilter.value || "ALL";

            el.categoryFilter.innerHTML = `
                <option value="ALL">All categories</option>
                ${categories.map((category) => {
                    const id = category.id ?? category.category_id;
                    const name = category.name ?? category.category_name;

                    return `
                        <option value="${escapeHTML(id)}">
                            ${escapeHTML(name)}
                        </option>
                    `;
                }).join("")}
            `;

            if (
                [...el.categoryFilter.options].some(
                    (option) => option.value === previousValue
                )
            ) {
                el.categoryFilter.value = previousValue;
            }
        }
    }

    async function loadTransactions() {
        showStatus("Loading transactions...");

        try {
            const response = await API.get("/api/transactions");
            transactions = extractArray(response, "transactions");

            updateSummary();
            currentPage = 1;
            renderTransactions();

            showStatus(
                `${transactions.length} transaction(s) loaded.`,
                "success"
            );
        } catch (error) {
            console.error("Could not load transactions:", error);
            transactions = [];

            updateSummary();
            renderTransactions();

            showStatus(
                error.message || "Unable to load transactions.",
                "error"
            );
        }
    }

    function updateSummary() {
        const income = transactions.reduce((total, transaction) => {
            return normalizeType(transaction) === "INCOME"
                ? total + Number(transaction.amount ?? 0)
                : total;
        }, 0);

        const expenses = transactions.reduce((total, transaction) => {
            return normalizeType(transaction) === "EXPENSE"
                ? total + Number(transaction.amount ?? 0)
                : total;
        }, 0);

        if (el.count) {
            el.count.textContent = transactions.length;
        }

        if (el.income) {
            el.income.textContent = money(income);
        }

        if (el.expenses) {
            el.expenses.textContent = money(expenses);
        }

        if (el.net) {
            el.net.textContent = money(income - expenses);
        }
    }

    function matchesPeriod(transaction, period) {
        if (!period || period === "ALL") return true;

        const date = dateObject(transactionDate(transaction));

        if (!date) return false;

        const now = new Date();
        const startToday = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
        );

        const daysAgo = Math.floor(
            (startToday.getTime() - date.getTime()) / 86400000
        );

        if (period === "7DAYS") {
            return daysAgo >= 0 && daysAgo < 7;
        }

        if (period === "30DAYS") {
            return daysAgo >= 0 && daysAgo < 30;
        }

        if (period === "THIS_MONTH") {
            return date.getFullYear() === now.getFullYear() &&
                date.getMonth() === now.getMonth();
        }

        if (period === "THIS_YEAR") {
            return date.getFullYear() === now.getFullYear();
        }

        return true;
    }

    function getFilteredTransactions() {
        const query = String(el.search?.value ?? "")
            .trim()
            .toLowerCase();

        const type = el.typeFilter?.value ?? "ALL";
        const category = el.categoryFilter?.value ?? "ALL";
        const period = el.periodFilter?.value ?? "ALL";

        return transactions
            .filter((transaction) => {
                const description = transactionDescription(transaction)
                    .toLowerCase();

                const categoryName = transactionCategory(transaction)
                    .toLowerCase();

                const matchesSearch =
                    !query ||
                    description.includes(query) ||
                    categoryName.includes(query);

                const matchesType =
                    type === "ALL" || normalizeType(transaction) === type;

                const categoryId =
                    transaction.category_id ??
                    transaction.categoryId ??
                    "";

                const matchesCategory =
                    category === "ALL" ||
                    String(categoryId) === String(category) ||
                    (
                        !categoryId &&
                        String(transactionCategory(transaction)) ===
                        String(
                            categories.find(
                                (item) =>
                                    String(item.id ?? item.category_id) ===
                                    String(category)
                            )?.name ?? ""
                        )
                    );

                return matchesSearch &&
                    matchesType &&
                    matchesCategory &&
                    matchesPeriod(transaction, period);
            })
            .sort((a, b) =>
                transactionDate(b).localeCompare(transactionDate(a))
            );
    }

    function renderTransactions() {
        if (!el.tableBody) return;

        const filtered = getFilteredTransactions();
        const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

        currentPage = Math.min(currentPage, totalPages);

        const startIndex = (currentPage - 1) * PAGE_SIZE;
        const pageItems = filtered.slice(
            startIndex,
            startIndex + PAGE_SIZE
        );

        el.tableBody.innerHTML = pageItems.map((transaction) => {
            const id = transactionId(transaction);
            const type = normalizeType(transaction);
            const category = transactionCategory(transaction);
            const description = transactionDescription(transaction);

            const paymentMethod = String(
                transaction.payment_method ?? "—"
            ).replaceAll("_", " ");

            const actions = `
                <div class="transaction-actions">
                    <button
                        type="button"
                        class="transaction-action-btn"
                        data-action="edit"
                        data-id="${escapeHTML(id)}"
                    >Edit</button>

                    <button
                        type="button"
                        class="transaction-action-btn delete"
                        data-action="delete"
                        data-id="${escapeHTML(id)}"
                    >Delete</button>
                </div>
            `;

            return `
                <tr>
                    <td>
                        <div class="transaction-description">
                            ${escapeHTML(description)}
                        </div>
                        ${transaction.notes ? `
                            <div class="transaction-notes">
                                ${escapeHTML(transaction.notes)}
                            </div>
                        ` : ""}
                    </td>

                    <td>
                        <span class="transaction-category">
                            <span class="transaction-category-dot"></span>
                            ${escapeHTML(category)}
                        </span>
                    </td>

                    <td>${formatDate(transactionDate(transaction))}</td>

                    <td>${escapeHTML(paymentMethod)}</td>

                    <td>
                        <span class="transaction-type ${type.toLowerCase()}">
                            ${type}
                        </span>
                    </td>

                    <td class="transaction-amount ${type.toLowerCase()}">
                        ${type === "INCOME" ? "+" : "−"}${money(
                            transaction.amount,
                            transaction.currency_code || "INR"
                        )}
                    </td>

                    <td>${actions}</td>
                </tr>
            `;
        }).join("");

        if (el.empty) {
            el.empty.hidden = pageItems.length > 0;
        }

        if (el.paginationInfo) {
            el.paginationInfo.textContent = filtered.length
                ? `Showing ${startIndex + 1}–${Math.min(
                    startIndex + PAGE_SIZE,
                    filtered.length
                )} of ${filtered.length} transactions`
                : "No transactions";
        }

        if (el.previous) {
            el.previous.disabled = currentPage <= 1;
        }

        if (el.next) {
            el.next.disabled = currentPage >= totalPages;
        }
    }

    function openForm(transaction = null) {
        if (!el.form || !el.formPanel) return;

        editingId = transaction ? transactionId(transaction) : null;
        el.form.reset();

        if (el.transactionId) {
            el.transactionId.value = editingId ?? "";
        }

        if (transaction) {
            el.form.elements.title.value = transactionDescription(transaction);
            el.form.elements.amount.value = transaction.amount ?? "";
            el.form.elements.type.value = normalizeType(transaction);
            el.form.elements.date.value = transactionDate(transaction);

            el.form.elements.payment_method.value =
                transaction.payment_method ?? "";

            el.form.elements.notes.value = transaction.notes ?? "";

            populateCategorySelects(
                transaction.category_id ??
                transaction.categoryId ??
                ""
            );
        } else {
            const dateInput = el.form.elements.date;

            if (dateInput) {
                dateInput.value = new Date().toLocaleDateString("en-CA");
            }

            populateCategorySelects();
        }

        if (el.formTitle) {
            el.formTitle.textContent = transaction
                ? "Edit transaction"
                : "Add transaction";
        }

        if (el.saveButton) {
            el.saveButton.textContent = transaction
                ? "Save changes"
                : "Save transaction";
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
        if (el.transactionId) el.transactionId.value = "";

        editingId = null;
    }

    function formPayload() {
        return {
            title: el.form.elements.title.value.trim(),
            amount: Number(el.form.elements.amount.value),
            type: el.form.elements.type.value,
            category_id: el.form.elements.category_id.value,
            date: el.form.elements.date.value,
            payment_method: el.form.elements.payment_method.value,
            notes: el.form.elements.notes.value.trim()
        };
    }

    async function saveTransaction(event) {
        event.preventDefault();

        if (!el.form.reportValidity()) return;
        const paymentMethod = el.form.elements.payment_method;
const paymentMethodError = "Please select a payment method.";

if (!paymentMethod.value) {
    paymentMethod.setAttribute("aria-invalid", "true");
    paymentMethod.style.border = "1px solid #ef4444";

    let error = el.form.querySelector(".payment-method-error");

    if (!error) {
        error = document.createElement("p");
        error.className = "payment-method-error";
        error.style.color = "#ef4444";
        error.style.fontSize = "13px";
        error.style.margin = "6px 0 0";

        paymentMethod.insertAdjacentElement("afterend", error);
    }

    error.textContent = paymentMethodError;
    paymentMethod.focus();
    return;
}paymentMethod.removeAttribute("aria-invalid");
paymentMethod.style.border = "";
el.form.querySelector(".payment-method-error")?.remove();

        const payload = formPayload();

        if (!payload.title || !payload.date || !payload.category_id) {
            showStatus(
                "Enter a description, date, and category.",
                "error"
            );
            return;
        }

        if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
            showStatus("Enter an amount greater than zero.", "error");
            return;
        }

        const saveButton = el.saveButton;
        const wasEditing = editingId != null;

        try {
            if (saveButton) {
                saveButton.disabled = true;
                saveButton.textContent = "Saving...";
            }

            if (wasEditing) {
                await API.put(
                    `/api/transactions/${encodeURIComponent(editingId)}`,
                    payload
                );
            } else {
                await API.post("/api/transactions", payload);
            }

            closeForm();

            showStatus(
                wasEditing
                    ? "Transaction updated successfully."
                    : "Transaction added successfully.",
                "success"
            );

            await loadTransactions();
        } catch (error) {
            console.error("Unable to save transaction:", error);

            showStatus(
                error.message || "Unable to save transaction.",
                "error"
            );
        } finally {
            if (saveButton) {
                saveButton.disabled = false;
                saveButton.textContent = "Save transaction";
            }
        }
    }

    const paymentMethodField = el.form.elements.payment_method;

        paymentMethodField.addEventListener("change", () => {
            if (paymentMethodField.value) {
                paymentMethodField.removeAttribute("aria-invalid");
                paymentMethodField.style.border = "";
                el.form.querySelector(".payment-method-error")?.remove();
            }
        });

    
async function deleteTransaction(id) {
    const transaction = transactions.find(
        (item) => String(transactionId(item)) === String(id)
    );

    if (!transaction) return;

    const confirmed = await showDeleteConfirmation(
        `Delete "${transactionDescription(transaction)}"?`,
        "This action cannot be undone."
    );

    if (!confirmed) return;

    try {
        await API.delete(
            `/api/transactions/${encodeURIComponent(id)}`
        );

        showStatus("Transaction deleted successfully.", "success");
        await loadTransactions();
    } catch (error) {
        console.error("Unable to delete transaction:", error);

        showStatus(
            error.message || "Unable to delete transaction.",
            "error"
        );
    }
}


function showDeleteConfirmation(message, description) {
    return new Promise((resolve) => {
        document.querySelector("#transaction-delete-modal")?.remove();

        const modal = document.createElement("div");
        modal.id = "transaction-delete-modal";
        modal.className = "transaction-delete-overlay";

        modal.innerHTML = `
            <div class="transaction-delete-dialog"
                 role="dialog"
                 aria-modal="true"
                 aria-labelledby="transaction-delete-title">

                <div class="transaction-delete-icon">!</div>

                <h2 id="transaction-delete-title">Confirm deletion</h2>

                <p class="transaction-delete-message"></p>
                <p class="transaction-delete-description"></p>

                <div class="transaction-delete-actions">
                    <button type="button"
                            class="transaction-delete-cancel">
                        Cancel
                    </button>

                    <button type="button"
                            class="transaction-delete-confirm">
                        Delete
                    </button>
                </div>
            </div>
        `;

        modal.querySelector(".transaction-delete-message").textContent =
            message;

        modal.querySelector(".transaction-delete-description").textContent =
            description;

        document.body.appendChild(modal);
        document.body.classList.add("transaction-modal-open");

        const cancelButton =
            modal.querySelector(".transaction-delete-cancel");

        const deleteButton =
            modal.querySelector(".transaction-delete-confirm");

        function closeModal(result) {
            modal.remove();
            document.body.classList.remove("transaction-modal-open");
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


    function handleTableClick(event) {
        const button = event.target.closest("button[data-action]");

        if (!button) return;

        const id = button.dataset.id;
        const action = button.dataset.action;

        if (id == null) return;

        const transaction = transactions.find(
            (item) => String(transactionId(item)) === String(id)
        );

        if (action === "edit" && transaction) {
            openForm(transaction);
        }

        if (action === "delete") {
            deleteTransaction(id);
        }
    }

    function initialize() {
        el.showForm?.addEventListener("click", () => openForm());
        el.cancelForm?.addEventListener("click", closeForm);
        el.cancelFormSecondary?.addEventListener("click", closeForm);
        el.form?.addEventListener("submit", saveTransaction);
        el.tableBody?.addEventListener("click", handleTableClick);

        el.search?.addEventListener("input", () => {
            currentPage = 1;
            renderTransactions();
        });

        [
            el.typeFilter,
            el.categoryFilter,
            el.periodFilter
        ].forEach((filter) => {
            filter?.addEventListener("change", () => {
                currentPage = 1;
                renderTransactions();
            });
        });

        el.previous?.addEventListener("click", () => {
            if (currentPage > 1) {
                currentPage--;
                renderTransactions();
            }
        });

        el.next?.addEventListener("click", () => {
            currentPage++;
            renderTransactions();
        });

        loadCategories().finally(loadTransactions);
    }

    document.addEventListener("DOMContentLoaded", initialize);
})();