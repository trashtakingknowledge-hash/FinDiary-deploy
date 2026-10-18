
/* ========================================
   ZORVYN — LOGIN JAVASCRIPT
   ======================================== */

"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("login-form");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const togglePassword = document.getElementById("toggle-password");
    const submitButton = document.getElementById("submit-btn");
    const messageBox = document.getElementById("login-message");

    if (!loginForm) return;

    // Show success/error messages
    function showMessage(message, type = "error") {
        if (!messageBox) return;

        messageBox.textContent = message;
        messageBox.hidden = false;
        messageBox.dataset.type = type;
    }

    function clearMessage() {
        if (!messageBox) return;

        messageBox.textContent = "";
        messageBox.hidden = true;
        delete messageBox.dataset.type;
    }

    // Show or hide password
    if (togglePassword && passwordInput) {
        togglePassword.addEventListener("click", () => {
            const shouldShow = passwordInput.type === "password";

            passwordInput.type = shouldShow ? "text" : "password";
            togglePassword.textContent = shouldShow ? "Hide" : "Show";
            togglePassword.setAttribute("aria-pressed", String(shouldShow));
            togglePassword.setAttribute(
                "aria-label",
                shouldShow ? "Hide password" : "Show password"
            );
        });
    }

    // Clear errors while the user edits fields
    [emailInput, passwordInput].forEach((input) => {
        if (!input) return;

        input.addEventListener("input", clearMessage);
    });

    // Login form submission
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearMessage();

        const email = emailInput?.value.trim() ?? "";
        const password = passwordInput?.value ?? "";

        if (!email || !password) {
            showMessage("Please enter your login ID and password.");
            return;
        }

        if (email.length > 254) {
            showMessage("Your login ID is too long.");
            return;
        }

        if (password.length > 1024) {
            showMessage("Your password is too long.");
            return;
        }

        const buttonText = submitButton?.querySelector(".button-text");
        const originalText = buttonText?.textContent ?? "Sign in";

        if (submitButton) {
            submitButton.disabled = true;
        }

        if (buttonText) {
            buttonText.textContent = "Signing in...";
        }

        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "same-origin",
                body: JSON.stringify({
                    email,
                    password
                })
            });

            let data;

            try {
                data = await response.json();
            } catch {
                throw new Error(
                    "The server returned an unexpected response. Please try again."
                );
            }

            if (!response.ok) {
                console.error("Login API status:", response.status);
                console.error("Login API response:", data);

                 throw new Error(
                   data.message ||
                   data.error ||
                    `Login failed. HTTP ${response.status}`
                  );
                }

            if (data.success === false) {
                throw new Error(data.error || "Login failed.");
            }

            showMessage("Login successful. Opening your dashboard...", "success");

            window.location.assign(data.redirect || "/overview");

        } catch (error) {
            showMessage(
                error instanceof Error
                    ? error.message
                    : "Unable to sign in. Please try again."
            );
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
            }

            if (buttonText) {
                buttonText.textContent = originalText;
            }
        }
    });
});
