import { computed, reactive } from "vue";
import { useWindowBridge } from "./useWindowBridge";

const SERVICE_TYPE_HINTS = {
  general: "一般諮詢只保留後續處理與其他補充，避免不必要的報修欄位干擾。",
  repair: "產品報修主要資訊已放在上方；這裡只補產品分類、合約與後續處理。",
  aws: "AWS 邀請組織可補產品分類；帳號、組織或特殊需求可寫在其他補充。",
  other: "其他類型只保留後續處理與補充欄位，需要的背景請寫在其他補充。",
  empty: "選擇服務類型後，下方只會顯示相關補充欄位。",
};

const SERVICE_TYPE_OPTIONS = [
  "一般諮詢",
  "產品報修",
  "協助客戶報修",
  "AWS - 邀請組織",
  "其他",
];

const PRODUCT_OPTIONS = [
  "AWS",
  "Dell Server/Storage",
  "PureStorage",
  "Akamai",
  "CyCraft / 奧義智慧",
  "其他",
];

const FOLLOWUP_OPTIONS = [
  "發Mail",
  "Webex告知",
  "請相關工程師協助排修",
  "通知業務",
  "通報於公務群組",
  "測試演練",
  "其他",
];

const IS_CUSTOMER_OPTIONS = ["是", "否"];

const SERVICE_DETAIL_FIELD_NAMES = [
  "serviceTypeOther",
  "productName",
  "contractId",
  "serial",
  "model",
  "dealer",
  "repairTarget",
  "owner",
  "contactMethod",
  "followupOther",
  "extraInfo",
];

function createFollowupState(values = {}) {
  return Object.fromEntries(
    FOLLOWUP_OPTIONS.map((option) => [option, Boolean(values[option])]),
  );
}

function createFieldState(values = {}) {
  return Object.fromEntries(
    SERVICE_DETAIL_FIELD_NAMES.map((fieldName) => [fieldName, String(values[fieldName] || "")]),
  );
}

const state = reactive({
  fields: createFieldState(),
  followups: createFollowupState(),
  isCustomer: "",
  otherFollowup: false,
  serviceType: "",
});

function getMode(serviceType = state.serviceType) {
  if (serviceType === "產品報修" || serviceType === "協助客戶報修") return "repair";
  if (serviceType === "AWS - 邀請組織") return "aws";
  if (serviceType === "其他") return "other";
  if (serviceType === "一般諮詢") return "general";
  return "empty";
}

function syncFollowups(nextFollowups = {}) {
  const normalizedFollowups = createFollowupState(nextFollowups);

  Object.keys(state.followups).forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(normalizedFollowups, key)) {
      delete state.followups[key];
    }
  });

  Object.entries(normalizedFollowups).forEach(([key, value]) => {
    state.followups[key] = value;
  });

  state.otherFollowup = Boolean(state.followups["其他"]);
}

function syncFields(nextFields = {}) {
  const normalizedFields = createFieldState(nextFields);

  Object.keys(state.fields).forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(normalizedFields, key)) {
      delete state.fields[key];
    }
  });

  Object.entries(normalizedFields).forEach(([key, value]) => {
    state.fields[key] = value;
  });
}

function syncState(nextState = {}) {
  state.isCustomer = IS_CUSTOMER_OPTIONS.includes(nextState.isCustomer)
    ? nextState.isCustomer
    : "";
  state.serviceType = String(nextState.serviceType || "");

  if (nextState.fields && typeof nextState.fields === "object") {
    syncFields(nextState.fields);
  }

  if (nextState.followups && typeof nextState.followups === "object") {
    syncFollowups(nextState.followups);
    return;
  }

  state.otherFollowup = Boolean(nextState.otherFollowup);
  state.followups["其他"] = state.otherFollowup;
}

function setServiceType(serviceType) {
  state.serviceType = String(serviceType || "");
}

function setField(fieldName, value) {
  if (!Object.prototype.hasOwnProperty.call(state.fields, fieldName)) return false;

  state.fields[fieldName] = String(value || "");
  return true;
}

function setIsCustomer(isCustomer) {
  state.isCustomer = IS_CUSTOMER_OPTIONS.includes(isCustomer) ? isCustomer : "";
}

function setOtherFollowup(isChecked) {
  setFollowup("其他", isChecked);
}

function setFollowup(followup, isChecked) {
  if (!Object.prototype.hasOwnProperty.call(state.followups, followup)) return false;

  state.followups[followup] = Boolean(isChecked);
  state.otherFollowup = Boolean(state.followups["其他"]);
  return true;
}

function isFollowupSelected(followup) {
  return Boolean(state.followups[followup]);
}

function getField(fieldName) {
  return state.fields[fieldName] || "";
}

function getState() {
  return {
    fields: { ...state.fields },
    followups: { ...state.followups },
    isCustomer: state.isCustomer,
    otherFollowup: state.otherFollowup,
    serviceType: state.serviceType,
  };
}

export function getIncidentServiceDetailsSnapshot() {
  return getState();
}

export function syncIncidentServiceDetailsSnapshot(nextState = {}) {
  syncState(nextState);
}

function isCustomerSelected(isCustomer) {
  return state.isCustomer === isCustomer;
}

function isServiceTypeSelected(serviceType) {
  return state.serviceType === serviceType;
}

function isSectionVisible(sectionModes) {
  const modes = String(sectionModes || "").split(/\s+/).filter(Boolean);
  const mode = getMode();
  return modes.includes("base") || modes.includes(mode);
}

export function useIncidentServiceDetails() {
  useWindowBridge("__mspIncidentServiceDetails", {
    getState,
    syncState,
  }, {
    refresh: "refreshIncidentServiceDetailsState",
  });

  return {
    followupOptions: FOLLOWUP_OPTIONS,
    getField,
    getState,
    hint: computed(() => SERVICE_TYPE_HINTS[getMode()] || SERVICE_TYPE_HINTS.empty),
    isCustomerOptions: IS_CUSTOMER_OPTIONS,
    isCustomerSelected,
    isFollowupOtherVisible: computed(() => state.otherFollowup),
    isFollowupSelected,
    isSectionVisible,
    isServiceTypeOtherVisible: computed(() => getMode() === "other"),
    isServiceTypeSelected,
    productOptions: PRODUCT_OPTIONS,
    setField,
    setFollowup,
    setIsCustomer,
    setOtherFollowup,
    setServiceType,
    serviceTypeOptions: SERVICE_TYPE_OPTIONS,
    state,
  };
}
