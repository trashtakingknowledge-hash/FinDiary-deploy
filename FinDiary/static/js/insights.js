
/* =========================================
   FINDIARY — INSIGHTS PAGE
   File: static/js/insights.js
   ========================================= */

(() => {
    "use strict";

    const API = window.ZorvynAPI;
    const $ = (selector) => document.querySelector(selector);

    let transactions = [];
    let charts = {};
    let loading = false;
    let categories = [];

    const COLORS = [
        "#9d77ff", "#68d8b0", "#f4bd70", "#ff8585",
        "#70b7ff", "#e58bd8", "#8ed5dc", "#b7c78b",
        "#d8a87e", "#a8a8ff"
    ];

    const money = (amount) => {
        const value = Number(amount ?? 0);

        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 2
        }).format(Number.isFinite(value) ? value : 0);
    };

    const escapeHTML = (value) =>
        String(value ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]);

    function showStatus(message, type = "") {
        const node = $("#insights-status");
        if (!node) return;

        node.textContent = message;
        node.className = "insights-status";

        if (type) node.classList.add(type);
    }

    function extractTransactions(response) {
        if (Array.isArray(response)) return response;
        if (Array.isArray(response?.transactions)) return response.transactions;
        if (Array.isArray(response?.items)) return response.items;
        if (Array.isArray(response?.data)) return response.data;

        return [];
    }

    function getDate(transaction) {
        return String(
            transaction.txn_date ??
            transaction.transaction_date ??
            transaction.date ??
            ""
        ).slice(0, 10);
    }

    function getType(transaction) {
        const type = String(
            transaction.txn_type ??
            transaction.type ??
            transaction.transaction_type ??
            "EXPENSE"
        ).toUpperCase();

        return type.includes("INCOME") || type === "CREDIT"
            ? "INCOME"
            : "EXPENSE";
    }

    async function loadCategories() {
        try {
            const response = await API.get("/api/categories");

            categories = Array.isArray(response)
                ? response
                : response?.categories ?? [];
        } catch (error) {
            console.error("Failed to load categories:", error);
            categories = [];
        }
    }

    function getCategory(transaction) {
        const categoryId = transaction.category_id;

        if (transaction.category_name || transaction.category) {
            return String(
                transaction.category_name ?? transaction.category
            );
        }

        const category = categories.find(
            (item) =>
                String(item.category_id ?? item.id) === String(categoryId)
        );

        return category?.name ?? category?.category_name ?? "Uncategorized";
    }

    function parseDate(value) {
        if (!value) return null;

        const date = new Date(`${value.slice(0, 10)}T00:00:00`);

        return Number.isNaN(date.getTime()) ? null : date;
    }

    function selectedDays() {
        return Math.max(1, Number($("#insights-period")?.value || 90));
    }

    function getFilteredTransactions() {
        const days = selectedDays();
        const end = new Date();
        end.setHours(23, 59, 59, 999);

        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - days + 1);

        return transactions.filter((transaction) => {
            const date = parseDate(getDate(transaction));
            return date && date >= start && date <= end;
        });
    }

    function setText(selector, value) {
        const node = $(selector);
        if (node) node.textContent = value;
    }

    function destroyChart(key) {
        if (charts[key]) {
            charts[key].destroy();
            delete charts[key];
        }
    }

    function setEmpty(canvasId, emptyId, isEmpty) {
        const canvas = document.getElementById(canvasId);
        const empty = document.getElementById(emptyId);

        if (canvas) canvas.style.display = isEmpty ? "none" : "block";
        if (empty) empty.hidden = !isEmpty;
    }

    function chartOptions() {
        const muted = getComputedStyle(document.documentElement)
            .getPropertyValue("--text-muted").trim() || "#a5a6bd";

        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: muted,
                        usePointStyle: true,
                        boxWidth: 8,
                        padding: 16
                    }
                },
                tooltip: {
                    callbacks: {
                        label(context) {
                            const value = context.parsed?.y ?? context.parsed;
                            return `${context.dataset.label || context.label}: ${money(value)}`;
                        }
                    }
                }
            }
        };
    }

    function updateMetrics(data) {
        let income = 0;
        let expenses = 0;
        let largestExpense = 0;
        let totalAmount = 0;

        data.forEach((transaction) => {
            const amount = Number(transaction.amount ?? 0);
            totalAmount += amount;

            if (getType(transaction) === "INCOME") {
                income += amount;
            } else {
                expenses += amount;
                largestExpense = Math.max(largestExpense, amount);
            }
        });

        const savingsRate = income > 0
            ? ((income - expenses) / income) * 100
            : null;

        setText("#insights-income", money(income));
        setText("#insights-expenses", money(expenses));
        setText(
            "#insights-savings-rate",
            savingsRate === null ? "—" : `${savingsRate.toFixed(1)}%`
        );
        setText("#insights-daily-average", money(expenses / selectedDays()));

        setText("#snapshot-transaction-count", String(data.length));
        setText(
            "#snapshot-average-transaction",
            money(data.length ? totalAmount / data.length : 0)
        );
        setText("#snapshot-largest-expense", money(largestExpense));
        setText("#snapshot-net-cashflow", money(income - expenses));
    }

    function groupByCategory(data) {
        const totals = new Map();

        data.filter((transaction) => getType(transaction) === "EXPENSE")
            .forEach((transaction) => {
                const category = getCategory(transaction);
                totals.set(
                    category,
                    (totals.get(category) || 0) +
                    Number(transaction.amount ?? 0)
                );
            });

        return [...totals.entries()].sort((a, b) => b[1] - a[1]);
    }

    function renderIncomeExpenseChart(data) {
        const grouped = new Map();

        data.forEach((transaction) => {
            const date = getDate(transaction);

            if (!grouped.has(date)) {
                grouped.set(date, { income: 0, expenses: 0 });
            }

            const item = grouped.get(date);
            const amount = Number(transaction.amount ?? 0);

            if (getType(transaction) === "INCOME") {
                item.income += amount;
            } else {
                item.expenses += amount;
            }
        });

        const labels = [...grouped.keys()].sort();

        setEmpty(
            "income-expense-chart",
            "income-expense-empty",
            labels.length === 0
        );

        destroyChart("incomeExpense");

        if (!labels.length || !window.Chart) return;

        charts.incomeExpense = new Chart($("#income-expense-chart"), {
            type: "bar",
            data: {
                labels,
                datasets: [
                    {
                        label: "Income",
                        data: labels.map((date) => grouped.get(date).income),
                        backgroundColor: "#68d8b0",
                        borderRadius: 4
                    },
                    {
                        label: "Expenses",
                        data: labels.map((date) => grouped.get(date).expenses),
                        backgroundColor: "#9d77ff",
                        borderRadius: 4
                    }
                ]
            },
            options: {
                ...chartOptions(),
                scales: {
                    x: {
                        ticks: {
                            color: "#a5a6bd",
                            maxTicksLimit: 8,
                            maxRotation: 0
                        },
                        grid: { display: false }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: "#a5a6bd",
                            callback: (value) => money(value)
                        },
                        grid: { color: "rgba(150,150,180,.12)" }
                    }
                }
            }
        });
    }

    function renderCategoryChart(data) {
        const entries = groupByCategory(data);

        setEmpty(
            "category-chart",
            "category-chart-empty",
            entries.length === 0
        );

        destroyChart("category");

        const legend = $("#category-legend");

        if (entries.length && window.Chart) {
            charts.category = new Chart($("#category-chart"), {
                type: "doughnut",
                data: {
                    labels: entries.map(([name]) => name),
                    datasets: [{
                        data: entries.map(([, amount]) => amount),
                        backgroundColor: entries.map(
                            (_, index) => COLORS[index % COLORS.length]
                        ),
                        borderWidth: 2,
                        borderColor: "#17172a",
                        hoverOffset: 5
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: "67%",
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (context) =>
                                    `${context.label}: ${money(context.parsed)}`
                            }
                        }
                    }
                }
            });
        }

        const total = entries.reduce(
            (sum, [, amount]) => sum + amount,
            0
        );

        if (legend) {
            legend.innerHTML = entries.length
                ? entries.slice(0, 7).map(
                    ([name, amount], index) => `
                        <div class="insights-legend-item">
                            <div class="insights-legend-name">
                                <span
                                    class="insights-legend-dot"
                                    style="background:${COLORS[index % COLORS.length]}"
                                ></span>
                                <span>${escapeHTML(name)}</span>
                            </div>
                            <span class="insights-legend-value">
                                ${money(amount)}
                                ${total ? ` · ${(amount / total * 100).toFixed(1)}%` : ""}
                            </span>
                        </div>
                    `
                ).join("")
                : "";
        }
    }

    function renderTrendChart(data) {
        const grouped = new Map();

        data.filter((transaction) => getType(transaction) === "EXPENSE")
            .forEach((transaction) => {
                const date = getDate(transaction);
                grouped.set(
                    date,
                    (grouped.get(date) || 0) +
                    Number(transaction.amount ?? 0)
                );
            });

        const labels = [...grouped.keys()].sort();

        setEmpty(
            "spending-trend-chart",
            "spending-trend-empty",
            labels.length === 0
        );

        destroyChart("trend");

        if (!labels.length || !window.Chart) return;

        charts.trend = new Chart($("#spending-trend-chart"), {
            type: "line",
            data: {
                labels,
                datasets: [{
                    label: "Daily spending",
                    data: labels.map((date) => grouped.get(date)),
                    borderColor: "#9d77ff",
                    backgroundColor: "rgba(157,119,255,.15)",
                    fill: true,
                    tension: 0.35,
                    pointRadius: labels.length > 40 ? 0 : 3,
                    pointHoverRadius: 5
                }]
            },
            options: {
                ...chartOptions(),
                scales: {
                    x: {
                        ticks: {
                            color: "#a5a6bd",
                            maxTicksLimit: 10,
                            maxRotation: 0
                        },
                        grid: { display: false }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: "#a5a6bd",
                            callback: (value) => money(value)
                        },
                        grid: { color: "rgba(150,150,180,.12)" }
                    }
                }
            }
        });
    }

    function renderTopCategories(data) {
        const entries = groupByCategory(data);
        const list = $("#top-categories-list");

        if (!list) return;

        if (!entries.length) {
            list.innerHTML = `
                <div class="insights-chart-empty">
                    No expense data yet. Add your first expense
                    to see spending insights.
                </div>
            `;
            return;
        }

        const max = entries[0][1] || 1;

        list.innerHTML = entries.slice(0, 6).map(
            ([name, amount], index) => `
                <div class="insights-top-category">
                    <div class="insights-top-category-header">
                        <span>${escapeHTML(name)}</span>
                        <strong>${money(amount)}</strong>
                    </div>
                    <div class="insights-progress-track">
                        <div
                            class="insights-progress-fill"
                            style="
                                width:${Math.max(2, amount / max * 100)}%;
                                background:${COLORS[index % COLORS.length]}
                            "
                        ></div>
                    </div>
                </div>
            `
        ).join("");
    }

    function renderInsights() {
        const data = getFilteredTransactions();

        updateMetrics(data);
        renderIncomeExpenseChart(data);
        renderCategoryChart(data);
        renderTrendChart(data);
        renderTopCategories(data);
    }

    async function loadInsights() {
        if (loading) return;

        loading = true;
        showStatus("Loading insights...");

        try {
            if (!API) {
                throw new Error("Shared API helper is missing.");
            }

            const response = await API.get("/api/transactions");
            transactions = extractTransactions(response);

            renderInsights();
            showStatus("Insights updated.", "success");
        } catch (error) {
            console.error("Unable to load insights:", error);

            transactions = [];
            renderInsights();

            showStatus(
                error.message || "Unable to load insights.",
                "error"
            );
        } finally {
            loading = false;
        }
    }

    async function initialize() {
        $("#insights-period")?.addEventListener("change", renderInsights);
        $("#refresh-insights")?.addEventListener("click", loadInsights);

        await loadCategories();
        await loadInsights();
    }

    document.addEventListener("DOMContentLoaded", initialize);
})();
