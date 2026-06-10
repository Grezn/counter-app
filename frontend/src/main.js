import { createApp, nextTick } from "vue";
import App from "./App.vue";
import { markLegacyReady } from "./legacyBridge";
import "../../public/styles.css";

function loadClassicScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-vue-bridge="${src}"]`)) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset.vueBridge = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

createApp(App).mount("#app");

await nextTick();
try {
  await loadClassicScript("/handover-summary.js");
  await loadClassicScript("/app.js");
  markLegacyReady();
  if (typeof window.refreshIncidentActionLabels === "function") {
    window.refreshIncidentActionLabels();
  }
} catch (err) {
  console.error("[Dashboard] legacy bridge failed to load:", err);
}
