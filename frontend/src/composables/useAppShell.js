import { computed, reactive } from "vue";
import { useWindowBridge } from "./useWindowBridge";

const THEME_STORAGE_KEY = "msp_theme";
const VIEW_CONFIG = {
  dashboard: {
    hash: "",
  },
  runbooks: {
    hash: "sop",
  },
};

const shell = reactive({
  theme: getInitialTheme(),
  activeView: getViewFromHash(),
});

let initialized = false;

function getInitialTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }
}

function getViewFromHash() {
  const hash = window.location.hash.replace("#", "").toLowerCase();
  if (hash === "sop" || hash === "runbooks" || hash === "runbook") return "runbooks";
  return "dashboard";
}

function setTheme(theme) {
  const normalizedTheme = theme === "dark" ? "dark" : "light";
  shell.theme = normalizedTheme;
  document.documentElement.dataset.theme = normalizedTheme;

  try {
    localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme);
  } catch {
    // Keep the current page usable when localStorage is unavailable.
  }
}

function setActiveView(viewName, options = {}) {
  const activeViewName = VIEW_CONFIG[viewName] ? viewName : "dashboard";
  shell.activeView = activeViewName;

  if (options.updateHash !== false) {
    const hash = VIEW_CONFIG[activeViewName].hash;
    const nextUrl = hash
      ? `${window.location.pathname}${window.location.search}#${hash}`
      : `${window.location.pathname}${window.location.search}`;

    try {
      window.history.pushState(null, "", nextUrl);
    } catch {
      if (hash) {
        window.location.hash = hash;
      }
    }
  }

  if (options.scrollTop !== false) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function syncViewFromLocation() {
  setActiveView(getViewFromHash(), {
    updateHash: false,
    scrollTop: true,
  });
}

function exposeShellGlobals() {
  window.setActiveView = setActiveView;
  window.setTheme = setTheme;
}

function initAppShell() {
  if (initialized) return;
  initialized = true;

  setTheme(shell.theme);
  setActiveView(getViewFromHash(), {
    updateHash: false,
    scrollTop: false,
  });
  exposeShellGlobals();

  window.addEventListener("hashchange", syncViewFromLocation);
  window.addEventListener("popstate", syncViewFromLocation);
}

export function useAppShell() {
  useWindowBridge("__mspAppShell", {
    setActiveView,
    setTheme,
  });

  return {
    activeView: computed(() => shell.activeView),
    initAppShell,
    setActiveView,
    setTheme,
    theme: computed(() => shell.theme),
  };
}
