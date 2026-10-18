
document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const body = document.body;
    const appShell = document.querySelector(".app-shell");
    const sidebar = document.getElementById("sidebar");

    const sidebarToggle = document.getElementById("sidebar-toggle");
    const sidebarLogo = document.getElementById("sidebar-logo");
    const mobileMenuToggle = document.getElementById("mobile-menu");
    const sidebarOverlay = document.getElementById("sidebar-overlay");

    const logoutButtons = [
        document.getElementById("logout-btn"),
        document.getElementById("sidebar-logout-button")
    ].filter(Boolean);

    const SIDEBAR_KEY = "findiary-sidebar-collapsed";
    

    // Sidebar collapse and expand
    function setSidebarCollapsed(collapsed) {
        if (!appShell) return;

        appShell.classList.toggle("sidebar-collapsed", collapsed);
        localStorage.setItem(SIDEBAR_KEY, String(collapsed));

        if (sidebarToggle) {
            sidebarToggle.title = collapsed ? "" : "Collapse sidebar";
            sidebarToggle.setAttribute(
                "aria-label",
                collapsed ? "Expand sidebar" : "Collapse sidebar"
            );
            sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
        }

        if (sidebarLogo) {
            sidebarLogo.setAttribute("aria-label", "Expand sidebar");
        }
    }

    if (appShell) {
        const savedState = localStorage.getItem(SIDEBAR_KEY);
        const collapsed = savedState !== "false";

        appShell.classList.toggle("sidebar-collapsed", collapsed);

        if (savedState === null) {
            localStorage.setItem(SIDEBAR_KEY, String(collapsed));
        }

        if (sidebarToggle) {
            sidebarToggle.title = collapsed ? "" : "Collapse sidebar";
            sidebarToggle.setAttribute(
                "aria-label",
                collapsed ? "Expand sidebar" : "Collapse sidebar"
            );
            sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
        }

        document.documentElement.classList.remove("sidebar-start-collapsed");
    }

    sidebarToggle?.addEventListener("click", () => {
        setSidebarCollapsed(true);
    });

    sidebarLogo?.addEventListener("click", () => {
        if (appShell?.classList.contains("sidebar-collapsed")) {
            setSidebarCollapsed(false);
        }
    });

    // Mobile navigation
    function openMobileSidebar() {
        body.classList.add("sidebar-open");
        sidebar?.classList.add("mobile-open");
        sidebarOverlay?.classList.add("active");
        mobileMenuToggle?.setAttribute("aria-expanded", "true");
    }

    function closeMobileSidebar() {
        body.classList.remove("sidebar-open");
        sidebar?.classList.remove("mobile-open");
        sidebarOverlay?.classList.remove("active");
        mobileMenuToggle?.setAttribute("aria-expanded", "false");
    }

    mobileMenuToggle?.addEventListener("click", () => {
        body.classList.contains("sidebar-open")
            ? closeMobileSidebar()
            : openMobileSidebar();
    });

    sidebarOverlay?.addEventListener("click", closeMobileSidebar);

    document.querySelectorAll(".sidebar a").forEach((link) => {
        link.addEventListener("click", closeMobileSidebar);
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeMobileSidebar();
        }
    });

    // Dark mode only
body.dataset.theme = "dark";
document.documentElement.dataset.theme = "dark";

    // Custom Logout Modal
    const logoutModal = document.getElementById("logout-modal");
    const cancelLogout = document.getElementById("cancel-logout");
    const confirmLogout = document.getElementById("confirm-logout");

    function showLogoutModal() {
        if (!logoutModal || !cancelLogout || !confirmLogout) {
            console.error("Logout modal elements not found.");
            return Promise.resolve(false);
        }

        logoutModal.classList.remove("hidden");

        return new Promise((resolve) => {
            function closeModal(result) {
                logoutModal.classList.add("hidden");

                cancelLogout.removeEventListener("click", onCancel);
                confirmLogout.removeEventListener("click", onConfirm);

                resolve(result);
            }

            function onCancel() {
                closeModal(false);
            }

            function onConfirm() {
                closeModal(true);
            }

            cancelLogout.addEventListener("click", onCancel);
            confirmLogout.addEventListener("click", onConfirm);
        });
    }

    // Logout
    logoutButtons.forEach((button) => {
        button.addEventListener("click", async () => {
            const confirmed = await showLogoutModal();

            if (!confirmed) return;

            logoutButtons.forEach((item) => {
                item.disabled = true;
            });

            try {
                if (!window.ZorvynAPI) {
                    window.location.href = "/logout";
                    return;
                }

                await window.ZorvynAPI.post("/api/auth/logout", {});
                window.location.href = "/login";
            } catch (error) {
                console.error("Logout failed:", error);
                window.location.href = "/logout";
            }
        });
    });
});

// document.addEventListener("DOMContentLoaded", () => {
//     "use strict";

//     const body = document.body;
//     const appShell = document.querySelector(".app-shell");
//     const sidebar = document.getElementById("sidebar");

//     const sidebarToggle = document.getElementById("sidebar-toggle");
//     const sidebarLogo = document.getElementById("sidebar-logo");
//     const mobileMenuToggle = document.getElementById("mobile-menu");
//     const sidebarOverlay = document.getElementById("sidebar-overlay");
//     const themeToggle = document.getElementById("theme-btn");

//     const logoutButtons = [
//         document.getElementById("logout-btn"),
//         document.getElementById("sidebar-logout-button")
//     ].filter(Boolean);

//     const SIDEBAR_KEY = "findiary-sidebar-collapsed";
//     const THEME_KEY = "zorvyn-theme";

//     // Sidebar collapse and expand
//     function setSidebarCollapsed(collapsed) {
//         if (!appShell) return;

//         appShell.classList.toggle("sidebar-collapsed", collapsed);
//         localStorage.setItem(SIDEBAR_KEY, String(collapsed));

//         if (sidebarToggle) {
//             sidebarToggle.title = collapsed ? "" : "Collapse sidebar";
//             sidebarToggle.setAttribute(
//                 "aria-label",
//                 collapsed ? "Expand sidebar" : "Collapse sidebar"
//             );
//             sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
//         }

//         if (sidebarLogo) {
//             sidebarLogo.setAttribute("aria-label", "Expand sidebar");
//         }
//     }

//     if (appShell) {
//     const savedState = localStorage.getItem(SIDEBAR_KEY);
//     const collapsed = savedState !== "false";

//     appShell.classList.toggle("sidebar-collapsed", collapsed);

//     if (savedState === null) {
//         localStorage.setItem(SIDEBAR_KEY, String(collapsed));
//     }

//     if (sidebarToggle) {
//         sidebarToggle.title = collapsed ? "" : "Collapse sidebar";
//         sidebarToggle.setAttribute(
//             "aria-label",
//             collapsed ? "Expand sidebar" : "Collapse sidebar"
//         );
//         sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
//     }

//     document.documentElement.classList.remove("sidebar-start-collapsed");
//     }

//     sidebarToggle?.addEventListener("click", () => {
//         setSidebarCollapsed(true);
//     });

//     sidebarLogo?.addEventListener("click", () => {
//         if (appShell?.classList.contains("sidebar-collapsed")) {
//             setSidebarCollapsed(false);
//         }
//     });

//     // Mobile navigation
//     function openMobileSidebar() {
//         body.classList.add("sidebar-open");
//         sidebar?.classList.add("mobile-open");
//         sidebarOverlay?.classList.add("active");
//         mobileMenuToggle?.setAttribute("aria-expanded", "true");
//     }

//     function closeMobileSidebar() {
//         body.classList.remove("sidebar-open");
//         sidebar?.classList.remove("mobile-open");
//         sidebarOverlay?.classList.remove("active");
//         mobileMenuToggle?.setAttribute("aria-expanded", "false");
//     }

//     mobileMenuToggle?.addEventListener("click", () => {
//         body.classList.contains("sidebar-open")
//             ? closeMobileSidebar()
//             : openMobileSidebar();
//     });

//     sidebarOverlay?.addEventListener("click", closeMobileSidebar);

//     document.querySelectorAll(".sidebar a").forEach((link) => {
//         link.addEventListener("click", closeMobileSidebar);
//     });

//     document.addEventListener("keydown", (event) => {
//         if (event.key === "Escape") {
//             closeMobileSidebar();
//         }
//     });

//     // Theme toggle
//     function applyTheme(theme) {
//         const selectedTheme = theme === "light" ? "light" : "dark";

//         body.dataset.theme = selectedTheme;
//         document.documentElement.dataset.theme = selectedTheme;

//         themeToggle?.setAttribute(
//             "aria-pressed",
//             String(selectedTheme === "light")
//         );

//         themeToggle?.setAttribute(
//             "aria-label",
//             selectedTheme === "dark"
//                 ? "Switch to light theme"
//                 : "Switch to dark theme"
//         );
//     }

//     applyTheme(localStorage.getItem(THEME_KEY) || "dark");

//     themeToggle?.addEventListener("click", () => {
//         const currentTheme =
//             document.documentElement.dataset.theme || "dark";

//         const nextTheme = currentTheme === "dark" ? "light" : "dark";

//         applyTheme(nextTheme);
//         localStorage.setItem(THEME_KEY, nextTheme);
//     });

//     // Logout
//     logoutButtons.forEach((button) => {
//         button.addEventListener("click", async () => {
//             if (!window.confirm("Are you sure you want to log out?")) {
//                 return;
//             }

//             logoutButtons.forEach((item) => {
//                 item.disabled = true;
//             });

//             try {
//                 if (!window.ZorvynAPI) {
//                     window.location.href = "/logout";
//                     return;
//                 }

//                 await window.ZorvynAPI.post("/api/auth/logout", {});
//                 window.location.href = "/login";
//             } catch (error) {
//                 console.error("Logout failed:", error);
//                 window.location.href = "/logout";
//             }
//         });
//     });
// });

//     // Custom Logout Modal
//     const logoutModal = document.getElementById("logout-modal");
//     const cancelLogout = document.getElementById("cancel-logout");
//     const confirmLogout = document.getElementById("confirm-logout");

//     function showLogoutModal() {
//         if (!logoutModal || !cancelLogout || !confirmLogout) {
//             console.error("Logout modal elements not found.");
//             return Promise.resolve(false);
//         }

//         logoutModal.classList.remove("hidden");

//         return new Promise((resolve) => {
//             function closeModal(result) {
//                 logoutModal.classList.add("hidden");
//                 cancelLogout.removeEventListener("click", onCancel);
//                 confirmLogout.removeEventListener("click", onConfirm);
//                 resolve(result);
//             }

//             function onCancel() {
//                 closeModal(false);
//             }

//             function onConfirm() {
//                 closeModal(true);
//             }

//             cancelLogout.addEventListener("click", onCancel);
//             confirmLogout.addEventListener("click", onConfirm);
//         });
//     }

//     // Logout
//     logoutButtons.forEach((button) => {
//         button.addEventListener("click", async () => {
//             const confirmed = await showLogoutModal();

//             if (!confirmed) return;

//             logoutButtons.forEach((item) => {
//                 item.disabled = true;
//             });

//             try {
//                 if (!window.ZorvynAPI) {
//                     window.location.href = "/logout";
//                     return;
//                 }

//                 await window.ZorvynAPI.post("/api/auth/logout", {});
//                 window.location.href = "/login";
//             } catch (error) {
//                 console.error("Logout failed:", error);
//                 window.location.href = "/logout";
//             }
//         });
//     });
