import { readonly, ref } from "vue";

const legacyReadyState = ref(false);

export const legacyReady = readonly(legacyReadyState);

export function markLegacyReady() {
  legacyReadyState.value = true;
}

export function legacy(name, ...args) {
  const fn = window[name];

  if (typeof fn === "function") {
    return fn(...args);
  }

  console.warn(`Dashboard handler ${name} is not ready yet.`);
  return undefined;
}
