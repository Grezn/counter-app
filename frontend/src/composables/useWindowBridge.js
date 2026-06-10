import { onMounted, onUnmounted } from "vue";

const bridgeStacks = new Map();

function runRefresh(refresh) {
  if (typeof refresh === "function") {
    refresh();
    return;
  }

  if (typeof refresh === "string" && typeof window[refresh] === "function") {
    window[refresh]();
  }
}

export function useWindowBridge(bridgeName, bridge, options = {}) {
  let activeBridge = bridge;

  onMounted(() => {
    activeBridge = typeof bridge === "function" ? bridge() : bridge;

    const stack = bridgeStacks.get(bridgeName) || [];
    stack.push(activeBridge);
    bridgeStacks.set(bridgeName, stack);

    window[bridgeName] = activeBridge;
    runRefresh(options.refresh);
  });

  onUnmounted(() => {
    const stack = bridgeStacks.get(bridgeName) || [];
    const activeIndex = stack.lastIndexOf(activeBridge);

    if (activeIndex >= 0) {
      stack.splice(activeIndex, 1);
    }

    const currentBridge = window[bridgeName];

    if (stack.length > 0) {
      bridgeStacks.set(bridgeName, stack);

      if (currentBridge === activeBridge) {
        window[bridgeName] = stack[stack.length - 1];
      }

      return;
    }

    bridgeStacks.delete(bridgeName);

    if (currentBridge === activeBridge) {
      delete window[bridgeName];
    }
  });
}
