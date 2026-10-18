
/**
 * Zorvyn API Client
 * Common helper functions for communicating with Flask.
 */

(function () {
    "use strict";

    const API_BASE_URL = "";

    /**
     * Send an HTTP request to the Flask backend.
     *
     * @param {string} endpoint - API endpoint, e.g. "/api/overview"
     * @param {object} options - Fetch options
     * @returns {Promise<object>} Parsed JSON response
     */
    async function apiRequest(endpoint, options = {}) {
        const headers = {
            "Accept": "application/json",
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {})
        };

        let response;

        try {
            response = await fetch(`${API_BASE_URL}${endpoint}`, {
                ...options,
                headers,
                credentials: "same-origin"
            });
        } catch (error) {
            throw new Error(
                "Unable to connect to the server. Please check your connection."
            );
        }

        const contentType = response.headers.get("content-type") || "";
        let data = {};

        if (contentType.includes("application/json")) {
            try {
                data = await response.json();
            } catch {
                throw new Error("The server returned an invalid response.");
            }
        } else if (!response.ok) {
            throw new Error(
                `Request failed with status ${response.status}.`
            );
        }

        if (!response.ok) {
            throw new Error(
                data.message ||
                data.error ||
                `Request failed with status ${response.status}.`
            );
        }

        return data;
    }

    /**
     * GET request.
     */
    async function get(endpoint) {
        return apiRequest(endpoint, {
            method: "GET"
        });
    }

    /**
     * POST request.
     */
    async function post(endpoint, payload = {}) {
        return apiRequest(endpoint, {
            method: "POST",
            body: JSON.stringify(payload)
        });
    }

    /**
     * PUT request.
     */
    async function put(endpoint, payload = {}) {
        return apiRequest(endpoint, {
            method: "PUT",
            body: JSON.stringify(payload)
        });
    }

    /**
     * DELETE request.
     */
    async function remove(endpoint) {
        return apiRequest(endpoint, {
            method: "DELETE"
        });
    }

    // Expose methods globally for other Zorvyn JavaScript files.
    window.ZorvynAPI = Object.freeze({
        request: apiRequest,
        get,
        post,
        put,
        delete: remove
    });
})();
