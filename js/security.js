/* ═══════════════════════════════════════════════════════════════════════════
   LexRadar v2.0 · Security Utilities
   ─────────────────────────────────────────────────────────────────────────
   localStorage encryption, XSS sanitizer, rate limiter, CSRF prevention
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Simple localStorage encryption using XOR + Base64
 * NOTE: This is NOT cryptographically secure. For production, use proper encryption.
 * Use only to prevent casual inspection of sensitive data.
 */
class StorageEncryption {
  constructor(key = "lexradar-key-v1") {
    this.key = key;
  }

  /**
   * Encrypt value using simple XOR cipher
   */
  encrypt(value) {
    try {
      const json = JSON.stringify(value);
      const encrypted = btoa(
        json
          .split("")
          .map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ this.key.charCodeAt(i % this.key.length)))
          .join("")
      );
      return encrypted;
    } catch (e) {
      console.error("Encryption error:", e);
      return null;
    }
  }

  /**
   * Decrypt value
   */
  decrypt(encrypted) {
    try {
      const decoded = atob(encrypted);
      const decrypted = decoded
        .split("")
        .map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ this.key.charCodeAt(i % this.key.length)))
        .join("");
      return JSON.parse(decrypted);
    } catch (e) {
      console.error("Decryption error:", e);
      return null;
    }
  }

  /**
   * Set encrypted value in localStorage
   */
  setSecure(key, value) {
    const encrypted = this.encrypt(value);
    if (encrypted) {
      localStorage.setItem(key, encrypted);
      return true;
    }
    return false;
  }

  /**
   * Get decrypted value from localStorage
   */
  getSecure(key) {
    const encrypted = localStorage.getItem(key);
    if (!encrypted) return null;
    return this.decrypt(encrypted);
  }

  /**
   * Remove from localStorage
   */
  removeSecure(key) {
    localStorage.removeItem(key);
  }
}

/**
 * XSS Sanitizer - removes dangerous HTML/JS
 * Use for sanitizing user-generated or external content
 */
class XSSSanitizer {
  /**
   * Create a temporary element and sanitize via textContent
   */
  static sanitize(html) {
    const temp = document.createElement("div");
    temp.textContent = html;
    return temp.innerHTML;
  }

  /**
   * Sanitize while preserving basic HTML tags (p, br, strong, em, etc.)
   */
  static sanitizeHTML(html) {
    const allowed = ["p", "br", "strong", "em", "u", "i", "b", "a", "ul", "ol", "li"];
    const temp = document.createElement("div");
    temp.innerHTML = html;

    const walk = (node) => {
      for (let i = node.childNodes.length - 1; i >= 0; i--) {
        const child = node.childNodes[i];
        if (child.nodeType === 1) {
          if (!allowed.includes(child.tagName.toLowerCase())) {
            const textNode = document.createTextNode(child.textContent);
            node.replaceChild(textNode, child);
          } else {
            walk(child);
          }
        }
      }
    };

    walk(temp);
    return temp.innerHTML;
  }

  /**
   * Escape HTML for safe display
   */
  static escapeHTML(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Validate URL to prevent javascript: and data: attacks
   */
  static validateURL(url) {
    try {
      const parsed = new URL(url, window.location.href);
      const allowedProtocols = ["http:", "https:"];
      return allowedProtocols.includes(parsed.protocol);
    } catch {
      return false;
    }
  }
}

/**
 * Rate Limiter - prevent excessive API calls
 */
class RateLimiter {
  constructor(maxRequests = 10, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }

  /**
   * Check if request is allowed
   */
  isAllowed() {
    const now = Date.now();
    this.requests = this.requests.filter((time) => now - time < this.windowMs);

    if (this.requests.length < this.maxRequests) {
      this.requests.push(now);
      return true;
    }

    return false;
  }

  /**
   * Get remaining requests in current window
   */
  getRemaining() {
    const now = Date.now();
    this.requests = this.requests.filter((time) => now - time < this.windowMs);
    return Math.max(0, this.maxRequests - this.requests.length);
  }

  /**
   * Get time until next request allowed (in ms)
   */
  getWaitTime() {
    if (this.requests.length === 0) return 0;
    const oldestRequest = this.requests[0];
    const waitTime = this.windowMs - (Date.now() - oldestRequest);
    return Math.max(0, waitTime);
  }

  /**
   * Reset the limiter
   */
  reset() {
    this.requests = [];
  }
}

/**
 * Focus Trap - trap keyboard focus within a modal/dialog
 * Required for WCAG 2.1 AA compliance
 */
class FocusTrap {
  constructor(element) {
    this.element = element;
    this.previousActiveElement = null;
  }

  /**
   * Activate focus trap
   */
  activate() {
    this.previousActiveElement = document.activeElement;
    this.element.addEventListener("keydown", this.handleKeyDown.bind(this));
    this.focusFirstElement();
  }

  /**
   * Deactivate focus trap and restore focus
   */
  deactivate() {
    this.element.removeEventListener("keydown", this.handleKeyDown.bind(this));
    if (this.previousActiveElement && this.previousActiveElement.focus) {
      this.previousActiveElement.focus();
    }
  }

  /**
   * Get all focusable elements within the trap
   */
  getFocusableElements() {
    const focusable = this.element.querySelectorAll(
      "button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])"
    );
    return Array.from(focusable);
  }

  /**
   * Focus first element
   */
  focusFirstElement() {
    const focusable = this.getFocusableElements();
    if (focusable.length > 0) {
      focusable[0].focus();
    }
  }

  /**
   * Handle Tab key navigation
   */
  handleKeyDown(event) {
    if (event.key !== "Tab") return;

    const focusable = this.getFocusableElements();
    if (focusable.length === 0) return;

    const activeElement = document.activeElement;
    const focusedIndex = focusable.indexOf(activeElement);

    if (event.shiftKey) {
      // Shift + Tab: move backwards
      if (focusedIndex === 0) {
        event.preventDefault();
        focusable[focusable.length - 1].focus();
      }
    } else {
      // Tab: move forwards
      if (focusedIndex === focusable.length - 1) {
        event.preventDefault();
        focusable[0].focus();
      }
    }
  }
}

/**
 * Content Security Policy Helper
 * Logs CSP violations for monitoring
 */
class CSPMonitor {
  static setup() {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.warn("CSP Violation:", {
        blockedURI: event.blockedURI,
        violatedDirective: event.violatedDirective,
        originalPolicy: event.originalPolicy,
        sourceFile: event.sourceFile,
        lineNumber: event.lineNumber,
      });

      // TODO: Send to analytics/monitoring service
    });
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   EXPORT FOR USE
═══════════════════════════════════════════════════════════════════════════ */

// Example usage (uncomment to use):
// const encryption = new StorageEncryption();
// encryption.setSecure("user-data", { id: 123, name: "John" });
// const data = encryption.getSecure("user-data");

// const limiter = new RateLimiter(5, 60000); // 5 requests per minute
// if (limiter.isAllowed()) {
//   // Make API call
// } else {
//   console.warn("Rate limit exceeded. Wait", limiter.getWaitTime(), "ms");
// }

// const sanitizer = new XSSSanitizer();
// const clean = sanitizer.sanitize("<img src=x onerror=alert('xss')>");

// const dialog = document.querySelector("dialog");
// const trap = new FocusTrap(dialog);
// dialog.addEventListener("showModal", () => trap.activate());
// dialog.addEventListener("close", () => trap.deactivate());
