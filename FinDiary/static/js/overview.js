
/**
 * Zorvyn Overview
 * Loads dashboard information from the Flask backend.
 */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const elements = {
        balance: document.getElementById("total-balance"),
        income: document.getElementById("total-income"),
        expenses: document.getElementById("total-expenses"),
        savings: document.getElementById("total-savings"),
        transactions: document.getElementById("recent-transactions"),
        breakdown: document.getElementById("spending-breakdown"),
        goals: document.getElementById("savings-goals"),
        bills: document.getElementById("upcoming-bills"),
        chart: document.getElementById("financial-chart"),
        message: document.getElementById("overview-message")
    };

    const currencyFormatter = new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    function formatCurrency(value) {
        const amount = Number(value);

        if (!Number.isFinite(amount)) {
            return currencyFormatter.format(0);
        }

        return currencyFormatter.format(amount);
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "—";
        }

        return date.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    }

    function showMessage(message, type = "info") {
        if (!elements.message) return;

        elements.message.textContent = message;
        elements.message.dataset.type = type;
    }

    function showEmptyState(element, title, description) {
        if (!element) return;

        element.replaceChildren();

        const heading = document.createElement("p");
        heading.textContent = title;

        const detail = document.createElement("span");
        detail.textContent = description;

        element.append(heading, detail);
    }

    // -------------------------------
    // Summary metrics
    // -------------------------------

    function renderSummary(data) {
        if (elements.balance) {
            elements.balance.textContent = formatCurrency(
                data.total_balance
            );
        }

        if (elements.income) {
            elements.income.textContent = formatCurrency(
                data.total_income
            );
        }

        if (elements.expenses) {
            elements.expenses.textContent = formatCurrency(
                data.total_expenses
            );
        }

        if (elements.savings) {
            const savings = Number(data.total_savings);

            elements.savings.textContent = formatCurrency(
                Number.isFinite(savings)
                    ? savings
                    : Number(data.total_income || 0) -
                      Number(data.total_expenses || 0)
            );
        }
    }

    // -------------------------------
    // Recent transactions
    // -------------------------------

    function renderTransactions(transactions) {
        if (!elements.transactions) return;

        if (!Array.isArray(transactions) || transactions.length === 0) {
            elements.transactions.innerHTML = `
                <tr>
                    <td colspan="4">
                        <div class="table-empty">
                            No transactions available yet.
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        elements.transactions.innerHTML = transactions
            .slice(0, 5)
            .map(transaction => {
                const type = String(transaction.type || "expense")
                    .toLowerCase();

                const isIncome = type === "income";

                return `
                    <tr>
                        <td>${escapeHTML(transaction.description || "Transaction")}</td>
                        <td>${escapeHTML(transaction.category || "Other")}</td>
                        <td>${escapeHTML(formatDate(transaction.date))}</td>
                        <td class="${isIncome ? "amount-income" : "amount-expense"}">
                            ${isIncome ? "+" : "−"}${escapeHTML(
                                formatCurrency(transaction.amount)
                            )}
                        </td>
                    </tr>
                `;
            })
            .join("");
    }

    // -------------------------------
    // Spending breakdown
    // -------------------------------

    function renderBreakdown(categories) {
        if (!elements.breakdown) return;

        if (!Array.isArray(categories) || categories.length === 0) {
            showEmptyState(
                elements.breakdown,
                "No spending data yet.",
                "Expense categories will appear here."
            );
            return;
        }

        elements.breakdown.innerHTML = categories
            .map(category => {
                const amount = Number(category.amount) || 0;

                return `
                    <div class="breakdown-row">
                        <div class="breakdown-info">
                            <span>${escapeHTML(category.category || "Other")}</span>
                            <strong>${escapeHTML(formatCurrency(amount))}</strong>
                        </div>
                    </div>
                `;
            })
            .join("");
    }

    // -------------------------------
    // Savings goals
    // -------------------------------

    function renderGoals(goals) {
        if (!elements.goals) return;

        if (!Array.isArray(goals) || goals.length === 0) {
            showEmptyState(
                elements.goals,
                "No savings goals created.",
                "Create a goal to track your progress."
            );
            return;
        }

        elements.goals.innerHTML = goals
            .slice(0, 3)
            .map(goal => {
                const target = Number(goal.target_amount) || 0;
                const saved = Number(goal.saved_amount) || 0;

                const percentage = target > 0
                    ? Math.min(100, Math.max(0, saved / target * 100))
                    : 0;

                return `
                    <div class="goal-item">
                        <div class="goal-item-heading">
                            <span>${escapeHTML(goal.name || "Savings goal")}</span>
                            <strong>${percentage.toFixed(0)}%</strong>
                        </div>

                        <div class="progress-track">
                            <div
                                class="progress-fill"
                                style="width: ${percentage}%"
                            ></div>
                        </div>

                        <div class="goal-item-footer">
                            <span>${escapeHTML(formatCurrency(saved))} saved</span>
                            <span>Target ${escapeHTML(formatCurrency(target))}</span>
                        </div>
                    </div>
                `;
            })
            .join("");
    }

    // -------------------------------
    // Upcoming bills
    // -------------------------------

    function renderBills(bills) {
        if (!elements.bills) return;

        if (!Array.isArray(bills) || bills.length === 0) {
            showEmptyState(
                elements.bills,
                "No upcoming bills to display.",
                "Add bills to track upcoming payments."
            );
            return;
        }

        elements.bills.innerHTML = bills
            .slice(0, 4)
            .map(bill => `
                <div class="bill-item">
                    <div>
                        <strong>${escapeHTML(bill.name || "Bill")}</strong>
                        <p>${escapeHTML(formatDate(bill.due_date))}</p>
                    </div>

                    <strong>${escapeHTML(
                        formatCurrency(bill.amount)
                    )}</strong>
                </div>
            `)
            .join("");
    }

    // -------------------------------
    // Financial chart placeholder
    // -------------------------------

    function renderChart(data) {
        if (!elements.chart) return;

        const hasActivity =
            Number(data.total_income || 0) !== 0 ||
            Number(data.total_expenses || 0) !== 0;

        if (!hasActivity) {
            elements.chart.replaceChildren();

            const title = document.createElement("p");
            title.textContent = "No financial activity yet.";

            const description = document.createElement("span");
            description.textContent =
                "Add transactions to see your financial overview.";

            elements.chart.append(title, description);
        }
    }

    // -------------------------------
    // Load dashboard data
    // -------------------------------

    async function loadOverview() {
        if (!window.ZorvynAPI) {
            showMessage(
                "API client not loaded. Check static/js/api.js.",
                "error"
            );
            return;
        }

        showMessage("Loading your financial overview...");

        try {
            const data = await window.ZorvynAPI.get("/api/overview");

            renderSummary(data);
            renderTransactions(data.recent_transactions);
            renderBreakdown(data.spending_breakdown);
            renderGoals(data.goals);
            renderBills(data.upcoming_bills);
            renderChart(data);

            showMessage("");
        } catch (error) {
            console.error("Overview loading failed:", error);

            showMessage(
                error.message || "Unable to load your financial overview.",
                "error"
            );
        }
    }

    loadOverview();

    // Allow other scripts to refresh the dashboard.
    window.ZorvynOverview = Object.freeze({
        refresh: loadOverview
    });
});
