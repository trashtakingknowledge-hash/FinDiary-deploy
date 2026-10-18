
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const signupForm = document.getElementById("signup-form");
    const fullNameInput = document.getElementById("full_name");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const confirmPasswordInput = document.getElementById("confirm_password");
    const signupButton = document.getElementById("signup-btn");
    const messageBox = document.getElementById("signup-message");

    if (!signupForm) return;

    function showMessage(message, type = "error") {
        messageBox.textContent = message;
        messageBox.dataset.type = type;
        messageBox.hidden = false;
    }

    function clearMessage() {
        messageBox.textContent = "";
        messageBox.hidden = true;
        delete messageBox.dataset.type;
    }

    signupForm.addEventListener("input", clearMessage);

    signupForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearMessage();

        const full_name = fullNameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const confirm_password = confirmPasswordInput.value;

        if (!full_name || !email || !password || !confirm_password) {
            showMessage("Please fill in all fields.");
            return;
        }

        if (password.length < 8) {
            showMessage("Password must be at least 8 characters.");
            return;
        }

        if (password !== confirm_password) {
            showMessage("Passwords do not match.");
            return;
        }

        signupButton.disabled = true;

        const buttonText = signupButton.querySelector(".button-text");
        const originalText = buttonText.textContent;
        buttonText.textContent = "Creating account...";

        try {
            const response = await fetch("/api/auth/signup", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "same-origin",
                body: JSON.stringify({
                    full_name,
                    email,
                    password,
                    confirm_password
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Unable to create account.");
            }

            showMessage(
                data.message || "Account created successfully. Redirecting to login...",
                "success"
            );

            window.location.assign(data.redirect || "/login");

        } catch (error) {
            showMessage(
                error instanceof Error
                    ? error.message
                    : "Unable to create account. Please try again."
            );
        } finally {
            signupButton.disabled = false;
            buttonText.textContent = originalText;
        }
    });
});
