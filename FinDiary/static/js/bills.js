/* =========================================
   ZORVYN — BILLS PAGE
   File: static/js/bills.js
   ========================================= */

(() => {
    "use strict";

    const API = window.ZorvynAPI;

    if (!API) {
        console.error("ZorvynAPI is not loaded. Check static/js/api.js.");
        return;
    }

    const $ = (selector) => document.querySelector(selector);

    const elements = {
        formPanel: $("#bill-form-panel"),
        form: $("#bill-form"),
        formTitle: $("#bill-form-title"),
        billId: $("#bill_id"),
        showForm: $("#show-bill-form"),
        cancelForm: $("#cancel-bill-form"),
        cancelFormSecondary: $("#cancel-bill-form-secondary"),
        saveButton: $("#save-bill-btn"),

        search: $("#bill-search"),
        statusFilter: $("#bill-status-filter"),
        periodFilter: $("#bill-period-filter"),
        tableBody: $("#bills-table-body"),
        empty: $("#bills-empty"),
        statusMessage: $("#bills-status"),

        billCount: $("#bill-count"),
        upcomingCount: $("#upcoming-count"),
        overdueCount: $("#overdue-count"),
        outstandingTotal: $("#outstanding-total"),

        status: $("#bill-status"),
        paymentMethodField: $("#payment-method-field"),
        paymentType: $("#bill-payment-type")
    };

    let bills = [];
    let editingBillId = null;
    let saving = false;

    const today = () => {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        return date;
    };

    const escapeHTML = (value) =>
        String(value ?? "").replace(/[&<>"']/g, (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);

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

    const dateOnly = (value) => {
        if (!value) return null;

        const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
        return Number.isNaN(date.getTime()) ? null : date;
    };

    const formatDate = (value) => {
        const date = dateOnly(value);

        if (!date) return "—";

        return date.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    };

    const billIdOf = (bill) => bill?.bill_id ?? bill?.id;

    const getBillEndpoint = (id = null) =>
        id == null ? "/api/bills" : `/api/bills/${encodeURIComponent(id)}`;

    const extractBills = (response) => {
        if (Array.isArray(response)) return response;
        if (Array.isArray(response?.bills)) return response.bills;
        if (Array.isArray(response?.items)) return response.items;
        if (Array.isArray(response?.data)) return response.data;
        return [];
    };

    function showMessage(message, type = "") {
        if (!elements.statusMessage) return;

        elements.statusMessage.textContent = message;
        elements.statusMessage.className = "bills-status";

        if (type) {
            elements.statusMessage.classList.add(type);
        }
    }

    /* ---------- INLINE PAYMENT TYPE ---------- */

    function togglePaymentMethod() {
    const status = document.querySelector("#bill-status");
    const field = document.querySelector("#payment-method-field");
    const paymentType = document.querySelector("#bill-payment-type");

    if (!status || !field || !paymentType) return;

    const isPaid = status.value.trim().toUpperCase() === "PAID";

    field.hidden = !isPaid;
    field.style.display = isPaid ? "" : "none";
    paymentType.required = isPaid;

    if (!isPaid) {
        paymentType.value = "";
    }
}

    /* ---------- STATUS AND SUMMARY ---------- */

    function normalizeStatus(bill) {
        if (String(bill.status ?? "UNPAID").toUpperCase() === "PAID") {
            return "PAID";
        }

        const dueDate = dateOnly(bill.due_date);

        if (dueDate && dueDate < today()) {
            return "OVERDUE";
        }

        return "UPCOMING";
    }

    function updateSummary() {
        const outstanding = bills.filter(
            (bill) => normalizeStatus(bill) !== "PAID"
        );

        const overdue = bills.filter(
            (bill) => normalizeStatus(bill) === "OVERDUE"
        );

        const upcoming = bills.filter(
            (bill) => normalizeStatus(bill) === "UPCOMING"
        );

        if (elements.billCount) {
            elements.billCount.textContent = bills.length;
        }

        if (elements.upcomingCount) {
            elements.upcomingCount.textContent = upcoming.length;
        }

        if (elements.overdueCount) {
            elements.overdueCount.textContent = overdue.length;
        }

        if (elements.outstandingTotal) {
            const total = outstanding.reduce(
                (sum, bill) => sum + Number(bill.amount ?? 0),
                0
            );

            elements.outstandingTotal.textContent = money(total);
        }
    }

    function matchesPeriod(bill, period) {
        const selectedPeriod = String(period || "ALL").toUpperCase();
        const status = String(bill.status || "UNPAID").toUpperCase();

        if (selectedPeriod === "ALL") return true;
        if (status === "PAID") return false;

        const dueDate = dateOnly(bill.due_date);
        if (!dueDate) return false;

        if (selectedPeriod === "UPCOMING") return dueDate >= today();
        if (selectedPeriod === "OVERDUE") return dueDate < today();

        return true;
    }

    function getFilteredBills() {
        const query = String(elements.search?.value || "")
            .trim()
            .toLowerCase();

        const selectedStatus = String(
            elements.statusFilter?.value || "ALL"
        ).toUpperCase();

        const selectedPeriod = String(
            elements.periodFilter?.value || "ALL"
        ).toUpperCase();

        return bills.filter((bill) => {
            const name = String(bill.name ?? bill.bill_name ?? "");
            const category = String(
                bill.category ?? bill.category_name ?? ""
            );
            const notes = String(bill.notes ?? "");
            const status = String(bill.status || "UNPAID").toUpperCase();

            const matchesSearch =
                !query ||
                name.toLowerCase().includes(query) ||
                category.toLowerCase().includes(query) ||
                notes.toLowerCase().includes(query);

            const matchesStatus =
                selectedStatus === "ALL" ||
                (selectedStatus === "PAID" && status === "PAID") ||
                (selectedStatus === "UNPAID" && status !== "PAID");

            return matchesSearch &&
                matchesStatus &&
                matchesPeriod(bill, selectedPeriod);
        });
    }

    /* ---------- RENDER BILLS ---------- */

    function renderBills() {
        if (!elements.tableBody) return;

        const filteredBills = getFilteredBills();

        elements.tableBody.innerHTML = filteredBills.map((bill) => {
            const id = billIdOf(bill);
            const name = bill.name ?? bill.bill_name ?? "Untitled bill";
            const category = bill.category_name ??
                bill.category ?? "Uncategorized";
            const recurrence = String(bill.recurrence ?? "NONE").toUpperCase();
            const status = normalizeStatus(bill);

            const actions = `
                <div class="bill-actions">
                    ${status !== "PAID" ? `
                        <button
                            type="button"
                            class="bill-action-btn"
                            data-action="paid"
                            data-id="${escapeHTML(id)}"
                        >Mark paid</button>
                    ` : ""}

                    <button
                        type="button"
                        class="bill-action-btn"
                        data-action="edit"
                        data-id="${escapeHTML(id)}"
                    >Edit</button>

                    <button
                        type="button"
                        class="bill-action-btn delete"
                        data-action="delete"
                        data-id="${escapeHTML(id)}"
                    >Delete</button>
                </div>
            `;

            return `
                <tr>
                    <td>
                        <div class="bill-name">${escapeHTML(name)}</div>
                        ${bill.notes ? `
                            <div class="bill-notes">
                                ${escapeHTML(bill.notes)}
                            </div>
                        ` : ""}
                    </td>
                    <td>${formatDate(bill.due_date)}</td>
                    <td>${escapeHTML(category)}</td>
                    <td>${escapeHTML(recurrence)}</td>
                    <td class="bill-amount">
                        ${money(bill.amount, bill.currency_code || "INR")}
                    </td>
                    <td>
                        <span class="bill-status ${status.toLowerCase()}">
                            ${escapeHTML(status)}
                        </span>
                    </td>
                    <td>${actions}</td>
                </tr>
            `;
        }).join("");

        if (elements.empty) {
            elements.empty.hidden = filteredBills.length > 0;
        }
    }

    async function loadBills() {
        showMessage("Loading bills...");

        try {
            const response = await API.get("/api/bills");
            bills = extractBills(response);

            updateSummary();
            renderBills();

            showMessage(
                bills.length
                    ? `Total Bills: ${bills.length}`
                    : "No bills found. Add your first bill to get started."
            );
        } catch (error) {
            console.error("Failed to load bills:", error);
            showMessage(
                error.message || "Unable to load bills. Please try again.",
                "error"
            );
        }
    }

    /* ---------- ADD / EDIT FORM ---------- */
function openForm(bill = null) {
    if (!elements.form || !elements.formPanel) return;

    editingBillId = bill ? billIdOf(bill) : null;

    // Reset all form fields
    elements.form.reset();

    if (elements.billId) {
        elements.billId.value = editingBillId ?? "";
    }

    // Default status for a new bill
    elements.status.value = "UNPAID";

    if (bill) {
        elements.form.elements.name.value =
            bill.name ?? bill.bill_name ?? "";

        elements.form.elements.amount.value =
            bill.amount ?? "";

        elements.form.elements.due_date.value =
            String(bill.due_date ?? "").slice(0, 10);

        elements.form.elements.category.value =
            bill.category_name ?? bill.category ?? "";        

        elements.status.value =
            String(bill.status ?? "UNPAID").toUpperCase();

        elements.form.elements.notes.value =
            bill.notes ?? "";
    }

    if (elements.formTitle) {
        elements.formTitle.textContent = bill
            ? "Edit bill"
            : "Add a new bill";
    }

    if (elements.saveButton) {
        elements.saveButton.textContent = bill
            ? "Save changes"
            : "Save bill";
    }

    // Update Payment Type visibility after setting the status
    togglePaymentMethod();

    elements.formPanel.classList.remove("hidden");
    elements.formPanel.hidden = false;

    elements.formPanel.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

    elements.form.elements.name.focus();
}

    function closeForm() {
        if (elements.formPanel) {
            elements.formPanel.classList.add("hidden");
            elements.formPanel.hidden = true;
        }

        elements.form?.reset();
        editingBillId = null;

        if (elements.billId) {
            elements.billId.value = "";
        }

        togglePaymentMethod();
    }

    
function getFormPayload() {
    const form = elements.form;

    return {
        name: form.elements.name.value.trim(),
        amount: Number(form.elements.amount.value),
        due_date: form.elements.due_date.value,
        category: form.elements.category.value.trim(),
        status: form.elements.status.value,
        payment_method: form.elements.payment_method.value || null,
        notes: form.elements.notes.value.trim()
    };
}


    /* ---------- SAVE BILL AND PAYMENT ---------- */

    async function saveBill(event) {
        event.preventDefault();

        if (saving) return;

        const payload = getFormPayload();
        const selectedStatus = String(payload.status || "UNPAID").toUpperCase();
        const paymentTypeField = elements.paymentType;
        elements.paymentType?.addEventListener("change", () => {
            if (elements.paymentType.value) {
                elements.paymentType.removeAttribute("aria-invalid");
                elements.paymentType.style.border = "";

                document
                    .querySelector("#payment-method-field .payment-method-error")
                    ?.remove();
            }
        });
const paymentMethod = paymentTypeField?.value || "";
const paymentField = document.getElementById("payment-method-field");

if (paymentField && !paymentField.hidden && !paymentMethod) {
    paymentTypeField.setAttribute("aria-invalid", "true");
    paymentTypeField.style.border = "1px solid #ef4444";

    let error = paymentField.querySelector(".payment-method-error");

    if (!error) {
        error = document.createElement("p");
        error.className = "payment-method-error";
        error.textContent =
            "Please select a payment method before saving.";
        error.style.color = "#ef4444";
        error.style.fontSize = "13px";
        error.style.margin = "6px 0 0";

        paymentTypeField.insertAdjacentElement("afterend", error);
    }

    paymentTypeField.focus();
    return;
}

paymentTypeField?.removeAttribute("aria-invalid");

if (paymentTypeField) {
    paymentTypeField.style.border = "";
}

paymentField?.querySelector(".payment-method-error")?.remove();

        paymentTypeField.removeAttribute("aria-invalid");
        paymentTypeField.style.border = "";
        paymentTypeField.parentElement
            .querySelector(".payment-method-error")?.remove();
        const existingBill = bills.find(
            (bill) => String(billIdOf(bill)) === String(editingBillId)
        );

        if (!payload.name || !payload.due_date) {
            showMessage("Please complete all required fields.", "error");
            return;
        }

        if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
            showMessage("Enter an amount greater than zero.", "error");
            return;
        }

        if (selectedStatus === "PAID" && !paymentMethod) {
            showMessage("Please select a payment type.", "error");
            elements.paymentType?.focus();
            return;
        }

        saving = true;
        const button = elements.saveButton;
        const wasEditing = editingBillId != null;
        const originalButtonText = button?.textContent || "Save bill";

        if (button) {
            button.disabled = true;
            button.textContent = "Saving...";
        }

        try {
            let billId = editingBillId;
            const wasAlreadyPaid =
                String(existingBill?.status || "").toUpperCase() === "PAID";

            /*
             * Never send PAID directly to create/update.
             * Save the bill as UNPAID first, then use mark-paid endpoint.
             */
            const savePayload = { ...payload };

            if (selectedStatus === "PAID") {
                savePayload.status = "UNPAID";
            }

            if (wasEditing) {
                // For an already-paid bill, preserve its status when editing.
                if (wasAlreadyPaid && selectedStatus === "PAID") {
                    delete savePayload.status;
                }

                await API.put(getBillEndpoint(billId), savePayload);
            } else {
                const result = await API.post("/api/bills", savePayload);

                billId =
                    result?.bill?.bill_id ??
                    result?.bill?.id ??
                    result?.bill_id ??
                    result?.id;

                if (selectedStatus === "PAID" && billId == null) {
                    // Reload in case the API response omits the new bill ID.
                    const refreshed = extractBills(await API.get("/api/bills"));
                    const match = refreshed.find((bill) =>
                        String(bill.name ?? bill.bill_name) === payload.name &&
                        String(bill.due_date).slice(0, 10) === payload.due_date &&
                        Number(bill.amount) === payload.amount
                    );

                    billId = match ? billIdOf(match) : null;
                }
            }

            if (selectedStatus === "PAID" && !wasAlreadyPaid) {
                if (billId == null) {
                    throw new Error(
                        "Bill was saved, but its ID could not be found. Reload bills and try marking it paid."
                    );
                }

                await API.post(
                    `/api/bills/${encodeURIComponent(billId)}/mark-paid`,
                    { payment_method: paymentMethod }
                );
            }

            closeForm();

            showMessage(
                selectedStatus === "PAID"
                    ? (wasAlreadyPaid
                        ? "Bill updated successfully."
                        : "Bill marked paid and expense transaction recorded.")
                    : (wasEditing
                        ? "Bill updated successfully."
                        : "Bill added successfully."),
                "success"
            );

            await loadBills();
        } catch (error) {
            console.error("Failed to save bill:", error);
            showMessage(error.message || "Unable to save bill.", "error");
        } finally {
            saving = false;

            if (button) {
                button.disabled = false;
                button.textContent = editingBillId != null
                    ? "Save changes"
                    : originalButtonText;
            }
        }
    }
    
elements.paymentType?.addEventListener("change", () => {
    if (elements.paymentType.value) {
        elements.paymentType.removeAttribute("aria-invalid");
        elements.paymentType.style.border = "";

        document
            .querySelector("#payment-method-field .payment-method-error")
            ?.remove();
    }
});


    /* ---------- MARK PAID BUTTON ---------- */

    function markPaid(id) {
        const bill = bills.find(
            (item) => String(billIdOf(item)) === String(id)
        );

        if (!bill) return;

        if (String(bill.status || "").toUpperCase() === "PAID") {
            showMessage("This bill is already paid.", "error");
            return;
        }

        openForm(bill);

        elements.status.value = "PAID";
        togglePaymentMethod();
        elements.paymentType?.focus();
    }

    /* ---------- DELETE BILL ---------- */

    
async function deleteBill(id) {
    const bill = bills.find(
        (item) => String(billIdOf(item)) === String(id)
    );

    if (!bill) return;

    const name = bill.name ?? bill.bill_name ?? "this bill";

    const confirmed = await showBillDeleteConfirmation(
        `Delete "${name}"?`,
        "This action cannot be undone."
    );

    if (!confirmed) return;

    try {
        await API.delete(getBillEndpoint(id));
        showMessage("Bill deleted successfully.", "success");
        await loadBills();
    } catch (error) {
        console.error("Failed to delete bill:", error);
        showMessage(error.message || "Unable to delete bill.", "error");
    }
}


function showBillDeleteConfirmation(message, description) {
    return new Promise((resolve) => {
        document.querySelector("#bill-delete-modal")?.remove();

        const modal = document.createElement("div");
        modal.id = "bill-delete-modal";
        modal.className = "bill-delete-overlay";

        modal.innerHTML = `
            <div class="bill-delete-dialog"
                 role="dialog"
                 aria-modal="true"
                 aria-labelledby="bill-delete-title">

                <div class="bill-delete-icon">!</div>

                <h2 id="bill-delete-title">Confirm deletion</h2>

                <p class="bill-delete-message"></p>
                <p class="bill-delete-description"></p>

                <div class="bill-delete-actions">
                    <button type="button" class="bill-delete-cancel">
                        Cancel
                    </button>

                    <button type="button" class="bill-delete-confirm">
                        Delete
                    </button>
                </div>
            </div>
        `;

        modal.querySelector(".bill-delete-message").textContent = message;
        modal.querySelector(".bill-delete-description").textContent =
            description;

        document.body.appendChild(modal);
        document.body.classList.add("bill-modal-open");

        const cancelButton = modal.querySelector(".bill-delete-cancel");
        const deleteButton = modal.querySelector(".bill-delete-confirm");

        function closeModal(result) {
            modal.remove();
            document.body.classList.remove("bill-modal-open");
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

    /* ---------- TABLE ACTIONS ---------- */

    function handleTableClick(event) {
        const button = event.target.closest("button[data-action]");
        if (!button) return;

        const { action, id } = button.dataset;
        if (id == null) return;

        if (action === "paid") {
            markPaid(id);
        } else if (action === "edit") {
            const bill = bills.find(
                (item) => String(billIdOf(item)) === String(id)
            );

            if (bill) openForm(bill);
        } else if (action === "delete") {
            deleteBill(id);
        }
    }


    
document.addEventListener("DOMContentLoaded", async () => {
    const categorySelect = document.getElementById("bill-category");

    if (!categorySelect) return;

    try {
        const response = await window.ZorvynAPI.get("/api/categories");

        const categories = response.categories || [];

        categorySelect.replaceChildren(
            new Option("Select category", "")
        );

        categories
            .filter(category =>
                ["EXPENSE", "BOTH"].includes(
                    (category.kind || "").toUpperCase()
                )
            )
            .forEach(category => {
                categorySelect.add(
                    new Option(category.name, category.name)
                );
            });

    } catch (error) {
        console.error("Could not load categories:", error);
        categorySelect.replaceChildren(
            new Option("Failed to load categories", "")
        );
    }
});


    /* ---------- INITIALIZATION ---------- */

    function initialize() {
        elements.showForm?.addEventListener("click", () => openForm());
        elements.cancelForm?.addEventListener("click", closeForm);
        elements.cancelFormSecondary?.addEventListener("click", closeForm);

        elements.form?.addEventListener("submit", saveBill);
        elements.status?.addEventListener("change", togglePaymentMethod);
        elements.tableBody?.addEventListener("click", handleTableClick);

        elements.search?.addEventListener("input", renderBills);
        elements.statusFilter?.addEventListener("change", renderBills);
        elements.periodFilter?.addEventListener("change", renderBills);

        togglePaymentMethod();
        loadBills();
    }

    document.addEventListener("DOMContentLoaded", initialize);
})();   